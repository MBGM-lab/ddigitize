#!/usr/bin/env python3
"""
Validate and visualise the Curvature Spike Ratio (CSR) on synthetic traces.
Compares CSR vs kink-count on clean and stitched traces.
"""
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

STEP = 10
OUT  = '/home/HDD-drive/Repos/lineformer_results/csr_validation.png'


def turning_angles(xs, ys, step=STEP):
    idx = np.arange(0, len(xs), step)
    kx, ky = xs[idx], ys[idx]
    angles = []
    for i in range(1, len(kx) - 1):
        v1 = np.array([kx[i]-kx[i-1], ky[i]-ky[i-1]], dtype=float)
        v2 = np.array([kx[i+1]-kx[i], ky[i+1]-ky[i]], dtype=float)
        n1, n2 = np.linalg.norm(v1), np.linalg.norm(v2)
        if n1 < 1e-9 or n2 < 1e-9:
            continue
        cos_a = np.clip(np.dot(v1, v2) / (n1 * n2), -1, 1)
        angles.append(np.degrees(np.arccos(cos_a)))
    return np.array(angles)


def kink_count(xs, ys, thresh=45):
    return int(np.sum(turning_angles(xs, ys) > thresh))


def csr(xs, ys):
    a = turning_angles(xs, ys)
    if len(a) < 3:
        return 1.0
    accel = np.abs(a[2:] - a[:-2]) / 2.0
    return float(np.max(accel) / (np.median(accel) + 1.0))


N = 500
t = np.linspace(0, 10, N)


def gauss(t, mu, sig, amp=1.0):
    return amp * np.exp(-0.5 * ((t - mu) / sig) ** 2)


# ── Synthetic traces ──────────────────────────────────────────────────────────
traces = {}

# 1. Pure smooth Gaussian (no stitching)
traces['Smooth\n(Gaussian)'] = (t, gauss(t, 5, 1.5, 2.0))

# 2. Smooth sine wave (gentle, no stitching)
traces['Smooth\n(sine)'] = (t, np.sin(t) + 0.05 * np.sin(5 * t))

# 3. Stitched: narrow falling → broad rising (clear kink, ~80°)
yA = gauss(t, 0, 0.7, 3.5)
yB = gauss(t, 4, 1.6, 2.3)
ic = np.where(np.diff(np.sign(yA - yB)))[0]
ic = ic[ic > 10][0] if len(ic[ic > 10]) else N // 2
ys_stitch1 = np.where(np.arange(N) < ic, yA, yB)
traces['Stitched\n(steep, ~80°)'] = (t, ys_stitch1)

# 4. Stitched: moderate angle (~30°) — kink-count would miss this
yC = gauss(t, 3, 1.2, 2.0)
yD = gauss(t, 6, 1.2, 2.0)
ic2 = np.where(np.diff(np.sign(yC - yD)))[0]
ic2 = ic2[ic2 > 10][0] if len(ic2[ic2 > 10]) else N // 2
ys_stitch2 = np.where(np.arange(N) < ic2, yC, yD)
traces['Stitched\n(moderate, ~30°)'] = (t, ys_stitch2)

# 5. Stitched: very shallow angle (~15°) — both metrics may miss
yE = gauss(t, 4.5, 2.0, 2.0)
yF = gauss(t, 5.5, 2.0, 2.0)
ic3 = np.where(np.diff(np.sign(yE - yF)))[0]
ic3 = ic3[ic3 > 10][0] if len(ic3[ic3 > 10]) else N // 2
ys_stitch3 = np.where(np.arange(N) < ic3, yE, yF)
traces['Stitched\n(shallow, ~15°)'] = (t, ys_stitch3)

# ── Compute scores ────────────────────────────────────────────────────────────
labels = list(traces.keys())
kinks  = [kink_count(xs, ys) for xs, ys in traces.values()]
csrs   = [csr(xs, ys)        for xs, ys in traces.values()]

print(f"{'Label':<25}  {'Kink count':>10}  {'CSR':>8}")
print("-" * 48)
for lbl, k, c in zip(labels, kinks, csrs):
    print(f"{lbl.replace(chr(10),' '):<25}  {k:>10}  {c:>8.1f}")

# ── Figure ────────────────────────────────────────────────────────────────────
colors = ['#2A7A4B', '#5B8FCC', '#B85010', '#CC1111', '#8B44A8']
fig, axes = plt.subplots(len(traces), 1, figsize=(9, 9), dpi=300)
fig.patch.set_facecolor('white')

for ax, (lbl, (xs, ys)), col, k, c in zip(axes, traces.items(), colors, kinks, csrs):
    ax.plot(xs, ys, color=col, lw=1.8)
    ax.set_xlim(t[0], t[-1])
    ax.set_xticks([])
    for sp in ['top', 'right', 'bottom']:
        ax.spines[sp].set_visible(False)
    ax.spines['left'].set_color('#ccc')
    ax.tick_params(left=False, labelleft=False)
    ax.set_ylabel(lbl, fontsize=8.5, rotation=0, ha='right', va='center', labelpad=60)
    ax.text(0.99, 0.82,
            f'kinks={k}   CSR={c:.1f}',
            transform=ax.transAxes, ha='right', va='top',
            fontsize=8.5, color='#444',
            bbox=dict(boxstyle='round,pad=0.3', fc='white', ec='#ddd', lw=0.8))

axes[-1].set_xticks(np.arange(0, 11, 2))
axes[-1].set_xlabel('x', fontsize=9, color='#555')
axes[-1].spines['bottom'].set_visible(True)
axes[-1].spines['bottom'].set_color('#ccc')
axes[-1].tick_params(bottom=True, labelbottom=True, labelsize=8)

fig.suptitle('Kink count vs Curvature Spike Ratio (CSR) — synthetic traces',
             fontsize=10, fontweight='bold', y=0.99)
plt.tight_layout(rect=[0, 0, 1, 0.98])
plt.savefig(OUT, dpi=300, bbox_inches='tight')
print(f'\nSaved: {OUT}')
