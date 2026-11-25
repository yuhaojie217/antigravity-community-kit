"""Pack Hakimi Muse-style desk-edge peeker frames and dual themes into dist/renderer.js & dist/theme.css."""
import base64
import io
import json
import os
import numpy as np
from PIL import Image

BASE = os.path.dirname(os.path.abspath(__file__))
MUSE_ART = os.path.join(BASE, "art", "muse-poses")
DIST = os.path.join(BASE, "dist")

MUSE_POSES = ["idle", "laptop1", "laptop2", "write1", "write2", "done", "sleepy"]
TARGET_W = 360
MAX_COLORS = 224


def encode_muse_frame(path, target_w=TARGET_W, colors=MAX_COLORS):
    im = Image.open(path).convert("RGBA")
    arr = np.array(im)
    # Purge ultra-faint alpha haze (< 18) for clean edges on both light & dark surfaces
    arr[:, :, 3] = np.where(arr[:, :, 3] < 18, 0, arr[:, :, 3])
    im = Image.fromarray(arr, mode="RGBA")

    scale = target_w / float(im.width)
    if scale < 1.0:
        im = im.resize((target_w, max(1, round(im.height * scale))), Image.LANCZOS)

    if colors:
        alpha = im.getchannel("A")
        flat = im.convert("RGB").quantize(colors=colors, method=Image.MEDIANCUT, dither=Image.FLOYDSTEINBERG)
        im = flat.convert("RGBA")
        im.putalpha(alpha)

    buf = io.BytesIO()
    im.save(buf, "PNG", optimize=True)
    raw = buf.getvalue()
    return "data:image/png;base64," + base64.b64encode(raw).decode("ascii"), len(raw), im.size


def main():
    os.makedirs(DIST, exist_ok=True)
    found = {}
    for name in MUSE_POSES:
        p = os.path.join(MUSE_ART, f"muse-{name}.png")
        if not os.path.exists(p):
            raise SystemExit(f"[MISS] {name}: {p}")
        uri, nbytes, size = encode_muse_frame(p)
        found[name] = uri
        print(f"[OK] {name}: {size}  {nbytes} bytes")

    tpl_path = os.path.join(BASE, "renderer.template.js")
    out_path = os.path.join(DIST, "renderer.js")
    with open(tpl_path, "r", encoding="utf-8") as f:
        tpl = f.read()

    if "__HAKIMI_POSES__" not in tpl or "__AGY_THEMES__" not in tpl:
        raise SystemExit("Missing template markers in renderer.template.js")

    google_css_path = os.path.join(BASE, "google.css")
    theme_css_path = os.path.join(DIST, "theme.css")
    with open(google_css_path, "r", encoding="utf-8") as gf:
        google_css = gf.read()
    with open(theme_css_path, "w", encoding="utf-8") as tf:
        tf.write(google_css)
    print(f"[sync] dist/theme.css <- google.css ({len(google_css)} chars)")

    claude_path = os.path.join(BASE, "claude.css")
    with open(claude_path, "r", encoding="utf-8") as tf:
        themes = {"claude": tf.read()}
    print(f"[theme] claude: {len(themes['claude'])} chars")

    out = tpl.replace("__HAKIMI_POSES__", json.dumps(found, ensure_ascii=False))
    out = out.replace("__AGY_THEMES__", json.dumps(themes, ensure_ascii=False))

    with open(out_path, "w", encoding="utf-8") as f:
        f.write(out)

    total = os.path.getsize(out_path)
    print(f"dist/renderer.js -> {total} bytes ({total / 1024:.1f} KB)")


if __name__ == "__main__":
    main()
