# Precision Placement

Two complementary tools help when placing points or adjusting handles in high-density or
fine-detail regions.

## Precision cursor mode

Press `f` to toggle *precision cursor mode*. A red crosshair appears on the canvas and
moves at one-fifth the speed of the mouse, allowing sub-pixel accuracy. While the mode is
active:

- **Left-click** or **`Enter`** places a new anchor point at the crosshair position.
- **Arrow keys** nudge the crosshair in image pixel space (see below).
- Press `f` again (or `Escape`) to exit.

## Arrow-key nudge

Arrow keys move the last placed anchor point (or the precision crosshair when precision
cursor mode is active) in image pixel coordinates:

| Keys | Step size |
|------|-----------|
| Arrow | 1 image pixel |
| `Shift`+Arrow | 10 image pixels |
| `Ctrl+Shift`+Arrow | 0.1 image pixel (sub-pixel fine adjustment) |

Arrow-key nudge also works when extending an existing path.

## Slow handle drag

Hold `Shift` while dragging a control point or handle to reduce mouse movement to
one-fifth speed. The modifier can be pressed or released at any point during the drag
without the handle jumping.
