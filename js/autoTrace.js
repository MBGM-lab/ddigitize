const COLOR_THRESHOLD = 80;
const BG_THRESHOLD    = 220;
const MIN_BRIGHTNESS  = 25;

function pixelIdx(imageData, x, y) {
  return (Math.floor(y) * imageData.width + Math.floor(x)) * 4;
}

function brightness(imageData, x, y) {
  const i = pixelIdx(imageData, x, y);
  if (i < 0 || i >= imageData.data.length - 3) return -1;
  return (imageData.data[i] + imageData.data[i+1] + imageData.data[i+2]) / 3;
}

function rgbDist(imageData, x, y, target) {
  const i = pixelIdx(imageData, x, y);
  if (i < 0 || i >= imageData.data.length - 3) return Infinity;
  const dr = imageData.data[i]   - target.r;
  const dg = imageData.data[i+1] - target.g;
  const db = imageData.data[i+2] - target.b;
  return Math.sqrt(dr*dr + dg*dg + db*db);
}

function isMatch(imageData, x, y, target) {
  const br = brightness(imageData, x, y);
  return br > MIN_BRIGHTNESS && rgbDist(imageData, x, y, target) < COLOR_THRESHOLD;
}

// Find stroke centre from a seed pixel using opposing-spoke method.
function spokeCenter(imageData, target, sx, sy, numSpokes = 12, maxDist = 20) {
  let sumCX = 0, sumCY = 0, sumW = 0;
  for (let i = 0; i < numSpokes; i++) {
    const angle = (Math.PI * i) / numSpokes;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    let b1x = sx, b1y = sy, b2x = sx, b2y = sy;
    for (let d = 1; d <= maxDist; d++) {
      const px = sx + cos * d, py = sy + sin * d;
      if (rgbDist(imageData, px, py, target) < COLOR_THRESHOLD * 2 &&
          brightness(imageData, px, py) > MIN_BRIGHTNESS) { b1x = px; b1y = py; } else break;
    }
    for (let d = 1; d <= maxDist; d++) {
      const px = sx - cos * d, py = sy - sin * d;
      if (rgbDist(imageData, px, py, target) < COLOR_THRESHOLD * 2 &&
          brightness(imageData, px, py) > MIN_BRIGHTNESS) { b2x = px; b2y = py; } else break;
    }
    const crossWidth = Math.hypot(b1x - b2x, b1y - b2y);
    if (crossWidth < 0.5) continue;
    const w = 1 / crossWidth;
    sumCX += (b1x + b2x) / 2 * w;
    sumCY += (b1y + b2y) / 2 * w;
    sumW += w;
  }
  return sumW > 0 ? { x: sumCX / sumW, y: sumCY / sumW } : { x: sx, y: sy };
}

// Sample the trace colour at a click point using the same cluster-voting
// approach as fit.js: two-phase anchor scan → gradient walk to stroke centre
// → cluster the resulting samples.
export function sampleTraceColor(cx, cy, imageData, radius = 8) {
  const samples = [];

  // Phase 1: closest non-background pixel to the click.
  let bestDist2 = Infinity, bx = -1, by = -1;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const d2 = dx*dx + dy*dy;
      if (d2 > radius * radius) continue;
      const px = cx + dx, py = cy + dy;
      const br = brightness(imageData, px, py);
      if (br < MIN_BRIGHTNESS || br > BG_THRESHOLD) continue;
      if (d2 < bestDist2) { bestDist2 = d2; bx = px; by = py; }
    }
  }
  if (bx < 0) {
    // Fallback: just read the clicked pixel
    const i = pixelIdx(imageData, cx, cy);
    return { r: imageData.data[i], g: imageData.data[i+1], b: imageData.data[i+2] };
  }

  // Phase 2: gradient walk to stroke centre.
  let hx = bx, hy = by;
  let curBr = brightness(imageData, hx, hy);
  for (let step = 0; step < 8; step++) {
    let improved = false;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = hx + dx, ny = hy + dy;
        const br = brightness(imageData, nx, ny);
        if (br < curBr && br > MIN_BRIGHTNESS && br < BG_THRESHOLD) {
          curBr = br; hx = nx; hy = ny; improved = true;
        }
      }
    }
    if (!improved) break;
  }
  const i = pixelIdx(imageData, hx, hy);
  samples.push({ r: imageData.data[i], g: imageData.data[i+1], b: imageData.data[i+2] });

  if (samples.length === 0) {
    const fi = pixelIdx(imageData, cx, cy);
    return { r: imageData.data[fi], g: imageData.data[fi+1], b: imageData.data[fi+2] };
  }
  return samples[0];
}

