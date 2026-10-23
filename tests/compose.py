import sys
from PIL import Image, ImageDraw, ImageFont
out, n = sys.argv[1], int(sys.argv[2])
mock, build = sys.argv[3:3 + n], sys.argv[3 + n:]
H = 1100
def fit(p):
    im = Image.open(p).convert('RGB')
    return im.resize((round(im.width * H / im.height), H))
rows = [[fit(p) for p in mock], [fit(p) for p in build]]
colw = max(i.width for r in rows for i in r)
cols = max(len(r) for r in rows)
gap, lab = 30, 60
W = cols * colw + (cols + 1) * gap
img = Image.new('RGB', (W, 2 * (H + lab) + 3 * gap), '#ffffff')
d = ImageDraw.Draw(img)
try: f = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 34)
except Exception: f = ImageFont.load_default()
for r, (title, row) in enumerate([('Mockup', rows[0]), ('Build', rows[1])]):
    y = gap + r * (H + lab + gap)
    d.text((gap, y), title, fill='#1c1b19', font=f)
    for c, im in enumerate(row):
        img.paste(im, (gap + c * (colw + gap), y + lab))
img.save(out)
print(out, img.size)
