#!/usr/bin/env python3
"""
Scatter plot: kinks_per_line (x) vs mean_csr (y)
Compares the existing kink-count metric with the new Curvature Spike Ratio.
Color = overlap type (3 levels, slots 1-3 from validated palette).
Shape = figure set (bw / bw_solid / color).
Output: lineformer_results/quality_scatter.png  (300 dpi)
"""
import csv, os
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D
from matplotlib.patches import Patch

CSV  = '/home/HDD-drive/Repos/lineformer_results/quality_scores.csv'
OUT  = '/home/HDD-drive/Repos/lineformer_results/quality_scatter.png'

# ── Palette (slots 1-3, all-pairs validated light mode) ───────────────────────
OVERLAP_COLOR = {
    'none':    '#2a78d6',   # slot 1 blue
    'partial': '#eb6834',   # slot 2 orange
    'heavy':   '#1baf7a',   # slot 3 aqua
}
OVERLAP_LABEL = {
    'none':    'No overlap',
    'partial': 'Partial overlap',
    'heavy':   'Heavy overlap',
}
SET_MARKER = {
    'bw':       ('o', 'BW dashed'),
    'bw_solid': ('s', 'BW solid'),
    'color':    ('D', 'Color'),
}

# ── Load data ─────────────────────────────────────────────────────────────────
rows = []
with open(CSV) as f:
    for r in csv.DictReader(f):
        rows.append({
            'set':            r['set'],
            'overlap':        r['overlap'],
            'n_expected':     int(r['n_expected']),
            'kinks_per_line': float(r['kinks_per_line']),
            'mean_csr':       float(r['mean_csr']),
        })

# ── Figure ────────────────────────────────────────────────────────────────────
fig, ax = plt.subplots(figsize=(7.5, 5.5), dpi=300)
fig.patch.set_facecolor('#fcfcfb')
ax.set_facecolor('#fcfcfb')

# Gridlines — hairline, recessive
ax.grid(True, color='#e1e0d9', linewidth=0.6, zorder=0)
ax.set_axisbelow(True)

# Reference lines (approximate threshold boundaries)
ax.axhline(6,   color='#c3c2b7', lw=1.0, ls='--', zorder=1)
ax.axvline(0.5, color='#c3c2b7', lw=1.0, ls='--', zorder=1)
ax.text(0.52, 15.8, 'kinks > 0.5', fontsize=7.5, color='#898781', va='top')
ax.text(3.65, 6.25, 'CSR > 6',    fontsize=7.5, color='#898781', va='bottom')

# Plot points
for row in rows:
    c   = OVERLAP_COLOR[row['overlap']]
    mkr, _ = SET_MARKER[row['set']]
    ax.scatter(row['kinks_per_line'], row['mean_csr'],
               marker=mkr, s=60, color=c,
               edgecolors='white', linewidths=1.2, zorder=4)

# Jitter annotation for a few key outliers
ANNOTATE = [
    # (set, overlap, n_expected, label_text, dx, dy)
    ('bw_solid', 'partial', 4,  'bw_solid\n4 curves', -0.55, 1.5),
    ('bw_solid', 'partial', 8,  'bw_solid\n8 curves',  0.05, 1.0),
    ('bw',       'partial', 8,  'bw 8 curves',         0.05, 0.8),
]
for s, ov, ne, lbl, dx, dy in ANNOTATE:
    pts = [r for r in rows if r['set']==s and r['overlap']==ov and r['n_expected']==ne]
    if pts:
        px, py = pts[0]['kinks_per_line'], pts[0]['mean_csr']
        ax.annotate(lbl, xy=(px, py), xytext=(px+dx, py+dy),
                    fontsize=7, color='#52514e',
                    arrowprops=dict(arrowstyle='-', color='#c3c2b7', lw=0.8))

# ── Spines ────────────────────────────────────────────────────────────────────
for sp in ['top', 'right']:
    ax.spines[sp].set_visible(False)
ax.spines['left'].set_color('#c3c2b7')
ax.spines['bottom'].set_color('#c3c2b7')
ax.tick_params(color='#c3c2b7', labelcolor='#52514e', labelsize=8.5)

ax.set_xlabel('Kinks per line  (existing metric)', fontsize=9.5, color='#0b0b0b', labelpad=6)
ax.set_ylabel('Mean CSR  (new metric)',            fontsize=9.5, color='#0b0b0b', labelpad=6)
ax.set_xlim(-0.15, 4.0)
ax.set_ylim(0, 17)

# ── Legend — two groups ───────────────────────────────────────────────────────
overlap_handles = [
    Line2D([0],[0], marker='o', color='w', markerfacecolor=OVERLAP_COLOR[k],
           markeredgecolor='white', markersize=8, label=OVERLAP_LABEL[k])
    for k in ['none', 'partial', 'heavy']
]
set_handles = [
    Line2D([0],[0], marker=m, color='w', markerfacecolor='#52514e',
           markeredgecolor='white', markersize=7, label=lbl)
    for m, lbl in [('o','BW dashed'), ('s','BW solid'), ('D','Color')]
]

leg1 = ax.legend(handles=overlap_handles, title='Overlap', title_fontsize=8,
                 fontsize=8, loc='upper left',
                 frameon=True, framealpha=0.95, edgecolor='#e1e0d9',
                 handletextpad=0.5, labelspacing=0.4)
ax.add_artist(leg1)
ax.legend(handles=set_handles, title='Figure set', title_fontsize=8,
          fontsize=8, loc='upper center',
          frameon=True, framealpha=0.95, edgecolor='#e1e0d9',
          handletextpad=0.5, labelspacing=0.4)

ax.set_title('Kink count vs Curvature Spike Ratio across all test figures',
             fontsize=10, color='#0b0b0b', pad=10, loc='left')

plt.tight_layout()
plt.savefig(OUT, dpi=300, bbox_inches='tight', facecolor='#fcfcfb')
print(f'Saved: {OUT}')
