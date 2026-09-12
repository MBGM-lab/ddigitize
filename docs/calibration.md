# Coordinate System Calibration

Calibration maps pixel positions on the canvas to physical units and is optional;
without it, exported coordinates are in raw image pixels.

Click **Coordinate System** in the toolbar to open the calibration panel. The panel
can remain open while you work; clicking elsewhere on the canvas while the panel is open
does *not* place anchor points. Close the panel with **Close** or **Done** when finished.

## Standard calibration (two points per axis)

1. Click **Set X-axis**. Click two points of known X value on the image (e.g. two labelled
   tick marks). The points are shown as coloured circles joined by an overlay line.
2. Enter the corresponding real-world X values in the **P1** and **P2** fields in the
   calibration panel.
3. Click **Done**. The panel automatically prompts for the Y axis next.
4. Click **Set Y-axis** and repeat for the Y axis.
5. Click **Done** again, then **Close**.

The two calibration points can be repositioned by dragging them after they have been
placed, without needing to re-enter the values.

## Scale-bar / origin mode

If the natural axis intersection is not visible or inconvenient to click (e.g. bar charts,
figures with the origin outside the plot area), use the origin mode:

1. Calibrate X and Y axes as above, but use any two convenient reference marks on each
   axis — their pixel span sets the scale factor (value span ÷ pixel length); their
   absolute positions do not matter.
2. Click **Set Origin** and click the point on the image that corresponds to $(0, 0)$.

When an origin is set, exported coordinates are computed as
$(x_\text{pixel} - x_\text{origin}) \times \text{scale}_x$ and
$(y_\text{pixel} - y_\text{origin}) \times \text{scale}_y$.
The origin crosshair can be repositioned by dragging it while the calibration panel is open.

## Logarithmic axes

Check **Log X** or **Log Y** in the calibration panel to apply logarithmic interpolation
between the two reference values on that axis. Both reference values must be strictly
positive. Log mode is compatible with all other calibration options.

## Tilted axes

By default, *ddigitize* uses only the horizontal pixel component for X and the vertical
pixel component for Y (axis-aligned mode). If the image axes are rotated or skewed
relative to the screen, check **Tilted axes** to switch to full vector projection: the
pixel coordinate is projected onto the actual direction vector of each calibration line.

## Axis display options

In the calibration panel:

- **Axis colour pickers** — change the overlay line colour for the X axis (default red)
  and Y axis (default green) independently.
- **Axis line width** — adjusts the thickness of the overlay lines (0.5–10 px, default 2 px).

## Clearing the calibration

Click **Clear Axes** in the toolbar (visible only when a calibration is set) to remove
the coordinate system and revert to pixel coordinates. A confirmation dialog is shown.
Alternatively, **Reset to Default** inside the calibration panel performs the same action.
