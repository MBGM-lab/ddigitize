"""
Render the per-image tracing overview PDF (supplementary material S4).

Each row shows one test figure across four columns:
  Original (color) | Tracing — color | Tracing — BW dashed | Tracing — BW solid

The tracing columns require annotated images produced by run_quality.py
with the --save-tracings option.

Usage:
  python make_pdf_overview.py \\
      [--test     lineformer_test] \\
      [--results  lineformer_results] \\
      [--output   lineformer_results/overview.pdf]
"""

import argparse
import os

import matplotlib
matplotlib.use('Agg')
import matplotlib.image as mpimg
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.backends.backend_pdf import PdfPages

FIGURES = [
    ('single_sigmoid',        '1 curve / sigmoid'),
    ('single_expdecay',       '1 curve / exp decay'),
    ('single_alpha',          '1 curve / alpha'),
    ('two_no_overlap',        '2 curves / A'),
    ('two_partial_overlap',   '2 curves / B'),
    ('two_heavy_overlap',     '2 curves / C'),
    ('four_no_overlap',       '4 curves / A'),
    ('four_partial_overlap',  '4 curves / B'),
    ('four_heavy_overlap',    '4 curves / C'),
    ('eight_no_overlap',      '8 curves / A'),
    ('eight_partial_overlap', '8 curves / B'),
    ('eight_heavy_overlap',   '8 curves / C'),
    ('twelve_no_overlap',     '12 curves / A'),
    ('twelve_partial_overlap','12 curves / B'),
    ('twelve_heavy_overlap',  '12 curves / C'),
]

COL_TITLES    = ['Original (color)', 'Tracing — color',
                 'Tracing — BW dashed', 'Tracing — BW solid']
ROWS_PER_PAGE = 5
A4_PORTRAIT   = (8.27, 11.69)


def load(path):
    return mpimg.imread(path) if os.path.exists(path) else None


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--test', default='lineformer_test',
                        help='Directory of original test figures '
                             '(default: lineformer_test)')
    parser.add_argument('--results', default='lineformer_results',
                        help='Directory of LineFormer tracing results; must '
                             'contain color/, bw/, and bw_solid/ subdirectories '
                             'produced by run_quality.py --save-tracings '
                             '(default: lineformer_results)')
    parser.add_argument('--output', default='lineformer_results/overview.pdf',
                        help='Output PDF path (default: lineformer_results/overview.pdf)')
    args = parser.parse_args()

    pages = [FIGURES[i:i+ROWS_PER_PAGE]
             for i in range(0, len(FIGURES), ROWS_PER_PAGE)]

    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    with PdfPages(args.output) as pdf:
        for page_rows in pages:
            n = len(page_rows)
            fig, axes = plt.subplots(
                n, 4, figsize=A4_PORTRAIT,
                gridspec_kw={'wspace': 0.03, 'hspace': 0.08,
                             'left': 0.18, 'right': 0.99,
                             'top': 0.96, 'bottom': 0.01})
            fig.patch.set_facecolor('white')

            if n == 1:
                axes = axes[np.newaxis, :]

            for j, title in enumerate(COL_TITLES):
                axes[0, j].set_title(title, fontsize=8, fontweight='bold', pad=4)

            for i, (stem, label) in enumerate(page_rows):
                paths = [
                    os.path.join(args.test,    'color',    stem + '.png'),
                    os.path.join(args.results, 'color',    stem + '.png'),
                    os.path.join(args.results, 'bw',       stem + '.png'),
                    os.path.join(args.results, 'bw_solid', stem + '.png'),
                ]
                for j, path in enumerate(paths):
                    ax  = axes[i, j]
                    img = load(path)
                    if img is not None:
                        ax.imshow(img)
                    else:
                        ax.text(0.5, 0.5, 'missing', ha='center', va='center',
                                fontsize=7, color='#aaa', transform=ax.transAxes)
                    ax.set_xticks([]); ax.set_yticks([])
                    for spine in ax.spines.values():
                        spine.set_visible(False)

                axes[i, 0].set_ylabel(label, fontsize=8, fontweight='bold',
                                      labelpad=6, rotation=0,
                                      ha='right', va='center')

            pdf.savefig(fig, dpi=150)
            plt.close(fig)

    print(f'Saved: {args.output}')


if __name__ == '__main__':
    main()
