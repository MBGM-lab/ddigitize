"""
Render the per-image tracing overview PDF with a 2×2 layout per figure.

Each figure is shown as a 2×2 block:
  Original (color)      | Tracing — color
  Tracing — BW dashed   | Tracing — BW solid

Three figures per page gives images ~42 % larger than the 1×4/5-per-page layout.

Output:  Manuscript/S4.pdf  (15 figures → 5 pages)
"""

import os
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.image as mpimg
import matplotlib.gridspec as gridspec
from matplotlib.lines import Line2D
from matplotlib.backends.backend_pdf import PdfPages

TEST_DIR     = "/home/HDD-drive/Repos/lineformer_test"
RESULTS_DIR  = "/home/HDD-drive/Repos/lineformer_results_contrast"  # contrast: black on color, colour on BW
OUTPUT_PDF   = "/home/HDD-drive/Repos/Bezier_curve_and_svgpathtool/App/Manuscript/S2_File.pdf"

FIGURES = [
    # sigmoid group (well separated)
    ('single_sigmoid',        '1 curve',   'Sigmoid: well separated'),
    ('two_no_overlap',        '2 curves',  'Sigmoid: well separated'),
    ('four_no_overlap',       '4 curves',  'Sigmoid: well separated'),
    ('eight_no_overlap',      '8 curves',  'Sigmoid: well separated'),
    ('twelve_no_overlap',     '12 curves', 'Sigmoid: well separated'),
    # alpha group (partial overlap)
    ('single_alpha',          '1 curve',   'Alpha: partial overlap'),
    ('two_partial_overlap',   '2 curves',  'Alpha: partial overlap'),
    ('four_partial_overlap',  '4 curves',  'Alpha: partial overlap'),
    ('eight_partial_overlap', '8 curves',  'Alpha: partial overlap'),
    ('twelve_partial_overlap','12 curves', 'Alpha: partial overlap'),
    # exp-decay group (heavy overlap)
    ('single_expdecay',       '1 curve',   'Exp decay: heavy overlap'),
    ('two_heavy_overlap',     '2 curves',  'Exp decay: heavy overlap'),
    ('four_heavy_overlap',    '4 curves',  'Exp decay: heavy overlap'),
    ('eight_heavy_overlap',   '8 curves',  'Exp decay: heavy overlap'),
    ('twelve_heavy_overlap',  '12 curves', 'Exp decay: heavy overlap'),
]

FIGS_PER_PAGE = 2
A4_PORTRAIT   = (8.27, 11.69)
DPI           = 300


def load(path):
    return mpimg.imread(path) if os.path.exists(path) else None


def make_page(pdf, page_figs, caption=None):
    """Render one page with len(page_figs) 2×2 figure blocks."""
    n = len(page_figs)
    # Use the group title that appears most on this page (first occurrence wins ties)
    from collections import Counter
    title_counts = Counter(f[2] for f in page_figs)
    page_title = title_counts.most_common(1)[0][0]

    # Always build the gridspec for FIGS_PER_PAGE slots so row heights are
    # consistent even on the last page which may have fewer figures.
    n_slots = FIGS_PER_PAGE
    hr = []
    for i in range(n_slots):
        hr += [1, 1]
        if i < n_slots - 1:
            hr.append(0.12)   # spacer between groups
    total_rows = len(hr)

    fig = plt.figure(figsize=A4_PORTRAIT, facecolor='white')
    fig.suptitle(page_title, fontsize=14, fontweight='bold', y=0.997)

    gs = gridspec.GridSpec(
        total_rows, 2, figure=fig,
        height_ratios=hr,
        left=0.26, right=0.99,
        top=0.950, bottom=0.012,
        wspace=0.03, hspace=0.04,
    )

    row_offset = 0
    for fig_idx, (stem, label, group_name) in enumerate(page_figs):
        paths = [
            os.path.join(TEST_DIR,    'color',    stem + '.png'),
            os.path.join(RESULTS_DIR, 'color',    stem + '.png'),
            os.path.join(RESULTS_DIR, 'bw',       stem + '.png'),
            os.path.join(RESULTS_DIR, 'bw_solid', stem + '.png'),
        ]
        # 2×2 block: [orig, color_trace] top row, [bw, bw_solid] bottom row
        subtitles = [
            ['Original (color)', 'Tracing — color'],
            ['Tracing — BW dashed', 'Tracing — BW solid'],
        ]
        for blk_row in range(2):
            for blk_col in range(2):
                ax = fig.add_subplot(gs[row_offset + blk_row, blk_col])
                img = load(paths[blk_row * 2 + blk_col])
                if img is not None:
                    ax.imshow(img)
                else:
                    ax.text(0.5, 0.5, 'missing', ha='center', va='center',
                            fontsize=7, color='#aaa', transform=ax.transAxes)
                ax.set_xticks([])
                ax.set_yticks([])
                for spine in ax.spines.values():
                    spine.set_visible(False)
                ax.set_title(subtitles[blk_row][blk_col],
                             fontsize=8, fontweight='bold', pad=3)

        # Curve-count label on the y-axis (left of the 2×2 block)
        pos_tl = gs[row_offset,     0].get_position(fig)
        pos_bl = gs[row_offset + 1, 0].get_position(fig)
        mid_y  = (pos_tl.y1 + pos_bl.y0) / 2
        label_text = label if group_name == page_title else f"{label}\n{group_name}"
        fig.text(pos_tl.x0 - 0.005, mid_y, label_text,
                 ha='right', va='center', fontsize=10, fontweight='bold')

        # Horizontal separator line in the spacer row between groups
        if fig_idx < n - 1:
            sp   = gs[row_offset + 2, 0].get_position(fig)
            sp_r = gs[row_offset + 2, 1].get_position(fig)
            line_y = (sp.y0 + sp.y1) / 2
            fig.add_artist(Line2D([sp.x0, sp_r.x1], [line_y, line_y],
                                  transform=fig.transFigure,
                                  color='#aaa', linewidth=0.8))

        row_offset += 2
        if fig_idx < n - 1:
            row_offset += 1   # skip the spacer row

    if caption:
        fig.text(0.26, 0.420, 'S2 File.', ha='left', va='top',
                 fontsize=9, fontweight='bold', color='#111111', fontfamily='serif')
        fig.text(0.26, 0.395, caption, ha='left', va='top',
                 fontsize=9, color='#111111', fontfamily='serif', linespacing=1.7)

    pdf.savefig(fig, dpi=DPI)
    plt.close(fig)


