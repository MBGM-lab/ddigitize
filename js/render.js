import { state } from './state.js';
import { transformToRealCoordinates } from './export.js';

export function setupCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const section = state.plotCanvas.parentElement;
  const cssW = section.clientWidth || 1200;
  // Constrain height to available viewport space so the canvas never scrolls out of view.
  const sectionTop = section.getBoundingClientRect().top;
  const availH = Math.max(300, window.innerHeight - sectionTop - 16);
  const cssH = Math.min(Math.round(cssW * 0.75), availH);
  state.plotCanvas.width = cssW * dpr;
  state.plotCanvas.height = cssH * dpr;
  state.plotCanvas.style.width = cssW + 'px';
  state.plotCanvas.style.height = cssH + 'px';
}

export function getAdjustedCoords(e) {
  const rect = state.plotCanvas.getBoundingClientRect();
  const x = (e.clientX - rect.left - state.imageOffset.x) / state.imageScale;
  const y = (e.clientY - rect.top - state.imageOffset.y) / state.imageScale;
  return { x, y };
}

export function redrawPlotCanvas() {
  const { plotCtx: ctx, plotCanvas: canvas, imageOffset, imageScale,
          uploadedImage, imageVisible, paths, currentPathIndex,
          calibrationMode, calibrationPoints, coordinateSystem } = state;

  const dpr = window.devicePixelRatio || 1;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.translate(imageOffset.x, imageOffset.y);
  ctx.scale(imageScale, imageScale);

  if (uploadedImage && imageVisible) {
    ctx.drawImage(uploadedImage, 0, 0);
  }

  paths.forEach((path, pathIndex) => {
    const isActive = pathIndex === currentPathIndex;

    ctx.fillStyle = isActive ? 'blue' : path.color;

    if (!path.processed || path.extending) {
      // Draw corner anchor handles (arms + dots) underneath the anchor dots.
      path.points.forEach(pt => {
        if (!pt.corner) return;
        const drawHandle = h => {
          if (!h) return;
          const hx = pt.x + h.dx, hy = pt.y + h.dy;
          ctx.beginPath();
          ctx.moveTo(pt.x, pt.y);
          ctx.lineTo(hx, hy);
          ctx.strokeStyle = 'gray';
          ctx.lineWidth = 1 / imageScale;
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(hx, hy, 4 / imageScale, 0, Math.PI * 2);
          ctx.fillStyle = 'purple';
          ctx.fill();
        };
        drawHandle(pt.handleIn);
        drawHandle(pt.handleOut);
      });

      // Draw anchor dots on top.
      path.points.forEach(pt => {
        const r = 5 / imageScale;
        ctx.fillStyle = isActive ? 'blue' : path.color;
        ctx.beginPath();
        if (pt.corner) {
          ctx.rect(pt.x - r, pt.y - r, 2 * r, 2 * r);
        } else if (pt.peak) {
          // Diamond — visually distinct from smooth (circle) and corner (square)
          ctx.moveTo(pt.x,     pt.y - r);
          ctx.lineTo(pt.x + r, pt.y    );
          ctx.lineTo(pt.x,     pt.y + r);
          ctx.lineTo(pt.x - r, pt.y    );
          ctx.closePath();
        } else {
          ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
        }
        ctx.fill();
      });
    }

    if (path.segments.length) {
      path.segments.forEach((segment, segIndex) => {
        ctx.beginPath();
        ctx.moveTo(segment[0].x, segment[0].y);
        ctx.bezierCurveTo(
          segment[1].x, segment[1].y,
          segment[2].x, segment[2].y,
          segment[3].x, segment[3].y
        );
        ctx.strokeStyle = path.color;
        ctx.lineWidth = isActive ? 3 / imageScale : 2 / imageScale;
        ctx.stroke();

        if (isActive) {
          const isStraight = path.lineType === 'straight';
          segment.forEach((pt, cpIndex) => {
            // In straight-line mode handles (cp1, cp2) overlap the anchors — skip them.
            if (isStraight && (cpIndex === 1 || cpIndex === 2)) return;
            const isAnchor = cpIndex === 0 || cpIndex === 3;
            const ptIndex  = cpIndex === 0 ? segIndex : segIndex + 1;
            const srcPt    = path.points[ptIndex];
            const isCorner = isAnchor && srcPt?.corner;
            const isPeak   = isAnchor && srcPt?.peak;
            const r = 6 / imageScale;
            ctx.beginPath();
            ctx.fillStyle = isAnchor ? 'blue' : 'purple';
            if (isCorner) {
              ctx.rect(pt.x - r, pt.y - r, 2 * r, 2 * r);
            } else if (isPeak) {
              ctx.moveTo(pt.x,     pt.y - r);
              ctx.lineTo(pt.x + r, pt.y    );
              ctx.lineTo(pt.x,     pt.y + r);
              ctx.lineTo(pt.x - r, pt.y    );
              ctx.closePath();
            } else {
              ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
            }
            ctx.fill();

            if (cpIndex === 0 && path.points[segIndex]?.symmetric) {
              ctx.save();
              ctx.fillStyle = 'white';
              ctx.font = `${10 / imageScale}px Arial`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText('S', pt.x, pt.y);
              ctx.restore();
            }
            if (cpIndex === 3 && path.points[segIndex + 1]?.symmetric) {
              ctx.save();
              ctx.fillStyle = 'white';
              ctx.font = `${10 / imageScale}px Arial`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText('S', pt.x, pt.y);
              ctx.restore();
            }
          });

          if (!isStraight) {
            ctx.beginPath();
            ctx.moveTo(segment[0].x, segment[0].y);
            ctx.lineTo(segment[1].x, segment[1].y);
            ctx.moveTo(segment[2].x, segment[2].y);
            ctx.lineTo(segment[3].x, segment[3].y);
            ctx.strokeStyle = 'gray';
            ctx.lineWidth = 1 / imageScale;
            ctx.stroke();
          }
        }
      });
    }
  });

  // Active calibration clicks
  if (calibrationMode && calibrationPoints.length > 0) {
    ctx.fillStyle = 'lime';
    calibrationPoints.forEach((pt, idx) => {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 8 / imageScale, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'black';
      ctx.font = `${14 / imageScale}px Arial`;
      ctx.fillText((idx + 1).toString(), pt.x + 10 / imageScale, pt.y);
      ctx.fillStyle = 'lime';
    });
    if (calibrationPoints.length === 2) {
      ctx.beginPath();
      ctx.moveTo(calibrationPoints[0].x, calibrationPoints[0].y);
      ctx.lineTo(calibrationPoints[1].x, calibrationPoints[1].y);
      ctx.strokeStyle = 'lime';
      ctx.lineWidth = 2 / imageScale;
      ctx.stroke();
    }
  }

  if (coordinateSystem && coordinateSystem.isCustom) {
    const { xColor, yColor, width: lw } = state.axisStyle;
    if (coordinateSystem.xAxisCustom && coordinateSystem.xAxis) {
      const xa = coordinateSystem.xAxis;
      ctx.beginPath();
      ctx.moveTo(xa.p1.x, xa.p1.y);
      ctx.lineTo(xa.p2.x, xa.p2.y);
      ctx.strokeStyle = xColor;
      ctx.lineWidth = lw / imageScale;
      ctx.stroke();
      ctx.fillStyle = xColor;
      ctx.font = `${12 / imageScale}px Arial`;
      ctx.fillText(`X: ${xa.v1}`, xa.p1.x, xa.p1.y - 10 / imageScale);
      ctx.fillText(`${xa.v2}`, xa.p2.x, xa.p2.y - 10 / imageScale);
    }
    if (coordinateSystem.yAxisCustom && coordinateSystem.yAxis) {
      const ya = coordinateSystem.yAxis;
      ctx.beginPath();
      ctx.moveTo(ya.p1.x, ya.p1.y);
      ctx.lineTo(ya.p2.x, ya.p2.y);
      ctx.strokeStyle = yColor;
      ctx.lineWidth = lw / imageScale;
      ctx.stroke();
      ctx.fillStyle = yColor;
      ctx.font = `${12 / imageScale}px Arial`;
      ctx.fillText(`Y: ${ya.v1}`, ya.p1.x + 10 / imageScale, ya.p1.y);
      ctx.fillText(`${ya.v2}`, ya.p2.x + 10 / imageScale, ya.p2.y);
    }
    // Origin crosshair (committed)
    if (coordinateSystem.origin) {
      const o = coordinateSystem.origin;
      const sz = 14 / imageScale;
      ctx.strokeStyle = xColor;
      ctx.lineWidth = lw / imageScale;
      ctx.beginPath();
      ctx.moveTo(o.x - sz, o.y); ctx.lineTo(o.x + sz, o.y);
      ctx.moveTo(o.x, o.y - sz); ctx.lineTo(o.x, o.y + sz);
      ctx.stroke();
      ctx.fillStyle = xColor;
      ctx.font = `${11 / imageScale}px Arial`;
      ctx.fillText('(0,0)', o.x + sz + 3 / imageScale, o.y - sz / 2);
    }
  }

  // Highlight ring around the Tab-selected / nearest control point.
  if (state.hoveredCP) {
    const { pathIndex, segIndex, cpIndex } = state.hoveredCP;
    const hPath = paths[pathIndex];
    const hPt   = hPath?.segments[segIndex]?.[cpIndex];
    if (hPt) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 210, 0, 0.95)';
      ctx.lineWidth = 2 / imageScale;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(hPt.x, hPt.y, 10 / imageScale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  if (state.precisionMode) {
    const { x, y } = state.precisionCursor;
    const arm = 12 / imageScale;
    const gap =  3 / imageScale;
    ctx.save();
    ctx.strokeStyle = 'rgba(220,50,50,0.95)';
    ctx.lineWidth = 1.5 / imageScale;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(x - arm, y); ctx.lineTo(x - gap, y);
    ctx.moveTo(x + gap, y); ctx.lineTo(x + arm, y);
    ctx.moveTo(x, y - arm); ctx.lineTo(x, y - gap);
    ctx.moveTo(x, y + gap); ctx.lineTo(x, y + arm);
    ctx.stroke();
    ctx.fillStyle = 'rgba(220,50,50,0.8)';
    ctx.beginPath();
    ctx.arc(x, y, 2 / imageScale, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ── Auto-trace end marker (shown when trace is done, re-run available) ───
  if (state.lineFollowMode && state.lineFollowEnd) {
    const { x, y } = state.lineFollowEnd;
    const r = 8 / imageScale;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.strokeStyle = '#ee6600';
    ctx.lineWidth = 2 / imageScale;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, 2.5 / imageScale, 0, Math.PI * 2);
    ctx.fillStyle = '#ee6600';
    ctx.fill();
    ctx.restore();
  }

  // ── Auto-trace start marker ───────────────────────────────────────────────
  if (state.lineFollowMode && state.lineFollowStart) {
    const { x, y } = state.lineFollowStart;
    const r = 8 / imageScale;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.strokeStyle = '#00cc44';
    ctx.lineWidth = 2 / imageScale;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, 2.5 / imageScale, 0, Math.PI * 2);
    ctx.fillStyle = '#00cc44';
    ctx.fill();
    if (state.lineFollowColor) {
      const { r: cr, g: cg, b: cb } = state.lineFollowColor;
      const swatchSize = 10 / imageScale;
      ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 1 / imageScale;
      ctx.beginPath();
      ctx.rect(x + r + 2 / imageScale, y - swatchSize / 2, swatchSize, swatchSize);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  ctx.restore();

  if (state.zoomRect) {
    const dpr2 = window.devicePixelRatio || 1;
    const zr = state.zoomRect;
    const x = Math.min(zr.x1, zr.x2), y = Math.min(zr.y1, zr.y2);
    const w = Math.abs(zr.x2 - zr.x1), h = Math.abs(zr.y2 - zr.y1);
    ctx.save();
    ctx.scale(dpr2, dpr2);
    ctx.strokeStyle = 'rgba(60,120,220,0.9)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 3]);
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = 'rgba(60,120,220,0.08)';
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  }

  if (state.mousePos) {
    const dpr2 = window.devicePixelRatio || 1;
    const cssW = canvas.width / dpr2;
    const cs = state.coordinateSystem;
    const calibrated = cs && cs.xAxis && cs.yAxis;
    const fmt = n => Number.isFinite(n) ? n.toFixed(3) : '—';
    let label;
    if (calibrated) {
      const real = transformToRealCoordinates(state.mousePos);
      label = `x: ${fmt(real.x)}  y: ${fmt(real.y)}`;
    } else {
      label = `x: ${Math.round(state.mousePos.x)} px  y: ${Math.round(state.mousePos.y)} px`;
    }
    ctx.save();
    ctx.scale(dpr2, dpr2);
    ctx.font = '12px monospace';
    const tw = ctx.measureText(label).width;
    const pad = 5;
    const h = 20;
    const bx = cssW - tw - pad * 2 - 8;
    const by = 8;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(bx, by, tw + pad * 2, h);
    ctx.strokeStyle = '#bbb';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, tw + pad * 2, h);
    ctx.fillStyle = '#333';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, bx + pad, by + h / 2);
    ctx.restore();
  }

}
