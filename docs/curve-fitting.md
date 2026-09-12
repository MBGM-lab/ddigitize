# Curve Fitting

## Smooth Curves (Bézier)

Click **Smooth Curves** in the toolbar after placing at least two anchor points. The tool:

1. Computes initial Bézier control points from a Catmull-Rom-inspired formula, ensuring
   smooth, kink-free transitions at every anchor.
2. Automatically runs [image fitting](#automatic-image-fitting) to snap the curve to the
   underlying trace in the image.

Interior anchor points are assigned symmetric handles by default; the two handles at each
interior anchor are mirror images, maintaining smoothness. See
[Editing Control Handles](editing-handles.md) for how to adjust handles manually.

## Straight Lines

Click **Straight Lines** to connect anchor points with straight segments. No image fitting
is applied. This mode is suitable for step functions, piecewise-linear data, or cases
where curve smoothing is not desired.

## Automatic image fitting

After initial Bézier generation, *ddigitize* automatically refines the curve to match
the underlying image trace by gradient descent on the inner control points of each
segment, pulling them toward nearby pixels that match the detected curve colour.

Automatic image fitting is triggered every time **Smooth Curves** is clicked. It can only
improve — not degrade — accuracy: the result is accepted only when it reduces or maintains
the fitting error relative to the initial Bézier chain.
