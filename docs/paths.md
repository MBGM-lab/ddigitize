# Paths

Each extracted curve is stored as a *path*. Multiple independent paths can coexist in
one session. Paths are listed in the sidebar under **Paths**; the active path is
highlighted in blue.

## Creating paths

Click **New Path** in the toolbar to add a new empty path. New paths are assigned colours
automatically from a 10-colour palette; colours cycle if more than ten paths exist. A
single red Path 1 is created automatically on startup or when the last path is deleted.

## Selecting the active path

Click any path name in the sidebar list. Only the active path receives new anchor point
clicks; its control handles are shown on the canvas.

## Renaming a path

Double-click the path name in the sidebar. An inline text field appears; press `Enter`
or click away to confirm, `Esc` to cancel.

## Path colour

The colour swatch / picker in the **Active Path** card of the sidebar sets the colour of
the current path. The path list and canvas update instantly.

## Duplicating a path

Click the **⧉** button on any path list item to create an identical copy of that path.
The duplicate is inserted directly below the original in the list, inherits all anchor
points, Bézier segments, and colour, and is named *Path N* where N is the total number
of paths after insertion. The duplicate becomes the active path immediately, so it can be
renamed, recoloured, or independently adjusted without affecting the original. Duplication
is fully undoable with `Ctrl+Z`.

A typical use case is digitising a family of related curves: fit one curve, duplicate it,
select the duplicate, and drag its handles or anchor points to match the next curve in the
figure — reusing the overall shape while adjusting local features.

## Deleting a path

Click the **×** button on any path list item. A confirmation dialog is shown. Deleting
the last remaining path automatically creates a new empty Path 1.

## Remove All

Click **Remove All** at the right end of the toolbar to delete every path and start over.
The background image and coordinate calibration are preserved. A confirmation dialog is
shown before proceeding.

## Path visibility in the list

Each path item shows a colour swatch, the path name, the per-path relative origin toggle
(⊙), the extend button (**+**), the duplicate button (**⧉**), and the delete button (**×**).
Paths are always rendered on the canvas; there is no per-path hide toggle, but the entire
background image can be hidden with **Hide Image** to inspect curves in isolation.
