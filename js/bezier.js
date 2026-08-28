export function computeBezierChain(points) {
  const n = points.length;
  if (n < 2) return [];
  const curves = [];
  for (let i = 0; i < n - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];

    // B1: if the anchor has a user-dragged outgoing handle use it directly;
    // otherwise Catmull-Rom (corners reflect the far neighbour so the handle
    // stays along the local chord, breaking C1 continuity by design).
    let B1;
    if (p1.corner && p1.handleOut) {
      B1 = { x: p1.x + p1.handleOut.dx, y: p1.y + p1.handleOut.dy };
    } else {
      const p0 = p1.corner ? { x: 2*p1.x - p2.x, y: 2*p1.y - p2.y }
                           : (i > 0 ? points[i - 1] : points[i]);
      B1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    }

    // B2: same logic for the incoming handle at p2.
    let B2;
    if (p2.corner && p2.handleIn) {
      B2 = { x: p2.x + p2.handleIn.dx, y: p2.y + p2.handleIn.dy };
    } else {
      const p3 = p2.corner ? { x: 2*p2.x - p1.x, y: 2*p2.y - p1.y }
                           : (i + 2 < n ? points[i + 2] : points[i + 1]);
      B2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    }

    curves.push([{ x: p1.x, y: p1.y }, B1, B2, { x: p2.x, y: p2.y }]);
  }
  return curves;
}

export function sampleBezierCurve(B0, B1, B2, B3, numPoints = 50) {
  const points = [];
  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    const t2 = t * t;
    const t3 = t2 * t;
    const mt = 1 - t;
    const mt2 = mt * mt;
    const mt3 = mt2 * mt;
    const x = mt3 * B0.x + 3 * mt2 * t * B1.x + 3 * mt * t2 * B2.x + t3 * B3.x;
    const y = mt3 * B0.y + 3 * mt2 * t * B1.y + 3 * mt * t2 * B2.y + t3 * B3.y;
    points.push({ x, y });
  }
  return points;
}
