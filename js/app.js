import { state, CP_HIT_RADIUS, MAX_UNDO_HISTORY } from './state.js';
import { setupCanvas, redrawPlotCanvas, getAdjustedCoords } from './render.js';
import { createNewPath, getCurrentPath, updatePathList, saveState, undo, redo } from './paths.js';
import { fitPathToImage } from './fit.js';
import { computeBezierChain } from './bezier.js';
import { fitModel, sampleFit } from './model_fit.js';
import { collectExportData, triggerDownload } from './export.js';

// ── Utilities ────────────────────────────────────────────────────────────────

function showError(msg) {
  document.getElementById('errorMessage').textContent = msg;
  document.getElementById('errorBanner').style.display = 'block';
}

function updateCalibrationInfo() {
  const infoSpan = document.getElementById('calibrationInfo');
  const cs = state.coordinateSystem;
  if (!cs || !cs.isCustom) {
    infoSpan.textContent = '(Using default: pixel coordinates)';
  } else {
    const originStr = cs.origin ? ', origin ✓' : '';
    infoSpan.textContent = `(X-axis: ${cs.xAxis ? '✓' : '✗'}, Y-axis: ${cs.yAxis ? '✓' : '✗'}${originStr})`;
  }
}

// ── Canvas init ───────────────────────────────────────────────────────────────

state.plotCanvas = document.getElementById('plotCanvas');
state.plotCtx = state.plotCanvas.getContext('2d');
state.plotCanvas.addEventListener('contextmenu', e => e.preventDefault());

setupCanvas();
let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(
    () => requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!state.uploadedImage) { setupCanvas(); return; }
      const dpr = window.devicePixelRatio || 1;
      const oldW = state.plotCanvas.width / dpr;
      const oldH = state.plotCanvas.height / dpr;
      setupCanvas();
      const newW = state.plotCanvas.width / dpr;
      const newH = state.plotCanvas.height / dpr;
      // Preserve zoom; re-centre pan so the image stays centred in the new canvas.
      state.imageOffset.x += (newW - oldW) / 2;
      state.imageOffset.y += (newH - oldH) / 2;
      redrawPlotCanvas();
    })),
    50
  );
});

// ── Initial path ──────────────────────────────────────────────────────────────

createNewPath('#ff0000');
state.colorIndex = 1;
redrawPlotCanvas();

// ── Click handler ─────────────────────────────────────────────────────────────

function handleClick(e) {
  if (e.shiftKey || e.button === 2 || e.defaultPrevented) return;
  if (didDrag) { didDrag = false; return; }
  if (!state.uploadedImage) return;

  const coords = state.precisionMode ? { ...state.precisionCursor } : getAdjustedCoords(e);

  if (state.calibrationMode) {
    if (state.calibrationAxis === 'origin') {
      const origin = { x: coords.x, y: coords.y };
      state.calibrationOriginPoint = origin;
      if (state.coordinateSystem) state.coordinateSystem.origin = origin;
      state.calibrationMode = false;
      state.calibrationAxis = null;
      document.getElementById('originStatus').textContent =
        `Origin ✓ (${Math.round(coords.x)}, ${Math.round(coords.y)}) px`;
      document.getElementById('calibrationStatus').textContent = 'Origin set.';
      updateCalibrationInfo();
      redrawPlotCanvas();
      updateButtonStates();
    } else if (state.calibrationPoints.length < 2) {
      state.calibrationPoints.push({ x: coords.x, y: coords.y });
      if (state.calibrationPoints.length === 2) {
        document.getElementById('calibrationStatus').textContent =
          'Two points selected. Drag to adjust, enter values and click "Done"';
      }
      redrawPlotCanvas();
      updateButtonStates();
    }
    e.preventDefault();
    return;
  }

  // Block path editing while calibration panel is open
  if (document.getElementById('calibrationPanel').style.display !== 'none') {
    e.preventDefault();
    return;
  }

  const path = getCurrentPath();

  // Alt+Click: remove closest point
  if (e.altKey) {
    saveState();
    let closestIndex = -1, closestDist = Infinity;
    path.points.forEach((pt, idx) => {
      const dist = Math.hypot(pt.x - coords.x, pt.y - coords.y);
      if (dist < closestDist && dist < 10) { closestDist = dist; closestIndex = idx; }
    });
    if (closestIndex >= 0) {
      path.points.splice(closestIndex, 1);
      if (path.lineType === 'smooth' && path.segments.length > 0) {
        const prevSeg = closestIndex > 0 ? path.segments[closestIndex - 1] : null;
        const nextSeg = closestIndex < path.segments.length ? path.segments[closestIndex] : null;
        if (prevSeg && nextSeg) {
          // Interior point: merge the two adjacent segments into one, preserving
          // the outgoing tangent from the left neighbour and incoming tangent to
          // the right neighbour so the rest of the curve is undisturbed.
          path.segments.splice(closestIndex - 1, 2,
            [prevSeg[0], prevSeg[1], nextSeg[2], nextSeg[3]]);
        } else {
          // Endpoint: just drop the one adjacent segment.
          path.segments.splice(prevSeg ? closestIndex - 1 : 0, 1);
        }
      } else if (path.lineType === 'straight') {
        path.segments = [];
        for (let i = 0; i < path.points.length - 1; i++) {
          const p0 = path.points[i], p1 = path.points[i + 1];
          path.segments.push([p0, p0, p1, p1]);
        }
      }
      updatePathList();
      redrawPlotCanvas();
      e.preventDefault();
    }
    return;
  }

  // Ctrl+Click: insert point on nearest segment (works on any path with segments)
  if (e.ctrlKey && path.segments.length > 0) {
    let bestInsertIndex = -1, minDist = Infinity;
    path.segments.forEach((seg, i) => {
      for (let s = 0; s <= 30; s++) {
        const t = s / 30, mt = 1 - t;
        const bx = mt*mt*mt*seg[0].x + 3*mt*mt*t*seg[1].x + 3*mt*t*t*seg[2].x + t*t*t*seg[3].x;
        const by = mt*mt*mt*seg[0].y + 3*mt*mt*t*seg[1].y + 3*mt*t*t*seg[2].y + t*t*t*seg[3].y;
        const d = Math.hypot(coords.x - bx, coords.y - by);
        if (d < minDist) { minDist = d; bestInsertIndex = i + 1; }
      }
    });
    const hitRadius = 20 / state.imageScale;
    if (bestInsertIndex >= 0 && minDist < hitRadius) {
      saveState();
      path.points.splice(bestInsertIndex, 0, { x: coords.x, y: coords.y, symmetric: false });
      if (path.lineType === 'straight') {
        path.segments = [];
        for (let i = 0; i < path.points.length - 1; i++) {
          const p0 = path.points[i], p1 = path.points[i + 1];
          path.segments.push([p0, p0, p1, p1]);
        }
      } else if (path.lineType === 'smooth') {
        const seg = bestInsertIndex - 1;
        if (seg >= 0 && seg < path.segments.length) {
          const old = path.segments[seg];
          const np = { x: coords.x, y: coords.y };
          const newSeg1 = [old[0],
            { x: (old[0].x * 2 + np.x) / 3, y: (old[0].y * 2 + np.y) / 3 },
            { x: (old[0].x + np.x * 2) / 3, y: (old[0].y + np.y * 2) / 3 },
            np];
          const newSeg2 = [np,
            { x: (np.x * 2 + old[3].x) / 3, y: (np.y * 2 + old[3].y) / 3 },
            { x: (np.x + old[3].x * 2) / 3, y: (np.y + old[3].y * 2) / 3 },
            old[3]];
          path.segments.splice(seg, 1, newSeg1, newSeg2);
          path.points[bestInsertIndex].symmetric = true;
          // path stays processed — segment is split in place, no re-fit needed
        }
      }
      updatePathList();
      redrawPlotCanvas();
    }
    e.preventDefault();
    return;
  }

  if (path.processed && !path.extending) return;
  saveState('add_point');
  path.points.push({ x: coords.x, y: coords.y, symmetric: false });
  document.getElementById('canvasHint').style.display = 'none';
  updatePathList();
  redrawPlotCanvas();
}

