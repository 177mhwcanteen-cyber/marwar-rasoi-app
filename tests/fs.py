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
USERS, DOCS, FAIL = {}, {}, set()  # email → {pw, uid} ; "orders/id" → fields
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
        if "accounts:update" in u.path: e = body["idToken"][4:]; USERS[e]["pw"] = body["password"]; return await J({"idToken": "tok-" + e, "refreshToken": "rt-" + e, "localId": USERS[e]["uid"], "expiresIn": "3600"})
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
        if col in ("tkaam", "tvisit", "tmsg", "tprof") and not is_owner:  # नियम v12/v13: साथी सिर्फ़ em == अपना लॉगिन, और क्वेरी में यही शर्त हो
            w = ((body["structuredQuery"].get("where") or {}).get("fieldFilter") or {})
            if not email or w.get("field", {}).get("fieldPath") != "em" or w.get("value", {}).get("stringValue") != email: return await J([{"error": {"message": "PERMISSION_DENIED"}}], 403)
            return await J([{"document": {"name": "x/" + k, "fields": f}} for k, f in DOCS.items() if k.startswith(col + "/") and sv(f, "em") == email] or [{}])
        return await J([{"document": {"name": "x/" + k, "fields": f}} for k, f in DOCS.items() if k.startswith(col + "/")] or [{}])
    col, _, did = path.strip("/").partition("/")
    if rq.method == "POST":
        did = q["documentId"][0]; f = body["fields"]
        if not is_staff and not (sv(f, "status") == "new" and (sv(f, "by") == "customer" or (role == "saathi" and sv(f, "kind") == "order"))): return await J({"error": {"message": "PERMISSION_DENIED"}}, 403)
        DOCS[col + "/" + did] = f; return await J({"name": "x/" + col + "/" + did, "fields": f})
    key = col + "/" + did
    if rq.method == "GET":
        if key not in DOCS: return await J({"error": {"message": "NOT_FOUND"}}, 404)
        return await J({"name": "x/" + key, "fields": DOCS[key]})
    if rq.method == "PATCH":
        if email in FAIL: return await J({"error": {"message": "UNAVAILABLE"}}, 503)
        f = body["fields"]
        if col == "staff":
            if key not in DOCS:
                if not (is_owner or sv(f, "role") == "pending"): return await J({"error": {"message": "PERMISSION_DENIED"}}, 403)
            elif not is_owner: return await J({"error": {"message": "PERMISSION_DENIED"}}, 403)
        elif col in ("tkaam", "tvisit", "tprof", "hello") or (col == "tmsg" and is_owner):
            if not is_owner: return await J({"error": {"message": "PERMISSION_DENIED"}}, 403)
        elif col in ("tvr", "tmsg"):
            if key in DOCS or not email or sv(f, "em") != email or (col == "tmsg" and sv(f, "fr") != "s") or (col == "tvr" and sv(f, "ans") not in ("pahuncha", "mila", "nahi")): return await J({"error": {"message": "PERMISSION_DENIED"}}, 403)
        elif col == "tkr":
            if key in DOCS or not email or sv(f, "em") != email or sv(f, "ans") not in ("done", "gaya", "nahi", "note", "seen"): return await J({"error": {"message": "PERMISSION_DENIED"}}, 403)
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
        await mg.click('#sheet [data-tk="done"]'); await mg.wait_for_selector("#sheet details.tkg"); await mg.wait_for_timeout(400); R = [f for k, f in DOCS.items() if k.startswith("tkr/") and sv(f, "ans") != "seen"]
        ok(len(R) == 1 and sv(R[0], "kid") == "k1" and sv(R[0], "ans") == "done" and sv(R[0], "em") == SW, "स्वरूप सा का जवाब tkr में"); await mg.screenshot(path=SH + "/rasoi-kaam-manager.png"); await mg.click("#sheet .sx")
        kb = await page("kailash"); await kb.goto(B); await kb.wait_for_selector("#fgo"); await kb.fill("#fp", "9414000000"); await kb.fill("#fk", "111111"); await kb.click("#fgo")
        await kb.wait_for_selector("#nm"); await kb.fill("#nm", "कैलाश भाई"); await kb.click("#nmo"); await kb.wait_for_selector("text=मंज़ूरी बाकी")
        await ow.click('[data-t="more"]'); await ow.click('[data-a="team"]'); u = USERS[KB]["uid"]; await ow.wait_for_selector(f'[data-u="{u}"][data-r="saathi"]'); await ow.click(f'[data-u="{u}"][data-r="saathi"]'); await ow.wait_for_timeout(300)
        ok(sv(DOCS["staff/" + u], "role") == "saathi", "डायरेक्टर ने साथी बनाया"); await ow.click("#sheet .sx")
        await kb.click("text=फिर देखें"); await kb.wait_for_selector(".tk"); t = await kb.inner_text("#pg"); ok("कपिल जी से चेक" in t and "गैस" not in t and "मेरा दिन" in await kb.inner_text("#tabs") and "स्टोर" not in await kb.inner_text("#tabs"), "कैलाश भाई को सिर्फ़ अपना काम, साथी के टैब: " + t[:200])
        r = await kb.evaluate("fsQuery({from:[{collectionId:'orders'}],limit:5}).then(()=> 'खुल गया').catch(e=>'रुका')"); ok(r == "रुका", "साथी को ऑर्डर नहीं")
        await kb.click('[data-tk="nahi"]'); await kb.wait_for_selector("#kmn"); await kb.click("#kmo"); ok("लिखिए" in await kb.inner_text("#kme"), "नहीं पर कारण ज़रूरी")
        await kb.fill("#kmn", "कपिल जी शहर से बाहर"); await kb.click("#kmo"); await kb.wait_for_selector(".tksent"); await kb.wait_for_timeout(400); R = [f for k, f in DOCS.items() if k.startswith("tkr/") and sv(f, "em") == KB and sv(f, "ans") != "seen"]
        ok(len(R) == 1 and sv(R[0], "ans") == "nahi" and "शहर से बाहर" in sv(R[0], "note"), "कैलाश भाई का 'नहीं' + कारण"); await kb.screenshot(path=SH + "/rasoi-kaam-saathi.png")
        ok(any(sv(f, "ans") == "seen" and sv(f, "kid") == "k2" for k, f in DOCS.items() if k.startswith("tkr/")), "👁 देखा अपने-आप गया")
        # चरण C: आज की विज़िट ऊपर, संदेश, पहुँचा/मिला, ऑफ़लाइन कतार
        TD = await kb.evaluate("kmToday()")
        await ow.evaluate(f"""Promise.all([fsSet('tvisit','{TD}_9414000000',{{em:'{KB}',day:'{TD}',n:'कैलाश भाई',v:[{{u:'74 Armd Regt',time:'10:30',meet:[{{n:'Maj Singh',ph:'9876511111'}}],ids:['k2'],note:'चेक लेना'}},{{u:'Station HQ',meet:[]}}],mt:Date.now()}}),
          fsSet('tmsg','d1',{{em:'{KB}',fr:'d',t:'कैलाश भाई, आज 74 Armd ज़रूर जाइए',at:Date.now(),by:'विक्रम जी'}})])""")
        await kb.click('[data-tk="ref"]'); await kb.wait_for_selector(".vz"); t = await kb.inner_text("#pg")
        ok(t.index("आज की विज़िट") < t.index("हमारी टीम के काम") and "74 Armd Regt" in t and "Maj Singh" in t and "ज़रूर जाइए" in t, "विज़िट सबसे ऊपर + संदेश: " + t[:160])
        await kb.click('.vz [data-a2="pahuncha"]'); await kb.wait_for_timeout(500); await kb.click('.vz [data-a2="mila"]'); await kb.wait_for_timeout(500)
        V = [f for k, f in DOCS.items() if k.startswith("tvr/")]; ok(sorted(sv(f, "ans") for f in V) == ["mila", "pahuncha"] and all(sv(f, "em") == KB for f in V), "विज़िट: पहुँचा + मिला")
        await kb.fill("#msgt", "चेक मिल गया, कल जमा करूँगा"); await kb.click('[data-tk="msend"]'); await kb.wait_for_timeout(500)
        ok(any(sv(f, "fr") == "s" and "चेक मिल गया" in sv(f, "t") for k, f in DOCS.items() if k.startswith("tmsg/")), "साथी का संदेश")
        FAIL.add(KB); await kb.click('[data-tk="note"]'); await kb.fill("#kmn", "आधा काम हुआ"); await kb.click("#kmo"); await kb.wait_for_timeout(500)
        ok(await kb.evaluate("LS.get('mr_out',[]).length") == 1 and "भेजना बाकी" in await kb.inner_text("#pg"), "नेट नहीं: कतार में")
        FAIL.discard(KB); await kb.evaluate("flushOut()"); await kb.wait_for_timeout(500)
        ok(await kb.evaluate("LS.get('mr_out',[]).length") == 0 and any(sv(f, "ans") == "note" and "आधा" in sv(f, "note") for k, f in DOCS.items() if k.startswith("tkr/")), "नेट आते ही गया")
        await kb.screenshot(path=SH + "/rasoi-din.png", full_page=True)
        # चरण D: ⭐ मेरा हाल (VBE का गिना tprof)
        await ow.evaluate(f"""fsSet('tprof','9414000000',{{em:'{KB}',n:'कैलाश भाई',today:35,goal:100,tot:620,level:{{n:'कर्मठ',ic:'🔨',next:880,nn:'पक्का',pc:12}},streak:4,week:[{{d:'{TD}',s:35}}],done30:[{{t:'RO की सर्विस',unit:'177 MH',doneAt:Date.now(),stars:20}}],ontime:{{d:4,n:5}},rank:{{pos:4,of:6,top:[{{n:'मनोज भाई',s:120}},{{n:'दिनेश जी',s:90}},{{n:'स्वरूप जी',s:70}}],gap:15}},tip:'सबसे पुराना काम पहले: कपिल जी से चेक लाना',badges:['🔥 7 दिन की लड़ी'],open:1,mt:Date.now()}})""")
        await kb.evaluate("dinLoad()"); await kb.click('#tabs [data-t="haal"]'); await kb.wait_for_selector(".ring.big"); t = await kb.inner_text("#pg")
        ok("35" in t and "कर्मठ" in t and "मनोज भाई" in t and "15 ⭐ दूर" in t and "सबसे पुराना काम" in t and "RO की सर्विस" not in t.split("मैंने किया")[0][:0] + "x", "मेरा हाल: " + t[:200])
        await kb.screenshot(path=SH + "/rasoi-haal.png", full_page=True); await kb.click('#tabs [data-t="din"]')
        await ow.evaluate("kaamSheet()"); await ow.wait_for_selector("#sheet .tkg"); t = await ow.inner_text("#sheet"); ok("स्वरूप जी" in t and "कैलाश भाई" in t, "डायरेक्टर को सबका हाल: " + t[:200]); await ow.click("#sheet .sx")
        cu = await page("customer"); await cu.goto(B + "t/"); await cu.wait_for_selector(".mc"); ok("Home order" in await cu.inner_text("#tno") and "Free home delivery" in await cu.inner_text("#hero") and "Kitchen starts at 7:15 PM" in await cu.inner_text("#hero"), "घर का ऑर्डर-पेज")
        await cu.click('.mc[data-id="rs-paneer-butter-masala"] .ad'); await cu.click("#bar"); await cu.click("#send"); await cu.wait_for_timeout(200); ok(await cu.locator("#send").is_visible(), "नाम के बिना नहीं जाता")
        await cu.fill("#hn", "Capt Sharma"); await cu.fill("#hp", "9876543210"); await cu.fill("#ha", "Q 12/B, 74 Armd"); await cu.click("#send"); await cu.wait_for_selector(".trk")
        o = [f for k, f in DOCS.items() if k.startswith("orders/") and sv(f, "by") == "customer"]; ok(len(o) == 1 and sv(o[0], "type") == "delivery" and sv(o[0], "phone") == "9876543210", "ऑर्डर Firestore में")
        await mg.wait_for_selector(".oc", timeout=9000); t = await mg.inner_text("#pg"); ok("डिलीवरी" in t and "Capt Sharma" in t and "Q 12/B" in t and "Paneer Butter Masala" in t and "₹190" in t, "मैनेजर को ऑर्डर: " + t[:160])
        ok(await mg.evaluate("BELL.on") is True, "मैनेजर की घंटी"); ok(await ow.evaluate("BELL.on") is False, "डायरेक्टर की घंटी अभी नहीं")
        await mg.screenshot(path=SH + "/rasoi-fs-manager.png")
        await mg.click('.oc [data-a="acc"]'); await mg.click('#sheet [data-m="35"]'); await mg.wait_for_timeout(400); o = [f for k, f in DOCS.items() if k.startswith("orders/")]; ok(sv(o[0], "status") == "acc" and sv(o[0], "eta") == "35", "स्वीकार Firestore में")
        await cu.wait_for_selector("text=Accepted · ready in ~35 min", timeout=10000); await cu.screenshot(path=SH + "/rasoi-fs-customer.png")
        await mg.click('.oc [data-a="cook"]'); await mg.wait_for_timeout(300); await mg.click('.oc [data-a="out"]'); await cu.wait_for_selector("text=Out for delivery", timeout=10000)
        # बाहर का आदमी ऑर्डर की सूची नहीं पढ़ सकता
        r = await cu.evaluate("fsQuery({from:[{collectionId:'orders'}],limit:5}).then(()=> 'खुल गया').catch(e=>'रुका')"); ok(r == "रुका", "ग्राहक को सूची नहीं")
        # 🤝 योजना-3 चरण A: डायरेक्टर खुद खाता बनाए → पिन → नंबर डालते ही नाम → साथी के 4 टैब → साथी ऑर्डर ले → सिर्फ़ मैनेजर को घंटी → पिन बदलें → 🔁 नया पिन
        ow.on("dialog", lambda d: asyncio.ensure_future(d.accept()))
        await ow.click('[data-t="more"]'); await ow.click('[data-a="team"]'); await ow.wait_for_selector("#mtf"); await ow.click("#mtf summary")
        await ow.fill("#mtn", "मुकेश भाई"); await ow.fill("#mtp", "8949761842"); await ow.click("#mtgo"); await ow.wait_for_selector("#pinv"); PIN = (await ow.inner_text("#pinv")).strip()
        MK = "8949761842@marwar-rasoi.app"; ok(len(PIN) == 6 and USERS[MK]["pw"] == PIN and sv(DOCS["staff/" + USERS[MK]["uid"]], "role") == "saathi", "डायरेक्टर ने खाता बनाया + पिन")
        ok("8949761842" in await ow.get_attribute("#pinwa", "href") and PIN in urllib.parse.unquote(await ow.get_attribute("#pinwa", "href")), "पिन WhatsApp पर"); ok(sum(1 for k in DOCS if k.startswith("hello/")) == 1, "hello बना")
        ok(AUTHU := await ow.evaluate("AUTH.u.ph"), "डायरेक्टर का लॉगिन वही रहा"); ok(AUTHU == "9509553600", "डायरेक्टर का लॉगिन वही: " + str(AUTHU)); await ow.click("#sheet .sx")
        mk = await page("mukesh"); await mk.goto(B); await mk.wait_for_selector("#fgo"); await mk.fill("#fp", "8949761842"); await mk.wait_for_function("document.querySelector('#fhi').textContent.includes('मुकेश भाई')")
        await mk.fill("#fk", PIN); await mk.click("#fgo"); await mk.wait_for_selector('#tabs [data-t="din"]'); t = await mk.inner_text("#tabs"); ok("ऑर्डर लें" in t and "मेरा हाल" in t and "टेबल" not in t, "साथी के 4 टैब: " + t)
        await mk.click('#tabs [data-t="take"]'); await mk.wait_for_selector(".mc .ad"); await mk.click('[data-ty="parcel"]'); await mk.wait_for_selector(".mc .ad"); await mk.locator(".mc .ad").first.click(); await mk.click("#bar"); await mk.fill("#cn", "Sub Rathore"); await mk.click("#send")
        await mk.wait_for_selector("#smine"); o = [f for k, f in DOCS.items() if k.startswith("orders/") and sv(f, "taker") == "मुकेश भाई"]; ok(len(o) == 1 and sv(o[0], "status") == "new", "साथी का ऑर्डर नया (मैनेजर स्वीकार करे)")
        await mg.evaluate("DB.poll()"); await mg.wait_for_timeout(600); ok(await mg.evaluate("ringFor().some(o=>o.taker==='मुकेश भाई')"), "साथी के ऑर्डर पर मैनेजर को घंटी")
        ok(await mg.evaluate("(()=>{const m=ME;ME={name:'x',role:'waiter'};const a=[ringOK({kind:'order'}),ringOK({kind:'call',call:'water'}),ringOK({kind:'call',call:'store'})];ME={name:'y',role:'saathi'};a.push(ringOK({kind:'call',call:'water'}));ME=m;return a.join()})()") == "false,true,false,false", "वेटर = सिर्फ़ टेबल-पुकार, साथी = कुछ नहीं")
        await mk.click('#tabs [data-t="more"]'); await mk.click('[data-a="pin"]'); await mk.fill("#pn1", "246810"); await mk.fill("#pn2", "246810"); await mk.click("#pngo"); await mk.wait_for_timeout(300); ok(USERS[MK]["pw"] == "246810", "साथी ने पिन बदला")
        await ow.click('[data-a="team"]'); u = USERS[MK]["uid"]; await ow.wait_for_selector(f'[data-up="{u}"]'); await ow.click(f'[data-up="{u}"]'); await ow.wait_for_selector("#pinv"); P2 = (await ow.inner_text("#pinv")).strip()
        MK2 = "8949761842.2@marwar-rasoi.app"; ok(USERS.get(MK2, {}).get("pw") == P2 and sv(DOCS["staff/" + u], "role") == "off" and sv(DOCS["staff/" + USERS[MK2]["uid"]], "role") == "saathi", "🔁 नया पिन: नया खाता, पुराना बंद (मिटा नहीं)"); await ow.click("#sheet .sx")
        mk2 = await page("mukesh2"); await mk2.goto(B); await mk2.wait_for_selector("#fgo"); await mk2.fill("#fp", "8949761842"); await mk2.wait_for_function("document.querySelector('#fhi').textContent.includes('मुकेश')"); await mk2.fill("#fk", P2); await mk2.click("#fgo")
        await mk2.wait_for_selector('#tabs [data-t="din"]'); ok(await mk2.evaluate("AUTH.u.uid") == USERS[MK2]["uid"], "नए पिन से नया खाता खुला"); await mk.screenshot(path=SH + "/rasoi-saathi-take.png")
        # 🎩 डायरेक्टर ईमेल से: पहले पुष्टि का लिंक, पुष्टि के बाद डायरेक्टर
        dr = await page("dir"); await dr.goto(B); await dr.wait_for_selector("#fdir"); await dr.click("#fdir"); ok(await dr.input_value("#de") == DIR, "डायरेक्टर की ईमेल पहले से भरी")
        await dr.fill("#dk", "abc123"); await dr.click("#dgo"); await dr.wait_for_function("document.querySelector('#derr').textContent.includes('पुष्टि')"); ok(SENT == [DIR] and "staff/" + USERS[DIR]["uid"] not in DOCS, "बिना पुष्टि: लिंक गया, खाता नहीं खुला")
        VER.add(DIR); await dr.click("#dgo"); await dr.wait_for_selector("#nm"); await dr.fill("#nm", "विक्रम जी"); await dr.click("#nmo"); await dr.wait_for_timeout(500)
        ok(sv(DOCS["staff/" + USERS[DIR]["uid"]], "role") == "owner", "पुष्टि के बाद: डायरेक्टर")
        ok(not errs, "JS error: " + "; ".join(errs)); await b.close()
    print("✅ मारवाड़ रसोई: असली मोड (Firestore) पास")
asyncio.run(main())
