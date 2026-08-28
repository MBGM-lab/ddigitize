import { state, MAX_UNDO_HISTORY, colorPalette } from './state.js';
import { redrawPlotCanvas } from './render.js';

export function createNewPath(color = null) {
  if (color === null) {
    color = colorPalette[state.colorIndex % colorPalette.length];
    state.colorIndex++;
  }
  const id = state.pathIdCounter++;
  const path = {
    id,
    name: `Path ${id + 1}`,
    color,
    points: [],
    segments: [],
    processed: false,
    lineType: 'none',
    relativeOrigin: null,
    modelName: null,
  };
  state.paths.push(path);
  state.currentPathIndex = state.paths.length - 1;
  document.getElementById('pathColor').value = color;
  updatePathList();
  return path;
}

export function duplicatePath(index) {
  saveState('duplicate_path');
  const src = state.paths[index];
  const clone = JSON.parse(JSON.stringify(src));
  clone.id = state.pathIdCounter++;
  clone.name = `Path ${state.paths.length + 1}`;
  state.paths.splice(index + 1, 0, clone);
  state.currentPathIndex = index + 1;
  document.getElementById('pathColor').value = clone.color;
  updatePathList();
  redrawPlotCanvas();
}

export function getCurrentPath() {
  return state.paths[state.currentPathIndex];
}

