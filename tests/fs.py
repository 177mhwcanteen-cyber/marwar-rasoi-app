"""मारवाड़ रसोई — असली मोड (Firestore REST) की जाँच, नकली Firebase के साथ: डायरेक्टर का खाता → मैनेजर का खाता (मंज़ूरी बाकी) → डायरेक्टर मैनेजर बनाए →
घर से ऑर्डर → मैनेजर को दिखे + घंटी → स्वीकार → ग्राहक को "Accepted"।  चलाएँ: node scripts/build.mjs && python3 tests/fs.py www <shots-dir>"""
import asyncio, sys, json, re, threading, http.server, functools, os, urllib.parse
from playwright.async_api import async_playwright
WWW, SH = sys.argv[1], (sys.argv[2] if len(sys.argv) > 2 else "/tmp")
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 8823), functools.partial(http.server.SimpleHTTPRequestHandler, directory=WWW))
srv.RequestHandlerClass.log_message = lambda *a: None
threading.Thread(target=srv.serve_forever, daemon=True).start()
B = "http://127.0.0.1:8823/"
OWNER = "9509553600@marwar-rasoi.app"; DIR = "marwarrasoimr@gmail.com"; VER, SENT = set(), []
USERS, DOCS = {}, {}  # email → {pw, uid} ; "orders/id" → fields
def ok(c, m):
    if not c: print("❌", m); os._exit(1)
def sv(f, k): v = (f or {}).get(k, {}); return v.get("stringValue", v.get("integerValue"))
def staff_role(email):
    u = USERS.get(email); return sv(DOCS.get("staff/" + u["uid"]), "role") if u else None
async def fake(route):
    rq = route.request; u = urllib.parse.urlparse(rq.url); body = json.loads(rq.post_data) if rq.post_data and rq.post_data.startswith("{") else {}
    J = lambda o, st=200: route.fulfill(status=st, content_type="application/json", body=json.dumps(o))
    if "identitytoolkit" in u.netloc:
        if "lookup" in u.path: e = body["idToken"][4:]; return await J({"users": [{"email": e, "emailVerified": e in VER}]})
        if "sendOobCode" in u.path: SENT.append(body["idToken"][4:]); return await J({})
        e, pw = body["email"], body["password"]
        if "signUp" in u.path:
            if e in USERS: return await J({"error": {"message": "EMAIL_EXISTS"}}, 400)
            USERS[e] = {"pw": pw, "uid": "u" + str(len(USERS) + 1)}
        elif e not in USERS or USERS[e]["pw"] != pw: return await J({"error": {"message": "INVALID_LOGIN_CREDENTIALS"}}, 400)
        return await J({"idToken": "tok-" + e, "refreshToken": "rt-" + e, "localId": USERS[e]["uid"], "expiresIn": "3600"})
    if "securetoken" in u.netloc: return await J({"id_token": "x", "refresh_token": "x", "user_id": "x", "expires_in": "3600"})
    email = (rq.headers.get("authorization") or "")[11:] or None; role = staff_role(email) if email else None
    is_owner = email == OWNER or (email == DIR and DIR in VER); is_staff = is_owner or role in ("owner", "manager", "waiter")
    path = u.path.split("/documents", 1)[1]; q = urllib.parse.parse_qs(u.query)
    if path == ":runQuery":
        col = body["structuredQuery"]["from"][0]["collectionId"]
        if (col == "orders" and not is_staff) or (col == "staff" and not is_owner): return await J([{"error": {"message": "PERMISSION_DENIED"}}], 403)
        if col == "tkaam" and not is_owner:  # नियम v12: साथी सिर्फ़ em == अपना लॉगिन, और क्वेरी में यही शर्त हो
            w = ((body["structuredQuery"].get("where") or {}).get("fieldFilter") or {})
            if not email or w.get("field", {}).get("fieldPath") != "em" or w.get("value", {}).get("stringValue") != email: return await J([{"error": {"message": "PERMISSION_DENIED"}}], 403)
            return await J([{"document": {"name": "x/" + k, "fields": f}} for k, f in DOCS.items() if k.startswith("tkaam/") and sv(f, "em") == email] or [{}])
        return await J([{"document": {"name": "x/" + k, "fields": f}} for k, f in DOCS.items() if k.startswith(col + "/")] or [{}])
    col, _, did = path.strip("/").partition("/")
    if rq.method == "POST":
        did = q["documentId"][0]; f = body["fields"]
        if not is_staff and not (sv(f, "status") == "new" and sv(f, "by") == "customer"): return await J({"error": {"message": "PERMISSION_DENIED"}}, 403)
        DOCS[col + "/" + did] = f; return await J({"name": "x/" + col + "/" + did, "fields": f})
    key = col + "/" + did
    if rq.method == "GET":
        if key not in DOCS: return await J({"error": {"message": "NOT_FOUND"}}, 404)
        return await J({"name": "x/" + key, "fields": DOCS[key]})
    if rq.method == "PATCH":
        f = body["fields"]
        if col == "staff":
            if key not in DOCS:
                if not (is_owner or sv(f, "role") == "pending"): return await J({"error": {"message": "PERMISSION_DENIED"}}, 403)
            elif not is_owner: return await J({"error": {"message": "PERMISSION_DENIED"}}, 403)
        elif col == "tkaam":
            if not is_owner: return await J({"error": {"message": "PERMISSION_DENIED"}}, 403)
        elif col == "tkr":
            if key in DOCS or not email or sv(f, "em") != email or sv(f, "ans") not in ("done", "gaya", "nahi"): return await J({"error": {"message": "PERMISSION_DENIED"}}, 403)
        elif not is_staff: return await J({"error": {"message": "PERMISSION_DENIED"}}, 403)
        DOCS[key] = dict(DOCS.get(key, {}), **f) if "updateMask.fieldPaths" in q else f; return await J({"name": "x/" + key, "fields": DOCS[key]})
    await J({}, 400)
