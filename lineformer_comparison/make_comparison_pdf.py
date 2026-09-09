#!/usr/bin/env python3
"""
Rebuild S1_example_data_and_usage.pdf at 300 dpi.
For each example: comparison page (Original | LineFormer) + dDigitize page.
"""
import os, shutil
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages
from matplotlib.gridspec import GridSpec
from PIL import Image

BASE   = '/home/HDD-drive/Repos/Bezier_curve_and_svgpathtool/App/Manuscript/Figures/example_data'
OUT    = '/home/HDD-drive/Repos/Bezier_curve_and_svgpathtool/App/Manuscript/S1_example_data_and_usage.pdf'
COPY   = '/home/HDD-drive/Repos/Bezier_curve_and_svgpathtool/App/Manuscript/Figures/S1_example_data_and_usage.pdf'
DPI    = 300
LW, LH = 11.69, 8.27   # A4 landscape (inches)

def load(path, upsample=2):
    """Load image; optionally LANCZOS 2× upsample for small originals."""
    if not os.path.exists(path):
        return None
    img = Image.open(path).convert('RGB')
    if upsample > 1:
        img = img.resize((img.width * upsample, img.height * upsample),
                         Image.LANCZOS)
    return np.array(img)

def comparison_page(pdf, title, rows, col_titles=('Original', 'LineFormer tracing')):
    """
    rows: list of (left_path, right_path, row_label) tuples.
    Two columns, height computed from aspect ratios.
    """
    n = len(rows)
    # compute height_ratios from first image in each row (aspect w/h)
    ratios = []
    for lp, rp, _ in rows:
        img = load(lp) if lp and os.path.exists(lp) else None
        if img is None and rp and os.path.exists(rp):
            img = load(rp)
        if img is not None:
            ratios.append(img.shape[1] / img.shape[0])   # w/h
        else:
            ratios.append(1.5)

    fig = plt.figure(figsize=(LW, LH))
    fig.patch.set_facecolor('white')
    fig.suptitle(title, fontsize=12, fontweight='bold', y=0.98)

    gs = GridSpec(n, 2, figure=fig,
                  height_ratios=[1/r for r in ratios],
                  wspace=0.03, hspace=0.10,
                  left=0.12, right=0.99, top=0.93, bottom=0.02)

    for j, ct in enumerate(col_titles):
        ax = fig.add_subplot(gs[0, j])
        ax.set_title(ct, fontsize=9, fontweight='bold', pad=4)
        ax.set_visible(False)
        ax2 = fig.add_subplot(gs[0, j])
        ax2.set_title(ct, fontsize=9, fontweight='bold', pad=4)

    for i, (lp, rp, row_label) in enumerate(rows):
        for j, path in enumerate([lp, rp]):
            ax = fig.add_subplot(gs[i, j])
            img = load(path) if path else None
            if img is not None:
                ax.imshow(img)
            else:
                ax.text(0.5, 0.5, 'missing', ha='center', va='center',
                        fontsize=9, color='#aaa', transform=ax.transAxes)
            ax.set_xticks([]); ax.set_yticks([])
            for sp in ax.spines.values():
                sp.set_visible(False)
            if j == 0 and i == 0:
                ax.set_title(col_titles[0], fontsize=9, fontweight='bold', pad=4)
            if j == 1 and i == 0:
                ax.set_title(col_titles[1], fontsize=9, fontweight='bold', pad=4)
        # row label on far left
        ax0 = fig.axes[i * 2] if i * 2 < len(fig.axes) else None
        # use the left axis ylabel
        fig.axes[i*2].set_ylabel(row_label, fontsize=8, fontweight='bold',
                                  labelpad=6, rotation=0, ha='right', va='center')

    pdf.savefig(fig, dpi=DPI)
    plt.close(fig)


