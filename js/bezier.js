export function computeBezierChain(points) {
  const n = points.length;
  if (n < 2) return [];
  const curves = [];
  for (let i = 0; i < n - 1; i++) {
    const p0 = i > 0 ? points[i - 1] : points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = i + 2 < n ? points[i + 2] : points[i + 1];
    curves.push([
      { x: p1.x, y: p1.y },
      { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 },
      { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 },
      { x: p2.x, y: p2.y },
    ]);
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
