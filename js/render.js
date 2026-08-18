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
      path.points.forEach(pt => {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 5 / imageScale, 0, Math.PI * 2);
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
            ctx.beginPath();
            ctx.fillStyle = (cpIndex === 0 || cpIndex === 3) ? 'blue' : 'purple';
            ctx.arc(pt.x, pt.y, 6 / imageScale, 0, Math.PI * 2);
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
