"""
Generate synthetic multi-curve line chart figures for evaluating automated
line-extraction methods (e.g. LineFormer).

Three curve families span a range of visual overlap:
  no_overlap      -- horizontally-staggered traces at distinct y-levels
  partial_overlap -- alpha-function waveforms with moderate temporal offset
  heavy_overlap   -- exponential decays sharing a common fast initial transient

Three visual styles are produced for each figure:
  color    -- distinct solid colours
  bw       -- grayscale with varied line styles (solid/dashed/dotted/dash-dot)
  bw_solid -- grayscale with solid lines only

Additionally, annotated versions mark overlap regions in red.
An overlap_scores.csv is written with per-figure metrics.

Usage:
  python generate_figures.py [--out OUT_DIR]
  (default output dir: lineformer_test)
"""

import argparse
import csv
import os

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

# ── Global parameters ──────────────────────────────────────────────────────────
OVERLAP_THRESHOLD = 0.02   # fraction of y-range: curves within this are "overlapping"
N_SAMPLES         = 500    # number of x-points used for overlap metric
FIG_DPI           = 150
FIG_SIZE          = (7, 4)

X = np.linspace(0, 10, N_SAMPLES)


# ── Curve families ─────────────────────────────────────────────────────────────

def make_separated_traces(n):
    """
    n sinusoidal traces at distinct y-levels — guaranteed zero overlap.
    Each trace oscillates with an amplitude that is 25 % of the inter-trace
    spacing, so adjacent traces never come within OVERLAP_THRESHOLD of each other.
    """
    levels  = np.linspace(0.1, 0.9, n)
    spacing = (0.9 - 0.1) / max(n - 1, 1)
    amp     = 0.25 * spacing          # amplitude fraction of spacing
    return [lv + amp * np.sin(2 * np.pi * X / 8.0) for lv in levels]


def make_partial_overlap_alpha(n):
    """
    n alpha-function waveforms (y = t·exp(−t/τ)) with staggered onsets.
    Curves overlap only where their tails cross, producing moderate overlap.
    """
    tau     = 1.2
    offsets = np.linspace(0.0, 7.0, n)
    ys = []
    for o in offsets:
        t    = X - o
        y    = np.where(t > 0, t * np.exp(-t / tau), 0.0)
        peak = y.max()
        ys.append(y / peak if peak > 0 else y)
    return ys


def make_heavy_overlap_expdecay(n):
    """
    n exponential decays sharing the same starting point, diverging slowly.
    Produces extensive overlap near x = 0 where all curves are close to 1.
    """
    taus = np.linspace(0.8, 3.5, n)
    return [np.exp(-X / tau) for tau in taus]


# ── Figure catalogue ───────────────────────────────────────────────────────────

SINGLES = {
    'single_sigmoid':  [1.0 / (1.0 + np.exp(-(X - 5.0) / 0.5))],
    'single_expdecay': [np.exp(-X / 2.0)],
    'single_alpha':    [X * np.exp(-X / 2.0) / (2.0 * np.exp(-1.0))],
}

MULTI = {}
for _n, _prefix in [(2, 'two'), (4, 'four'), (8, 'eight'), (12, 'twelve')]:
    MULTI[f'{_prefix}_no_overlap']      = make_separated_traces(_n)
    MULTI[f'{_prefix}_partial_overlap'] = make_partial_overlap_alpha(_n)
    MULTI[f'{_prefix}_heavy_overlap']   = make_heavy_overlap_expdecay(_n)

ALL_FIGURES = {**SINGLES, **MULTI}


# ── Visual style functions ─────────────────────────────────────────────────────

_COLORS = ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00',
           '#a65628', '#f781bf', '#999999', '#1b9e77', '#d95f02',
           '#66c2a5', '#fc8d62']

_LINESTYLES = ['-', '--', ':', '-.']


def _gray(i, n):
    """Shade from black (i=0) to mid-gray (i=n-1)."""
    return str(round(i / max(n - 1, 1) * 0.72, 3))


def color_style(i, n):
    return dict(color=_COLORS[i % len(_COLORS)], lw=1.8, ls='-')


