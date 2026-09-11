# ddigitize

A browser-based tool for extracting numerical data from scientific figures using smooth cubic Bézier curves. No installation required — runs entirely in the browser with all computation client-side.

**[Launch app](https://MBGM-lab.github.io/ddigitize/)** | [![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.22687235.svg)](https://doi.org/10.5281/zenodo.22687235)

## Motivation

A large volume of scientific data exists only as graphs in published literature. Most existing digitization tools recover discrete summary statistics or piecewise-linear point sequences. **ddigitize** instead represents curves as smooth cubic Bézier chains: users place a few anchor points and the tool fits a smooth, kink-free curve through them, which can be fine-tuned interactively.

## Features

- **Bézier-based fitting** — smooth curves from sparse anchor points; automatic image-constrained refinement
- **Multi-path support** — extract several named traces from the same figure simultaneously
- **Coordinate calibration** — define real-world axes from reference points; live coordinate readout during placement
- **Precision cursor mode** (`f`) — crosshair at 0.2× mouse speed with sub-pixel arrow-key nudging
- **Full undo/redo** (`Ctrl+Z` / `Ctrl+Y`)
- **Session save/resume** — export as JSON and reload to continue editing later; append further traces to an existing session
- **Export** — JSON (full Bézier representation) or CSV (sampled coordinates) compatible with standard analysis software
- **Offline** — no server component; all data stay in the local browser session

## Workflow

1. Load an image via file picker, drag-and-drop, or `Ctrl+V` (clipboard paste)
2. Define coordinate axes by clicking known reference points and entering their values
3. Place anchor points along the curve of interest
4. Click **Smooth Curves** (Bézier) or **Straight Lines**
5. Fine-tune control handles by dragging; use **New Path** for additional curves
6. Export as JSON or CSV

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| Left-click | Place anchor point |
| `Alt+Click` (near anchor) | Remove anchor point |
| `Ctrl+Click` (near curve) | Insert anchor on segment |
| `Ctrl+drag` (on anchor) | Move anchor + both handles together |
| `Ctrl+Shift+drag` | Translate entire path |
| `Shift+drag` | Slow drag (one-fifth speed) |
| Right-click on anchor | Toggle symmetric handles |
| `Tab` (hover near CPs) | Cycle highlight ring through overlapping control points |
| `f` | Toggle precision cursor mode |
| `Enter` (precision mode) | Place point at crosshair |
| Arrow keys | Nudge last point / crosshair by 1 px |
| `Shift+Arrow` | Nudge by 10 px |
| `Ctrl+Shift+Arrow` | Nudge by 0.1 px |
| `Shift+left-drag` | Zoom rectangle |
| Right-click drag | Pan canvas |
| Scroll wheel | Zoom in/out (up to 40×) |
| `Ctrl+0` | Fit image to window |
| `Ctrl+Z` / `Ctrl+Y` | Undo / Redo |
| `Ctrl+V` | Paste image from clipboard |

On macOS, substitute `Cmd` for `Ctrl`.

## Tips

- **Calibrate before placing points** to verify accuracy in real units as you click.
- **Fewer, well-placed points beat a dense grid** — a few anchors at peaks, inflections, and endpoints outperform many evenly-spaced clicks (sometimes two is enough).
- **Zoom in** (`Shift+drag`) before placing anchors near closely spaced features.
- **Use `Ctrl+Click`** to insert a point on a poorly fitting segment without disturbing the rest of the curve.
- **Light-on-dark traces**: the fitting algorithm targets dark pixels; invert the image externally before loading for bright curves.
- **Duplicate paths** (`⧉` button) to reuse a fitted shape for a family of similar curves.
- **Save regularly** — the browser holds all state in memory. Export JSON after each fitting step; reload it on top of the same image at any time to resume exactly where you left off, or share the file with a collaborator so they can inspect, extend, or correct the traced curves.

## Export formats

| Format | Contents |
|---|---|
| JSON | Full Bézier representation — exact curve reconstruction and session resumption |
| CSV | Sampled coordinates — direct import into R, Python, MATLAB, etc. |

## License

Open-source. See [LICENSE](LICENSE).