def make_legend_page(pdf):
    """Final page: figure caption."""
    fig = plt.figure(figsize=A4_PORTRAIT, facecolor='white')

    kw_label = dict(ha='left', va='top', fontsize=9, fontweight='bold',
                    color='#111111', fontfamily='serif')
    kw_body  = dict(ha='left', va='top', fontsize=9, color='#111111',
                    fontfamily='serif', linespacing=1.7)

    fig.text(0.10, 0.920, 'S2 File.', **kw_label)
    fig.text(0.10, 0.893,
        'LineFormer tracing results for all synthetic test figures. Each row shows one test\n'
        'figure as a 2×2 panel: the original colour image (top left), LineFormer tracing with\n'
        'black lines overlaid on the colour figure (top right), coloured individual traces\n'
        'overlaid on the black-and-white dashed version (bottom left), and coloured traces on\n'
        'the black-and-white solid version (bottom right). Black traces are used on colour\n'
        'figures and distinct colours on black-and-white figures to maximise contrast. Test\n'
        'figures span three curve families — sigmoid (well separated), alpha function (partial\n'
        'overlap), and exponential decay (heavy overlap) — each shown with 1, 2, 4, 8, and\n'
        '12 curves.',
        **kw_body)

    pdf.savefig(fig, dpi=DPI)
    plt.close(fig)


CAPTION = (
    'LineFormer tracing results for all synthetic test figures. Each row shows one test\n'
    'figure as a 2×2 panel: the original colour image (top left), LineFormer tracing with\n'
    'black lines overlaid on the colour figure (top right), coloured individual traces\n'
    'overlaid on the black-and-white dashed version (bottom left), and coloured traces on\n'
    'the black-and-white solid version (bottom right). Black traces are used on colour\n'
    'figures and distinct colours on black-and-white figures to maximise contrast. Test\n'
    'figures span three curve families — sigmoid (well separated), alpha function (partial\n'
    'overlap), and exponential decay (heavy overlap) — each shown with 1, 2, 4, 8, and\n'
    '12 curves.'
)

if __name__ == '__main__':
    pages = [FIGURES[i:i + FIGS_PER_PAGE]
             for i in range(0, len(FIGURES), FIGS_PER_PAGE)]

    os.makedirs(os.path.dirname(os.path.abspath(OUTPUT_PDF)), exist_ok=True)
    with PdfPages(OUTPUT_PDF) as pdf:
        for i, page_figs in enumerate(pages):
            is_last = (i == len(pages) - 1)
            make_page(pdf, page_figs, caption=CAPTION if is_last else None)
            stems = [f[0] for f in page_figs]
            print(f'  Page: {stems}')

    print(f'Saved: {OUTPUT_PDF}')
