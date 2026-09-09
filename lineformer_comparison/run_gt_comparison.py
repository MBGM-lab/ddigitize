"""
Compare LineFormer detected traces against ground-truth curves.

For each detected trace we ask: at each x-position, which GT curve is the
trace nearest to in y?  Counting stable switches in that assignment gives
'n_transitions' — the number of times a trace jumps from following one GT
curve to following another.  This directly captures the crossing artefacts
that produce kinked traces, validated against the known ground truth.

Additionally reports mean y-distance to the nearest GT curve at each point
(mean_min_dist_px), which measures how faithfully the trace follows ANY GT
curve (useful for detecting compromise paths in heavy-overlap).

Output: lineformer_results/gt_comparison.csv
"""

import sys, os, csv
sys.path.insert(0, '/home/HDD-drive/Repos/ddigitalize/lineformer_comparison')
sys.path.insert(0, '/home/HDD-drive/Repos/LineFormer')

import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import cv2

from generate_figures import MULTI, X, FIG_SIZE, FIG_DPI, STYLES
import infer
from scipy.optimize import linear_sum_assignment
from scipy.spatial import cKDTree

CKPT       = "/home/HDD-drive/Repos/LineFormer/iter_3000.pth"
CONFIG     = "/home/HDD-drive/Repos/LineFormer/lineformer_swin_t_config.py"
DEVICE     = "cpu"
INPUT_DIR  = "/home/HDD-drive/Repos/lineformer_test"
OUTPUT_CSV = "/home/HDD-drive/Repos/lineformer_results/gt_comparison.csv"

# A GT-assignment change must persist for at least this many consecutive
# detected-trace points before it is counted as a real transition.
MIN_RUN = 8

SETS = ['bw', 'bw_solid', 'color']
FIGURES = [
    ('two_no_overlap',         2,  'none'),
    ('two_partial_overlap',    2,  'partial'),
    ('two_heavy_overlap',      2,  'heavy'),
    ('four_no_overlap',        4,  'none'),
    ('four_partial_overlap',   4,  'partial'),
    ('four_heavy_overlap',     4,  'heavy'),
    ('eight_no_overlap',       8,  'none'),
    ('eight_partial_overlap',  8,  'partial'),
    ('eight_heavy_overlap',    8,  'heavy'),
    ('twelve_no_overlap',      12, 'none'),
    ('twelve_partial_overlap', 12, 'partial'),
    ('twelve_heavy_overlap',   12, 'heavy'),
]


def get_gt_pixel_curves(gt_curves, style_fn):
    """
    Re-render the figure identically to generate_figures.py and return GT
    curves as arrays of (x_px, y_px) in saved-image pixel coordinates.

    create fig at default dpi=100, save at FIG_DPI=150 with bbox_inches='tight':
      x_img = x_display * scale          (tight bbox clips negligible left margin)
      y_img = (canvas_h - y_display) * scale   (y flipped; full canvas height kept)
    """
    n = len(gt_curves)
    fig, ax = plt.subplots(figsize=FIG_SIZE)
    fig.patch.set_facecolor('white')
    ax.set_facecolor('white')
    ax.spines[['top', 'right']].set_visible(False)
    for i, y in enumerate(gt_curves):
        ax.plot(X, y, **style_fn(i, n))
    ax.set_xlabel('x'); ax.set_ylabel('y')
    ax.set_xlim(X[0], X[-1])

    fig.canvas.draw()
    trans    = ax.transData
    scale    = FIG_DPI / fig.dpi
    canvas_h = FIG_SIZE[1] * fig.dpi     # 400 display px

    pixel_curves = []
    for y_vals in gt_curves:
        pts = trans.transform(np.column_stack([X, y_vals]))
        img_pts = np.column_stack([
            pts[:, 0] * scale,
            (canvas_h - pts[:, 1]) * scale,
        ])
        pixel_curves.append(img_pts)     # shape (500, 2)

    plt.close(fig)
    return pixel_curves


def assign_nearest_gt(det_ds, gt_pixel_curves):
    """
    For each point of a detected trace, return:
      labels : index of nearest GT curve (by y-distance at same x)
      dists  : y-distance to that nearest GT curve
    Points are processed in x order.
    """
    pts = sorted(det_ds, key=lambda p: p['x'])
    ng  = len(gt_pixel_curves)

    labels = np.empty(len(pts), dtype=int)
    dists  = np.empty(len(pts))

    # Precompute interpolators: for each GT curve, numpy interp along x
    gt_x = [gc[:, 0] for gc in gt_pixel_curves]
    gt_y = [gc[:, 1] for gc in gt_pixel_curves]

    for i, p in enumerate(pts):
        xp = p['x']; yp = p['y']
        best_k, best_d = 0, np.inf
        for k in range(ng):
            y_gt = float(np.interp(xp, gt_x[k], gt_y[k]))
            d = abs(y_gt - yp)
            if d < best_d:
                best_d = d; best_k = k
        labels[i] = best_k
        dists[i]  = best_d

    return labels, dists


