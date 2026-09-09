# LineFormer — Analysis Pipeline

This document describes the custom scripts added on top of the LineFormer codebase to run batch inference, assess trace quality, and generate manuscript figures.

---

## Repository layout (relevant paths)

```
LineFormer/                   ← this repo (model code + analysis scripts)
  iter_3000.pth               ← trained model weights
  lineformer_swin_t_config.py ← model config

lineformer_test/              ← test images (input, read-only)
  bw/                         ← black-and-white dashed-line figures
  bw_solid/                   ← black-and-white solid-line figures
  color/                      ← colour figures
  example_data/               ← real example figures (dose-response, ephys, timeseries)

lineformer_results/           ← colored-trace output + quality CSV + figures
  bw/ bw_solid/ color/        ← traced PNGs with coloured lines
  quality_scores.csv
  quality_scatter.png
  kink_detection_figure.png
  csr_validation.png
  csr_transitions_*.png

lineformer_results_black/     ← black-trace output + JSON trace data
  bw/ bw_solid/ color/
    *.png                     ← original image with black traced lines
    *_traces.json             ← raw {x, y} coordinates for every detected trace
```

All paths above are hardcoded in the scripts. Edit the constants at the top of each script if your layout differs.

---

## Environment

All scripts must be run with the **LineFormer conda environment**, which provides PyTorch, mmcv, and mmdet:

```bash
conda activate LineFormer
# or use the full path:
/home/robert/miniconda3/envs/LineFormer/bin/python <script>.py
```

Run every script from inside the `LineFormer/` directory so that local imports (`infer`, `line_utils`) resolve correctly:

```bash
cd /home/HDD-drive/Repos/LineFormer
```

---

## Is inference deterministic?

LineFormer uses a Swin-Transformer backbone followed by convolutional heads. **On CPU with fixed model weights, inference is deterministic** — running the same script twice produces identical output. GPU inference may introduce minor floating-point non-determinism depending on the CUDA version and hardware.

The trace *ordering* within a figure (which line gets index 0, 1, …) can vary between runs if mmdet's post-processing involves any non-stable sort.

---

## Step-by-step: full pipeline

### 1. Batch inference — coloured lines

Runs LineFormer on every image in `lineformer_test/` (recursive glob) and draws each detected trace in a distinct colour. Output goes to `lineformer_results/`.

```bash
python run_batch.py
```

> **Note:** This script uses a recursive glob and will process sub-directories too (e.g. `example_data/split/`). Keep `lineformer_test/` clean of already-traced images to avoid accidental double-tracing.

Output: `lineformer_results/<set>/<stem>.png`

---

### 2. Batch inference — black lines + JSON trace data (recommended for analysis)

Runs LineFormer on only the three test sub-sets (`bw/`, `bw_solid/`, `color/`) and saves:

- A PNG with all traces drawn in black over the original image
- A JSON file containing the raw `[{x, y}, …]` coordinate lists for every detected trace

```bash
python run_batch_black.py
```

Output per figure:
- `lineformer_results_black/<set>/<stem>.png`
- `lineformer_results_black/<set>/<stem>_traces.json`

---

### 3. Quality analysis

Loads the pre-computed JSON trace files from Step 2 and computes two quality metrics per figure:

| Metric | Description |
|--------|-------------|
| **Kink count** | Number of turning angles > 45° along a trace (subsampled every 10 px). A stitched trace that jumps between two underlying curves often shows a sharp kink. |
| **Curvature Spike Ratio (CSR)** | `max(|θᵢ₊₁ − θᵢ₋₁| / 2) / (median + 1°)`. Measures whether one location along the trace has an unusually abrupt change in curvature. The ε = 1° noise floor prevents division-by-near-zero for straight-line traces. Smooth curves yield CSR ≈ 1–5; stitched traces yield CSR >> 6. |

```bash
python run_quality.py
```

Output: `lineformer_results/quality_scores.csv`

Columns: `set, figure, n_expected, overlap, n_detected, n_kinked, n_clean, total_kinks, kinks_per_line, mean_csr, max_csr`

> Steps 2 and 3 must be run in order. `run_quality.py` reads the JSON files produced by `run_batch_black.py`.

---

### 4. Quality heatmap (main manuscript figure)