state.plotCanvas.addEventListener('click', handleClick);

// ── Symmetry helper ───────────────────────────────────────────────────────────

function applySymmetry(pathIndex, segIndex, cpIndex, newPos) {
  const path = state.paths[pathIndex];
  const segment = path.segments[segIndex];
  const lockLength = document.getElementById('lockHandleLength').checked;

  if (cpIndex === 1 && path.points[segIndex]?.symmetric && segIndex > 0) {
    const anchor = segment[0];
    const dx = newPos.x - anchor.x, dy = newPos.y - anchor.y;
    const mirrorAngle = Math.atan2(dy, dx) + Math.PI;
    const prev = path.segments[segIndex - 1];
    const mirrorDist = lockLength ? Math.hypot(dx, dy)
      : Math.hypot(prev[2].x - anchor.x, prev[2].y - anchor.y);
    prev[2] = { x: anchor.x + Math.cos(mirrorAngle) * mirrorDist, y: anchor.y + Math.sin(mirrorAngle) * mirrorDist };
  }

  if (cpIndex === 2 && path.points[segIndex + 1]?.symmetric && segIndex < path.segments.length - 1) {
    const anchor = segment[3];
    const dx = newPos.x - anchor.x, dy = newPos.y - anchor.y;
    const mirrorAngle = Math.atan2(dy, dx) + Math.PI;
    const next = path.segments[segIndex + 1];
    const mirrorDist = lockLength ? Math.hypot(dx, dy)
      : Math.hypot(next[1].x - anchor.x, next[1].y - anchor.y);
    next[1] = { x: anchor.x + Math.cos(mirrorAngle) * mirrorDist, y: anchor.y + Math.sin(mirrorAngle) * mirrorDist };
  }
}

// ── Mouse: zoom, pan, right-click symmetry toggle ─────────────────────────────

// ── Zoom helpers ──────────────────────────────────────────────────────────────

function updateZoomDisplay() {
  document.getElementById('zoomLevel').textContent = Math.round(state.imageScale * 100) + '%';
}

function fitToWindow() {
  if (!state.uploadedImage) return;
  const dpr = window.devicePixelRatio || 1;
  const cssW = state.plotCanvas.width / dpr;
  const cssH = state.plotCanvas.height / dpr;
  const scale = Math.min(cssW / state.uploadedImage.width, cssH / state.uploadedImage.height) * 0.95;
  state.imageScale = scale;
  state.imageOffset.x = (cssW - state.uploadedImage.width * scale) / 2;
  state.imageOffset.y = (cssH - state.uploadedImage.height * scale) / 2;
  updateZoomDisplay();
  redrawPlotCanvas();
}

document.getElementById('fitBtn').addEventListener('click', fitToWindow);

document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === '0') { e.preventDefault(); fitToWindow(); }
});

// ── Zoom rectangle (Shift+drag) ───────────────────────────────────────────────

state.plotCanvas.addEventListener('mousedown', e => {
  if (e.button !== 0 || !e.shiftKey || e.ctrlKey) return;  // Ctrl+Shift reserved for path drag
  const rect = state.plotCanvas.getBoundingClientRect();
  const x = e.clientX - rect.left, y = e.clientY - rect.top;
  state.zoomRect = { x1: x, y1: y, x2: x, y2: y };
  e.preventDefault();
});

// ── Whole-path drag (Ctrl+Shift+drag) ────────────────────────────────────────

let pathDragSnapshot = null;
state.plotCanvas.addEventListener('mousedown', e => {
  if (e.button !== 0 || !e.shiftKey || !e.ctrlKey) return;
  if (!state.uploadedImage) return;
  const path = getCurrentPath();
  if (!path || (path.points.length === 0 && !path.processed)) return;
  const coords = getAdjustedCoords(e);
  pathDragSnapshot = {
    type: 'path_change', pathIndex: state.currentPathIndex,
    pathSnapshot: JSON.parse(JSON.stringify(path)),
    currentPathIndex: state.currentPathIndex,
    pathIdCounter: state.pathIdCounter, colorIndex: state.colorIndex,
  };
  state.draggingPath = { pathIndex: state.currentPathIndex, lastMousePos: { x: coords.x, y: coords.y } };
  e.preventDefault();
});

state.plotCanvas.addEventListener('mousemove', e => {
  if (!state.zoomRect) return;
  const rect = state.plotCanvas.getBoundingClientRect();
  state.zoomRect.x2 = e.clientX - rect.left;
  state.zoomRect.y2 = e.clientY - rect.top;
  redrawPlotCanvas();
});

state.plotCanvas.addEventListener('mouseup', e => {
  if (!state.zoomRect) return;
  const dpr = window.devicePixelRatio || 1;
  const cssW = state.plotCanvas.width / dpr;
  const cssH = state.plotCanvas.height / dpr;
  const x1 = Math.min(state.zoomRect.x1, state.zoomRect.x2);
  const x2 = Math.max(state.zoomRect.x1, state.zoomRect.x2);
  const y1 = Math.min(state.zoomRect.y1, state.zoomRect.y2);
  const y2 = Math.max(state.zoomRect.y1, state.zoomRect.y2);
  const w = x2 - x1, h = y2 - y1;
  if (w > 8 && h > 8) {
    const imgX = (x1 - state.imageOffset.x) / state.imageScale;
    const imgY = (y1 - state.imageOffset.y) / state.imageScale;
    const imgW = w / state.imageScale;
    const imgH = h / state.imageScale;
    const newScale = Math.min(cssW / imgW, cssH / imgH);
    state.imageScale = Math.max(0.05, Math.min(40,newScale));
    state.imageOffset.x = cssW / 2 - (imgX + imgW / 2) * state.imageScale;
    state.imageOffset.y = cssH / 2 - (imgY + imgH / 2) * state.imageScale;
    updateZoomDisplay();
  }
  state.zoomRect = null;
  redrawPlotCanvas();
});

