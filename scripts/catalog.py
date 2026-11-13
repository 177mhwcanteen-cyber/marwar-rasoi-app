"""स्टोर की सामान-सूची 177 MH कैंटीन की खेपों से (विक्रम जी: "सामान की list वही रखना जो MH कैंटीन में है; बारकोड स्कैन से एंट्री")।
चलाएँ: python3 scripts/catalog.py /path/to/177-MH-   → web/data/catalog.json  [{id, n, u, bc}]  — सिर्फ़ नाम/इकाई/बारकोड (भाव, स्टॉक, लागत नहीं; तम्बाकू नहीं)"""
import json, glob, os, sys, re
SRC = sys.argv[1]; OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "web", "data", "catalog.json")
seen, out = set(), []
TOB = re.compile(r"CIGAR|GUTKHA|TOBACCO|BEEDI|BIDI|PAN MASALA|ZARDA|KHAINI", re.I)
for f in sorted(glob.glob(os.path.join(SRC, "web", "data", "items", "S-*.json"))):
    for x in json.load(open(f, encoding="utf8")).get("items", []):
        if x.get("xloc") or not x.get("name") or x.get("secret") or x.get("sub") == "tob" or TOB.search(x["name"]) or x["id"] in seen: continue
        seen.add(x["id"]); bc = [b for b in [x.get("barcode")] + list(x.get("barcodes") or []) if b]
        out.append({"id": x["id"], "n": x["name"], "u": x.get("unit") or "pc", **({"bc": bc} if bc else {})})
out.sort(key=lambda x: x["n"])
json.dump(out, open(OUT, "w", encoding="utf8"), ensure_ascii=False, separators=(",", ":"))
print(len(out), "सामान ·", sum(1 for x in out if x.get("bc")), "बारकोड वाले ·", os.path.getsize(OUT) // 1024, "KB")
