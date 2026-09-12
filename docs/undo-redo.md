# Undo and Redo

| Shortcut | Action |
|----------|--------|
| `Ctrl+Z` (or `Cmd+Z`) | Undo last action |
| `Ctrl+Y` or `Ctrl+Shift+Z` (or `Cmd+Y` / `Cmd+Shift+Z`) | Redo |

Up to 50 undo steps are retained. Every point placement, curve fit, handle drag, point
insertion, point removal, path duplication, and calibration action is individually
undoable. Undo/redo operates per path using stored snapshots; switching the active path
does not clear the history.