export function updatePathList() {
  const listDiv = document.getElementById('pathList');
  listDiv.innerHTML = '';
  state.paths.forEach((path, index) => {
    const item = document.createElement('div');
    item.className = 'path-item' + (index === state.currentPathIndex ? ' active' : '');
    item.onclick = () => {
      if (state.currentPathIndex === index) return;
      state.currentPathIndex = index;
      document.getElementById('pathColor').value = path.color;
      updatePathList();
      redrawPlotCanvas();
    };

    const colorBox = document.createElement('div');
    colorBox.className = 'color-box';
    colorBox.style.backgroundColor = path.color;

    const nameSpan = document.createElement('span');
    nameSpan.textContent = path.name;
    nameSpan.title = 'Double-click to rename';
    nameSpan.style.cssText = 'cursor:text; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;';

    nameSpan.addEventListener('dblclick', e => {
      e.stopPropagation();
      const input = document.createElement('input');
      input.type = 'text';
      input.value = path.name;
      input.style.cssText = 'flex:1; font-size:13px; border:1px solid #bbb; border-radius:3px; padding:0 4px; width:100%;';
      nameSpan.replaceWith(input);
      input.focus();
      input.select();

      function commit() {
        const val = input.value.trim();
        if (val) path.name = val;
        updatePathList();
      }
      input.addEventListener('blur', commit);
      input.addEventListener('keydown', e2 => {
        if (e2.key === 'Enter') { e2.preventDefault(); input.blur(); }
        if (e2.key === 'Escape') { input.value = path.name; input.blur(); }
      });
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = '×';
    deleteBtn.title = 'Delete this path';
    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      if (confirm('Delete this path?')) {
        state.paths.splice(index, 1);
        if (state.currentPathIndex >= state.paths.length) {
          state.currentPathIndex = Math.max(0, state.paths.length - 1);
        }
        if (state.paths.length === 0) {
          createNewPath('#ff0000');
        } else {
          // Renumber default-named paths and reset the counter.
          let counter = 1;
          state.paths.forEach(p => {
            if (/^Path \d+$/.test(p.name)) p.name = `Path ${counter++}`;
          });
          state.pathIdCounter = state.paths.length;
        }
        const active = state.paths[state.currentPathIndex];
        if (active) document.getElementById('pathColor').value = active.color;
        updatePathList();
        redrawPlotCanvas();
      }
    };

    // Per-path relative-origin toggle: null=inherit global, true=force on, false=force off.
    const originBtn = document.createElement('button');
    const originStates = { null: { label: '⌖', color: '#bbb',     tip: 'Relative origin: following global setting — click to force ON' },
                           true:  { label: '⌖', color: '#007bff',  tip: 'Relative origin: forced ON for this path — click to force OFF' },
                           false: { label: '⌖', color: '#cc3300',  tip: 'Relative origin: forced OFF for this path — click to reset to global' } };
    const oKey = path.relativeOrigin === null ? 'null' : String(path.relativeOrigin);
    originBtn.textContent = originStates[oKey].label;
    originBtn.title = originStates[oKey].tip;
    originBtn.style.cssText = `font-size:13px; padding:0 5px; color:${originStates[oKey].color};`;
    originBtn.onclick = (e) => {
      e.stopPropagation();
      path.relativeOrigin = path.relativeOrigin === null ? true : path.relativeOrigin === true ? false : null;
      updatePathList();
    };

    const extendBtn = document.createElement('button');
    extendBtn.textContent = path.extending ? 'Extending…' : '+';
    extendBtn.title = path.extending ? 'Extending — click Smooth Curves or Straight Lines to finish'
                                     : 'Add more points to this path';
    extendBtn.style.cssText = 'font-size:13px; padding:0 5px;';
    if (path.extending) extendBtn.style.color = '#d07000';
    extendBtn.disabled = !path.processed;
    extendBtn.onclick = (e) => {
      e.stopPropagation();
      state.currentPathIndex = index;
      if (!path.extending) {
        path.extendFromIndex = path.points.length;
        path.extending = true;
      } else {
        path.extending = false;
        path.extendFromIndex = 0;
      }
      updatePathList();
    };

    const dupBtn = document.createElement('button');
    dupBtn.textContent = '⧉';
    dupBtn.title = 'Duplicate this path';
    dupBtn.style.cssText = 'font-size:13px; padding:0 5px;';
    dupBtn.onclick = (e) => {
      e.stopPropagation();
      duplicatePath(index);
    };

    item.appendChild(colorBox);
    item.appendChild(nameSpan);
    item.appendChild(originBtn);
    item.appendChild(extendBtn);
    item.appendChild(dupBtn);
    item.appendChild(deleteBtn);
    listDiv.appendChild(item);
  });
}

function pathSnapshot(p) {
  return JSON.parse(JSON.stringify({
    id: p.id, name: p.name, color: p.color, points: p.points,
    segments: p.segments, processed: p.processed, extending: p.extending, extendFromIndex: p.extendFromIndex, lineType: p.lineType, relativeOrigin: p.relativeOrigin,
    modelName: p.modelName,
  }));
}

// type: 'add_point' stores almost nothing — undo just pops the last point.
// type: 'path_change' (default) snapshots only the one affected path.
export function saveState(type = 'path_change') {
  state.redoHistory = [];
  const pathIndex = state.currentPathIndex;
  let delta;

  if (type === 'add_point') {
    delta = { type: 'add_point', pathIndex };
  } else if (type === 'duplicate_path') {
    delta = { type: 'duplicate_path', insertedIndex: state.currentPathIndex + 1 };
  } else {
    const p = state.paths[pathIndex];
    delta = { type: 'path_change', pathIndex, pathSnapshot: pathSnapshot(p) };
  }

  delta.currentPathIndex = state.currentPathIndex;
  delta.pathIdCounter    = state.pathIdCounter;
  delta.colorIndex       = state.colorIndex;

  state.undoHistory.push(delta);
  if (state.undoHistory.length > MAX_UNDO_HISTORY) state.undoHistory.shift();
}

export function undo() {
  if (state.undoHistory.length === 0) return false;
  const delta = state.undoHistory.pop();
  const p = state.paths[delta.pathIndex];

  // Capture redo entry from current state before modifying it.
  const redoEntry = {
    currentPathIndex: state.currentPathIndex,
    pathIdCounter:    state.pathIdCounter,
    colorIndex:       state.colorIndex,
  };
  if (delta.type === 'add_point') {
    redoEntry.type = 'add_point_redo';
    redoEntry.pathIndex = delta.pathIndex;
    redoEntry.point = p ? { ...p.points[p.points.length - 1] } : null;
  } else if (delta.type === 'duplicate_path') {
    redoEntry.type = 'duplicate_path_redo';
    redoEntry.insertedIndex = delta.insertedIndex;
    redoEntry.pathSnapshot = pathSnapshot(state.paths[delta.insertedIndex]);
  } else {
    redoEntry.type = 'path_change';
    redoEntry.pathIndex = delta.pathIndex;
    redoEntry.pathSnapshot = p ? pathSnapshot(p) : null;
  }
  state.redoHistory.push(redoEntry);

  if (delta.type === 'add_point') {
    if (p) p.points.pop();
  } else if (delta.type === 'duplicate_path') {
    state.paths.splice(delta.insertedIndex, 1);
  } else {
    if (delta.pathIndex < state.paths.length) {
      state.paths[delta.pathIndex] = delta.pathSnapshot;
    }
  }

  state.currentPathIndex = delta.currentPathIndex;
  state.pathIdCounter    = delta.pathIdCounter;
  state.colorIndex       = delta.colorIndex;
  updatePathList();
  redrawPlotCanvas();
  return true;
}

export function redo() {
  if (state.redoHistory.length === 0) return false;
  const entry = state.redoHistory.pop();
  const p = state.paths[entry.pathIndex];

  // Push undo entry for the current state before applying redo.
  const undoEntry = {
    currentPathIndex: state.currentPathIndex,
    pathIdCounter:    state.pathIdCounter,
    colorIndex:       state.colorIndex,
  };
  if (entry.type === 'add_point_redo') {
    undoEntry.type = 'add_point';
    undoEntry.pathIndex = entry.pathIndex;
  } else if (entry.type === 'duplicate_path_redo') {
    undoEntry.type = 'duplicate_path';
    undoEntry.insertedIndex = entry.insertedIndex;
  } else {
    undoEntry.type = 'path_change';
    undoEntry.pathIndex = entry.pathIndex;
    undoEntry.pathSnapshot = p ? pathSnapshot(p) : null;
  }
  state.undoHistory.push(undoEntry);

  if (entry.type === 'add_point_redo') {
    if (p && entry.point) p.points.push(entry.point);
  } else if (entry.type === 'duplicate_path_redo') {
    state.paths.splice(entry.insertedIndex, 0, entry.pathSnapshot);
  } else {
    if (entry.pathIndex < state.paths.length && entry.pathSnapshot) {
      state.paths[entry.pathIndex] = entry.pathSnapshot;
    }
  }

  state.currentPathIndex = entry.currentPathIndex;
  state.pathIdCounter    = entry.pathIdCounter;
  state.colorIndex       = entry.colorIndex;
  updatePathList();
  redrawPlotCanvas();
  return true;
}
