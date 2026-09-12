# ddigitize User Manual

*ddigitize* is a browser-based tool for extracting numerical data from scientific
images. Users place a small number of anchor points along a curve of interest;
the tool fits a smooth, $C^1$-continuous cubic Bézier chain through those points
and optionally refines it to hug the underlying image trace.

No installation is required. The application runs entirely in the browser and
stores no data on any server. The interface consists of a full-window canvas
on the left and a collapsible sidebar on the right, with a toolbar across the top.

## General workflow

1. Load an image (or [load a previously saved session](session.md) to resume earlier work).
2. Define the [coordinate system](calibration.md) (optional but recommended).
3. Place [anchor points](placing-anchors.md) along each curve of interest.
4. Choose a fitting mode and click **Smooth Curves** or **Straight Lines**.
5. Fine-tune [control handles](editing-handles.md) manually if needed.
6. [Export](export.md) the digitised data as JSON or CSV.