def bw_style(i, n):
    return dict(color=_gray(i, n), lw=1.8, ls=_LINESTYLES[i % len(_LINESTYLES)])


def bw_solid_style(i, n):
    return dict(color=_gray(i, n), lw=1.8, ls='-')


STYLES = {
    'color':    color_style,
    'bw':       bw_style,
    'bw_solid': bw_solid_style,
}


# ── Overlap metrics ────────────────────────────────────────────────────────────

def overlap_metrics(curves):
    """
    Returns (n_overlap_events, overlap_score) where:
      overlap_score     -- fraction of x-positions where any pair is within
                           OVERLAP_THRESHOLD of the global y-range AND at least
                           one of the pair is above the noise floor
      n_overlap_events  -- number of distinct contiguous overlap intervals
    """
    if len(curves) < 2:
        return 0, 0.0

    ys      = np.array(curves)
    y_range = ys.max() - ys.min()
    if y_range == 0:
        return 0, 0.0
    thr = OVERLAP_THRESHOLD * y_range

    # Only count overlap where at least one curve is meaningfully active
    any_active = ys.max(axis=0) > thr

    any_overlap = np.zeros(N_SAMPLES, dtype=bool)
    for i in range(len(curves)):
        for j in range(i + 1, len(curves)):
            any_overlap |= any_active & (np.abs(ys[i] - ys[j]) < thr)

    overlap_score = float(any_overlap.mean())

    events, in_event = 0, False
    for v in any_overlap:
        if v and not in_event:
            events += 1
            in_event = True
        elif not v:
            in_event = False

    return events, round(overlap_score, 4)


# ── Rendering ──────────────────────────────────────────────────────────────────

def render_figure(curves, style_fn, out_path, annotate=False):
    n = len(curves)
    fig, ax = plt.subplots(figsize=FIG_SIZE)
    fig.patch.set_facecolor('white')
    ax.set_facecolor('white')
    ax.spines[['top', 'right']].set_visible(False)

    if annotate and n >= 2:
        ys      = np.array(curves)
        y_range = ys.max() - ys.min()
        thr     = OVERLAP_THRESHOLD * y_range if y_range > 0 else 0.0
        any_active  = ys.max(axis=0) > thr
        any_overlap = np.zeros(N_SAMPLES, dtype=bool)
        for i in range(n):
            for j in range(i + 1, n):
                any_overlap |= any_active & (np.abs(ys[i] - ys[j]) < thr)

        in_event, start = False, None
        for k, (v, x) in enumerate(zip(any_overlap, X)):
            if v and not in_event:
                start = x
                in_event = True
            elif not v and in_event:
                ax.axvspan(start, X[k - 1], alpha=0.25, color='red', lw=0)
                in_event = False
        if in_event:
            ax.axvspan(start, X[-1], alpha=0.25, color='red', lw=0)

    for i, y in enumerate(curves):
        ax.plot(X, y, **style_fn(i, n))

    ax.set_xlabel('x')
    ax.set_ylabel('y')
    ax.set_xlim(X[0], X[-1])

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    fig.savefig(out_path, dpi=FIG_DPI, bbox_inches='tight')
    plt.close(fig)


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--out', default='lineformer_test',
                        help='Root output directory (default: lineformer_test)')
    args = parser.parse_args()
    out = args.out

    rows = []
    for name, curves in ALL_FIGURES.items():
        print(f'{name}  ({len(curves)} curve(s))')
        events, score = overlap_metrics(curves)
        rows.append({
            'figure':           name + '.png',
            'n_curves':         len(curves),
            'n_overlap_events': events,
            'overlap_score':    score,
        })

        for style_key, style_fn in STYLES.items():
            path = os.path.join(out, style_key, name + '.png')
            render_figure(curves, style_fn, path)

        path = os.path.join(out, 'annotated', name + '.png')
        render_figure(curves, color_style, path, annotate=True)

    csv_path = os.path.join(out, 'overlap_scores.csv')
    with open(csv_path, 'w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=rows[0].keys())
        w.writeheader()
        w.writerows(rows)

    print(f'\nOverlap scores  -> {csv_path}')
    print(f'Figures         -> {out}/{{color,bw,bw_solid,annotated}}/')


if __name__ == '__main__':
    main()
