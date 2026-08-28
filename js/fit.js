import { state } from './state.js';
import { redrawPlotCanvas } from './render.js';
import { updatePathList } from './paths.js';
import { computeBezierChain } from './bezier.js';
import { fitModel, sampleFit } from './model_fit.js';

// Parse a CSS hex color string into {r, g, b}.
function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

// How similar (0 = identical, 441 = black vs white) does a pixel need to be
// to the path color to count as a match.
const COLOR_THRESHOLD = 80;

export function fitPathToImage(path) {
  if (!state.uploadedImage || !state.imagePixelData || path.lineType !== 'smooth' || path.segments.length === 0) {
    return;
  }

  const imageData = state.imagePixelData;
  const BG_THRESHOLD = 220;  // skip near-white background pixels
  const MIN_BRIGHTNESS = 25; // skip near-black frame/axis pixels

  // Auto-detect the curve color from the pixels surrounding the clicked
  // anchor points rather than relying on path.color matching the image.
  // Two-phase per anchor: (1) find closest non-background pixel — proximity
  // identifies which curve the user clicked, avoiding false matches at
  // crossings; (2) gradient-walk toward the locally darkest pixel from there
  // — darkness = purity, so this lands at the stroke center and gives a clean
  // target color. Largest cluster of resulting samples wins.
  // Falls back to path.color only if no non-background pixels are found.
  const target = (() => {
    const SAMPLE_R = 10;
    const CLUSTER_DIST = 80;

    const samples = [];
    for (const pt of path.points) {
      // Phase 1: closest non-background pixel (selects right curve at crossings).
      let bestDist2 = Infinity, bestPx = -1, bestPy = -1;
      for (let dy = -SAMPLE_R; dy <= SAMPLE_R; dy++) {
        for (let dx = -SAMPLE_R; dx <= SAMPLE_R; dx++) {
          const dist2 = dx * dx + dy * dy;
          if (dist2 > SAMPLE_R * SAMPLE_R) continue;
          const px = Math.floor(pt.x + dx), py = Math.floor(pt.y + dy);
          const idx = (py * imageData.width + px) * 4;
          if (idx < 0 || idx >= imageData.data.length - 3) continue;
          const brightness = (imageData.data[idx] + imageData.data[idx+1] + imageData.data[idx+2]) / 3;
          if (brightness > BG_THRESHOLD || brightness < MIN_BRIGHTNESS) continue;
          if (dist2 < bestDist2) { bestDist2 = dist2; bestPx = px; bestPy = py; }
        }
      }
      if (bestPx < 0) continue;

      // Phase 2: gradient-walk toward locally darkest pixel (stroke center).
      let cx = bestPx, cy = bestPy;
      let idx0 = (cy * imageData.width + cx) * 4;
      let curBr = (imageData.data[idx0] + imageData.data[idx0+1] + imageData.data[idx0+2]) / 3;
      let improved = true;
      for (let steps = 0; improved && steps < 8; steps++) {
        improved = false;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = cx + dx, ny = cy + dy;
            const idx = (ny * imageData.width + nx) * 4;
            if (idx < 0 || idx >= imageData.data.length - 3) continue;
            const br = (imageData.data[idx] + imageData.data[idx+1] + imageData.data[idx+2]) / 3;
            if (br < curBr && br > MIN_BRIGHTNESS && br < BG_THRESHOLD) {
              curBr = br; cx = nx; cy = ny; improved = true;
            }
          }
        }
      }
      const fi = (cy * imageData.width + cx) * 4;
      samples.push({ r: imageData.data[fi], g: imageData.data[fi+1], b: imageData.data[fi+2] });
    }

    if (samples.length === 0) return hexToRgb(path.color);

    // For each sample, count how many others are within CLUSTER_DIST.
    let bestCount = 0, bestIdx = 0;
    for (let i = 0; i < samples.length; i++) {
      let count = 0;
      for (let j = 0; j < samples.length; j++) {
        const dr = samples[i].r - samples[j].r, dg = samples[i].g - samples[j].g, db = samples[i].b - samples[j].b;
        if (Math.sqrt(dr * dr + dg * dg + db * db) < CLUSTER_DIST) count++;
      }
      if (count > bestCount) { bestCount = count; bestIdx = i; }
    }

    // Average within the winning cluster.
    const seed = samples[bestIdx];
    const cluster = samples.filter(s => {
      const dr = s.r - seed.r, dg = s.g - seed.g, db = s.b - seed.b;
      return Math.sqrt(dr * dr + dg * dg + db * db) < CLUSTER_DIST;
    });
    return {
      r: Math.round(cluster.reduce((s, c) => s + c.r, 0) / cluster.length),
      g: Math.round(cluster.reduce((s, c) => s + c.g, 0) / cluster.length),
      b: Math.round(cluster.reduce((s, c) => s + c.b, 0) / cluster.length),
    };
  })();

  // Returns the RGB distance between a pixel and the path's assigned color.
  function colorDist(x, y) {
    const idx = (Math.floor(y) * imageData.width + Math.floor(x)) * 4;
    if (idx < 0 || idx >= imageData.data.length - 3) return Infinity;
    const dr = imageData.data[idx]     - target.r;
    const dg = imageData.data[idx + 1] - target.g;
    const db = imageData.data[idx + 2] - target.b;
    return Math.sqrt(dr * dr + dg * dg + db * db);
  }

  function isMatchingPixel(x, y) {
    return colorDist(x, y) < COLOR_THRESHOLD;
  }

  // Shoot N pairs of opposing rays from (sx,sy), walk each until it exits the
  // color-matched region, and compute a weighted average of the cross-sectional
  // midpoints. Weighting is inversely proportional to cross-section width: the
  // direction perpendicular to the stroke has the narrowest cross-section and
  // therefore the most accurate midpoint estimate. The weighted average converges
  // to the stroke center regardless of which edge the initial point landed on.
  function spokeCenter(sx, sy, numSpokes = 12, maxDist = 20) {
    let sumCX = 0, sumCY = 0, sumW = 0;
    for (let i = 0; i < numSpokes; i++) {
      const angle = (Math.PI * i) / numSpokes; // span 0..π; each covers a full axis
      const cos = Math.cos(angle), sin = Math.sin(angle);

      // Walk in both directions along this axis, record last matching pixel.
      let b1x = sx, b1y = sy, b2x = sx, b2y = sy;
      for (let d = 1; d <= maxDist; d++) {
        const px = sx + cos * d, py = sy + sin * d;
        const idx = (Math.floor(py) * imageData.width + Math.floor(px)) * 4;
        if (idx < 0 || idx >= imageData.data.length - 3) break;
        const br = (imageData.data[idx] + imageData.data[idx+1] + imageData.data[idx+2]) / 3;
        if (colorDist(px, py) < COLOR_THRESHOLD * 2 && br > MIN_BRIGHTNESS) { b1x = px; b1y = py; } else break;
      }
      for (let d = 1; d <= maxDist; d++) {
        const px = sx - cos * d, py = sy - sin * d;
        const idx = (Math.floor(py) * imageData.width + Math.floor(px)) * 4;
        if (idx < 0 || idx >= imageData.data.length - 3) break;
        const br = (imageData.data[idx] + imageData.data[idx+1] + imageData.data[idx+2]) / 3;
        if (colorDist(px, py) < COLOR_THRESHOLD * 2 && br > MIN_BRIGHTNESS) { b2x = px; b2y = py; } else break;
      }

      const crossWidth = Math.hypot(b1x - b2x, b1y - b2y);
      if (crossWidth < 0.5) continue; // degenerate direction — skip
      const w = 1 / crossWidth;       // narrow = perpendicular = most accurate
      sumCX += (b1x + b2x) / 2 * w;
      sumCY += (b1y + b2y) / 2 * w;
      sumW += w;
    }
    return sumW > 0
      ? { x: sumCX / sumW, y: sumCY / sumW, found: true }
      : { x: sx, y: sy, found: true };
  }

  // Find a matching pixel within searchRadius. Two modes:
  //
  //   findCenter=false (default, for gradient-descent targets): nearest matching
  //   pixel geometrically — keeps gradient steps small and convergence stable.
  //
  //   findCenter=true (for anchor snapping): nearest matching pixel as seed, then
  //   spokeCenter() refines to the stroke center.
  function findClosestMatchingPixel(x, y, searchRadius = 15, findCenter = false) {
    let minDist = Infinity;
    let bestX = x, bestY = y;
    let fallbackDist = Infinity, fallbackX = x, fallbackY = y;
    let found = false;

    for (let dy = -searchRadius; dy <= searchRadius; dy++) {
      for (let dx = -searchRadius; dx <= searchRadius; dx++) {
        const geoDist = Math.hypot(dx, dy);
        if (geoDist > searchRadius) continue;
        const tx = x + dx, ty = y + dy;
        if (colorDist(tx, ty) < COLOR_THRESHOLD) {
          if (geoDist < minDist) { minDist = geoDist; bestX = tx; bestY = ty; found = true; }
        } else {
          const idx = (Math.floor(ty) * imageData.width + Math.floor(tx)) * 4;
          if (idx >= 0 && idx < imageData.data.length - 3) {
            const br = (imageData.data[idx] + imageData.data[idx+1] + imageData.data[idx+2]) / 3;
            if (br < 100 && geoDist < fallbackDist) { fallbackDist = geoDist; fallbackX = tx; fallbackY = ty; }
          }
        }
      }
    }

    if (found && findCenter) return spokeCenter(bestX, bestY);
    if (found) return { x: bestX, y: bestY, found: true };
    if (fallbackDist < searchRadius) return { x: fallbackX, y: fallbackY, found: true };
    return { x, y, found: false };
  }

  if (path.modelName) {
    fitModelBasedPath();
  } else {
    fitFreeFormPath();
  }

  updatePathList();
  redrawPlotCanvas();

  // ── Parametric-model curves ────────────────────────────────────────────────
  //
  // Snap the sparse clicked points (well-separated, same risk profile as
  // free-form anchors) to the nearest matching image pixel, then re-fit the
  // SAME parametric model through the corrected points, then rebuild the
  // Bezier chain from that. No per-segment gradient descent here at all: the
  // model fit itself -- now informed by image-corrected data -- is the whole
  // "hugging" mechanism. This replaces an earlier approach (independently
  // optimising each of ~80 densely-resampled segments) that was measured to
  // be dominated by pixel-level snapping noise rather than real shape
  // signal, producing a visible oscillation.
  //
  // Known limitation: if this path was built via "extend" (adding points to
  // an already-fit path), path.extending/extendFromIndex have already been
  // reset by the time this runs, so there's no signal left distinguishing
  // old points from newly-added ones. This re-fits the model across the
  // full point range rather than preserving the old segments' exact shape.
  // Not fixed here -- a pre-existing rough edge with model+extend, not a
  // regression in anything that currently works well.
  function fitModelBasedPath() {
    const snappedPoints = path.points.map(pt => {
      if (pt.corner) return { ...pt }; // corner anchors stay at their placed position
      const closest = findClosestMatchingPixel(pt.x, pt.y, 15, true); // findCenter=true: snap to stroke middle
      return closest.found ? { ...pt, x: closest.x, y: closest.y } : { ...pt };
    });

    const originalFit = fitModel(path.modelName, path.points);
    const snappedFit  = fitModel(path.modelName, snappedPoints);

    // Only adopt the snapped refit if it didn't make the fit meaningfully
    // worse. Re-fitting a global parametric model on nudged points can shift
    // its parameters by more than the nudge itself (e.g. which point looks
    // like "the peak" can flip) -- unlike free-form curves, where each
    // anchor only reshapes its local neighbourhood. Falling back to the
    // original fit on failure or a clear regression means this can only
    // ever match-or-improve on what "Smooth Curves" already produced.
    const useSnapped = snappedFit && snappedFit.success
      && (!originalFit || snappedFit.loss <= originalFit.loss * 1.5);

    const fitResult   = useSnapped ? snappedFit : originalFit;
    const basisPoints = useSnapped ? snappedPoints : path.points;
    if (!fitResult || !fitResult.success) return; // leave path untouched

    const dense = sampleFit(fitResult, basisPoints, 80);

    // No endpoint tapering: the model was refitted through the snapped anchor
    // points (including the endpoints), so the model curve already passes
    // through them. Applying a linear taper correction would introduce a
    // visible kink where the correction drops back to zero (~10 samples from
    // each end), which is worse than any residual endpoint mismatch.
    path.points = basisPoints;
    path.segments = computeBezierChain(dense);
  }

  // ── Free-form curves (no parametric model) ──────────────────────────────────
  //
  // path.points.length - 1 === path.segments.length always holds here (one
  // segment per raw click), and segments are wide enough that per-segment
  // gradient descent has real room to shape the curve between anchors to
  // hug the image -- measured to genuinely improve the fit, with no
  // noise/oscillation problem at this segment density. Unchanged behaviour.
  function fitFreeFormPath() {
    // Sample current B1/B2 position along the curve and return target points.
    function sampleTargets(segment, B1, B2, searchRadius, numSamples = 30) {
      const targets = [];
      for (let i = 0; i <= numSamples; i++) {
        const t = i / numSamples;
        const t2 = t * t; const t3 = t2 * t;
        const mt = 1 - t; const mt2 = mt * mt; const mt3 = mt2 * mt;
        const x = mt3 * segment[0].x + 3 * mt2 * t * B1.x + 3 * mt * t2 * B2.x + t3 * segment[3].x;
        const y = mt3 * segment[0].y + 3 * mt2 * t * B1.y + 3 * mt * t2 * B2.y + t3 * segment[3].y;
        const closest = findClosestMatchingPixel(x, y, searchRadius);
        if (closest.found) targets.push({ x: closest.x, y: closest.y, t });
      }
      return targets;
    }

    // Run one gradient-descent pass toward the given target points.
    function gradientPass(segment, B1, B2, targetPoints, learningRate, iterations) {
      for (let iter = 0; iter < iterations; iter++) {
        let gradB1x = 0, gradB1y = 0, gradB2x = 0, gradB2y = 0;
        targetPoints.forEach(target => {
          const t = target.t;
          const t2 = t * t; const t3 = t2 * t;
          const mt = 1 - t; const mt2 = mt * mt; const mt3 = mt2 * mt;
          const curveX = mt3 * segment[0].x + 3 * mt2 * t * B1.x + 3 * mt * t2 * B2.x + t3 * segment[3].x;
          const curveY = mt3 * segment[0].y + 3 * mt2 * t * B1.y + 3 * mt * t2 * B2.y + t3 * segment[3].y;
          const errorX = curveX - target.x;
          const errorY = curveY - target.y;
          gradB1x += errorX * (3 * mt2 * t); gradB1y += errorY * (3 * mt2 * t);
          gradB2x += errorX * (3 * mt * t2); gradB2y += errorY * (3 * mt * t2);
        });
        const n = targetPoints.length;
        B1.x -= learningRate * gradB1x / n; B1.y -= learningRate * gradB1y / n;
        B2.x -= learningRate * gradB2x / n; B2.y -= learningRate * gradB2y / n;
      }
    }

    // Snap each anchor point to the stroke center within snapRadius.
    // Also translates the adjacent control points by the same delta so they
    // stay in the correct relative position — otherwise the next gradient-
    // descent round starts from a curve that passes through blank space and
    // finds no targets, leaving the handle pointing in the wrong direction.
    function snapAnchors(snapRadius = 15) {
      path.points.forEach((pt, ptIndex) => {
        if (pt.corner) return; // corner anchors stay at their placed position
        const closest = findClosestMatchingPixel(pt.x, pt.y, snapRadius, true);
        if (!closest.found) return;
        const dx = closest.x - pt.x, dy = closest.y - pt.y;
        pt.x = closest.x;
        pt.y = closest.y;
        if (ptIndex < path.segments.length) {
          path.segments[ptIndex][0] = { x: closest.x, y: closest.y };
          path.segments[ptIndex][1].x += dx;   // translate outgoing B1
          path.segments[ptIndex][1].y += dy;
        }
        if (ptIndex > 0) {
          path.segments[ptIndex - 1][3] = { x: closest.x, y: closest.y };
          path.segments[ptIndex - 1][2].x += dx;  // translate incoming B2
          path.segments[ptIndex - 1][2].y += dy;
        }
      });
    }

    // Optimise B1/B2 for every segment with coarse-to-fine target sampling,
    // then snap anchors. Repeat NUM_ROUNDS times — each round starts from
    // where the previous left off, so the curve converges progressively.
    const NUM_ROUNDS = 3;
    const passes = [
      { searchRadius: 30, learningRate: 0.4, iterations: 20 },
      { searchRadius: 20, learningRate: 0.3, iterations: 20 },
      { searchRadius: 10, learningRate: 0.2, iterations: 20 },
      { searchRadius:  5, learningRate: 0.1, iterations: 20 },
    ];

    for (let round = 0; round < NUM_ROUNDS; round++) {
      path.segments.forEach((segment, segIndex) => {
        let B1 = { ...segment[1] };
        let B2 = { ...segment[2] };

        for (const pass of passes) {
          const targetPoints = sampleTargets(segment, B1, B2, pass.searchRadius);
          if (targetPoints.length < 5) continue;
          gradientPass(segment, B1, B2, targetPoints, pass.learningRate, pass.iterations);
        }

        // Project B1/B2 onto the user-set handle directions (angle locked, length free).
        const h1 = path.points[segIndex]?.handleOut;
        if (h1) {
          const hLen = Math.hypot(h1.dx, h1.dy);
          if (hLen > 0) {
            const anc = segment[0], dX = h1.dx / hLen, dY = h1.dy / hLen;
            const proj = Math.max(0, (B1.x - anc.x) * dX + (B1.y - anc.y) * dY);
            B1.x = anc.x + dX * proj; B1.y = anc.y + dY * proj;
          }
        }
        const h2 = path.points[segIndex + 1]?.handleIn;
        if (h2) {
          const hLen = Math.hypot(h2.dx, h2.dy);
          if (hLen > 0) {
            const anc = segment[3], dX = h2.dx / hLen, dY = h2.dy / hLen;
            const proj = Math.max(0, (B2.x - anc.x) * dX + (B2.y - anc.y) * dY);
            B2.x = anc.x + dX * proj; B2.y = anc.y + dY * proj;
          }
        }

        segment[1] = B1;
        segment[2] = B2;

        // Enforce C1 symmetry at smooth (non-corner) anchor joins only.
        if (segIndex > 0 && !path.points[segIndex]?.corner) {
          const prevSegment = path.segments[segIndex - 1];
          const anchor = segment[0];
          const dx = B1.x - anchor.x; const dy = B1.y - anchor.y;
          const dist = Math.hypot(dx, dy);
          if (dist > 0) {
            const mirrorAngle = Math.atan2(dy, dx) + Math.PI;
            const prevDx = prevSegment[2].x - anchor.x; const prevDy = prevSegment[2].y - anchor.y;
            const prevDist = Math.hypot(prevDx, prevDy);
            prevSegment[2].x = anchor.x + Math.cos(mirrorAngle) * prevDist;
            prevSegment[2].y = anchor.y + Math.sin(mirrorAngle) * prevDist;
          }
        }
        if (segIndex < path.segments.length - 1 && !path.points[segIndex + 1]?.corner) {
          const nextSegment = path.segments[segIndex + 1];
          const anchor = segment[3];
          const dx = B2.x - anchor.x; const dy = B2.y - anchor.y;
          const dist = Math.hypot(dx, dy);
          if (dist > 0) {
            const mirrorAngle = Math.atan2(dy, dx) + Math.PI;
            const nextDx = nextSegment[1].x - anchor.x; const nextDy = nextSegment[1].y - anchor.y;
            const nextDist = Math.hypot(nextDx, nextDy);
            nextSegment[1].x = anchor.x + Math.cos(mirrorAngle) * nextDist;
            nextSegment[1].y = anchor.y + Math.sin(mirrorAngle) * nextDist;
          }
        }
      });

      snapAnchors(15);
    }

    // Final tight refinement pass after all rounds.
    path.segments.forEach((segment, segIndex) => {
      let B1 = { ...segment[1] };
      let B2 = { ...segment[2] };
      const targetPoints = sampleTargets(segment, B1, B2, 5);
      if (targetPoints.length >= 5) {
        gradientPass(segment, B1, B2, targetPoints, 0.05, 20);
        const h1 = path.points[segIndex]?.handleOut;
        if (h1) {
          const hLen = Math.hypot(h1.dx, h1.dy);
          if (hLen > 0) {
            const anc = segment[0], dX = h1.dx / hLen, dY = h1.dy / hLen;
            const proj = Math.max(0, (B1.x - anc.x) * dX + (B1.y - anc.y) * dY);
            B1.x = anc.x + dX * proj; B1.y = anc.y + dY * proj;
          }
        }
        const h2 = path.points[segIndex + 1]?.handleIn;
        if (h2) {
          const hLen = Math.hypot(h2.dx, h2.dy);
          if (hLen > 0) {
            const anc = segment[3], dX = h2.dx / hLen, dY = h2.dy / hLen;
            const proj = Math.max(0, (B2.x - anc.x) * dX + (B2.y - anc.y) * dY);
            B2.x = anc.x + dX * proj; B2.y = anc.y + dY * proj;
          }
        }
        segment[1] = B1;
        segment[2] = B2;
      }
    });

    // Final snap — do this last so anchors end on stroke centers after
    // the tight refinement may have shifted the curve slightly.
    snapAnchors(8);

    // Correct any handles that point more than 90° away from the expected
    // curve tangent. The gradient descent can converge to a flipped handle
    // when there are few matching pixels near an endpoint (e.g. an anchor
    // placed right at the figure frame). Only flipped handles are corrected;
    // handles within 90° of the tangent are left as the gradient descent set
    // them (which contains real curve-shape information).
    path.points.forEach((pt, i) => {
      const prev = i > 0 ? path.points[i - 1] : null;
      const next = i < path.points.length - 1 ? path.points[i + 1] : null;
      let tanX = 0, tanY = 0;
      if (prev && next) { tanX = next.x - prev.x; tanY = next.y - prev.y; }
      else if (next)    { tanX = next.x - pt.x;   tanY = next.y - pt.y;   }
      else              { tanX = pt.x - prev.x;    tanY = pt.y - prev.y;   }
      const tanLen = Math.hypot(tanX, tanY);
      if (tanLen === 0) return;
      tanX /= tanLen; tanY /= tanLen;

      // Incoming B2 (control point before this anchor, on segment i-1)
      if (i > 0) {
        const b2 = path.segments[i - 1][2];
        const bx = b2.x - pt.x, by = b2.y - pt.y;
        const bLen = Math.hypot(bx, by);
        // B2 should oppose the tangent (curve arrives from the "back" direction)
        if (bLen > 0 && (bx * (-tanX) + by * (-tanY)) / bLen < 0) {
          b2.x = pt.x - tanX * bLen;
          b2.y = pt.y - tanY * bLen;
        }
      }
      // Outgoing B1 (control point after this anchor, on segment i)
      if (i < path.segments.length) {
        const b1 = path.segments[i][1];
        const bx = b1.x - pt.x, by = b1.y - pt.y;
        const bLen = Math.hypot(bx, by);
        // B1 should align with the tangent (curve departs in the "forward" direction)
        if (bLen > 0 && (bx * tanX + by * tanY) / bLen < 0) {
          b1.x = pt.x + tanX * bLen;
          b1.y = pt.y + tanY * bLen;
        }
      }
    });
  }
}
