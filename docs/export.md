# Data Export

## Filename

The base filename for exported files is set in the **filename** text field in the toolbar
(default: `curves`). The appropriate extension (`.json` or `.csv`) is appended
automatically.

## JSON export

Click **JSON** to download a JSON file containing all paths. The top-level object has two
keys:

```json
{
  "coordinate_system": { ... },
  "curves": [ ... ]
}
```

Each element of `curves` is one path object. The keys present depend on the path type.

### Smooth path (`line_type: "smooth"`)

```json
{
  "name":           "Path 1",
  "color":          "#ff0000",
  "line_type":      "smooth",
  "num_points":     5,
  "xy_values":      { "x": [...], "y": [...] },
  "bezier_path":    "M x y C b1x b1y b2x b2y ex ey ...",
  "pixel_points":   [ { "x": ..., "y": ..., "corner": false,
                        "symmetric": true,
                        "handleIn": null, "handleOut": null }, ... ],
  "pixel_segments": [ [P0, B1, B2, P3], ... ]
}
```

### Straight-line or unprocessed path

```json
{
  "name":         "Path 3",
  "color":        "#00aa00",
  "line_type":    "straight",
  "num_points":   4,
  "xy_values":    { "x": [...], "y": [...] },
  "pixel_points": [ { "x": ..., "y": ... }, ... ]
}
```

### Key descriptions

**`coordinate_system`**
: Calibration points, reference values, and flags (log scale, tilted axes) needed to
  reconstruct the coordinate transform. Stored as-is from the calibration panel.

**`name`, `color`, `line_type`, `num_points`**
: Path metadata. `line_type` is `"smooth"`, `"straight"`, or `"none"` (unprocessed).

**`xy_values`**
: Sampled $(x, y)$ in calibrated units (or raw image pixels if no calibration is set).
  Smooth paths: 50 samples per Bézier segment. Straight and unprocessed paths: one entry per anchor.

**`bezier_path`**
: SVG cubic Bézier path string in calibrated real-unit space
  (`M x y C b1x b1y b2x b2y ex ey ...`). Present only for free-form smooth paths.
  Encodes the fitted control points and allows exact curve reconstruction in any
  SVG-capable tool.

**`pixel_points`**
: Anchor positions in raw image-pixel coordinates. Each entry is an object with at
  minimum `x` and `y`. Smooth paths also carry: `corner` (boolean — `true` for corner
  anchors marked with `c`); `symmetric` (boolean — whether the two handles are mirrored);
  `handleIn` and `handleOut` (`{"dx": ..., "dy": ...}` offsets from the anchor, or
  `null` for non-corner anchors). Used by **Load session** to restore exact anchor
  placement independent of calibration.

**`pixel_segments`**
: Fitted Bézier control-point array in raw image-pixel coordinates. Each entry is a
  four-element array `[P0, B1, B2, P3]` where P0/P3 are anchor points and B1/B2 are the
  inner control handles. Present only for smooth paths. Enables exact session restoration
  and pixel-space curve reconstruction.

## CSV export

Click **CSV** to download a flat table with columns:
`path_id`, `name`, `color`, `x`, `y`.

One row per sampled point; paths are concatenated in order.

## Export warnings

If any path has points but has not been fitted (line type `none`), a confirmation dialog
warns that those paths will be exported as raw anchor pixel coordinates. If no coordinate
system has been calibrated, a separate dialog warns that all coordinates will be in pixels.

## Relative origin

The **Relative origin** checkbox in the toolbar subtracts the first anchor point of each
path from all its exported coordinates, so that each trace starts at $(0, 0)$. This is
useful when comparing traces that begin at different baseline levels, or when absolute
axis position is less important than the shape of the curve.

Individual paths can override the global setting using the **⊙** button in the path list
(next to the path name):

- **Grey (default)**: inherits the global checkbox.
- **Blue**: relative origin forced ON for this path regardless of the global setting.
- **Red**: relative origin forced OFF for this path regardless of the global setting.

Click the ⊙ button to cycle between these three states.
