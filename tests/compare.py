# Before | after compare. Usage: python3 tests/compare.py out.png "Title" before1.png after1.png [before2.png after2.png ...]
# Column labels default to 1.0 -> v1.1; set COMPARE_BEFORE / COMPARE_AFTER to change them.
import os, sys
from PIL import Image, ImageDraw, ImageFont
out, title, pairs = sys.argv[1], sys.argv[2], sys.argv[3:]
H, gap, lab = 1200, 30, 70
def fit(p):
    im = Image.open(p).convert('RGB')
    return im.resize((round(im.width * H / im.height), H))
rows = [(fit(pairs[i]), fit(pairs[i + 1]), pairs[i]) for i in range(0, len(pairs), 2)]
colw = max(max(a.width, b.width) for a, b, _ in rows)
W = 2 * colw + 3 * gap
img = Image.new('RGB', (W, 80 + len(rows) * (H + lab + gap) + gap), '#ffffff')
d = ImageDraw.Draw(img)
try:
    big = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 40)
    f = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 32)
except Exception:
    big = f = ImageFont.load_default()
d.text((gap, 24), title, fill='#1c1b19', font=big)
for r, (a, b, name) in enumerate(rows):
    y = 80 + r * (H + lab + gap)
    for c, (label, im) in enumerate([(os.environ.get('COMPARE_BEFORE', 'Before (1.0)'), a), (os.environ.get('COMPARE_AFTER', 'After (v1.1, live)'), b)]):
        x = gap + c * (colw + gap)
        d.text((x, y + 15), label, fill='#178046' if c else '#6b6862', font=f)
        img.paste(im, (x, y + lab))
        d.rectangle([x - 1, y + lab - 1, x + im.width, y + lab + H], outline='#d8d4cc', width=2)
img.save(out)
print(out, img.size)
