# Session Persistence

A JSON file exported from *ddigitize* contains everything needed to fully restore a
digitization session: the coordinate system calibration and, for every path, the anchor
positions and Bézier control points stored in raw image-pixel coordinates (`pixel_points`
and `pixel_segments`). This allows work to be saved and resumed across browser sessions,
shared between collaborators, or extended with additional traces at a later date.

## Saving a session

Click **JSON** in the toolbar to download the current session. The exported file serves
both as a data file (calibrated x, y values for analysis) and as a session file
(pixel-space representation for restoration). No separate "save" step is needed.

## Loading a session

Click **Load session** in the toolbar and select a previously exported JSON file.
*ddigitize* will:

1. Restore the coordinate system calibration stored in the file (X and Y axes, log scale
   flags, origin, tilted-axes mode).
2. Recreate every path with its name, colour, anchor positions, and smooth Bézier curves,
   all in image-pixel space.

!!! warning
    Session restoration requires the *same image* to be loaded first. The pixel-space
    coordinates in the JSON are meaningless without the original image; *ddigitize* does
    not embed image data in the exported file. Load the image as usual before clicking
    **Load session**.

After loading, all paths and calibration are immediately editable. You can add new paths,
insert or remove anchor points, re-run image fitting, and re-export as you would in a
fresh session.
