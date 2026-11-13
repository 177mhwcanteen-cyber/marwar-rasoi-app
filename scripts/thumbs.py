"""🍛 मारवाड़ रसोई की छोटी फोटो (ऐप/टेबल-पेज के लिए): web/menu/<id>.jpg (340px, ≤20 KB) → web/menu/s/<id>.jpg (200px, लगभग 6-8 KB)।
ऐप/टेबल-पेज की टाइल ~85px चौड़ी है, इसलिए 200px काफ़ी है — पेज 3 गुना हल्का खुलता है। नई/बदली फोटो के बाद चलाएँ: python3 scripts/rasoi_thumbs.py"""
import os, io, glob
from PIL import Image
D = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "web", "menu"); os.makedirs(D + "/s", exist_ok=True); tot = 0
for f in sorted(glob.glob(D + "/*.jpg")):
    im = Image.open(f).convert("RGB").resize((200, 200), Image.LANCZOS)
    for q in (74, 68, 62, 56):
        b = io.BytesIO(); im.save(b, "JPEG", quality=q, optimize=True, progressive=True)
        if b.tell() <= 8500: break
    open(D + "/s/" + os.path.basename(f), "wb").write(b.getvalue()); tot += b.tell()
print(len(glob.glob(D + "/s/*.jpg")), "फोटो ·", tot // 1024, "KB")