Reads `quality_scores.csv` and produces the three-panel heatmap used in the manuscript (`figure_LineFormer_results`). Each cell shows kinked/detected traces and kinks-per-line, coloured by severity.

```bash
python make_quality_heatmap.py
```

Output: `lineformer_results/quality_heatmap.png`

> Adapted from `ddigitize/lineformer_comparison/make_quality_plot.py`.

---

### 5. Quality scatter plot (CSR vs kink count)

Reads `quality_scores.csv` and produces a scatter plot of kinks-per-line (x) vs mean CSR (y), with colour encoding overlap level and marker shape encoding figure set.

```bash
python make_quality_plot.py
```

Output: `lineformer_results/quality_scatter.png`

---

## Manuscript figures

The following scripts generate individual figures for the manuscript. They can be run independently (Steps 1–3 are not prerequisites unless noted).

### Kink detection illustration

Generates a three-panel synthetic figure illustrating how kink detection works.

```bash
python make_kink_figure.py
```

Output: `lineformer_results/kink_detection_figure.png`

---

### CSR validation on synthetic traces

Compares kink count vs CSR on five synthetic traces (two smooth, three stitched at different angles). Useful for sanity-checking the CSR threshold.

```bash
python show_kink.py
```

Output: `lineformer_results/csr_validation.png`

---

### CSR transition point visualisation

Runs LineFormer on one chosen figure and marks where the maximum-CSR transition occurs (red ×) and where endpoint turning angles exceed the threshold (orange ×). Edit `FIGURE_SET` and `FIGURE_STEM` at the top of the script to choose a different figure.

```bash
python show_csr_transitions.py
```

Output: `lineformer_results/csr_transitions_<set>_<stem>.png`

This script re-runs inference directly (it does not use the cached JSON).

---

### Example data comparison PDF

Builds the supplementary PDF (`S1_example_data_and_usage.pdf`) comparing original figures with LineFormer tracings. Source images and traced results must be present under the `Manuscript/Figures/example_data/` tree.

```bash
python make_comparison_pdf.py
```

Output: `Bezier_curve_and_svgpathtool/App/Manuscript/S1_example_data_and_usage.pdf`

---

## Reproducing everything from scratch

```bash
cd /home/HDD-drive/Repos/LineFormer

# 1. Coloured tracings (optional, for visual inspection)
python run_batch.py

# 2. Black tracings + JSON trace data
python run_batch_black.py

# 3. Quality scores
python run_quality.py

# 4. Quality heatmap (main manuscript figure)
python make_quality_heatmap.py

# 5. Quality scatter plot (CSR vs kink count)
python make_quality_plot.py

# Manuscript figures (independent)
python make_kink_figure.py
python show_kink.py
python show_csr_transitions.py   # edit FIGURE_SET/FIGURE_STEM as desired
python make_comparison_pdf.py
```

Expected runtime on CPU: ~2–5 minutes per batch script (45 figures × ~3 s/figure). Quality analysis and plot generation are near-instant (reads JSON, no inference).

---

## Script index

| Script | Purpose | Reads | Writes |
|--------|---------|-------|--------|
| `run_batch.py` | Coloured-line batch inference | `lineformer_test/**` | `lineformer_results/**` |
| `run_batch_black.py` | Black-line batch inference + JSON export | `lineformer_test/{bw,bw_solid,color}/` | `lineformer_results_black/**` |
| `run_quality.py` | Kink + CSR quality analysis | `lineformer_results_black/**_traces.json` | `lineformer_results/quality_scores.csv` |
| `make_quality_heatmap.py` | Three-panel quality heatmap (main figure) | `quality_scores.csv` | `quality_heatmap.png` |
| `make_quality_plot.py` | Quality scatter plot (CSR vs kink count) | `quality_scores.csv` | `quality_scatter.png` |
| `make_kink_figure.py` | Kink detection illustration | — (synthetic) | `kink_detection_figure.png` |
| `show_kink.py` | CSR validation on synthetic traces | — (synthetic) | `csr_validation.png` |
| `show_csr_transitions.py` | CSR transition point visualisation | `lineformer_test/` (re-runs inference) | `csr_transitions_*.png` |
| `make_comparison_pdf.py` | Supplementary comparison PDF | `Manuscript/Figures/example_data/` | `S1_example_data_and_usage.pdf` |
