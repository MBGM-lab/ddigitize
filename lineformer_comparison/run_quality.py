"""
Run LineFormer inference on all synthetic test figures and compute kink metrics.

For each detected line the script subsamples the trace every STEP pixels and
measures the turning angle at each interior keypoint.  A line is flagged as
kinked when any angle exceeds KINK_THRESH degrees.  Per-figure totals are
written to a CSV that feeds make_quality_plot.py.

Usage:
  python run_quality.py \\
      --lineformer /path/to/LineFormer \\
      --checkpoint /path/to/iter_3000.pth \\
      --input  lineformer_test \\
      --output lineformer_results/quality_scores.csv \\
      [--save-tracings lineformer_results]

The optional --save-tracings argument saves annotated PNG images under
  <dir>/{color,bw,bw_solid}/<figure>.png
which are needed by make_pdf_overview.py.
"""

import argparse
import csv
import math
import os
import sys

import cv2
import numpy as np


STEP         = 10   # keypoint subsample interval (pixels)
ANGLE_THRESH = 45   # degrees — binary kinked/clean flag
KINK_THRESH  = 45   # degrees — per-line kink count

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


def turning_angles(ds):
    xs = np.array([pt['x'] for pt in ds])
    ys = np.array([pt['y'] for pt in ds])
    idx = np.arange(0, len(xs), STEP)
    if len(idx) < 3:
        return []
    kx, ky = xs[idx], ys[idx]
    angles = []
    for i in range(1, len(kx) - 1):
        v1 = np.array([kx[i] - kx[i-1], ky[i] - ky[i-1]], dtype=float)
        v2 = np.array([kx[i+1] - kx[i], ky[i+1] - ky[i]], dtype=float)
        n1, n2 = np.linalg.norm(v1), np.linalg.norm(v2)
        if n1 < 1e-6 or n2 < 1e-6:
            continue
        cos_a = np.clip(np.dot(v1, v2) / (n1 * n2), -1.0, 1.0)
        angles.append(math.degrees(math.acos(cos_a)))
    return angles


def is_kinked(ds):
    angles = turning_angles(ds)
    return bool(angles) and max(angles) > ANGLE_THRESH


def kink_count(ds):
    return sum(1 for a in turning_angles(ds) if a > KINK_THRESH)


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--lineformer', required=True,
                        help='Path to the LineFormer repository root '
                             '(must contain infer.py and lineformer_swin_t_config.py)')
    parser.add_argument('--checkpoint', required=True,
                        help='Path to the LineFormer checkpoint (.pth file)')
    parser.add_argument('--input', default='lineformer_test',
                        help='Directory of test figures (default: lineformer_test)')
    parser.add_argument('--output', default='lineformer_results/quality_scores.csv',
                        help='Output CSV path (default: lineformer_results/quality_scores.csv)')
    parser.add_argument('--save-tracings', metavar='DIR', default=None,
                        help='If given, save annotated tracing images to '
                             'DIR/{color,bw,bw_solid}/ (required by make_pdf_overview.py)')
    parser.add_argument('--device', default='cpu', choices=['cpu', 'cuda'],
                        help='Inference device (default: cpu)')
    args = parser.parse_args()

    sys.path.insert(0, args.lineformer)
    import infer
    if args.save_tracings:
        import line_utils

    config = os.path.join(args.lineformer, 'lineformer_swin_t_config.py')

    print('Loading model...')
    infer.load_model(config, args.checkpoint, args.device)
    print('Model loaded.\n')

    rows = []
    for set_key in SETS:
        for (stem, n_expected, overlap) in FIGURES:
            img_path = os.path.join(args.input, set_key, stem + '.png')
            if not os.path.exists(img_path):
                print(f'MISSING: {img_path}')
                continue

            img = cv2.imread(img_path)
            try:
                dataseries = infer.get_dataseries(img, to_clean=False)
            except Exception as e:
                print(f'ERROR {set_key}/{stem}: {e}')
                continue

            n_detected     = len(dataseries)
            kink_flags     = [is_kinked(ds) for ds in dataseries]
            kink_counts    = [kink_count(ds) for ds in dataseries]
            n_kinked       = sum(kink_flags)
            total_kinks    = sum(kink_counts)
            kinks_per_line = total_kinks / n_detected if n_detected > 0 else 0.0

            rows.append({
                'set':            set_key,
                'figure':         stem + '.png',
                'n_expected':     n_expected,
                'overlap':        overlap,
                'n_detected':     n_detected,
                'n_kinked':       n_kinked,
                'n_clean':        n_detected - n_kinked,
                'total_kinks':    total_kinks,
                'kinks_per_line': round(kinks_per_line, 2),
            })
            print(f'{set_key}/{stem}: detected={n_detected}, kinked={n_kinked}, '
                  f'kinks_per_line={kinks_per_line:.2f}')

            if args.save_tracings:
                out_path = os.path.join(args.save_tracings, set_key, stem + '.png')
                os.makedirs(os.path.dirname(out_path), exist_ok=True)
                result = line_utils.draw_lines(
                    img, line_utils.points_to_array(dataseries))
                cv2.imwrite(out_path, result)

    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    with open(args.output, 'w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=rows[0].keys())
        w.writeheader()
        w.writerows(rows)
    print(f'\nSaved: {args.output}')


if __name__ == '__main__':
    main()
