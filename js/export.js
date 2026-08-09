import { state } from './state.js';
import { sampleBezierCurve, computeBezierChain } from './bezier.js';
import { fitModel, sampleFit } from './model_fit.js';

export function transformToRealCoordinates(pt) {
  const cs = state.coordinateSystem;
  if (!cs || !cs.xAxis || !cs.yAxis) return { x: pt.x, y: -pt.y };

  // If an origin is set, use scale bar mode: axes define scale factor only,
  // and the origin defines (0,0). Scale = (v2-v1) / pixel_distance of the axis line.
  if (cs.origin) {
    const xPixelLen = Math.hypot(cs.xAxis.p2.x - cs.xAxis.p1.x, cs.xAxis.p2.y - cs.xAxis.p1.y);
    const yPixelLen = Math.hypot(cs.yAxis.p2.x - cs.yAxis.p1.x, cs.yAxis.p2.y - cs.yAxis.p1.y);
    if (xPixelLen === 0 || yPixelLen === 0) return { x: pt.x, y: -pt.y };
    return {
      x: (pt.x - cs.origin.x) * (cs.xAxis.v2 - cs.xAxis.v1) / xPixelLen,
      y: -(pt.y - cs.origin.y) * (cs.yAxis.v2 - cs.yAxis.v1) / yPixelLen,
    };
  }

  // Standard mode: project point onto axis vectors and interpolate.
  const xa = cs.xAxis;
  const ya = cs.yAxis;
  const tiltedAxes = document.getElementById('ignoreTilt')?.checked;

  let xProj, yProj;
  if (tiltedAxes) {
    const xVecX = xa.p2.x - xa.p1.x, xVecY = xa.p2.y - xa.p1.y;
    const xPixelDist = Math.hypot(xVecX, xVecY);
    xProj = ((pt.x - xa.p1.x) * xVecX + (pt.y - xa.p1.y) * xVecY) / (xPixelDist * xPixelDist);

    const yVecX = ya.p2.x - ya.p1.x, yVecY = ya.p2.y - ya.p1.y;
    const yPixelDist = Math.hypot(yVecX, yVecY);
    yProj = ((pt.x - ya.p1.x) * yVecX + (pt.y - ya.p1.y) * yVecY) / (yPixelDist * yPixelDist);
  } else {
    // Default: use only horizontal component for X and vertical for Y.
    xProj = (pt.x - xa.p1.x) / (xa.p2.x - xa.p1.x);
    yProj = (pt.y - ya.p1.y) / (ya.p2.y - ya.p1.y);
  }

  const realX = (cs.logX && xa.v1 > 0 && xa.v2 > 0)
    ? xa.v1 * Math.pow(xa.v2 / xa.v1, xProj)
    : xa.v1 + xProj * (xa.v2 - xa.v1);
  const realY = (cs.logY && ya.v1 > 0 && ya.v2 > 0)
    ? ya.v1 * Math.pow(ya.v2 / ya.v1, yProj)
    : ya.v1 + yProj * (ya.v2 - ya.v1);

  return { x: realX, y: realY };
}

export function collectExportData() {
  if (!state.paths.some(p => p.points.length >= 2)) {
    alert('No data to download. Please add some points first.');
    return null;
  }

  const unprocessedCount = state.paths.filter(p => p.points.length >= 2 && p.lineType === 'none').length;
  if (unprocessedCount > 0) {
    const proceed = confirm(
      `${unprocessedCount} path(s) have points but haven't been processed with "Smooth Curves" or "Straight Lines".\n\nThey will be exported as raw pixel coordinates. Continue anyway?`
    );
    if (!proceed) return null;
  }

  if (!state.coordinateSystem || !state.coordinateSystem.isCustom) {
    const proceed = confirm(
      'No coordinate system has been calibrated. Data will be exported in raw pixel coordinates.\n\nContinue anyway?'
    );
    if (!proceed) return null;
  }

  const globalRelative = document.getElementById('relativeOriginGlobal')?.checked ?? false;

  return state.paths.map(path => {
    const useRelative = path.relativeOrigin !== null ? path.relativeOrigin : globalRelative;

    const base = { name: path.name, color: path.color, line_type: path.lineType, num_points: path.points.length };

    // ── Parametric-model path ──────────────────────────────────────────────
    if (path.modelName && path.lineType === 'smooth' && path.points.length >= 2) {
      // Re-fit the model in real-unit space so exported params and XY values
      // are in the user's calibrated coordinate system, not pixel space.
      const realClickPts = path.points.map(transformToRealCoordinates);
      const exportFit = fitModel(path.modelName, realClickPts);

      let model_params = null;
      let xy_values = { x: [], y: [] };
      if (exportFit && exportFit.success) {
        model_params = { model: path.modelName, ...exportFit.params };
        const samples = sampleFit(exportFit, realClickPts, 200);
        xy_values.x = samples.map(p => round6(p.x));
        xy_values.y = samples.map(p => round6(p.y));
      }

      // Simple Bezier through the N clicked points only (one segment per gap).
      // Control points are transformed to real-unit space for SVG compatibility.
      const clickSegments = computeBezierChain(path.points);
      const bezier_from_clicks = segmentsToSvgPath(clickSegments);

      if (useRelative && xy_values.x.length > 0) {
        const x0 = xy_values.x[0], y0 = xy_values.y[0];
        xy_values.x = xy_values.x.map(v => round6(v - x0));
        xy_values.y = xy_values.y.map(v => round6(v - y0));
      }

      return { ...base, model_params, xy_values, bezier_from_clicks,
               pixel_points: path.points, pixel_segments: path.segments };
    }

    // ── Free-form / straight / unprocessed path ───────────────────────────
    const xPoints = [], yPoints = [];
    if (path.lineType === 'none' || path.lineType === 'straight') {
      path.points.forEach(pt => {
        const t = transformToRealCoordinates(pt);
        xPoints.push(t.x); yPoints.push(t.y);
      });
    } else if (path.lineType === 'smooth' && path.segments.length > 0) {
      path.segments.forEach((segment, idx) => {
        const samples = sampleBezierCurve(segment[0], segment[1], segment[2], segment[3], 50);
        samples.forEach((pt, i) => {
          if (idx === 0 || i > 0) {
            const t = transformToRealCoordinates(pt);
            xPoints.push(t.x); yPoints.push(t.y);
          }
        });
      });
    }

    if (useRelative && xPoints.length > 0) {
      const x0 = xPoints[0], y0 = yPoints[0];
      for (let i = 0; i < xPoints.length; i++) { xPoints[i] -= x0; yPoints[i] -= y0; }
    }

    const result = { ...base, xy_values: { x: xPoints, y: yPoints },
                     pixel_points: path.points };
    if (path.lineType === 'smooth' && path.segments.length > 0) {
      result.bezier_path = segmentsToSvgPath(path.segments);
      result.pixel_segments = path.segments;
    }
    return result;
  });
}

function round6(v) { return Math.round(v * 1e6) / 1e6; }

// Convert an array of [P0,B1,B2,P3] Bezier segments (pixel coords) to an
// SVG path string in real-unit space.
function segmentsToSvgPath(segments) {
  if (!segments.length) return '';
  const tp = pt => transformToRealCoordinates(pt);
  const r = p => `${round6(p.x)} ${round6(p.y)}`;
  const first = tp(segments[0][0]);
  let d = `M ${r(first)}`;
  for (const seg of segments) {
    d += ` C ${r(tp(seg[1]))} ${r(tp(seg[2]))} ${r(tp(seg[3]))}`;
  }
  return d;
}

export function triggerDownload(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}
