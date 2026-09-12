# Tips and Best Practices

- **Calibrate before placing points.** The live coordinate readout in the canvas corner
  lets you verify placement accuracy in real units as you click.

- **Fewer, well-placed points beat a dense grid.** Four to six anchors at salient features
  (peak, inflection, asymptote, endpoint) give better results than twenty evenly-spaced
  clicks along a flat region.

- **Zoom in for precision.** Use `Shift`+drag to zoom into a region before placing anchors
  near closely spaced features. Press `Ctrl+0` to return to the full overview.

- **Use precision cursor mode for fine-detail placement.** Press `f` to activate the
  crosshair cursor, which tracks at one-fifth mouse speed. Combine with arrow-key nudging
  (`Ctrl+Shift`+Arrow for 0.1 px steps) for sub-pixel accuracy without requiring a
  high-DPI display.

- **Use `Ctrl+Click` to add detail locally.** If the automatic fit misses a feature,
  `Ctrl+Click` on the problematic segment to insert a point there, then drag it to the
  correct position. Existing segments are unaffected.

- **Light-on-dark traces.** The image-fitting algorithm targets dark pixels. For curves
  that are lighter than their background, invert the image in an external editor before
  loading.

- **Multiple curves on one figure.** Use **New Path** for each trace. Assign meaningful
  names by double-clicking the path name. All paths are exported together in a single
  JSON or CSV file, with each trace identified by its name and colour.

- **Digitising families of curves.** If several curves in a figure share a similar shape
  (e.g. voltage-clamp step responses at different holding potentials), fit the first curve
  precisely, then click **⧉** to duplicate it. Select the copy and drag its handles or
  anchor points to match the next curve, reusing the overall shape while adjusting local
  features. This is faster than placing anchor points from scratch for each trace.

- **JSON preserves the full Bézier representation.** Use JSON export if you need exact
  curve reconstruction or session resumption. Use CSV for direct import into plotting or
  statistics software.

- **Relative origin for bar charts.** When digitising bar or column charts, enable
  **Relative origin** or set the coordinate origin to the bar baseline using **Set Origin**
  in the calibration panel; the exported heights will then be measured from zero
  automatically.

- **Save your work regularly.** The browser holds all state in memory; closing the tab or
  refreshing the page will erase the current session. Click **JSON** after each fitting
  step to keep a recoverable snapshot. Use **Load session** with the same image to resume
  exactly where you left off.

- **Collaborate by sharing the JSON.** Because the session file is plain JSON, a
  collaborator can load it (with the original image) to inspect, extend, or correct the
  traced curves and re-export.
