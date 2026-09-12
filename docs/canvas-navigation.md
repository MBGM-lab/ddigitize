# Canvas Navigation

| Action | Behaviour |
|--------|-----------|
| Scroll wheel | Zoom in/out centred on the canvas centre |
| Right-click drag | Pan the canvas freely |
| `Shift`+left-drag | Draw a zoom rectangle; release to zoom into that region |
| `Ctrl+0` | Fit the entire image to the window (`Cmd+0` on macOS) |

The current zoom level is shown as a percentage in the toolbar (maximum 4000 %).
Zoom and pan state are not affected by undo/redo. Use `Ctrl+0` to quickly return
to a full overview after zooming in for fine adjustments.

A live coordinate readout displays the cursor position in calibrated real-world units
(or in pixels if no calibration has been defined) whenever the pointer is over the canvas.