async def cfg(route):
    r = await route.fetch(); t = await r.text()
    t = re.sub(r'projectId: "[^"]*"', 'projectId: "demo-rasoi"', re.sub(r'apiKey: "[^"]*"', 'apiKey: "k"', t)).replace('org: "rasoi",', 'org: "rasoi", testClock: "17:30",').replace('homeUrl: "http', 'homeUrl: "", x: "http'); ok('"demo-rasoi"' in t and "testClock" in t, "config बदली नहीं")
    await route.fulfill(response=r, body=t)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); errs = []
        async def page(tag):
            cx = await b.new_context(viewport={"width": 390, "height": 780}); await cx.route(re.compile(r"googleapis\.com"), fake); await cx.route(re.compile(r"/config\.js"), cfg)
            pg = await cx.new_page(); pg.on("pageerror", lambda e: errs.append(tag + ": " + str(e))); return pg
        ow = await page("owner"); await ow.goto(B); await ow.wait_for_selector("#fgo"); ok(not await ow.locator("#demo").is_visible(), "डेमो पट्टी नहीं")
        await ow.fill("#fp", "95095"); await ow.click("#fgo"); ok("10 अंक" in await ow.inner_text("#ferr"), "अधूरा नंबर: संदेश टिके")
        await ow.fill("#fp", "9509553600"); await ow.fill("#fk", "123456"); await ow.click("#fgo"); await ow.wait_for_selector("#nm"); await ow.fill("#nm", "विक्रम जी"); await ow.click("#nmo")
        await ow.wait_for_selector(".empty"); ok(sv(DOCS["staff/u1"], "role") == "owner" and "विक्रम जी" in await ow.inner_text("#me"), "डायरेक्टर का खाता")
        mg = await page("manager"); await mg.goto(B); await mg.wait_for_selector("#fgo")
        await mg.fill("#fp", "9509553600"); await mg.fill("#fk", "999999"); await mg.click("#fgo"); await mg.wait_for_timeout(400); ok("पिन ग़लत" in await mg.inner_text("#ferr"), "ग़लत पिन का साफ़ संदेश: " + await mg.inner_text("#ferr"))
        await mg.fill("#fp", "9166753417"); await mg.fill("#fk", "123"); await mg.click("#fgo"); await mg.wait_for_timeout(300); ok("6 अंक" in await mg.inner_text("#ferr"), "छोटा पिन रुका")
        await mg.fill("#fk", "654321"); await mg.click("#fgo"); await mg.wait_for_selector("#nm"); await mg.fill("#nm", "स्वरूप सा"); await mg.click("#nmo"); await mg.wait_for_selector("text=मंज़ूरी बाकी")
        ok(sv(DOCS["staff/u2"], "role") == "pending", "मैनेजर pending"); ok(len([k for k in DOCS if k.startswith("orders/")]) == 0, "कोई ऑर्डर नहीं")
        await ow.click('[data-t="more"]'); await ow.click('[data-a="team"]'); await ow.wait_for_selector('[data-u="u2"][data-r="manager"]'); await ow.click('[data-u="u2"][data-r="manager"]'); await ow.wait_for_timeout(300)
        ok(sv(DOCS["staff/u2"], "role") == "manager", "डायरेक्टर ने मैनेजर बनाया"); await ow.click("#sheet .sx")
        await mg.click("text=फिर देखें"); await mg.wait_for_selector("#tabs button.on"); ok("स्वरूप सा" in await mg.inner_text("#me"), "मैनेजर अंदर")
        # 📋 हमारी टीम के काम (v12): VBE (डायरेक्टर के खाते से) काम लिखे → स्वरूप सा को सिर्फ़ अपना, कैलाश भाई (साथी) को सिर्फ़ अपना
        SW, KB = "9166753417@marwar-rasoi.app", "9414000000@marwar-rasoi.app"
        await ow.evaluate(f"""Promise.all([fsSet('tkaam','k1',{{em:'{SW}',who:'स्वरूप जी',t:'गैस सिलेंडर बुक करें',party:'गैस एजेंसी',ph:'9876500000',due:'2026-11-10',urgent:true,st:'open',rej:false,mt:Date.now()}}),
          fsSet('tkaam','k2',{{em:'{KB}',who:'कैलाश भाई',t:'कपिल जी से चेक लाना',unit:'177 MH',due:'2099-01-01',urgent:false,st:'open',rej:false,mt:Date.now()}})])""")
        r = await mg.evaluate("fsSet('tkaam','k9',{em:'x',t:'y'}).then(()=>'लिखा').catch(()=>'रुका')"); ok(r == "रुका", "मैनेजर tkaam नहीं लिख सकता")
        await mg.evaluate("kaamLoad(true).then(()=>draw())"); await mg.wait_for_selector(".tkstrip"); t = await mg.inner_text(".tkstrip"); ok("1 खुले" in t and "ज़रूरी" in t, "मैनेजर की पट्टी: " + t)
        await mg.click(".tkstrip"); await mg.wait_for_selector("#sheet .tk"); t = await mg.inner_text("#sheet"); ok("गैस सिलेंडर" in t and "कपिल" not in t and "लेट" in t, "स्वरूप सा को सिर्फ़ अपना काम: " + t[:200])
        await mg.click('#sheet [data-tk="done"]'); await mg.wait_for_selector("#sheet details.tkg"); R = [f for k, f in DOCS.items() if k.startswith("tkr/")]
        ok(len(R) == 1 and sv(R[0], "kid") == "k1" and sv(R[0], "ans") == "done" and sv(R[0], "em") == SW, "स्वरूप सा का जवाब tkr में"); await mg.screenshot(path=SH + "/rasoi-kaam-manager.png"); await mg.click("#sheet .sx")
        kb = await page("kailash"); await kb.goto(B); await kb.wait_for_selector("#fgo"); await kb.fill("#fp", "9414000000"); await kb.fill("#fk", "111111"); await kb.click("#fgo")
        await kb.wait_for_selector("#nm"); await kb.fill("#nm", "कैलाश भाई"); await kb.click("#nmo"); await kb.wait_for_selector("text=मंज़ूरी बाकी")
        await ow.click('[data-t="more"]'); await ow.click('[data-a="team"]'); u = USERS[KB]["uid"]; await ow.wait_for_selector(f'[data-u="{u}"][data-r="saathi"]'); await ow.click(f'[data-u="{u}"][data-r="saathi"]'); await ow.wait_for_timeout(300)
        ok(sv(DOCS["staff/" + u], "role") == "saathi", "डायरेक्टर ने साथी बनाया"); await ow.click("#sheet .sx")
        await kb.click("text=फिर देखें"); await kb.wait_for_selector(".tk"); t = await kb.inner_text("#pg"); ok("कपिल जी से चेक" in t and "गैस" not in t and not await kb.locator("#tabs").is_visible(), "कैलाश भाई को सिर्फ़ अपना काम, टैब नहीं: " + t[:200])
        r = await kb.evaluate("fsQuery({from:[{collectionId:'orders'}],limit:5}).then(()=> 'खुल गया').catch(e=>'रुका')"); ok(r == "रुका", "साथी को ऑर्डर नहीं")
        await kb.click('[data-tk="nahi"]'); await kb.wait_for_selector("#kmn"); await kb.click("#kmo"); ok("कारण" in await kb.inner_text("#kme"), "नहीं पर कारण ज़रूरी")
        await kb.fill("#kmn", "कपिल जी शहर से बाहर"); await kb.click("#kmo"); await kb.wait_for_selector(".tksent"); R = [f for k, f in DOCS.items() if k.startswith("tkr/") and sv(f, "em") == KB]
        ok(len(R) == 1 and sv(R[0], "ans") == "nahi" and "शहर से बाहर" in sv(R[0], "note"), "कैलाश भाई का 'नहीं' + कारण"); await kb.screenshot(path=SH + "/rasoi-kaam-saathi.png")
        await ow.evaluate("kaamSheet()"); await ow.wait_for_selector("#sheet .tkg"); t = await ow.inner_text("#sheet"); ok("स्वरूप जी" in t and "कैलाश भाई" in t, "डायरेक्टर को सबका हाल: " + t[:200]); await ow.click("#sheet .sx")
        cu = await page("customer"); await cu.goto(B + "t/"); await cu.wait_for_selector(".mc"); ok("Home order" in await cu.inner_text("#tno") and "Free home delivery" in await cu.inner_text("#hero") and "Kitchen starts at 7:15 PM" in await cu.inner_text("#hero"), "घर का ऑर्डर-पेज")
        await cu.click('.mc[data-id="rs-paneer-butter-masala"] .ad'); await cu.click("#bar"); await cu.click("#send"); await cu.wait_for_timeout(200); ok(await cu.locator("#send").is_visible(), "नाम के बिना नहीं जाता")
        await cu.fill("#hn", "Capt Sharma"); await cu.fill("#hp", "9876543210"); await cu.fill("#ha", "Q 12/B, 74 Armd"); await cu.click("#send"); await cu.wait_for_selector(".trk")
        o = [f for k, f in DOCS.items() if k.startswith("orders/")]; ok(len(o) == 1 and sv(o[0], "type") == "delivery" and sv(o[0], "phone") == "9876543210", "ऑर्डर Firestore में")
        await mg.wait_for_selector(".oc", timeout=9000); t = await mg.inner_text("#pg"); ok("डिलीवरी" in t and "Capt Sharma" in t and "Q 12/B" in t and "Paneer Butter Masala" in t and "₹190" in t, "मैनेजर को ऑर्डर: " + t[:160])
        ok(await mg.evaluate("BELL.on") is True, "मैनेजर की घंटी"); ok(await ow.evaluate("BELL.on") is False, "डायरेक्टर की घंटी अभी नहीं")
        await mg.screenshot(path=SH + "/rasoi-fs-manager.png")
        await mg.click('.oc [data-a="acc"]'); await mg.click('#sheet [data-m="35"]'); await mg.wait_for_timeout(400); o = [f for k, f in DOCS.items() if k.startswith("orders/")]; ok(sv(o[0], "status") == "acc" and sv(o[0], "eta") == "35", "स्वीकार Firestore में")
        await cu.wait_for_selector("text=Accepted · ready in ~35 min", timeout=10000); await cu.screenshot(path=SH + "/rasoi-fs-customer.png")
        await mg.click('.oc [data-a="cook"]'); await mg.wait_for_timeout(300); await mg.click('.oc [data-a="out"]'); await cu.wait_for_selector("text=Out for delivery", timeout=10000)
        # बाहर का आदमी ऑर्डर की सूची नहीं पढ़ सकता
        r = await cu.evaluate("fsQuery({from:[{collectionId:'orders'}],limit:5}).then(()=> 'खुल गया').catch(e=>'रुका')"); ok(r == "रुका", "ग्राहक को सूची नहीं")
        # 🎩 डायरेक्टर ईमेल से: पहले पुष्टि का लिंक, पुष्टि के बाद डायरेक्टर
        dr = await page("dir"); await dr.goto(B); await dr.wait_for_selector("#fdir"); await dr.click("#fdir"); ok(await dr.input_value("#de") == DIR, "डायरेक्टर की ईमेल पहले से भरी")
        await dr.fill("#dk", "abc123"); await dr.click("#dgo"); await dr.wait_for_function("document.querySelector('#derr').textContent.includes('पुष्टि')"); ok(SENT == [DIR] and "staff/" + USERS[DIR]["uid"] not in DOCS, "बिना पुष्टि: लिंक गया, खाता नहीं खुला")
        VER.add(DIR); await dr.click("#dgo"); await dr.wait_for_selector("#nm"); await dr.fill("#nm", "विक्रम जी"); await dr.click("#nmo"); await dr.wait_for_timeout(500)
        ok(sv(DOCS["staff/" + USERS[DIR]["uid"]], "role") == "owner", "पुष्टि के बाद: डायरेक्टर")
        ok(not errs, "JS error: " + "; ".join(errs)); await b.close()
    print("✅ मारवाड़ रसोई: असली मोड (Firestore) पास")
asyncio.run(main())
