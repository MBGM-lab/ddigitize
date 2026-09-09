"""
Render the LineFormer tracing-quality heatmap (quality_heatmap.png).

Reads quality_scores.csv produced by run_quality.py and writes a three-panel
heatmap: one panel per visual style (BW Dashed / BW Solid / Color).

Each cell shows:
  bold   -- kinked lines / total detected  (numerator = detection count)
  small  -- kinks per line  (turns >45° summed over all lines / n_detected)

Usage:
  python make_quality_plot.py \\
      [--input  lineformer_results/quality_scores.csv] \\
      [--output lineformer_results/plots]
"""

import argparse
import csv
import os

import matplotlib
matplotlib.use('Agg')
import matplotlib.colors as mcolors
import matplotlib.pyplot as plt
import numpy as np

SETS       = ['bw', 'bw_solid', 'color']
SET_LABELS = {'bw': 'BW Dashed', 'bw_solid': 'BW Solid', 'color': 'Color'}
COUNTS     = [2, 4, 8, 12]
OVERLAPS   = ['none', 'partial', 'heavy']
OV_LABELS  = {'none': 'A', 'partial': 'B', 'heavy': 'C'}


def load_csv(path):
    data = {s: {n: {o: None for o in OVERLAPS} for n in COUNTS} for s in SETS}
    with open(path) as f:
        for row in csv.DictReader(f):
            s, n, ov = row['set'], int(row['n_expected']), row['overlap']
            if n in COUNTS:
                data[s][n][ov] = {
                    'n_detected':     int(row['n_detected']),
                    'n_kinked':       int(row['n_kinked']),
                    'kinks_per_line': float(row['kinks_per_line']),
                }
    return data


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--input',
                        default='/home/HDD-drive/Repos/lineformer_results/quality_scores.csv',
                        help='Input CSV from run_quality.py')
    parser.add_argument('--output',
                        default='/home/HDD-drive/Repos/lineformer_results',
                        help='Output directory')
    args = parser.parse_args()

    data = load_csv(args.input)

    plt.rcParams.update({'font.family': 'sans-serif'})
    kink_cmap = mcolors.LinearSegmentedColormap.from_list(
        'kink', ['#f5f7fa', '#fdd0a2', '#e34948'])

    fig, axes = plt.subplots(1, 3, figsize=(10.5, 3.4), sharey=True,
                             gridspec_kw={'right': 0.91})
    fig.patch.set_facecolor('white')
    cbar_ax = fig.add_axes([0.93, 0.18, 0.020, 0.62])

    for ax, set_key in zip(axes, SETS):
        angle_mat = np.full((len(OVERLAPS), len(COUNTS)), np.nan)
        for i, ov in enumerate(OVERLAPS):
            for j, n in enumerate(COUNTS):
                d = data[set_key][n][ov]
                if d is not None:
                    angle_mat[i, j] = d['kinks_per_line']

        im = ax.imshow(angle_mat, cmap=kink_cmap, vmin=0, vmax=6, aspect='auto')

        for i in range(len(OVERLAPS)):
            for j in range(len(COUNTS)):
                d = data[set_key][COUNTS[j]][OVERLAPS[i]]
                if d is None:
                    continue
                ax.text(j, i, f"{d['n_kinked']}/{d['n_detected']}",
                        ha='center', va='center',
                        fontsize=10, color='#0c1117', fontweight='bold')
                ax.text(j, i + 0.32, f"{d['kinks_per_line']:.1f}",
                        ha='center', va='center',
                        fontsize=7.5, color='#0c1117', alpha=0.85)

        ax.set_xticks(range(len(COUNTS)))
        ax.set_xticklabels([str(n) for n in COUNTS], fontsize=9)
        ax.set_xlabel('Expected curves', fontsize=9, labelpad=4)
        ax.set_title(SET_LABELS[set_key], fontsize=11, fontweight='600',
                     pad=7, loc='left')

        if ax is axes[0]:
            ax.set_yticks(range(len(OVERLAPS)))
            ax.set_yticklabels([OV_LABELS[o] for o in OVERLAPS],
                               fontsize=11, fontweight='bold')

        for i in range(len(OVERLAPS)):
            for j in range(len(COUNTS)):
                ax.add_patch(plt.Rectangle(
                    (j - 0.5, i - 0.5), 1, 1,
                    fill=False, edgecolor='white', linewidth=1.5))

    cb = fig.colorbar(im, cax=cbar_ax)
    cb.set_label('Kinks per line\n(turns >45°)', fontsize=8)
    cb.ax.tick_params(labelsize=8)
    fig.suptitle(
        'Tracing quality: kinked lines / total detected  '
        '(value = kinks per line, threshold 45°)',
        fontsize=9, y=1.02, x=0.45)

    plt.tight_layout()
    os.makedirs(args.output, exist_ok=True)
    out = os.path.join(args.output, 'quality_heatmap.png')  # used in figure_LineFormer_results
    fig.savefig(out, format='png', bbox_inches='tight', dpi=150)
    plt.close()
    print(f'Saved: {out}')


if __name__ == '__main__':
    main()
