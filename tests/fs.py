"""मारवाड़ रसोई — असली मोड (Firestore REST) की जाँच, नकली Firebase के साथ: मालिक का खाता → मैनेजर का खाता (मंज़ूरी बाकी) → मालिक मैनेजर बनाए →
घर से ऑर्डर → मैनेजर को दिखे + घंटी → स्वीकार → ग्राहक को "Accepted"।  चलाएँ: node scripts/build.mjs && python3 tests/fs.py www <shots-dir>"""
import asyncio, sys, json, re, threading, http.server, functools, os, urllib.parse
from playwright.async_api import async_playwright
WWW, SH = sys.argv[1], (sys.argv[2] if len(sys.argv) > 2 else "/tmp")
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 8823), functools.partial(http.server.SimpleHTTPRequestHandler, directory=WWW))
srv.RequestHandlerClass.log_message = lambda *a: None
threading.Thread(target=srv.serve_forever, daemon=True).start()
B = "http://127.0.0.1:8823/"
OWNER = "9509553600@marwar-rasoi.app"
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
        e, pw = body["email"], body["password"]
        if "signUp" in u.path:
            if e in USERS: return await J({"error": {"message": "EMAIL_EXISTS"}}, 400)
            USERS[e] = {"pw": pw, "uid": "u" + str(len(USERS) + 1)}
        elif e not in USERS or USERS[e]["pw"] != pw: return await J({"error": {"message": "INVALID_LOGIN_CREDENTIALS"}}, 400)
        return await J({"idToken": "tok-" + e, "refreshToken": "rt-" + e, "localId": USERS[e]["uid"], "expiresIn": "3600"})
    if "securetoken" in u.netloc: return await J({"id_token": "x", "refresh_token": "x", "user_id": "x", "expires_in": "3600"})
    email = (rq.headers.get("authorization") or "")[11:] or None; role = staff_role(email) if email else None
    is_owner, is_staff = email == OWNER, (email == OWNER or role in ("owner", "manager", "waiter"))
    path = u.path.split("/documents", 1)[1]; q = urllib.parse.parse_qs(u.query)
    if path == ":runQuery":
        col = body["structuredQuery"]["from"][0]["collectionId"]
        if (col == "orders" and not is_staff) or (col == "staff" and not is_owner): return await J([{"error": {"message": "PERMISSION_DENIED"}}], 403)
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
        elif not is_staff: return await J({"error": {"message": "PERMISSION_DENIED"}}, 403)
        DOCS[key] = dict(DOCS.get(key, {}), **f) if "updateMask.fieldPaths" in q else f; return await J({"name": "x/" + key, "fields": DOCS[key]})
    await J({}, 400)
