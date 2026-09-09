#!/usr/bin/env python3
"""
Run LineFormer on all test figures and save results with black traced lines.
Output: lineformer_results_black/<set>/<stem>.png
"""
import sys, os, glob, json
sys.path.insert(0, os.path.dirname(__file__))

import cv2
import numpy as np
import infer
import line_utils

INPUT_DIR  = "/home/HDD-drive/Repos/lineformer_test"
OUTPUT_DIR = "/home/HDD-drive/Repos/lineformer_results_black"
CKPT   = "/home/HDD-drive/Repos/LineFormer/iter_3000.pth"
CONFIG = "/home/HDD-drive/Repos/LineFormer/lineformer_swin_t_config.py"
DEVICE = "cpu"
SETS           = ["bw", "bw_solid", "color"]
LINE_COLOR     = (0, 0, 0)   # black (BGR)
LINE_THICKNESS = 2

print("Loading model...")
infer.load_model(CONFIG, CKPT, DEVICE)
print("Model loaded.\n")

image_paths = []
for s in SETS:
    image_paths += sorted(glob.glob(os.path.join(INPUT_DIR, s, "*.png")))

for img_path in image_paths:
    rel_path = os.path.relpath(img_path, INPUT_DIR)
    out_path = os.path.join(OUTPUT_DIR, rel_path)
    json_path = out_path.replace(".png", "_traces.json")
    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    img = cv2.imread(img_path)
    if img is None:
        print(f"SKIP  {rel_path}")
        continue

    try:
        dataseries = infer.get_dataseries(img, to_clean=False)

        # Save trace coordinates as JSON
        with open(json_path, "w") as f:
            json.dump(dataseries, f)

        # Draw black lines on original image
        out = img.copy()
        lines = line_utils.points_to_array(dataseries)
        for line in lines:
            for i in range(len(line) - 1):
                cv2.line(out, tuple(line[i]), tuple(line[i+1]),
                         LINE_COLOR, LINE_THICKNESS, lineType=cv2.LINE_AA)
        cv2.imwrite(out_path, out)
        print(f"OK  {rel_path}  ({len(dataseries)} lines)")
    except Exception as e:
        print(f"ERROR  {rel_path}: {e}")

print(f"\nDone. Results in {OUTPUT_DIR}")
