"""
For each test image, run LineFormer and compute per-line quality scores:

  Kink score (existing):
    - subsample the interpolated trace every STEP pixels
    - compute the turning angle at each interior keypoint
    - flag a line as kinked if any angle exceeds ANGLE_THRESH degrees

  Curvature Spike Ratio (CSR, new):
    - compute turning angles θᵢ at every keypoint (same subsampling)
    - compute angular acceleration aᵢ = |θᵢ₊₁ − θᵢ₋₁| / 2
    - CSR = max(aᵢ) / (median(aᵢ) + ε)
    - smooth curves → CSR ≈ 1–5; stitched traces → CSR >> 10

Output: quality_scores.csv
"""

import sys, os, csv, math, json
sys.path.insert(0, os.path.dirname(__file__))

import numpy as np

# Load pre-computed trace JSONs saved by run_batch_black.py
TRACES_DIR = "/home/HDD-drive/Repos/lineformer_results_black"
OUTPUT_CSV = "/home/HDD-drive/Repos/lineformer_results/quality_scores.csv"

STEP        = 10   # subsample interval (matches mask_kp_sample_interval)
ANGLE_THRESH = 45  # degrees — used for binary kinked/clean classification
KINK_THRESH  = 45  # degrees — used for counting individual kink events

# Test figures (exclude singles which have 1 curve, no overlap variant)
SETS = ['bw', 'bw_solid', 'color']
FIGURES = [
    ('two_no_overlap',      2, 'none'),
    ('two_partial_overlap', 2, 'partial'),
    ('two_heavy_overlap',   2, 'heavy'),
    ('four_no_overlap',     4, 'none'),
    ('four_partial_overlap',4, 'partial'),
    ('four_heavy_overlap',  4, 'heavy'),
    ('eight_no_overlap',    8, 'none'),
    ('eight_partial_overlap',8,'partial'),
    ('eight_heavy_overlap', 8, 'heavy'),
    ('twelve_no_overlap',   12,'none'),
    ('twelve_partial_overlap',12,'partial'),
    ('twelve_heavy_overlap',12,'heavy'),
]


def turning_angles(ds):
    """Given a dataseries [{x,y},...], return list of turning angles (degrees) at interior keypoints."""
    xs = np.array([pt['x'] for pt in ds])
    ys = np.array([pt['y'] for pt in ds])

    # Subsample at STEP intervals to get the effective keypoints
    idx = np.arange(0, len(xs), STEP)
    if len(idx) < 3:
        return []

    kx = xs[idx]
    ky = ys[idx]

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


def is_kinked(ds, thresh=ANGLE_THRESH):
    angles = turning_angles(ds)
    if not angles:
        return False
    return max(angles) > thresh


def max_angle(ds):
    angles = turning_angles(ds)
    return max(angles) if angles else 0.0

def kink_count(ds, thresh=KINK_THRESH):
    """Number of turning angles exceeding thresh."""
    return sum(1 for a in turning_angles(ds) if a > thresh)


def curvature_spike_ratio(ds):
    """
    Curvature Spike Ratio (CSR): max angular acceleration / median angular acceleration.
    Angular acceleration aᵢ = |θᵢ₊₁ − θᵢ₋₁| / 2 at each interior angle.
    Returns 1.0 if fewer than 3 angles (not enough data).
    """
    angles = turning_angles(ds)
    if len(angles) < 3:
        return 1.0
    a = np.array(angles)
    # discrete derivative of the angle sequence (central differences)
    accel = np.abs(a[2:] - a[:-2]) / 2.0
    if len(accel) == 0:
        return 1.0
    # epsilon=1.0 deg is the noise floor: prevents explosion for nearly-straight
    # traces where median(accel) ≈ 0.
    return float(np.max(accel) / (np.median(accel) + 1.0))


rows = []
for set_key in SETS:
    for (stem, n_expected, overlap) in FIGURES:
        json_path = os.path.join(TRACES_DIR, set_key, stem + '_traces.json')
        if not os.path.exists(json_path):
            print(f"MISSING: {json_path}")
            continue

        with open(json_path) as f:
            dataseries = json.load(f)

        n_detected  = len(dataseries)
        kink_flags  = [is_kinked(ds) for ds in dataseries]
        kink_counts = [kink_count(ds) for ds in dataseries]
        csr_scores  = [curvature_spike_ratio(ds) for ds in dataseries]
        n_kinked    = sum(kink_flags)
        n_clean     = n_detected - n_kinked
        total_kinks = sum(kink_counts)
        kinks_per_line = total_kinks / n_detected if n_detected > 0 else 0.0
        mean_csr    = float(np.mean(csr_scores)) if csr_scores else 0.0
        max_csr     = float(np.max(csr_scores))  if csr_scores else 0.0

        rows.append({
            'set':             set_key,
            'figure':          stem + '.png',
            'n_expected':      n_expected,
            'overlap':         overlap,
            'n_detected':      n_detected,
            'n_kinked':        n_kinked,
            'n_clean':         n_clean,
            'total_kinks':     total_kinks,
            'kinks_per_line':  round(kinks_per_line, 2),
            'mean_csr':        round(mean_csr, 2),
            'max_csr':         round(max_csr, 2),
        })
        print(f"{set_key}/{stem}: detected={n_detected}, kinked={n_kinked}, "
              f"kinks_per_line={kinks_per_line:.2f}, mean_csr={mean_csr:.1f}, max_csr={max_csr:.1f}")

os.makedirs(os.path.dirname(OUTPUT_CSV), exist_ok=True)
with open(OUTPUT_CSV, 'w', newline='') as f:
    w = csv.DictWriter(f, fieldnames=rows[0].keys())
    w.writeheader()
    w.writerows(rows)

print(f"\nSaved: {OUTPUT_CSV}")