def ddigi_page(pdf, title, img_path, top_frac=0.09, right_frac=0.0):
    """Full-width dDigitize screenshot, crops toolbar from top (and optionally right panel)."""
    img = load(img_path, upsample=1)
    if img is None:
        print(f"  MISSING ddigitize image: {img_path}")
        return
    h, w = img.shape[:2]
    top_px   = int(h * top_frac)
    right_px = int(w * right_frac)
    cropped  = img[top_px:, :w - right_px if right_px else w]

    ch, cw = cropped.shape[:2]
    aspect = cw / ch
    fig_h = LW / aspect  # fill full width
    fig_h = min(fig_h, LH * 0.92)  # cap at page height

    fig, ax = plt.subplots(figsize=(LW, LH))
    fig.patch.set_facecolor('white')
    fig.suptitle(title, fontsize=12, fontweight='bold', y=0.98)

    # centre the image vertically
    ax_h = fig_h / LH
    ax.set_position([0.01, (1 - ax_h) / 2, 0.98, ax_h])
    ax.imshow(cropped)
    ax.set_xticks([]); ax.set_yticks([])
    for sp in ax.spines.values():
        sp.set_visible(False)

    pdf.savefig(fig, dpi=DPI)
    plt.close(fig)


# ── Content definition ────────────────────────────────────────────────────────

EXAMPLES = [
    {
        'title':       'Dose-response curves',
        'ddigi_title': 'Dose-response curves — dDigitize tracing',
        'rows': [
            (os.path.join(BASE, 'example_dose_response.png'),
             os.path.join(BASE, 'traced_LineFormer', 'example_dose_response.png'),
             'Full figure'),
        ],
        'ddigi': os.path.join(BASE, 'ddigitalize_traced', 'example_dose_response_ddigitize.png'),
    },
    {
        'title':       'Electrophysiology recordings',
        'ddigi_title': 'Electrophysiology recordings — dDigitize tracing',
        'rows': [
            (os.path.join(BASE, 'example_electrophysiology.png'),
             os.path.join(BASE, 'traced_LineFormer', 'example_electrophysiology.png'),
             'Full figure'),
            (os.path.join(BASE, 'split', 'ephys_action_potentials.png'),
             os.path.join(BASE, 'split_traced', 'ephys_action_potentials.png'),
             'Action\npotentials'),
            (os.path.join(BASE, 'split', 'ephys_na_channel.png'),
             os.path.join(BASE, 'split_traced', 'ephys_na_channel.png'),
             'Na⁺ channel'),
        ],
        'ddigi': os.path.join(BASE, 'ddigitalize_traced', 'example_electrophysiology_ddigitize.png'),
    },
    {
        'title':       'Time-series data',
        'ddigi_title': 'Time-series data — dDigitize tracing',
        'rows': [
            (os.path.join(BASE, 'example_timeseries.png'),
             os.path.join(BASE, 'traced_LineFormer', 'example_timeseries.png'),
             'Full figure'),
            (os.path.join(BASE, 'split', 'ts_calcium_imaging.png'),
             os.path.join(BASE, 'split_traced', 'ts_calcium_imaging.png'),
             'Ca²⁺ imaging'),
            (os.path.join(BASE, 'split', 'ts_lfp.png'),
             os.path.join(BASE, 'split_traced', 'ts_lfp.png'),
             'LFP'),
        ],
        'ddigi': os.path.join(BASE, 'ddigitalize_traced', 'example_timeseries_ddigitize.png'),
    },
]

# ── Build PDF ─────────────────────────────────────────────────────────────────
print(f'Writing {OUT}')
with PdfPages(OUT) as pdf:
    for ex in EXAMPLES:
        print(f"  Page: {ex['title']}")
        comparison_page(pdf, ex['title'], ex['rows'])

print(f'Saved: {OUT}')

if os.path.exists(os.path.dirname(COPY)):
    shutil.copy2(OUT, COPY)
    print(f'Copied to: {COPY}')
else:
    print(f'Copy destination missing, skipping: {COPY}')
