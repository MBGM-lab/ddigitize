# Placing Anchor Points

With an image loaded and the calibration panel closed, left-click anywhere on the canvas
to place an anchor point on the active path. Points are shown as filled circles (corner
anchors as squares — see below). At least two points are required before curve fitting.

## Removing a point

`Alt+Click` near any existing anchor point removes it. If the path has already been
fitted, the segments touching that point are removed; all other segments are preserved
unchanged.

## Inserting a point on an existing curve

`Ctrl+Click` near any fitted segment inserts a new anchor point at that location. Only
the segment containing the click is split into two; all other segments and their manually
adjusted handles are unchanged. This is the recommended way to add detail to a specific
region without re-fitting the whole path.

## Corner anchors

Press `c` after placing an anchor to mark it as a **corner anchor** (shown as a square).
Corner anchors break smoothness by design — the curve is free to have a sharp
change of direction at that point.

When `c` is pressed:

- The anchor is marked as a corner and symmetric handles are disabled for it.
- Two draggable handle arms appear, initialised along the chord to the previous anchor.
  Drag either handle dot to set the desired incoming or outgoing direction.
- During curve fitting, the handle *direction* is locked to what you set; only the
  *length* is adjusted by the optimiser.

Press `c` again on the same anchor to remove the corner mark and revert to a smooth anchor.