// Moving-average smoothing over a sliding window.
function smoothTrace(points, window = 9) {
  const half = Math.floor(window / 2);
  return points.map((_, i) => {
    let sx = 0, sy = 0, n = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(points.length - 1, i + half); j++) {
      sx += points[j].x; sy += points[j].y; n++;
    }
    return { x: sx / n, y: sy / n };
  });
}

// Perpendicular-extrema decimation: projects the raw trace onto the axis
// perpendicular to the start→end chord, smooths the resulting 1D signal,
// then picks local maxima and minima as anchors.  This directly finds the
// amplitude peaks and troughs without the bending-angle proxy, which makes
// it more accurate (anchors land at the true extremum) and less sensitive
// to parameter tuning.
export function curvatureDecimate(rawPts, { smoothWindow = 9, minDist = 25 } = {}, start, end) {
  if (rawPts.length < 3) return rawPts;

  // Fall back to first/last point as chord endpoints when not supplied.
  const p0 = start ?? rawPts[0];
  const p1 = end   ?? rawPts[rawPts.length - 1];
  const dx = p1.x - p0.x, dy = p1.y - p0.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) return rawPts;

  const cdx = dx / len, cdy = dy / len;   // chord direction
  const pdx = -cdy,     pdy =  cdx;       // perpendicular

  const n = rawPts.length;

  // Project each raw point onto the perpendicular (amplitude) axis.
  const perp  = rawPts.map(p => (p.x - p0.x) * pdx + (p.y - p0.y) * pdy);
  const chord = rawPts.map(p => (p.x - p0.x) * cdx + (p.y - p0.y) * cdy);

  // Smooth the 1D perpendicular signal to suppress pixel noise.
  const hw = Math.floor(smoothWindow / 2);
  const smooth = perp.map((_, i) => {
    let s = 0, cnt = 0;
    for (let j = Math.max(0, i - hw); j <= Math.min(n - 1, i + hw); j++) { s += perp[j]; cnt++; }
    return s / cnt;
  });

  // Find local extrema of the smoothed signal, then snap each one to the
  // raw-point index with the true perpendicular extremum in a ±hw window.
  // Gate consecutive anchors by minDist (in chord-direction pixels).
  // When two candidates fall within minDist of each other, keep the one
  // with the more extreme perpendicular value (closer to the true peak/dip).
  const result = [rawPts[0]];
  let lastChord   = chord[0];
  let lastBestIdx = -1;   // rawPts index of the last accepted peak/dip (-1 = only start so far)
  let lastBestVal = 0;

  for (let i = 1; i < n - 1; i++) {
    const isMax = smooth[i] >= smooth[i - 1] && smooth[i] > smooth[i + 1];
    const isMin = smooth[i] <= smooth[i - 1] && smooth[i] < smooth[i + 1];
    if (!isMax && !isMin) continue;

    // Snap to the true raw extremum in the local smoothing window.
    const lo = Math.max(0, i - hw), hi = Math.min(n - 1, i + hw);
    let bestIdx = i, bestVal = perp[i];
    for (let j = lo; j <= hi; j++) {
      if (isMax ? perp[j] > bestVal : perp[j] < bestVal) { bestVal = perp[j]; bestIdx = j; }
    }

    if (chord[bestIdx] - lastChord < minDist) {
      // Too close — replace the last accepted peak/dip if this one is more extreme.
      if (lastBestIdx >= 0 && (isMax ? bestVal > lastBestVal : bestVal < lastBestVal)) {
        result[result.length - 1] = rawPts[bestIdx];
        lastChord   = chord[bestIdx];
        lastBestIdx = bestIdx;
        lastBestVal = bestVal;
      }
    } else {
      result.push(rawPts[bestIdx]);
      lastChord   = chord[bestIdx];
      lastBestIdx = bestIdx;
      lastBestVal = bestVal;
    }
  }

  result.push(rawPts[n - 1]);
  return result;
}

// Ramer-Douglas-Peucker polyline simplification.
export function rdpDecimate(points, epsilon = 2.0) {
  if (points.length <= 2) return points;
  const first = points[0], last = points[points.length - 1];
  const dx = last.x - first.x, dy = last.y - first.y;
  const len = Math.hypot(dx, dy);

  let maxDist = 0, maxIdx = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const dist = len > 0
      ? Math.abs((last.y - first.y) * points[i].x - (last.x - first.x) * points[i].y +
                 last.x * first.y - last.y * first.x) / len
      : Math.hypot(points[i].x - first.x, points[i].y - first.y);
    if (dist > maxDist) { maxDist = dist; maxIdx = i; }
  }

  if (maxDist > epsilon) {
    const left  = rdpDecimate(points.slice(0, maxIdx + 1), epsilon);
    const right = rdpDecimate(points.slice(maxIdx), epsilon);
    return [...left.slice(0, -1), ...right];
  }
  return [first, last];
}