async def cfg(route):
    r = await route.fetch(); t = await r.text()
    t = t.replace('firebase: { apiKey: ""', 'testClock: "17:30", firebase: { apiKey: "k"').replace('projectId: ""', 'projectId: "demo-rasoi"'); ok('"demo-rasoi"' in t, "config बदली नहीं")
    await route.fulfill(response=r, body=t)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); errs = []
        async def page(tag):
            cx = await b.new_context(viewport={"width": 390, "height": 780}); await cx.route(re.compile(r"googleapis\.com"), fake); await cx.route(re.compile(r"/config\.js"), cfg)
            pg = await cx.new_page(); pg.on("pageerror", lambda e: errs.append(tag + ": " + str(e))); return pg
        ow = await page("owner"); await ow.goto(B); await ow.wait_for_selector("#fin"); ok(not await ow.locator("#demo").is_visible(), "डेमो पट्टी नहीं")
        await ow.fill("#fp", "9509553600"); await ow.fill("#fk", "123456"); await ow.fill("#fn", "विक्रम जी"); await ow.click("#fup")
        await ow.wait_for_selector(".empty"); ok(sv(DOCS["staff/u1"], "role") == "owner" and "विक्रम जी" in await ow.inner_text("#me"), "मालिक का खाता")
        mg = await page("manager"); await mg.goto(B); await mg.wait_for_selector("#fin")
        await mg.fill("#fp", "9166753417"); await mg.fill("#fk", "wrong"); await mg.click("#fin"); await mg.wait_for_timeout(300); ok(await mg.locator("#fin").is_visible(), "छोटा पिन रुका")
        await mg.fill("#fk", "654321"); await mg.fill("#fn", "स्वरूप सा"); await mg.click("#fup"); await mg.wait_for_selector("text=मंज़ूरी बाकी")
        ok(sv(DOCS["staff/u2"], "role") == "pending", "मैनेजर pending"); ok(len([k for k in DOCS if k.startswith("orders/")]) == 0, "कोई ऑर्डर नहीं")
        await ow.click('[data-t="more"]'); await ow.click('[data-a="team"]'); await ow.wait_for_selector('[data-u="u2"][data-r="manager"]'); await ow.click('[data-u="u2"][data-r="manager"]'); await ow.wait_for_timeout(300)
        ok(sv(DOCS["staff/u2"], "role") == "manager", "मालिक ने मैनेजर बनाया"); await ow.click("#sheet .scrim")
        await mg.click("text=फिर देखें"); await mg.wait_for_selector("#tabs button.on"); ok("स्वरूप सा" in await mg.inner_text("#me"), "मैनेजर अंदर")
        cu = await page("customer"); await cu.goto(B + "t/"); await cu.wait_for_selector(".mc"); ok("Home order" in await cu.inner_text("#tno") and "Free home delivery" in await cu.inner_text("#hero") and "Kitchen starts at 7:15 PM" in await cu.inner_text("#hero"), "घर का ऑर्डर-पेज")
        await cu.click('.mc[data-id="rs-paneer-butter-masala"] .ad'); await cu.click("#bar"); await cu.click("#send"); await cu.wait_for_timeout(200); ok(await cu.locator("#send").is_visible(), "नाम के बिना नहीं जाता")
        await cu.fill("#hn", "Capt Sharma"); await cu.fill("#hp", "9876543210"); await cu.fill("#ha", "Q 12/B, 74 Armd"); await cu.click("#send"); await cu.wait_for_selector(".trk")
        o = [f for k, f in DOCS.items() if k.startswith("orders/")]; ok(len(o) == 1 and sv(o[0], "type") == "delivery" and sv(o[0], "phone") == "9876543210", "ऑर्डर Firestore में")
        await mg.wait_for_selector(".oc", timeout=9000); t = await mg.inner_text("#pg"); ok("डिलीवरी" in t and "Capt Sharma" in t and "Q 12/B" in t and "Paneer Butter Masala" in t and "₹190" in t, "मैनेजर को ऑर्डर: " + t[:160])
        ok(await mg.evaluate("BELL.on") is True, "मैनेजर की घंटी"); ok(await ow.evaluate("BELL.on") is False, "मालिक की घंटी अभी नहीं")
        await mg.screenshot(path=SH + "/rasoi-fs-manager.png")
        await mg.click('.oc [data-a="acc"]'); await mg.click('#sheet [data-m="35"]'); await mg.wait_for_timeout(400); o = [f for k, f in DOCS.items() if k.startswith("orders/")]; ok(sv(o[0], "status") == "acc" and sv(o[0], "eta") == "35", "स्वीकार Firestore में")
        await cu.wait_for_selector("text=Accepted · ready in ~35 min", timeout=10000); await cu.screenshot(path=SH + "/rasoi-fs-customer.png")
        await mg.click('.oc [data-a="cook"]'); await mg.wait_for_timeout(300); await mg.click('.oc [data-a="out"]'); await cu.wait_for_selector("text=Out for delivery", timeout=10000)
        # बाहर का आदमी ऑर्डर की सूची नहीं पढ़ सकता
        r = await cu.evaluate("fsQuery({from:[{collectionId:'orders'}],limit:5}).then(()=> 'खुल गया').catch(e=>'रुका')"); ok(r == "रुका", "ग्राहक को सूची नहीं")
        ok(not errs, "JS error: " + "; ".join(errs)); await b.close()
    print("✅ मारवाड़ रसोई: असली मोड (Firestore) पास")
asyncio.run(main())
