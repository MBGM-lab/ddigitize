# Curve Fitting

## Smooth Curves (Bézier)

Click **Smooth Curves** in the toolbar after placing at least two anchor points. The tool:

1. Computes initial Bézier control points from a Catmull-Rom-inspired formula, ensuring
   $C^1$-continuous (kink-free) transitions at every smooth anchor.
2. Automatically runs [image fitting](#automatic-image-fitting) to snap the curve to the
   underlying trace in the image.

Interior anchor points are assigned symmetric handles by default; the two handles at each
interior anchor are mirror images, maintaining smoothness. See
[Editing Control Handles](editing-handles.md) for how to adjust handles manually.

## Straight Lines

Click **Straight Lines** to connect anchor points with straight segments. No image fitting
is applied. This mode is suitable for step functions, piecewise-linear data, or cases
where curve smoothing is not desired.

## Parametric curve models

!!! note
    This feature is currently under development and not available in the current release.
    The description below reflects the planned functionality.

Select a model from the **Curve Model** drop-down in the sidebar before clicking
**Smooth Curves**. The model constrains the curve shape to a known functional form and
provides a more robust fit when anchors are sparse.

| Model | Functional form | Min. points | Placement guidance |
|-------|----------------|-------------|-------------------|
| Free (no model) | — | 2 | Any placement |
| Single exponential | $A\,e^{-t/\tau}+C$ | 4 | From the peak through the decay to the asymptote |
| Double exponential | $A_1 e^{-t/\tau_1}+A_2 e^{-t/\tau_2}+C$ | 6 | From the peak through both fast and slow decay phases |
| Sigmoid (Boltzmann) | $A\,/\,(1+e^{(x-x_0)/k})+C$ | 4 | Across the rising phase and both upper and lower plateaus |
| Gaussian | $A\,e^{-(x-\mu)^2/(2\sigma^2)}+C$ | 4 | Baseline on both sides, flanks, and as close to the peak as possible |

When a parametric model is selected:

1. Parameters are estimated from the anchor points by nonlinear least-squares with
   multiple starting points to avoid local minima.
2. The fitted function is densely sampled to produce a smooth point set which is then
   passed to the Bézier chain generator.
3. Image fitting uses a snap-then-refit strategy: each anchor is snapped to the stroke
   centre in the image, the model is refit through the corrected anchor positions, and
   the result replaces the original fit only if it does not substantially increase the
   model error (tolerance factor 1.5).

A coloured model hint box beneath the drop-down describes recommended anchor placement
for the selected model.

!!! tip "Single/double exponential"
    Points placed before the curve peak are ignored by the exponential fitter, which fits
    only the decay phase. For a double exponential, place at least two or three points in
    the fast initial drop and three or more in the slow tail to give the fitter enough
    information to separate the two time constants.

!!! tip "Gaussian"
    Place one point as close to the peak as possible. With an even number of anchors
    placed at equal spacing, no anchor may land exactly at the peak, causing the optimizer
    to slightly overestimate the width. This is avoided by using an odd number of anchors
    or by placing one anchor deliberately at the peak.

## Automatic image fitting

After initial Bézier generation, *ddigitize* automatically refines the curve to match
the underlying image trace by gradient descent on the inner control points of each
segment, pulling them toward nearby pixels that match the detected curve colour.

Automatic image fitting is triggered every time **Smooth Curves** is clicked. It can only
improve — not degrade — accuracy: the result is accepted only when it reduces or maintains
the fitting error relative to the initial Bézier chain.