// Main auto-trace algorithm.
// Returns a dense array of {x, y} in image-pixel space from start to end.
//
// Primary method: parameterized perpendicular search — at each step along the
// chord, search ±searchBand pixels perpendicular to the chord for pixels matching
// targetColor, then refine to stroke centre.  Works perfectly for monotone traces.
//
// Fallback: directed beam search when the primary search misses too many consecutive
// steps — scans a 60° arc ahead in the last known direction.
export function traceLineFollow(start, end, imageData, targetColor, {
  stepSize   = 3,
  searchBand = 30,
  maxMiss    = 6,
  maxLostSteps = 25,
} = {}) {
  const totalDist = Math.hypot(end.x - start.x, end.y - start.y);
  if (totalDist < 1) return [start, end];

  const N = Math.ceil(totalDist / stepSize);
  const cdx = (end.x - start.x) / totalDist;  // chord unit direction
  const cdy = (end.y - start.y) / totalDist;
  const pdx = -cdy;                             // perpendicular
  const pdy =  cdx;

  const result = [];
  let lastFound = { x: start.x, y: start.y };
  let missStreak = 0;
  let lostStreak = 0;
  let lastDir = { x: cdx, y: cdy };

  // Helper: scan ±band along perp axis, centered on the last found position.
  // Returns the centroid of all matching pixels so the result lands at the
  // stroke centre rather than the nearest edge — this prevents systematic
  // amplitude underestimation near peaks/troughs where "nearest to lastFound"
  // would prefer the inner edge of the stroke.
  function searchPerp(probe) {
    const center = (lastFound.x - probe.x) * pdx + (lastFound.y - probe.y) * pdy;
    let sumS = 0, count = 0;
    for (let s = center - searchBand; s <= center + searchBand; s++) {
      const px = probe.x + pdx * s;
      const py = probe.y + pdy * s;
      if (px < 0 || py < 0 || px >= imageData.width || py >= imageData.height) continue;
      if (isMatch(imageData, px, py, targetColor)) { sumS += s; count++; }
    }
    if (count === 0) return null;
    const bestS = sumS / count;
    return { x: probe.x + pdx * bestS, y: probe.y + pdy * bestS };
  }

  // Helper: directed beam scan (60° arc ahead in lastDir).
  function searchBeam(from) {
    const baseAngle = Math.atan2(lastDir.y, lastDir.x);
    for (const r of [stepSize, stepSize * 2, stepSize * 3]) {
      let best = null, bestDist = Infinity;
      for (let da = -Math.PI / 3; da <= Math.PI / 3; da += 0.08) {
        const px = from.x + Math.cos(baseAngle + da) * r;
        const py = from.y + Math.sin(baseAngle + da) * r;
        if (isMatch(imageData, px, py, targetColor)) {
          const d = Math.hypot(px - from.x, py - from.y);
          if (d < bestDist) { bestDist = d; best = { x: px, y: py }; }
        }
      }
      if (best) return best;
    }
    return null;
  }

  result.push({ x: start.x, y: start.y });

  for (let i = 1; i <= N; i++) {
    const t = i / N;
    const probe = { x: start.x + t * (end.x - start.x), y: start.y + t * (end.y - start.y) };

    let candidate = searchPerp(probe);

    if (!candidate) {
      missStreak++;
      if (missStreak >= maxMiss) {
        // Switch to beam search from last known position.
        candidate = searchBeam(lastFound);
        if (!candidate) {
          lostStreak++;
          if (lostStreak >= maxLostSteps) break;
          continue;
        }
        lostStreak = 0;
      } else {
        continue;
      }
    }

    missStreak = 0;
    lostStreak = 0;

    // Refine to stroke centre.
    const centre = spokeCenter(imageData, targetColor, candidate.x, candidate.y);
    result.push(centre);

    const dx = centre.x - lastFound.x, dy = centre.y - lastFound.y;
    const d = Math.hypot(dx, dy);
    if (d > 0) lastDir = { x: dx / d, y: dy / d };
    lastFound = centre;
  }

  result.push({ x: end.x, y: end.y });
  return result;
}
