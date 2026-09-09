#!/usr/bin/env python3
"""
Kink detection illustration figure for manuscript.
Three detected traces: two stitched (kink events marked), one smooth (clean).
Output: lineformer_results/kink_detection_figure.png  (300 dpi)
"""
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D

STEP   = 25    # keypoint spacing (index units)
THRESH = 45    # kink angle threshold (degrees)
N      = 450   # points per trace
X      = np.linspace(0, 10, N)
OUT    = '/home/HDD-drive/Repos/lineformer_results/kink_detection_figure.png'

def gauss(x, mu, sig, amp=2.0):
    return amp * np.exp(-0.5 * ((x - mu) / sig) ** 2)

def compute_kinks(xs, ys, step=STEP, thresh=THRESH):
    idx = np.arange(0, len(xs), step)
    kx, ky = xs[idx], ys[idx]
    out = []
    for i in range(1, len(kx) - 1):
        v1 = np.array([kx[i] - kx[i-1], ky[i] - ky[i-1]])
        v2 = np.array([kx[i+1] - kx[i], ky[i+1] - ky[i]])
        n1, n2 = np.linalg.norm(v1), np.linalg.norm(v2)
        if n1 < 1e-9 or n2 < 1e-9:
            continue
        cos_a = np.clip(np.dot(v1, v2) / (n1 * n2), -1, 1)
        a = np.degrees(np.arccos(cos_a))
        out.append({'x': kx[i], 'y': ky[i], 'angle': a,
                    'kink': a > thresh,
                    'v1': v1 / n1, 'v2': v2 / n2})
    return out, kx, ky

# ── Underlying curves ─────────────────────────────────────────────────────────
# Pair 1: yA narrow Gaussian peaking at x=0 (left edge) — only its FALLING side
#         is visible, so no direction reversal → no false kinks.
#         yB broad Gaussian peaking at x=4 — crossing yA while yA falls.
yA = gauss(X, mu=0.0, sig=0.70, amp=3.5)
yB = gauss(X, mu=4.0, sig=1.60, amp=2.3)

# Pair 2: yC broad Gaussian peaking at x=5 (sigma=1.5 → gentle peak, angle ≈25° < 45°).
#         yD narrow Gaussian peaking at x=8 — rising steeply, crossing yC after x=5.
yC = gauss(X, mu=5.0, sig=1.50, amp=2.0)
yD = gauss(X, mu=8.0, sig=0.70, amp=2.5)

# Smooth reference (broad Gaussian, no crossings)
y_ref = gauss(X, mu=5.0, sig=2.00, amp=1.7)

def first_crossing_after(ya, yb, after_x):
    ai = np.searchsorted(X, after_x)
    diff = ya[ai:] - yb[ai:]
    chg = np.where(np.diff(np.sign(diff)))[0]
    return (chg[0] + ai) if len(chg) else int(N * 0.6)

i_c1 = first_crossing_after(yA, yB, after_x=0.5)
i_c2 = first_crossing_after(yC, yD, after_x=5.5)

idx_arr = np.arange(N)
t1 = np.where(idx_arr < i_c1, yA, yB)   # blue:   narrow→broad (stitched)
t2 = y_ref.copy()                        # green:  smooth
t3 = np.where(idx_arr < i_c2, yC, yD)   # orange: broad→narrow (stitched)

traces = [
    (t1, '#1A5694', 'Line 1'),
    (t2, '#2A7A4B', 'Line 2'),
    (t3, '#B85010', 'Line 3'),
]

# ── Figure ────────────────────────────────────────────────────────────────────
fig, ax = plt.subplots(figsize=(9, 5), dpi=300)
ax.set_facecolor('white')
fig.patch.set_facecolor('white')
ax.spines['top'].set_visible(False)
ax.spines['right'].set_visible(False)
ax.spines['left'].set_color('#bbb')
ax.spines['bottom'].set_color('#bbb')
ax.tick_params(colors='#999', labelsize=9)
ax.set_xlabel('Time (a.u.)', fontsize=10.5, color='#555')
ax.set_ylabel('Amplitude (a.u.)', fontsize=10.5, color='#555')
ax.set_xlim(-0.2, 10.3)
ax.set_ylim(-0.3, 3.9)