def count_transitions(labels, min_run=MIN_RUN):
    """
    Count stable GT-assignment changes in a label sequence.
    A change from label A → B is counted only if B persists for at least
    min_run consecutive points (avoids counting noise near crossings).
    """
    if len(labels) == 0:
        return 0

    current   = labels[0]
    pending   = None
    pen_count = 0
    n_switch  = 0

    for lbl in labels[1:]:
        if lbl == current:
            pending   = None
            pen_count = 0
        else:
            if lbl == pending:
                pen_count += 1
                if pen_count >= min_run:
                    n_switch += 1
                    current   = lbl
                    pending   = None
                    pen_count = 0
            else:
                pending   = lbl
                pen_count = 1

    return n_switch


def score_figure(detected_traces, gt_pixel_curves):
    """
    Aggregate transition and proximity metrics across all detected traces.

    Returns dict with:
      n_detected        : number of detected traces
      n_transitions_total : sum of GT-assignment switches over all traces
      transitions_per_trace : above / n_detected
      mean_min_dist_px  : mean y-distance to nearest GT curve across all points
      n_matched / n_missed : from Hungarian matching (for completeness)
    """
    nd = len(detected_traces)
    ng = len(gt_pixel_curves)

    if nd == 0 or ng == 0:
        return dict(n_detected=nd, n_transitions_total=0,
                    transitions_per_trace=0.0, mean_min_dist_px=np.nan,
                    n_matched=0, n_missed=ng)

    all_labels = []
    all_dists  = []
    n_trans_total = 0

    for ds in detected_traces:
        labels, dists = assign_nearest_gt(ds, gt_pixel_curves)
        n_trans_total += count_transitions(labels)
        all_labels.append(labels)
        all_dists.append(dists)

    mean_min_dist = float(np.mean(np.concatenate(all_dists)))
    tpt = n_trans_total / nd

    # Hungarian matching to count missed GT curves
    gt_trees  = [cKDTree(gt) for gt in gt_pixel_curves]
    det_arrays = [np.array([[p['x'], p['y']] for p in ds]) for ds in detected_traces]
    cost = np.zeros((nd, ng))
    for i, det in enumerate(det_arrays):
        for j, tree in enumerate(gt_trees):
            dists_2d, _ = tree.query(det)
            cost[i, j] = dists_2d.mean()
    if nd <= ng:
        ri, ci = linear_sum_assignment(cost)
    else:
        ci, ri = linear_sum_assignment(cost.T)
    n_matched = len(ri)
    n_missed  = ng - n_matched

    return dict(
        n_detected            = nd,
        n_transitions_total   = n_trans_total,
        transitions_per_trace = round(tpt, 2),
        mean_min_dist_px      = round(mean_min_dist, 1),
        n_matched             = n_matched,
        n_missed              = n_missed,
    )


print("Loading model...")
infer.load_model(CONFIG, CKPT, DEVICE)
print("Model loaded.\n")

rows = []
for set_key in SETS:
    style_fn = STYLES[set_key]
    for (stem, n_expected, overlap) in FIGURES:
        img_path = os.path.join(INPUT_DIR, set_key, stem + '.png')
        if not os.path.exists(img_path):
            print(f"MISSING: {img_path}"); continue

        gt_pixel = get_gt_pixel_curves(MULTI[stem], style_fn)

        img = cv2.imread(img_path)
        try:
            detected = infer.get_dataseries(img, to_clean=False)
        except Exception as e:
            print(f"ERROR {set_key}/{stem}: {e}"); continue

        sc = score_figure(detected, gt_pixel)

        row = dict(set=set_key, figure=stem+'.png',
                   n_expected=n_expected, overlap=overlap,
                   **sc)
        rows.append(row)
        print(f"{set_key}/{stem}: det={sc['n_detected']}, "
              f"trans={sc['n_transitions_total']} "
              f"({sc['transitions_per_trace']:.1f}/trace), "
              f"min_dist={sc['mean_min_dist_px']:.1f}px, "
              f"missed={sc['n_missed']}")

os.makedirs(os.path.dirname(OUTPUT_CSV), exist_ok=True)
with open(OUTPUT_CSV, 'w', newline='') as f:
    w = csv.DictWriter(f, fieldnames=rows[0].keys())
    w.writeheader(); w.writerows(rows)

print(f"\nSaved: {OUTPUT_CSV}")
