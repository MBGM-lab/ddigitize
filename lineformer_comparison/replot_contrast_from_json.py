#!/usr/bin/env python3
"""
Generate contrast-maximised tracing images from pre-computed JSON trace data.

  color figures   → black traces   (high contrast on bright/coloured background)
  bw / bw_solid   → coloured traces (high contrast on white/grey background)

No model inference required — reads JSON produced by run_batch_black.py.

Reads:  lineformer_results_black/<set>/<stem>_traces.json
        lineformer_test/<set>/<stem>.png
Writes: lineformer_results_contrast/<set>/<stem>.png
"""
import sys, os, glob, json
sys.path.insert(0, os.path.dirname(__file__))

import cv2
import line_utils

TEST_DIR   = "/home/HDD-drive/Repos/lineformer_test"
JSON_DIR   = "/home/HDD-drive/Repos/lineformer_results_black"
OUTPUT_DIR = "/home/HDD-drive/Repos/lineformer_results_contrast"
SETS       = ["bw", "bw_solid", "color"]
LINE_THICKNESS = 2

for set_name in SETS:
    json_paths = sorted(glob.glob(os.path.join(JSON_DIR, set_name, "*_traces.json")))
    for json_path in json_paths:
        stem = os.path.basename(json_path).replace("_traces.json", "")
        img_path = os.path.join(TEST_DIR, set_name, stem + ".png")
        out_path = os.path.join(OUTPUT_DIR, set_name, stem + ".png")
        os.makedirs(os.path.dirname(out_path), exist_ok=True)

        img = cv2.imread(img_path)
        if img is None:
            print(f"SKIP (missing original): {img_path}")
            continue

        with open(json_path) as f:
            dataseries = json.load(f)

        lines = line_utils.points_to_array(dataseries)

        if set_name == "color":
            # Black traces on colour image
            out = img.copy()
            for line in lines:
                for i in range(len(line) - 1):
                    cv2.line(out, (int(line[i][0]), int(line[i][1])),
                             (int(line[i+1][0]), int(line[i+1][1])),
                             (0, 0, 0), LINE_THICKNESS, lineType=cv2.LINE_AA)
        else:
            # Coloured traces on BW image
            out = line_utils.draw_lines(img, lines)

        cv2.imwrite(out_path, out)
        print(f"OK  {set_name}/{stem}  ({len(lines)} lines)")

print(f"\nDone. Results in {OUTPUT_DIR}")