for yg in [yA, yB, yC, yD, y_ref]:
    ax.plot(X, yg, color='#d8d8d8', lw=0.9, ls='--', zorder=1)

detailed_kink = None

for tr_y, color, label in traces:
    ax.plot(X, tr_y, color=color, lw=2.0, zorder=3, label=label,
            solid_capstyle='round')
    kinfo, kx, ky = compute_kinks(X, tr_y)

    ax.scatter([k['x'] for k in kinfo if not k['kink']],
               [k['y'] for k in kinfo if not k['kink']],
               s=9, color=color, zorder=4, alpha=0.45, linewidths=0)

    kinks = [k for k in kinfo if k['kink']]
    if kinks:
        top = max(kinks, key=lambda k: k['angle'])
        for k in kinks:
            ax.scatter(k['x'], k['y'], s=65, color='#CC1111', zorder=6,
                       edgecolors='white', linewidths=1.3)
            if k is top:
                dy = 0.15 if k['y'] < 2.0 else -0.22
                ax.annotate(f"θ = {k['angle']:.0f}°",
                            xy=(k['x'], k['y']),
                            xytext=(k['x'] + 0.28, k['y'] + dy),
                            fontsize=8.5, color='#CC1111',
                            fontweight='bold', zorder=7)
        if detailed_kink is None:
            detailed_kink = top

# Vector arrows at the highest-angle kink (Line 1)
if detailed_kink:
    bx, by = detailed_kink['x'], detailed_kink['y']
    v1, v2 = detailed_kink['v1'], detailed_kink['v2']
    L = 1.1

    def draw_arrow(p0, p1, col, lbl, lbl_sign=1):
        ax.annotate('', xy=p1, xytext=p0,
                    arrowprops=dict(arrowstyle='->', color=col,
                                   lw=2.0, mutation_scale=13), zorder=9)
        mid = ((p0[0]+p1[0])/2, (p0[1]+p1[1])/2)
        d = np.array([p1[0]-p0[0], p1[1]-p0[1]])
        perp = np.array([-d[1], d[0]])
        n = np.linalg.norm(perp)
        if n > 1e-9:
            perp = perp / n * 0.30 * lbl_sign
        ax.text(mid[0]+perp[0], mid[1]+perp[1], lbl,
                fontsize=10, fontweight='bold', color=col,
                ha='center', va='center', zorder=10)

    draw_arrow((bx - v1[0]*L, by - v1[1]*L), (bx, by), '#1A5694', 'v⃗ᵢ',    lbl_sign=-1)
    draw_arrow((bx, by), (bx + v2[0]*L, by + v2[1]*L), '#AA4400', 'v⃗ᵢ₊₁', lbl_sign=1)

# Legend
trace_h = [Line2D([0],[0], color=c, lw=2.0, label=lbl) for _, c, lbl in traces]
extra_h = [
    Line2D([0],[0], color='#ccc', ls='--', lw=1.0, label='Underlying curves (true)'),
    Line2D([0],[0], marker='o', color='#888', ls='', markersize=5, alpha=0.6,
           label=f'Keypoint (every {STEP} samples)'),
    Line2D([0],[0], marker='o', color='#CC1111', ls='', markersize=8,
           markeredgecolor='white', markeredgewidth=0.9,
           label=f'Kink event  (θ > {THRESH}°)'),
]
ax.legend(handles=trace_h + extra_h,
          fontsize=8.5, loc='upper right', frameon=True,
          framealpha=0.93, edgecolor='#ddd', ncol=2)

plt.tight_layout()
plt.savefig(OUT, dpi=300, bbox_inches='tight')
print(f'Saved: {OUT}')
