# LineFormer Comparison — Synthetic Figure Pipeline

Scripts for generating the synthetic multi-curve line charts and producing the
LineFormer evaluation figures used in the ddigitalize manuscript.

---

## Scripts

| Script | Purpose | Output |
|--------|---------|--------|
| `generate_figures.py` | Create synthetic test figures | `lineformer_test/` |
| `run_quality.py` | Run LineFormer inference; compute kink metric | `quality_scores.csv` (+ optional traced images) |
| `make_quality_plot.py` | Render quality heatmap | `quality_heatmap.png` (**manuscript Fig**) |
| `make_pdf_overview.py` | Render per-image tracing overview | `overview.pdf` (**supplementary S4**) |

---

## Requirements

```bash
pip install matplotlib numpy opencv-python
```

For `run_quality.py`: LineFormer and its dependencies.

```bash
git clone https://github.com/TheJaeLal/LineFormer
cd LineFormer
pip install -r requirements.txt
# Download the pretrained checkpoint iter_3000.pth from the LineFormer repo
```

---

## Step 1 — Generate synthetic figures

```bash
python generate_figures.py --out lineformer_test
```

Output layout:

```
lineformer_test/
  color/           # distinct solid colours
  bw/              # grayscale, varied line styles (solid / dashed / dotted / dash-dot)
  bw_solid/        # grayscale, solid lines only
  annotated/       # colour figures with overlap regions highlighted in red
  overlap_scores.csv
```

The test figures are already committed to the repository, so this step is only
needed if you want to regenerate them with different parameters.

### Figure catalogue

Fifteen figures per visual style (45 total):

| Stem | Curve family | Curves |
|------|-------------|--------|
| `single_sigmoid` | sigmoid (Boltzmann) | 1 |
| `single_expdecay` | exponential decay | 1 |
| `single_alpha` | alpha-function waveform | 1 |
| `*_no_overlap` | sinusoidal traces at distinct y-levels (overlap condition **A**) | 2 / 4 / 8 / 12 |
| `*_partial_overlap` | alpha-function waveforms with staggered onsets (condition **B**) | 2 / 4 / 8 / 12 |
| `*_heavy_overlap` | exponential decays sharing a common fast initial transient (condition **C**) | 2 / 4 / 8 / 12 |

### Overlap metrics (`overlap_scores.csv`)

| Column | Description |
|--------|-------------|
| `figure` | Filename |
| `n_curves` | Number of curves |
| `n_overlap_events` | Contiguous x-intervals where any pair is within 2 % of the y-range |
| `overlap_score` | Fraction of x-positions where any pair is within 2 % of the y-range |

---

## Step 2 — Run LineFormer inference

```bash
python run_quality.py \
    --lineformer /path/to/LineFormer \
    --checkpoint /path/to/iter_3000.pth \
    --input  lineformer_test \
    --output lineformer_results/quality_scores.csv \
    --save-tracings lineformer_results
```

`--save-tracings` is optional but required for the PDF overview (Step 4).
Without it only `quality_scores.csv` is written.

Output CSV columns:

| Column | Description |
|--------|-------------|
| `set` | Visual style (`bw`, `bw_solid`, `color`) |
| `figure` | Filename |
| `n_expected` | Ground-truth curve count |
| `overlap` | Overlap condition (`none`, `partial`, `heavy`) |
| `n_detected` | Number of lines detected by LineFormer |
| `n_kinked` | Lines with at least one turn > 45° |
| `n_clean` | Lines with no such turn |
| `total_kinks` | Total turn events > 45° across all detected lines |
| `kinks_per_line` | `total_kinks / n_detected` |

---

## Step 3 — Quality heatmap (manuscript figure)

```bash
python make_quality_plot.py \
    --input  lineformer_results/quality_scores.csv \
    --output lineformer_results/plots
```

Writes `lineformer_results/plots/quality_heatmap.png`.

---

## Step 4 — Per-image overview PDF (supplementary S4)

Requires the traced images saved by `--save-tracings` in Step 2.

```bash
python make_pdf_overview.py \
    --test    lineformer_test \
    --results lineformer_results \
    --output  lineformer_results/overview.pdf
```

Writes a three-page A4 portrait PDF.  Each row shows one test figure:
Original (color) | Tracing — color | Tracing — BW dashed | Tracing — BW solid.

---

## Adjusting parameters

Key constants in `generate_figures.py`:

```python
OVERLAP_THRESHOLD = 0.02   # vertical proximity threshold (fraction of y-range)
N_SAMPLES         = 500    # x-resolution for overlap metric
FIG_DPI           = 150
FIG_SIZE          = (7, 4)
```

Kink threshold in `run_quality.py`:

```python
KINK_THRESH  = 45   # degrees — turns sharper than this are counted as kinks
ANGLE_THRESH = 45   # degrees — a line is flagged kinked if any turn exceeds this
```