state.plotCanvas.addEventListener('wheel', e => {
  e.preventDefault();
  const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
  state.imageScale = Math.max(0.05, Math.min(40,state.imageScale * zoomFactor));
  updateZoomDisplay();
  redrawPlotCanvas();
});

state.plotCanvas.addEventListener('mousedown', e => {
  if (e.button !== 2) return;
  const coords = getAdjustedCoords(e);
  const path = getCurrentPath();
  let clickedAnchor = false;

  if (path.processed && path.segments.length > 0) {
    const checked = new Set();
    path.segments.forEach((segment, segIndex) => {
      if (!checked.has(segIndex)) {
        checked.add(segIndex);
        if (Math.hypot(segment[0].x - coords.x, segment[0].y - coords.y) < CP_HIT_RADIUS) {
          path.points[segIndex].symmetric = !path.points[segIndex].symmetric;
          clickedAnchor = true;
          redrawPlotCanvas();
          e.preventDefault();
        }
      }
    });

    if (!clickedAnchor) {
      const lastSeg = path.segments[path.segments.length - 1];
      if (Math.hypot(lastSeg[3].x - coords.x, lastSeg[3].y - coords.y) < CP_HIT_RADIUS) {
        path.points[path.segments.length].symmetric = !path.points[path.segments.length].symmetric;
        clickedAnchor = true;
        redrawPlotCanvas();
        e.preventDefault();
      }
    }
  }

  if (!clickedAnchor) {
    state.panning = true;
    state.panStart = { x: e.clientX, y: e.clientY };
    state.initialOffset = { x: state.imageOffset.x, y: state.imageOffset.y };
  }
  e.preventDefault();
});

state.plotCanvas.addEventListener('mousemove', e => {
  if (state.panning) {
    state.imageOffset.x = state.initialOffset.x + (e.clientX - state.panStart.x);
    state.imageOffset.y = state.initialOffset.y + (e.clientY - state.panStart.y);
    redrawPlotCanvas();
  }
});

state.plotCanvas.addEventListener('mouseup', e => {
  if (e.button === 2) state.panning = false;
});

// ── Nearby-CP helper (screen-pixel hit radius) ───────────────────────────────

function getNearbyCP(coords) {
  const path = getCurrentPath();
  if (!path?.segments.length) return [];
  const hitR = CP_HIT_RADIUS / state.imageScale;
  const results = [];
  path.segments.forEach((segment, segIndex) => {
    segment.forEach((pt, cpIndex) => {
      if (path.lineType === 'straight' && cpIndex !== 0 && cpIndex !== 3) return;
      const d = Math.hypot(pt.x - coords.x, pt.y - coords.y);
      if (d < hitR) results.push({ pathIndex: state.currentPathIndex, segIndex, cpIndex, dist: d });
    });
  });
  return results.sort((a, b) => a.dist - b.dist);
}

// ── Mouse: control point dragging ─────────────────────────────────────────────

let didDrag = false;
let cpDragSnapshot = null;
state.plotCanvas.addEventListener('mousedown', () => { didDrag = false; cpDragSnapshot = null; });

let draggingCalibPoint = null;
let draggingOrigin = false;

state.plotCanvas.addEventListener('mousedown', e => {
  if (e.button !== 0 || e.shiftKey) return;
  if (!state.uploadedImage) return;
  const coords = getAdjustedCoords(e);

  // Calibration point dragging takes priority.
  if (state.calibrationMode && state.calibrationPoints.length === 2) {
    const hitRadius = 10 / state.imageScale;
    for (let i = 0; i < 2; i++) {
      const pt = state.calibrationPoints[i];
      if (Math.hypot(pt.x - coords.x, pt.y - coords.y) < hitRadius) {
        draggingCalibPoint = i;
        e.preventDefault();
        return;
      }
    }
  }

  // Origin crosshair drag — available whenever panel is open and origin exists
  if (document.getElementById('calibrationPanel').style.display !== 'none' &&
      !state.calibrationMode && state.calibrationOriginPoint) {
    const hitRadius = 12 / state.imageScale;
    if (Math.hypot(state.calibrationOriginPoint.x - coords.x,
                   state.calibrationOriginPoint.y - coords.y) < hitRadius) {
      draggingOrigin = true;
      e.preventDefault();
      return;
    }
  }

  const path = getCurrentPath();
  if (!path.segments.length) return;
  const hitR = CP_HIT_RADIUS / state.imageScale;

  // Prefer the Tab-pre-selected CP if it is still within range; otherwise pick closest.
  let target = null;
  const hov = state.hoveredCP;
  if (hov && hov.pathIndex === state.currentPathIndex) {
    const pt = path.segments[hov.segIndex]?.[hov.cpIndex];
    if (pt && Math.hypot(pt.x - coords.x, pt.y - coords.y) < hitR) target = hov;
  }
  if (!target) {
    let minDist = hitR;
    path.segments.forEach((segment, segIndex) => {
      segment.forEach((pt, cpIndex) => {
        if (path.lineType === 'straight' && cpIndex !== 0 && cpIndex !== 3) return;
        const d = Math.hypot(pt.x - coords.x, pt.y - coords.y);
        if (d < minDist) { minDist = d; target = { pathIndex: state.currentPathIndex, segIndex, cpIndex }; }
      });
    });
  }
  if (target) {
    const { segIndex, cpIndex } = target;
    cpDragSnapshot = {
      type: 'path_change', pathIndex: state.currentPathIndex,
      pathSnapshot: JSON.parse(JSON.stringify(path)),
      currentPathIndex: state.currentPathIndex,
      pathIdCounter: state.pathIdCounter, colorIndex: state.colorIndex,
    };
    state.draggingCP = { pathIndex: state.currentPathIndex, segIndex, cpIndex, moveWithHandles: e.ctrlKey,
                         lastMousePos: { x: coords.x, y: coords.y } };
    e.preventDefault();
  }
});

