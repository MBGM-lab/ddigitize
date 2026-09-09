#!/usr/bin/env python3
"""
For a chosen test figure, run LineFormer, find each trace's max-CSR transition
point (the keypoint where angular acceleration spikes), and draw it on the image.
Output: lineformer_results/csr_transitions_<stem>.png  (300 dpi)
"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

import cv2
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import infer

CKPT   = "/home/HDD-drive/Repos/LineFormer/iter_3000.pth"
CONFIG = "/home/HDD-drive/Repos/LineFormer/lineformer_swin_t_config.py"
DEVICE = "cpu"
STEP   = 10

# Choose figure (highest CSR / most interesting)
FIGURE_SET  = "bw_solid"
FIGURE_STEM = "four_heavy_overlap"
INPUT_DIR   = "/home/HDD-drive/Repos/lineformer_test"
OUT_DIR     = "/home/HDD-drive/Repos/lineformer_results"

# Palette: 12 distinguishable categorical colors (cycled over traces)
TRACE_COLORS = [
    '#2a78d6', '#eb6834', '#1baf7a', '#eda100',
    '#e87ba4', '#008300', '#4a3aa7', '#e34948',
    '#7ecbcb', '#a0522d', '#9467bd', '#17becf',
]


def keypoints(ds, step=STEP):
    xs = np.array([pt['x'] for pt in ds])
    ys = np.array([pt['y'] for pt in ds])
    idx = np.arange(0, len(xs), step)
    return xs[idx], ys[idx], idx


def turning_angles_arr(kx, ky):
    angles = []
    for i in range(1, len(kx) - 1):
        v1 = np.array([kx[i]-kx[i-1], ky[i]-ky[i-1]], dtype=float)
        v2 = np.array([kx[i+1]-kx[i], ky[i+1]-ky[i]], dtype=float)
        n1, n2 = np.linalg.norm(v1), np.linalg.norm(v2)
        if n1 < 1e-9 or n2 < 1e-9:
            angles.append(0.0)
            continue
        cos_a = np.clip(np.dot(v1, v2) / (n1 * n2), -1, 1)
        angles.append(np.degrees(np.arccos(cos_a)))
    return np.array(angles)


def csr_transition(ds, step=STEP):
    """
    Returns (csr_score, transition_x, transition_y) where (x,y) is the image
    coordinate of the max angular-acceleration keypoint.
    Returns None if not enough data.
    """
    kx, ky, orig_idx = keypoints(ds, step)
    if len(kx) < 5:
        return None
    angles = turning_angles_arr(kx, ky)  # length = len(kx)-2, interior keypoints
    if len(angles) < 3:
        return None
    accel = np.abs(angles[2:] - angles[:-2]) / 2.0   # length = len(angles)-2
    if len(accel) == 0:
        return None
    csr   = float(np.max(accel) / (np.median(accel) + 1.0))
    # accel[j] corresponds to angles[j+1], which corresponds to keypoint kx[j+2]
    j_max = int(np.argmax(accel))
    tx, ty = kx[j_max + 2], ky[j_max + 2]
    return csr, tx, ty, float(accel[j_max])


ENDPOINT_ANGLE_THRESH = 10.0   # degrees — boundary turning angle that flags a transition

def endpoint_transitions(ds, step=STEP):
    """
    Check the first and last interior keypoints for large turning angles.
    These are blind spots for the central-difference CSR.
    Returns list of (x, y, angle) for any boundary keypoint above threshold.
    """
    kx, ky, _ = keypoints(ds, step)
    if len(kx) < 3:
        return []
    angles = turning_angles_arr(kx, ky)
    if len(angles) == 0:
        return []
    hits = []
    # First interior keypoint: kx[1]
    if angles[0] > ENDPOINT_ANGLE_THRESH:
        hits.append((kx[1], ky[1], angles[0]))
    # Last interior keypoint: kx[-2]
    if angles[-1] > ENDPOINT_ANGLE_THRESH:
        hits.append((kx[-2], ky[-2], angles[-1]))
    return hits


# ── Load model and run ────────────────────────────────────────────────────────
print("Loading model...")
infer.load_model(CONFIG, CKPT, DEVICE)
print("Model loaded.")

img_path = os.path.join(INPUT_DIR, FIGURE_SET, FIGURE_STEM + '.png')
img_bgr  = cv2.imread(img_path)
img_rgb  = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)

print(f"Running inference on {FIGURE_SET}/{FIGURE_STEM}...")
dataseries = infer.get_dataseries(img_bgr, to_clean=False)
print(f"  Detected {len(dataseries)} traces")

# ── Figure ────────────────────────────────────────────────────────────────────
fig, axes = plt.subplots(1, 2, figsize=(13, 5), dpi=300)
fig.patch.set_facecolor('#fcfcfb')

for ax, show_transitions in zip(axes, [False, True]):
    ax.imshow(img_rgb)
    ax.set_xticks([]); ax.set_yticks([])
    for sp in ax.spines.values():
        sp.set_visible(False)

    n_transitions = 0
    for ti, ds in enumerate(dataseries):
        col = TRACE_COLORS[ti % len(TRACE_COLORS)]
        xs  = np.array([pt['x'] for pt in ds])
        ys  = np.array([pt['y'] for pt in ds])
        ax.plot(xs, ys, color=col, lw=1.2, alpha=0.85, zorder=2)

        if show_transitions:
            # Interior CSR transitions
            result = csr_transition(ds)
            if result and result[0] > 6.0:
                csr_val, tx, ty, accel_val = result
                ax.plot(tx, ty,
                        marker='x', markersize=10, markeredgewidth=2.2,
                        color='red', zorder=5)
                ax.text(tx + 4, ty - 4,
                        f'CSR={csr_val:.0f}',
                        fontsize=6.5, color='red', zorder=6,
                        bbox=dict(boxstyle='round,pad=0.15', fc='white',
                                  ec='none', alpha=0.75))
                n_transitions += 1

            # Endpoint transitions (boundary blind-spot check)
            for (ex, ey, eang) in endpoint_transitions(ds):
                ax.plot(ex, ey,
                        marker='x', markersize=10, markeredgewidth=2.2,
                        color='#eb6834', zorder=5)
                ax.text(ex + 4, ey - 4,
                        f'{eang:.0f}°',
                        fontsize=6.5, color='#eb6834', zorder=6,
                        bbox=dict(boxstyle='round,pad=0.15', fc='white',
                                  ec='none', alpha=0.75))
                n_transitions += 1

    title = ('Original tracing' if not show_transitions
             else f'CSR transition points ({n_transitions} detected, CSR > 6)')
    ax.set_title(title, fontsize=9, color='#0b0b0b', pad=5)

fig.suptitle(f'{FIGURE_SET} / {FIGURE_STEM}',
             fontsize=10, fontweight='bold', color='#0b0b0b', y=1.01)

# Legend
cross_int = mpatches.Patch(color='red',     label='Interior transition (CSR spike)')
cross_end = mpatches.Patch(color='#eb6834', label=f'Endpoint transition (angle > {ENDPOINT_ANGLE_THRESH:.0f}°)')
axes[1].legend(handles=[cross_int, cross_end], fontsize=7.5, loc='lower right',
               frameon=True, framealpha=0.9, edgecolor='#e1e0d9')

plt.tight_layout()
out_path = os.path.join(OUT_DIR, f'csr_transitions_{FIGURE_SET}_{FIGURE_STEM}.png')
plt.savefig(out_path, dpi=300, bbox_inches='tight', facecolor='#fcfcfb')
print(f'Saved: {out_path}')
