# LineFormer — Analysis Pipeline

> **Note:** The scripts in this directory are copies from the ddigitize analysis workflow. They are **not** part of the LineFormer codebase itself and must be moved into a working LineFormer installation before they can be run. See [Setup](#setup) below.

This document describes the custom scripts used to run batch inference with LineFormer, assess trace quality, and generate the manuscript figures comparing LineFormer against ddigitize.

---

## Setup

### 1. Install LineFormer

Clone the official LineFormer repository and set up its conda environment:

```bash
git clone https://github.com/TheJaeLal/LineFormer.git
cd LineFormer

conda create -n LineFormer python=3.8
conda activate LineFormer
bash install.sh
```

> LineFormer requires **PyTorch 1.13.1** and **CUDA 11.7** (or run on CPU). The `install.sh` script installs mmdetection and all other dependencies.

### 2. Download the model weights

Download `iter_3000.pth` from the [LineFormer model checkpoint](https://drive.google.com/drive/folders/1K_zLZwgoUIAJtfjwfCU5Nv33k17R0O5T?usp=sharing) and place it in the root of the `LineFormer/` directory alongside `lineformer_swin_t_config.py`.

### 3. Copy the analysis scripts

Copy all scripts from this directory (`ddigitize/lineformer_comparison/`) into the root of your `LineFormer/` installation:

```bash
cp ddigitize/lineformer_comparison/*.py LineFormer/
```

### 4. Create the required directories

The scripts expect the following layout relative to `LineFormer/`:

```
LineFormer/                   ← run all scripts from here
  iter_3000.pth               ← trained model weights
  lineformer_swin_t_config.py ← model config
  run_batch.py                ← copied from this directory
  run_batch_black.py
  run_quality.py
  make_quality_heatmap.py
  make_quality_plot.py
  make_kink_figure.py
  show_kink.py
  show_csr_transitions.py
  make_comparison_pdf.py

lineformer_test/              ← test images (input, read-only)
  bw/                         ← black-and-white dashed-line figures
  bw_solid/                   ← black-and-white solid-line figures
  color/                      ← colour figures
  example_data/               ← real example figures (dose-response, ephys, timeseries)

lineformer_results/           ← coloured-trace output + quality CSV + figures
lineformer_results_black/     ← black-trace output + JSON trace data
```

Create the output directories:

```bash
mkdir -p lineformer_results/{bw,bw_solid,color}
mkdir -p lineformer_results_black/{bw,bw_solid,color}
```

All paths are hardcoded in the scripts. Edit the constants at the top of each script if your layout differs.

---

## Environment

All scripts must be run with the **LineFormer conda environment** and from inside the `LineFormer/` directory so that local imports (`infer`, `line_utils`) resolve correctly:

```bash
conda activate LineFormer
cd /path/to/LineFormer
```

---

## Is inference deterministic?

LineFormer uses a Swin-Transformer backbone followed by convolutional heads. **On CPU with fixed model weights, inference is deterministic** — running the same script twice produces identical output. GPU inference may introduce minor floating-point non-determinism depending on the CUDA version and hardware.

The trace *ordering* within a figure (which line gets index 0, 1, …) can vary between runs if mmdet's post-processing involves any non-stable sort.

---

## Step-by-step: full pipeline

### 1. Batch inference — coloured lines

Runs LineFormer on every image in `lineformer_test/` and draws each detected trace in a distinct colour. Output goes to `lineformer_results/`.

```bash
python run_batch.py
```

> **Note:** This script uses a recursive glob and will process sub-directories too. Keep `lineformer_test/` clean of already-traced images to avoid accidental double-tracing.

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
| **Curvature Spike Ratio (CSR)** | `max(|θᵢ₊₁ − θᵢ₋₁| / 2) / (median + 1°)`. Measures whether one location along the trace has an unusually abrupt change in curvature. Smooth curves yield CSR ≈ 1–5; stitched traces yield CSR >> 6. |

```bash
python run_quality.py
```

Output: `lineformer_results/quality_scores.csv`

Columns: `set, figure, n_expected, overlap, n_detected, n_kinked, n_clean, total_kinks, kinks_per_line, mean_csr, max_csr`

> Steps 2 and 3 must be run in order. `run_quality.py` reads the JSON files produced by `run_batch_black.py`.

---

### 4. Quality heatmap (main manuscript figure)

Reads `quality_scores.csv` and produces the three-panel heatmap used in the manuscript.

```bash
python make_quality_heatmap.py
```

Output: `lineformer_results/quality_heatmap.png`

---

### 5. Quality scatter plot (CSR vs kink count)

```bash
python make_quality_plot.py
```

Output: `lineformer_results/quality_scatter.png`

---

## Manuscript figures

The following scripts generate individual figures. They can be run independently (Steps 1–3 are not prerequisites unless noted).

```bash
python make_kink_figure.py        # kink detection illustration
python show_kink.py               # CSR validation on synthetic traces
python show_csr_transitions.py    # CSR transition point visualisation (edit FIGURE_SET/FIGURE_STEM at top)
python make_comparison_pdf.py     # supplementary comparison PDF (requires example_data/)
```

---

## Reproducing everything from scratch

```bash
conda activate LineFormer
cd /path/to/LineFormer

python run_batch.py               # 1. coloured tracings (optional)
python run_batch_black.py         # 2. black tracings + JSON
python run_quality.py             # 3. quality scores
python make_quality_heatmap.py    # 4. main manuscript figure
python make_quality_plot.py       # 5. scatter plot
python make_kink_figure.py
python show_kink.py
python show_csr_transitions.py
python make_comparison_pdf.py
```

Expected runtime on CPU: ~2–5 minutes per batch script (45 figures × ~3 s/figure). Quality analysis and plot generation are near-instant.

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