state.plotCanvas.addEventListener('mousemove', e => {
  const coords = getAdjustedCoords(e);
  if (draggingCalibPoint !== null) {
    didDrag = true;
    state.calibrationPoints[draggingCalibPoint] = { x: coords.x, y: coords.y };
    redrawPlotCanvas();
    return;
  }
  if (draggingOrigin) {
    didDrag = true;
    const origin = { x: coords.x, y: coords.y };
    state.calibrationOriginPoint = origin;
    if (state.coordinateSystem) state.coordinateSystem.origin = { ...origin };
    document.getElementById('originStatus').textContent =
      `Origin ✓ (${Math.round(coords.x)}, ${Math.round(coords.y)}) px`;
    redrawPlotCanvas();
    return;
  }
  if (state.draggingPath) {
    didDrag = true;
    const { pathIndex, lastMousePos } = state.draggingPath;
    const dx = coords.x - lastMousePos.x, dy = coords.y - lastMousePos.y;
    state.draggingPath.lastMousePos = { x: coords.x, y: coords.y };
    const p = state.paths[pathIndex];
    p.points.forEach(pt => { pt.x += dx; pt.y += dy; });
    p.segments.forEach(seg => seg.forEach(pt => { pt.x += dx; pt.y += dy; }));
    redrawPlotCanvas();
    return;
  }
  if (!state.draggingCP) return;
  didDrag = true;
  const { pathIndex, segIndex, cpIndex, lastMousePos } = state.draggingCP;
  const factor = e.shiftKey ? 0.2 : 1.0;
  const dx = (coords.x - lastMousePos.x) * factor;
  const dy = (coords.y - lastMousePos.y) * factor;
  state.draggingCP.lastMousePos = { x: coords.x, y: coords.y };
  const path = state.paths[pathIndex];
  const oldPos = { ...path.segments[segIndex][cpIndex] };
  const newPos = { x: oldPos.x + dx, y: oldPos.y + dy };
  path.segments[segIndex][cpIndex] = newPos;

  if (path.lineType === 'straight') {
    // Keep handles coincident with their anchor so lines stay straight.
    if (cpIndex === 0) {
      path.segments[segIndex][1] = { ...newPos };
      if (segIndex > 0) {
        path.segments[segIndex - 1][3] = { ...newPos };
        path.segments[segIndex - 1][2] = { ...newPos };
      }
      path.points[segIndex] = { ...path.points[segIndex], ...newPos };
    } else if (cpIndex === 3) {
      path.segments[segIndex][2] = { ...newPos };
      if (segIndex < path.segments.length - 1) {
        path.segments[segIndex + 1][0] = { ...newPos };
        path.segments[segIndex + 1][1] = { ...newPos };
      }
      path.points[segIndex + 1] = { ...path.points[segIndex + 1], ...newPos };
    }
  } else {
    if (cpIndex === 3 && segIndex < path.segments.length - 1) path.segments[segIndex + 1][0] = { ...newPos };
    if (cpIndex === 0 && segIndex > 0) path.segments[segIndex - 1][3] = { ...newPos };
    // Keep path.points in sync with dragged anchors so re-running "Smooth Curves"
    // uses the updated position rather than bouncing back to the original click position.
    if (cpIndex === 0) path.points[segIndex] = { ...path.points[segIndex], ...newPos };
    if (cpIndex === 3) path.points[segIndex + 1] = { ...path.points[segIndex + 1], ...newPos };
    // Ctrl+drag on an anchor: translate both handles with it to preserve local curve shape.
    if (state.draggingCP.moveWithHandles) {
      const dx = newPos.x - oldPos.x, dy = newPos.y - oldPos.y;
      if (cpIndex === 0) {
        path.segments[segIndex][1].x += dx; path.segments[segIndex][1].y += dy;
        if (segIndex > 0) { path.segments[segIndex - 1][2].x += dx; path.segments[segIndex - 1][2].y += dy; }
      }
      if (cpIndex === 3) {
        path.segments[segIndex][2].x += dx; path.segments[segIndex][2].y += dy;
        if (segIndex < path.segments.length - 1) { path.segments[segIndex + 1][1].x += dx; path.segments[segIndex + 1][1].y += dy; }
      }
    }
    applySymmetry(pathIndex, segIndex, cpIndex, newPos);
  }
  redrawPlotCanvas();
});

state.plotCanvas.addEventListener('mouseup', () => {
  if (didDrag && cpDragSnapshot) {
    state.redoHistory = [];
    state.undoHistory.push(cpDragSnapshot);
    if (state.undoHistory.length > MAX_UNDO_HISTORY) state.undoHistory.shift();
  }
  if (didDrag && pathDragSnapshot) {
    state.redoHistory = [];
    state.undoHistory.push(pathDragSnapshot);
    if (state.undoHistory.length > MAX_UNDO_HISTORY) state.undoHistory.shift();
  }
  cpDragSnapshot = null;
  pathDragSnapshot = null;
  draggingCalibPoint = null;
  draggingOrigin = false;
  state.draggingCP = null;
  state.draggingPath = null;
});

// ── Cursor management ─────────────────────────────────────────────────────────

function updateCursor(e) {
  const canvas = state.plotCanvas;

  if (state.zoomRect) { canvas.style.cursor = 'crosshair'; return; }
  if (state.draggingPath) { canvas.style.cursor = 'move'; return; }
  if (state.panning || state.draggingCP || draggingCalibPoint !== null || draggingOrigin) {
    canvas.style.cursor = 'grabbing';
    return;
  }
  if (state.calibrationMode) {
    // Hoverable calib points become grab targets once placed.
    if (e && state.calibrationPoints.length === 2) {
      const coords = getAdjustedCoords(e);
      const hitRadius = 10 / state.imageScale;
      for (const pt of state.calibrationPoints) {
        if (Math.hypot(pt.x - coords.x, pt.y - coords.y) < hitRadius) {
          canvas.style.cursor = 'grab';
          return;
        }
      }
    }
    canvas.style.cursor = 'crosshair';
    return;
  }

  // Panel open but not in active calibration mode — origin crosshair is draggable
  if (document.getElementById('calibrationPanel').style.display !== 'none') {
    if (e && state.calibrationOriginPoint) {
      const coords = getAdjustedCoords(e);
      const hitRadius = 12 / state.imageScale;
      if (Math.hypot(state.calibrationOriginPoint.x - coords.x,
                     state.calibrationOriginPoint.y - coords.y) < hitRadius) {
        canvas.style.cursor = 'grab';
        return;
      }
    }
    canvas.style.cursor = 'default';
    return;
  }

  const path = getCurrentPath();
  if (!path || !state.uploadedImage) { canvas.style.cursor = 'default'; return; }

  if (!path.processed) {
    canvas.style.cursor = 'crosshair';
    return;
  }

  // Hover over any control point → grab.
  if (e && path.segments.length > 0) {
    const coords = getAdjustedCoords(e);
    for (const segment of path.segments) {
      for (const pt of segment) {
        if (Math.hypot(pt.x - coords.x, pt.y - coords.y) < CP_HIT_RADIUS) {
          canvas.style.cursor = 'grab';
          return;
        }
      }
    }
  }

  canvas.style.cursor = 'default';
}

state.plotCanvas.addEventListener('mousemove', updateCursor);
state.plotCanvas.addEventListener('mouseup', () => updateCursor(null));

// ── Coordinate readout ────────────────────────────────────────────────────────

state.plotCanvas.addEventListener('mousemove', e => {
  const coords = getAdjustedCoords(e);
  if (state.precisionMode && !state.draggingCP) {
    const prev = state.mousePos;
    if (prev) {
      state.precisionCursor.x += (coords.x - prev.x) * 0.2;
      state.precisionCursor.y += (coords.y - prev.y) * 0.2;
    }
  }
  state.mousePos = coords;
  // Keep hoveredCP tracking nearest CP; preserve Tab selection while it stays in range.
  if (!state.draggingCP) {
    const nearby = getNearbyCP(coords);
    const cur = state.hoveredCP;
    const tabStillNear = cur && nearby.some(n => n.segIndex === cur.segIndex && n.cpIndex === cur.cpIndex);
    state.hoveredCP = tabStillNear ? cur : (nearby[0] ?? null);
  }
  redrawPlotCanvas();
});

