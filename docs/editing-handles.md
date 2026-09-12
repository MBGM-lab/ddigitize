# Editing Control Handles

After fitting, the Bézier control handles (shown as smaller coloured circles connected to
the anchors by lever lines) are visible for the active path. Anchors are shown as larger
filled circles (squares for [corner anchors](placing-anchors.md#corner-anchors)).

## Dragging handles and anchors

Click and drag any control handle to adjust the local curve shape. Dragging an anchor
point repositions it while leaving its handles fixed in space, allowing the incoming and
outgoing curve directions to be changed independently.

To move an anchor together with both of its handles as a rigid group — preserving the
local curve shape at that anchor — hold `Ctrl` while dragging the anchor (`Ctrl+drag`).
This is useful for repositioning a feature of the curve (e.g. a peak or inflection point)
without altering its shape.

To translate the *entire* path without changing its shape, hold `Ctrl+Shift` and drag
anywhere on the canvas (`Ctrl+Shift+drag`). All anchor points and control handles move by
the same offset. This is convenient for aligning a path that was traced on an image that
has since been replaced or re-cropped.

When anchor points or handles lie very close together, hovering the mouse over them
highlights the nearest one with a gold ring. If several overlap, press `Tab` to cycle
through them; the ring moves to each candidate in turn. Clicking or dragging while the
ring is visible acts on the highlighted control point rather than whichever happens to be
topmost.

## Symmetric handles

By default, interior anchors have *symmetric* handles: moving one handle automatically
mirrors the opposite handle's direction, keeping the curve smooth ($C^1$) at that anchor.
Right-click an anchor to toggle its symmetry off, allowing the two handles to move
independently (useful for cusps or sharp changes in direction). Right-click again to
restore symmetry.

## Lock handles

Check **Lock handles** in the **Active Path** card of the sidebar to enforce equal handle
lengths in addition to equal directions: both handles on a symmetric anchor become exact
mirror images. Uncheck to allow different handle lengths (the default, where only
direction is mirrored).
