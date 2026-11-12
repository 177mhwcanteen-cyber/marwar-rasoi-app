# मारवाड़ रसोई ऐप — किसी भी Claude के लिए पहले यह पढ़ें

मालिक: **विक्रम जी** (हमेशा "विक्रम जी", आसान हिंदी, जवाब छोटे 3-6 लाइन — उनकी Claude लिमिट जल्दी खत्म होती है)। वे सिर्फ़ मोबाइल से काम करते हैं, कोडिंग नहीं जानते।
टीम को "स्टाफ" न लिखें — नाम से। मैनेजर: **स्वरूप सा** (9166753417)। जगह: Amenity Centre, Jalipa। टेबल: 16।
पूरी योजना, चरण और नियम: **`docs/मारवाड़-रसोई-ऐप-प्रॉम्प्ट.txt`** — कोई भी काम उससे पहले नहीं।

## 🏢 संस्था-पहरा
यह रिपो **मारवाड़ रसोई** है (`web/config.js` → `org: "rasoi"`, अपना Firebase)। 177 MH (`177-MH-`), भैरव, सब्ज़ी एक्सप्रेस अलग हैं —
कोड के सुधार ले जा सकते हैं, **डेटा कभी नहीं**। ग्राहक का निजी डेटा (नंबर, पता, क्या खाया) इस public रिपो में कभी नहीं।

## पत्थर के नियम
1. भाव/डिश सिर्फ़ विक्रम जी के बताए (मेन्यू कार्ड) — `web/menu.json`; हटाना = `"off": true`, मिटाना नहीं; id न बदलें।
2. काम से पहले `git pull --rebase`; बदलाव के बाद `node scripts/build.mjs && python3 tests/flow.py www <shots>` — "✅ पूरा बहाव पास" आए तभी push।
3. मालिक को घंटी तभी जब मैनेजर `ownerWait` (180 से.) में न उठाए। पक्का बिल TMBill में — ऐप में सिर्फ़ उसका नंबर।
4. हर स्क्रीन compact, फोटो ≤20 KB, ग्राहक-पेज आसान English + हिंदी।
5. चाबियाँ/पासवर्ड कोड में कभी नहीं (APK की चाबी GitHub Secrets: RASOI_KEYSTORE_B64, RASOI_KS_PASS)।

## ढाँचा
- `web/index.html` — मैनेजर/वेटर/मालिक ऐप (🔔 ऑर्डर · 🍽️ टेबल · ➕ ऑर्डर लें · ☰ और)। `web/t/` — ग्राहक का टेबल-QR पेज (`?t=5`)। `web/qr.html` — 16 टेबल के QR कार्ड।
- `web/core.js` — साझा: `DB` (डेटा की परत: अभी `local` = इसी ब्राउज़र में; Firebase config आते ही Firestore), `MENU`, `menuUI`, `BELL`, हालत का क्रम `FLOW`।
- ऑर्डर का दस्तावेज़: `{kind: order|call, type: table|parcel|delivery, table, items[{id,n,q,s,veg}], total, note, by, name, phone, addr, status: new→acc→cook→out→done | rej, eta, tm, log[]}`।
  `call` = 💧 पानी / 🙋 वेटर / 🧾 बिल (टेबल से)। संग्रह का नाम `orders`, नया = `status:"new"` — APK की घंटी (OrderRingService) इसी को देखती है।
- APK: `android/` (177 ऐप का खोल — घंटी OrderRingService, लोकेशन TrackService; `ringStart{wait}` = मालिक के लिए देर)। ऐप GitHub Pages का पेज खोलता है
  (`capacitor.config.json` → `server.url`), इसलिए वेब का बदलाव बिना नई APK के पहुँचता है; नई APK सिर्फ़ `android/` बदलने पर।
- CI: `.github/workflows/build.yml` → Pages + APK (`releases/latest/download/marwar-rasoi.apk`)।

## अभी की हालत (13-11-2026)
चरण 1+2 का पहला रूप **डेमो मोड** में बना और टेस्ट पास: टेबल से ऑर्डर/पुकार → मैनेजर स्वीकार (समय) → बनाना → परोसा → TMBill नं.; वेटर मोड; 16 टेबल; मालिक की देर-घंटी (पेज में)।
**बाकी:** (1) Firebase config → `DB` का Firestore रूप + लॉगिन + `firestore.rules` (2) APK में `ringStart` जोड़ना (मैनेजर wait:0, मालिक wait:180) (3) 177 के ऑर्डर-पेज से रसोई के ऑर्डर यहाँ
(4) ग्राहक खाते (हर ग्राहक का अपना बदलने लायक पासवर्ड) (5) मालिक का नंबर पूछना।
