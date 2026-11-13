"""📸 6 डिश वाली तस्वीर (3×2) काटकर डिश पर लगाना — क्रम docs/photo-sets.json।
चलाएँ: python3 scripts/photoset.py <तस्वीर> <सेट नंबर> [177-MH- का रास्ता]   (हर फोटो 340×340, ≤20 KB; json में p के आगे ?v= ताकि पुरानी फोटो कैश से न दिखे)"""
import sys, json, io, os, re, time
from PIL import Image
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
img, n = Image.open(sys.argv[1]).convert("RGB"), int(sys.argv[2]); mh = sys.argv[3] if len(sys.argv) > 3 else ""
ids = json.load(open(R + "/docs/photo-sets.json"))[n - 1]; W, H = img.size; tw, th = W / 3, H / 2; v = time.strftime("%m%d")
def jpg(t):
    for q in range(88, 30, -4):
        b = io.BytesIO(); t.save(b, "JPEG", quality=q, optimize=True, progressive=True)
        if b.tell() <= 20000: return b.getvalue()
    raise SystemExit("20 KB में नहीं आई")
for k, iid in enumerate(ids):
    c, r = k % 3, k // 3; s = min(tw, th) * 0.955; cx, cy = (c + .5) * tw, (r + .5) * th
    d = jpg(img.crop((round(cx - s / 2), round(cy - s / 2), round(cx + s / 2), round(cy + s / 2))).resize((340, 340), Image.LANCZOS))
    for p in [R + "/web/menu/" + iid + ".jpg"] + ([mh + "/web/order/rasoi/" + iid + ".jpg"] if mh else []): open(p, "wb").write(d)
    print(iid, len(d))
for f in [R + "/web/menu.json"] + ([mh + "/web/order/rasoi.json"] if mh else []):
    s = open(f, encoding="utf-8").read()
    for iid in ids: s, c = re.subn(r'(/' + re.escape(iid) + r'\.jpg)(\?v=\w+)?"', r'\1?v=' + v + '"', s); assert c == 1, (f, iid, c)
    open(f, "w", encoding="utf-8").write(s)