state.plotCanvas.addEventListener('mouseleave', () => {
  state.mousePos = null;
  state.hoveredCP = null;
  redrawPlotCanvas();
});

// ── Button: new path ──────────────────────────────────────────────────────────

document.getElementById('newPathBtn').addEventListener('click', () => {
  createNewPath();
  redrawPlotCanvas();
  updateButtonStates();
});

// ── Curve model selector ──────────────────────────────────────────────────────

const MODEL_INFO = {
  free:       { label: 'Free',                minPoints: 2,  hint: null },
  single_exp: { label: 'Single exponential',  minPoints: 4,  hint: 'Place ≥ 4 points from the peak through the decay to the asymptote. Points before the peak are ignored.' },
  double_exp: { label: 'Double exponential',  minPoints: 6,  hint: 'Place ≥ 6 points from the peak through the decay to the asymptote. Points before the peak are ignored.' },
  sigmoid:    { label: 'Sigmoid (Boltzmann)', minPoints: 4,  hint: 'Place ≥ 4 points spread across the rising phase and both plateaus.' },
  gaussian:   { label: 'Gaussian',            minPoints: 4,  hint: 'Place ≥ 4 points: baseline on both sides, the flanks, and the peak.' },
};

function updateModelHint() {
  const info = MODEL_INFO[state.curveModel];
  const hintEl = document.getElementById('modelHint');
  if (info.hint) {
    hintEl.textContent = info.hint;
    hintEl.style.display = 'block';
  } else {
    hintEl.style.display = 'none';
  }
}

document.getElementById('curveModel').addEventListener('change', e => {
  state.curveModel = e.target.value;
  updateModelHint();
  updateButtonStates();
});

updateModelHint();

// ── Button: color picker ──────────────────────────────────────────────────────

document.getElementById('pathColor').addEventListener('input', e => {
  getCurrentPath().color = e.target.value;
  updatePathList();
  redrawPlotCanvas();
});

// ── Button: toggle image ──────────────────────────────────────────────────────

document.getElementById('toggleImageBtn').addEventListener('click', () => {
  state.imageVisible = !state.imageVisible;
  document.getElementById('toggleImageBtn').textContent = state.imageVisible ? 'Hide Image' : 'Show Image';
  redrawPlotCanvas();
});

// ── Image loading ─────────────────────────────────────────────────────────────

function loadImageFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const reader = new FileReader();
  reader.onload = event => {
    state.uploadedImage = new Image();
    state.uploadedImage.onload = () => {
      state.imageScale = 1;
      state.imageOffset.x = 0;
      state.imageOffset.y = 0;
      state.paths = [];
      state.pathIdCounter = 0;
      createNewPath('#ff0000');
      state.colorIndex = 1;
      state.imageVisible = true;
      document.getElementById('toggleImageBtn').style.display = 'inline-block';
      document.getElementById('uploadOverlay').style.display = 'none';

      state.coordinateSystem = {
        xAxis: {
          p1: { x: 0, y: state.uploadedImage.height },
          p2: { x: state.uploadedImage.width, y: state.uploadedImage.height },
          v1: 0, v2: state.uploadedImage.width
        },
        yAxis: {
          p1: { x: 0, y: state.uploadedImage.height },
          p2: { x: 0, y: 0 },
          v1: 0, v2: state.uploadedImage.height
        }
      };

      const offscreen = document.createElement('canvas');
      offscreen.width = state.uploadedImage.width;
      offscreen.height = state.uploadedImage.height;
      const offCtx = offscreen.getContext('2d');
      offCtx.drawImage(state.uploadedImage, 0, 0);
      state.imagePixelData = offCtx.getImageData(0, 0, offscreen.width, offscreen.height);

      fitToWindow();
      redrawPlotCanvas();
      updateButtonStates();
    };
    state.uploadedImage.src = event.target.result;
  };
  reader.readAsDataURL(file);
}

document.getElementById('imageUpload').addEventListener('change', e => {
  loadImageFile(e.target.files[0]);
});

// ── Drag-and-drop ─────────────────────────────────────────────────────────────
// The upload overlay (visible when no image is loaded) covers the canvas, so it
// must be the drop target when visible — Firefox does not fire drag events on
// canvas elements beneath a stacked element. The overlay's pointer-events are
// therefore left as the default (auto), and canvasSection handles drops when the
// overlay is hidden (image already loaded).

const canvasSection = document.getElementById('canvasSection');

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
}
function handleDrop(e) {
  e.preventDefault();
  canvasSection.classList.remove('drag-over');
  let file = e.dataTransfer.files?.[0];
  if (!file) {
    for (const item of (e.dataTransfer.items ?? [])) {
      if (item.kind === 'file') { file = item.getAsFile(); break; }
    }
  }
  if (!file && e.dataTransfer.types.length === 0) {
    // Firefox on Wayland delivers an empty DataTransfer — browser-level limitation.
    showError('Drag-and-drop is unavailable in Firefox on Wayland. Use Browse or Ctrl+V instead, or restart Firefox with MOZ_ENABLE_WAYLAND=0.');
    return;
  }
  loadImageFile(file);
}

canvasSection.addEventListener('dragenter', e => {
  e.preventDefault();
  canvasSection.classList.add('drag-over');
});
canvasSection.addEventListener('dragleave', e => {
  if (!canvasSection.contains(e.relatedTarget)) {
    canvasSection.classList.remove('drag-over');
  }
});
canvasSection.addEventListener('dragover', handleDragOver);
canvasSection.addEventListener('drop', handleDrop);

// ── Paste from clipboard (Ctrl+V) ─────────────────────────────────────────────

document.addEventListener('paste', e => {
  const item = Array.from(e.clipboardData.items).find(i => i.type.startsWith('image/'));
  if (item) loadImageFile(item.getAsFile());
});

// ── Calibration buttons ───────────────────────────────────────────────────────

document.getElementById('calibrateBtn').addEventListener('click', () => {
  const panel = document.getElementById('calibrationPanel');
  const isVisible = panel.style.display !== 'none';
  panel.style.display = isVisible ? 'none' : 'block';
  if (!isVisible) {
    updateCalibrationInfo();
    const cs = state.coordinateSystem;
    // Sync style inputs to current state
    document.getElementById('xAxisColor').value = state.axisStyle.xColor;
    document.getElementById('yAxisColor').value = state.axisStyle.yColor;
    document.getElementById('axisLineWidth').value = state.axisStyle.width;
    document.getElementById('xLogScale').checked = !!cs?.logX;
    document.getElementById('yLogScale').checked = !!cs?.logY;
    // Resize canvas after panel has fully reflowed (double rAF ensures layout is stable); keep current zoom/pan
    requestAnimationFrame(() => requestAnimationFrame(() => { setupCanvas(); redrawPlotCanvas(); }));
    // Load existing origin into temp state
    state.calibrationOriginPoint = cs?.origin ? { ...cs.origin } : null;
    document.getElementById('originStatus').textContent = state.calibrationOriginPoint
      ? `Origin ✓ (${Math.round(state.calibrationOriginPoint.x)}, ${Math.round(state.calibrationOriginPoint.y)}) px`
      : '';
    const alreadyCalibrated = !!cs?.xAxisCustom;
    state.calibrationMode = !alreadyCalibrated;
    state.calibrationAxis = alreadyCalibrated ? null : 'x';
    state.calibrationPoints = [];
    document.getElementById('calibrationStatus').textContent =
      alreadyCalibrated ? '' : 'Click two points on the X-axis';
  } else {
    state.calibrationMode = false;
    state.calibrationAxis = null;
    state.calibrationPoints = [];
    document.getElementById('calibrationStatus').textContent = '';
    requestAnimationFrame(() => { setupCanvas(); redrawPlotCanvas(); });
  }
  updateButtonStates();
});

