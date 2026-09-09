#!/usr/bin/env python3
"""
Re-draw stored LineFormer tracings in distinct colors using pre-computed JSON
trace data (produced by run_batch_black.py). No model inference is needed.

Reads:  lineformer_results_black/<set>/<stem>_traces.json
        lineformer_test/<set>/<stem>.png   (original image)
Writes: lineformer_results/<set>/<stem>.png
"""
import sys, os, glob, json
sys.path.insert(0, os.path.dirname(__file__))

import cv2
import line_utils

TEST_DIR   = "/home/HDD-drive/Repos/lineformer_test"
JSON_DIR   = "/home/HDD-drive/Repos/lineformer_results_black"
OUTPUT_DIR = "/home/HDD-drive/Repos/lineformer_results"
SETS       = ["bw", "bw_solid", "color"]

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

        lines  = line_utils.points_to_array(dataseries)
        result = line_utils.draw_lines(img, lines)
        cv2.imwrite(out_path, result)
        print(f"OK  {set_name}/{stem}  ({len(lines)} lines)")

print(f"\nDone. Results in {OUTPUT_DIR}")
