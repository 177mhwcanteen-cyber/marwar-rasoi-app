"""निजी डेटा (उधारी, ग्राहक…) का "MR1:" कोड बनाना — विक्रम जी मालिक-ऐप के ☰ और → 🤖 Claude का कोड में चिपकाते हैं। public रिपो में यह डेटा कभी न रखें।
चलाएँ: python3 scripts/code.py data.json   (ढाँचा web/owner.js के ऊपर लिखा है; id ज़रूरी, हर कोड की अलग)"""
import base64, json, sys
P = json.load(open(sys.argv[1], encoding="utf8")); assert P.get("id"), "id चाहिए"
print("MR1:" + base64.b64encode(json.dumps(P, ensure_ascii=False, separators=(",", ":")).encode("utf8")).decode())