// Live-update axis labels on the canvas when numeric values are edited.
['x1Val', 'x2Val'].forEach(id => {
  document.getElementById(id).addEventListener('input', () => {
    if (!state.coordinateSystem?.xAxisCustom) return;
    const v1 = parseFloat(document.getElementById('x1Val').value);
    const v2 = parseFloat(document.getElementById('x2Val').value);
    if (!isNaN(v1)) state.coordinateSystem.xAxis.v1 = v1;
    if (!isNaN(v2)) state.coordinateSystem.xAxis.v2 = v2;
    redrawPlotCanvas();
  });
});
['y1Val', 'y2Val'].forEach(id => {
  document.getElementById(id).addEventListener('input', () => {
    if (!state.coordinateSystem?.yAxisCustom) return;
    const v1 = parseFloat(document.getElementById('y1Val').value);
    const v2 = parseFloat(document.getElementById('y2Val').value);
    if (!isNaN(v1)) state.coordinateSystem.yAxis.v1 = v1;
    if (!isNaN(v2)) state.coordinateSystem.yAxis.v2 = v2;
    redrawPlotCanvas();
  });
});

document.getElementById('setXAxis').addEventListener('click', () => {
  state.calibrationMode = true;
  state.calibrationAxis = 'x';
  state.calibrationPoints = [];
  document.getElementById('calibrationStatus').textContent = 'Click two points on the X-axis';
  redrawPlotCanvas();
  updateButtonStates();
});

document.getElementById('setYAxis').addEventListener('click', () => {
  state.calibrationMode = true;
  state.calibrationAxis = 'y';
  state.calibrationPoints = [];
  document.getElementById('calibrationStatus').textContent = 'Click two points on the Y-axis';
  redrawPlotCanvas();
  updateButtonStates();
});

document.getElementById('setOriginBtn').addEventListener('click', () => {
  state.calibrationMode = true;
  state.calibrationAxis = 'origin';
  state.calibrationPoints = [];
  document.getElementById('calibrationStatus').textContent = 'Click the origin (0,0) on the image';
  redrawPlotCanvas();
  updateButtonStates();
});

document.getElementById('xAxisColor').addEventListener('input', e => {
  state.axisStyle.xColor = e.target.value;
  redrawPlotCanvas();
});
document.getElementById('yAxisColor').addEventListener('input', e => {
  state.axisStyle.yColor = e.target.value;
  redrawPlotCanvas();
});
document.getElementById('axisLineWidth').addEventListener('input', e => {
  const w = parseFloat(e.target.value);
  if (w > 0) { state.axisStyle.width = w; redrawPlotCanvas(); }
});
document.getElementById('xLogScale').addEventListener('change', e => {
  if (state.coordinateSystem) state.coordinateSystem.logX = e.target.checked;
  redrawPlotCanvas();
});
document.getElementById('yLogScale').addEventListener('change', e => {
  if (state.coordinateSystem) state.coordinateSystem.logY = e.target.checked;
  redrawPlotCanvas();
});
document.getElementById('ignoreTilt').addEventListener('change', () => redrawPlotCanvas());

document.getElementById('doneCalibrate').addEventListener('click', () => {
  if (state.calibrationPoints.length === 2) {
    const axis = state.calibrationAxis;
    const v1 = parseFloat(document.getElementById(axis === 'x' ? 'x1Val' : 'y1Val').value);
    const v2 = parseFloat(document.getElementById(axis === 'x' ? 'x2Val' : 'y2Val').value);
    const axisLabel = axis.toUpperCase();

    if (isNaN(v1) || isNaN(v2)) {
      showError(`${axisLabel}-axis: please enter numeric values for both calibration points.`);
      return;
    }
    if (v1 === v2) {
      showError(`${axisLabel}-axis: the two values must be different (got ${v1} for both).`);
      return;
    }

    if (!state.coordinateSystem) state.coordinateSystem = { isCustom: true };
    else state.coordinateSystem.isCustom = true;

    state.coordinateSystem[axis + 'Axis'] = {
      p1: state.calibrationPoints[0],
      p2: state.calibrationPoints[1],
      v1, v2
    };
    state.coordinateSystem[axis + 'AxisCustom'] = true;

    const bothDone = state.coordinateSystem.xAxisCustom && state.coordinateSystem.yAxisCustom;
    document.getElementById('calibrationStatus').textContent =
      `${axisLabel}-axis set! ` + (bothDone ? 'Both axes calibrated.' : `Now set the ${axis === 'x' ? 'Y' : 'X'}-axis.`);

    updateCalibrationInfo();

    // Auto-start Y-axis after X is saved.
    if (axis === 'x' && !state.coordinateSystem.yAxisCustom) {
      state.calibrationMode = true;
      state.calibrationAxis = 'y';
      state.calibrationPoints = [];
      document.getElementById('calibrationStatus').textContent = 'X-axis set! Now click two points on the Y-axis';
      redrawPlotCanvas();
      updateButtonStates();
      return;
    }
  }

  // Commit origin (may be null = no origin = standard axis mode)
  if (state.coordinateSystem) {
    state.coordinateSystem.origin = state.calibrationOriginPoint || null;
  }

  state.calibrationMode = false;
  state.calibrationAxis = null;
  state.calibrationPoints = [];
  updateCalibrationInfo();
  redrawPlotCanvas();
  updateButtonStates();
});

function clearCoordinateSystem() {
  state.coordinateSystem = null;
  state.calibrationMode = false;
  state.calibrationAxis = null;
  state.calibrationPoints = [];
  state.calibrationOriginPoint = null;
  document.getElementById('originStatus').textContent = '';
  document.getElementById('xLogScale').checked = false;
  document.getElementById('yLogScale').checked = false;
  document.getElementById('calibrationPanel').style.display = 'none';
  requestAnimationFrame(() => { setupCanvas(); redrawPlotCanvas(); });
  updateCalibrationInfo();
  redrawPlotCanvas();
  updateButtonStates();
}

document.getElementById('clearAxesBtn').addEventListener('click', () => {
  if (!confirm('Remove the coordinate system and revert to pixel coordinates?')) return;
  clearCoordinateSystem();
});

