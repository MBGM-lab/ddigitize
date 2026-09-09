import sys
import os
import glob
import cv2
import infer
import line_utils

INPUT_DIR = "/home/HDD-drive/Repos/lineformer_test"
OUTPUT_DIR = "/home/HDD-drive/Repos/lineformer_results"

CKPT = "/home/HDD-drive/Repos/LineFormer/iter_3000.pth"
CONFIG = "/home/HDD-drive/Repos/LineFormer/lineformer_swin_t_config.py"
DEVICE = "cpu"

print("Loading model...")
infer.load_model(CONFIG, CKPT, DEVICE)
print("Model loaded.\n")

image_paths = sorted(glob.glob(os.path.join(INPUT_DIR, "**", "*.png"), recursive=True))
image_paths += sorted(glob.glob(os.path.join(INPUT_DIR, "**", "*.jpg"), recursive=True))

for img_path in image_paths:
    rel_path = os.path.relpath(img_path, INPUT_DIR)
    out_path = os.path.join(OUTPUT_DIR, rel_path)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    img = cv2.imread(img_path)
    if img is None:
        print(f"SKIP (unreadable): {rel_path}")
        continue

    try:
        line_dataseries = infer.get_dataseries(img, to_clean=False)
        n = len(line_dataseries)
        result_img = line_utils.draw_lines(img, line_utils.points_to_array(line_dataseries))
        cv2.imwrite(out_path, result_img)
        print(f"OK  {rel_path}  ({n} lines detected) -> {out_path}")
    except Exception as e:
        print(f"ERROR {rel_path}: {e}")