document.getElementById('resetCalibrate').addEventListener('click', () => {
  if (!confirm('Reset coordinate system to default pixel coordinates?')) return;
  clearCoordinateSystem();
});

document.getElementById('closeCalibrate').addEventListener('click', () => {
  document.getElementById('calibrationPanel').style.display = 'none';
  state.calibrationMode = false;
  state.calibrationAxis = null;
  state.calibrationPoints = [];
  requestAnimationFrame(() => { setupCanvas(); redrawPlotCanvas(); });
  updateButtonStates();
});

// ── Button: smooth curves ─────────────────────────────────────────────────────

document.getElementById('uploadBtn').addEventListener('click', () => {
  if (!state.uploadedImage) { alert('Please upload an image first.'); return; }
  const path = getCurrentPath();
  const minPts = MODEL_INFO[state.curveModel]?.minPoints ?? 2;
  if (path.points.length < minPts) {
    alert(`${MODEL_INFO[state.curveModel]?.label ?? 'This model'} needs at least ${minPts} points.`);
    return;
  }

  // When extending, only fit the newly added points; preserve existing segments.
  const partialFit = path.extending && path.extendFromIndex > 1
    && path.points.length > path.extendFromIndex;
  const fitPoints = partialFit ? path.points.slice(path.extendFromIndex - 1) : path.points;

  // If a parametric model is selected, fit it first and use the dense samples
  // as the point set for the Bézier chain — then fall through to the server.
  let pointsForServer = fitPoints;
  if (state.curveModel !== 'free') {
    const fitResult = fitModel(state.curveModel, fitPoints);
    if (!fitResult || !fitResult.success) {
      showError('Model fitting failed — try placing more points or switching to Free mode.');
      return;
    }
    pointsForServer = sampleFit(fitResult, fitPoints, 80);
  }

  const newSegs = computeBezierChain(pointsForServer);
  if (partialFit) {
    path.segments = [...path.segments.slice(0, path.extendFromIndex - 1), ...newSegs];
    for (let i = path.extendFromIndex; i < path.points.length - 1; i++) path.points[i].symmetric = true;
  } else {
    path.segments = newSegs;
    for (let i = 1; i < path.points.length - 1; i++) path.points[i].symmetric = true;
  }
  path.processed = true;
  path.extending = false;
  path.extendFromIndex = 0;
  path.lineType = 'smooth';
  // Record which model (if any) generated this curve, for fitPathToImage's
  // image-fit branch later.
  path.modelName = state.curveModel !== 'free' ? state.curveModel : null;
  updatePathList();
  redrawPlotCanvas();
  fitPathToImage(path);
});

// ── Button: straight lines ────────────────────────────────────────────────────

document.getElementById('straightLineBtn').addEventListener('click', () => {
  if (!state.uploadedImage) { alert('Please upload an image first.'); return; }
  const path = getCurrentPath();
  if (path.points.length < 2) { alert('Please click at least two points to define a curve.'); return; }
  path.segments = [];
  for (let i = 0; i < path.points.length - 1; i++) {
    const p0 = path.points[i], p1 = path.points[i + 1];
    path.segments.push([p0, p0, p1, p1]);
  }
  path.processed = true;
  path.extending = false;
  path.extendFromIndex = 0;
  path.lineType = 'straight';
  path.modelName = null; // straight-line paths are never model-based
  updatePathList();
  redrawPlotCanvas();
});

// ── Button: fit to image ──────────────────────────────────────────────────────

document.getElementById('fitToImageBtn')?.addEventListener('click', () => {
  if (!state.uploadedImage) { alert('Please upload an image first.'); return; }
  const path = getCurrentPath();
  if (path.lineType !== 'smooth' || path.segments.length === 0) {
    alert("Please click 'Smooth Curves' first, then use 'Fit to Image' to refine.");
    return;
  }
  fitPathToImage(path);
});

// ── Button: download JSON ─────────────────────────────────────────────────────

function flashButton(id, message) {
  const btn = document.getElementById(id);
  const original = btn.textContent;
  btn.textContent = message;
  btn.disabled = true;
  setTimeout(() => { btn.textContent = original; btn.disabled = false; }, 1500);
}

document.getElementById('downloadBtn').addEventListener('click', () => {
  const curves = collectExportData();
  if (!curves) return;

  const output = {
    coordinate_system: state.coordinateSystem,
    curves,
  };

  const baseName = document.getElementById('exportFilename').value.trim() || 'curves';
  triggerDownload(JSON.stringify(output, null, 2), `${baseName}.json`, 'application/json');
  flashButton('downloadBtn', '✓ Downloaded!');
});

// ── Button: download CSV ──────────────────────────────────────────────────────

document.getElementById('downloadCsvBtn').addEventListener('click', () => {
  const curves = collectExportData();
  if (!curves) return;
  const rows = ['path_id,name,color,model,x,y'];
  curves.forEach((path, idx) => {
    const model = path.model_params?.model ?? '';
    const xy = path.xy_values ?? { x: [], y: [] };
    for (let i = 0; i < xy.x.length; i++) {
      rows.push(`${idx + 1},${path.name},${path.color},${model},${xy.x[i]},${xy.y[i]}`);
    }
  });
  const baseName = document.getElementById('exportFilename').value.trim() || 'curves';
  triggerDownload(rows.join('\n'), `${baseName}.csv`, 'text/csv');
  flashButton('downloadCsvBtn', '✓ Downloaded!');
});

// ── Session load ──────────────────────────────────────────────────────────────

function loadSession(data) {
  if (!state.uploadedImage) {
    showError('Load the image first, then load the session JSON.');
    return;
  }
  if (!Array.isArray(data.curves) || data.curves.length === 0) {
    showError('No curves found in this JSON file.');
    return;
  }

  if (data.coordinate_system) {
    state.coordinateSystem = data.coordinate_system;
    updateCalibrationInfo();
  }

  // Drop empty placeholder paths (e.g. the default initial path) before appending.
  state.paths = state.paths.filter(p => p.points.length > 0 || p.processed);

  const insertIndex = state.paths.length;
  data.curves.forEach(c => {
    state.paths.push({
      id: state.pathIdCounter++,
      name: c.name || `Path ${state.pathIdCounter}`,
      color: c.color || '#ff0000',
      points: c.pixel_points || [],
      segments: c.pixel_segments || [],
      processed: (c.pixel_segments?.length > 0) || c.line_type === 'straight',
      lineType: c.line_type || 'none',
      relativeOrigin: null,
      modelName: c.model_params?.model || null,
      extending: false,
      extendFromIndex: 0,
    });
  });
  state.currentPathIndex = insertIndex;
  document.getElementById('pathColor').value = state.paths[insertIndex]?.color || '#ff0000';

  updatePathList();
  redrawPlotCanvas();
  updateButtonStates();
}

document.getElementById('loadSessionBtn').addEventListener('click', () => {
  document.getElementById('sessionUpload').click();
});

document.getElementById('sessionUpload').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      loadSession(JSON.parse(ev.target.result));
    } catch {
      showError('Could not parse JSON file.');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});

// ── Button: reset ─────────────────────────────────────────────────────────────

document.getElementById('resetBtn').addEventListener('click', () => {
  if (!confirm('Delete all paths? This cannot be undone.')) return;
  state.paths = [];
  state.pathIdCounter = 0;
  state.colorIndex = 0;
  createNewPath();
  redrawPlotCanvas();
});

// ── Keyboard: undo / precision mode / arrow nudge ────────────────────────────

document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
    e.preventDefault();
    undo();
  }
  if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y' || ((e.key === 'z' || e.key === 'Z') && e.shiftKey))) {
    e.preventDefault();
    redo();
  }

  // Tab — cycle through control points within hit range of the cursor
  if (e.key === 'Tab' && state.mousePos && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    const nearby = getNearbyCP(state.mousePos);
    if (nearby.length > 1) {
      const cur = state.hoveredCP;
      const curIdx = cur ? nearby.findIndex(n => n.segIndex === cur.segIndex && n.cpIndex === cur.cpIndex) : -1;
      const next = nearby[(curIdx + 1) % nearby.length];
      state.hoveredCP = next;
      redrawPlotCanvas();
    }
    return;
  }

  // f — toggle precision cursor mode
  if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey) {
    state.precisionMode = !state.precisionMode;
    if (state.precisionMode && state.mousePos) {
      state.precisionCursor.x = state.mousePos.x;
      state.precisionCursor.y = state.mousePos.y;
    }
    redrawPlotCanvas();
    return;
  }

  // Arrow keys — nudge precision cursor or last placed point
  // Shift = 10 px, Ctrl+Shift = 0.1 px (sub-pixel fine), plain = 1 px
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
    if (e.ctrlKey && !e.shiftKey) return;  // leave plain Ctrl+Arrow to browser/WM
    const step = (e.ctrlKey && e.shiftKey) ? 0.1 : e.shiftKey ? 10 : 1;
    const dx = e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0;
    const dy = e.key === 'ArrowDown'  ? step : e.key === 'ArrowUp'   ? -step : 0;

    if (state.precisionMode) {
      e.preventDefault();
      state.precisionCursor.x += dx;
      state.precisionCursor.y += dy;
      redrawPlotCanvas();
    } else {
      const path = getCurrentPath();
      if (path && path.points.length > 0 && (!path.processed || path.extending)) {
        e.preventDefault();
        saveState('path_change');
        const last = path.points[path.points.length - 1];
        last.x += dx;
        last.y += dy;
        redrawPlotCanvas();
      }
    }
  }

  // Enter — place a point at the precision cursor position
  if (e.key === 'Enter' && state.precisionMode && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    const path = getCurrentPath();
    if (path && (!path.processed || path.extending)) {
      saveState('add_point');
      path.points.push({ x: state.precisionCursor.x, y: state.precisionCursor.y, symmetric: false });
      updatePathList();
      redrawPlotCanvas();
    }
  }
});

// ── Button state highlighting ─────────────────────────────────────────────────

function updateButtonStates() {
  const path = getCurrentPath();
  const calibPanelOpen = document.getElementById('calibrationPanel').style.display !== 'none';

  const showHint = !!state.uploadedImage && !!path && path.points.length === 0 && !calibPanelOpen;
  const minPtsHint = MODEL_INFO[state.curveModel]?.minPoints ?? 2;
  document.getElementById('canvasHint').textContent =
    `Click on the image to place points along the curve (need ≥ ${minPtsHint})`;
  document.getElementById('canvasHint').style.display = showHint ? 'block' : 'none';

  // While calibration panel is open: highlight only calibration buttons.
  const toolbarIds = ['imageUpload', 'uploadBtn', 'straightLineBtn',
                      'newPathBtn', 'calibrateBtn', 'downloadBtn', 'downloadCsvBtn', 'loadSessionBtn'];
  const allCalibIds = ['setXAxis', 'setYAxis', 'setOriginBtn', 'doneCalibrate', 'closeCalibrate', 'resetCalibrate'];
  if (calibPanelOpen) {
    toolbarIds.forEach(id => document.getElementById(id).classList.remove('btn-primary'));
    allCalibIds.forEach(id => document.getElementById(id)?.classList.remove('btn-primary'));

    const hasPoints = state.calibrationPoints.length === 2;
    const xSet = !!state.coordinateSystem?.xAxisCustom;
    const ySet = !!state.coordinateSystem?.yAxisCustom;
    const bothSet = xSet && ySet;
    document.getElementById('setXAxis').classList.toggle('btn-primary', !xSet);
    document.getElementById('setYAxis').classList.toggle('btn-primary', xSet && !ySet);
    document.getElementById('setOriginBtn').classList.toggle('btn-primary', bothSet && !state.calibrationOriginPoint);
    document.getElementById('doneCalibrate').classList.toggle('btn-primary', hasPoints || (state.calibrationAxis === 'origin' && !!state.calibrationOriginPoint));
    document.getElementById('closeCalibrate').classList.toggle('btn-primary', bothSet);
    document.getElementById('resetCalibrate').classList.toggle('btn-primary', bothSet);
    return;
  }

  // Normal mode.
  allCalibIds.forEach(id => document.getElementById(id)?.classList.remove('btn-primary'));

  const minPts     = MODEL_INFO[state.curveModel]?.minPoints ?? 2;
  const canProcess = path && path.points.length >= minPts && (!path.processed || path.extending);
  const canFit        = path && path.lineType === 'smooth' && path.segments.length > 0 && !!state.uploadedImage;
  const hasProcessed  = state.paths.some(p => p.lineType !== 'none');
  const nudgeNewPath  = !!state.uploadedImage && path && path.lineType !== 'none';
  const cs = state.coordinateSystem;
  const isCalibrated = !!(cs?.isCustom && cs.xAxisCustom && cs.yAxisCustom);

  document.getElementById('imageUpload').classList.toggle('btn-primary', !state.uploadedImage);
  document.getElementById('uploadBtn').classList.toggle('btn-primary', canProcess);
  document.getElementById('straightLineBtn').classList.toggle('btn-primary', canProcess);
  document.getElementById('fitToImageBtn')?.classList.toggle('btn-primary', canFit);
  document.getElementById('newPathBtn').classList.toggle('btn-primary', nudgeNewPath);
  document.getElementById('calibrateBtn').classList.toggle('btn-primary', !!state.uploadedImage && !isCalibrated);
  document.getElementById('clearAxesBtn').style.display = isCalibrated ? 'inline-block' : 'none';
  document.getElementById('downloadBtn').classList.toggle('btn-primary', hasProcessed);
  document.getElementById('downloadCsvBtn').classList.toggle('btn-primary', hasProcessed);
  updateCursor(null);
}

// updatePathList() rebuilds #pathList on every state change — use it as a hook.
new MutationObserver(updateButtonStates).observe(
  document.getElementById('pathList'), { childList: true, subtree: true }
);
updateButtonStates();
