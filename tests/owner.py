"""मारवाड़ रसोई — मालिक के औज़ार (डेमो मोड): 💰 उधारी · 🤖 Claude का कोड + अपने-आप खेप · 🚚 177 MH से आया माल का मिलान · 🗺️ टीम का नक्शा।
चलाएँ: node scripts/build.mjs && python3 tests/owner.py www <shots-dir>"""
import asyncio, re, sys, json, base64, time, threading, http.server, functools, os
from playwright.async_api import async_playwright
WWW, SH = sys.argv[1], (sys.argv[2] if len(sys.argv) > 2 else "/tmp")
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 8825), functools.partial(http.server.SimpleHTTPRequestHandler, directory=WWW))
srv.RequestHandlerClass.log_message = lambda *a: None
threading.Thread(target=srv.serve_forever, daemon=True).start()
def ok(c, m):
    if not c: print("❌", m); os._exit(1)
PACK = {"id": "T-01", "assets": {"a01": {"q": 16}}, "stock": [{"t": "in", "src": "पुराना स्टॉक", "items": [{"id": "r23", "n": "रिफाइंड तेल", "u": "L", "q": 30}], "total": 0}]}
CODE = "MR1:" + base64.b64encode(json.dumps({"id": "U-01", "udhar": [{"name": "Hav Ramesh", "phone": "98290 11111", "amt": 1250, "why": "अक्टूबर का बाकी"}], "assets": {"a02": {"q": 64}}}, ensure_ascii=False).encode()).decode()
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); cx = await b.new_context(viewport={"width": 390, "height": 780}, device_scale_factor=2); errs = []
        async def cfg(route):
            r = await route.fetch(); await route.fulfill(response=r, body=re.sub(r'projectId: "[^"]*"', 'projectId: ""', await r.text()))
        await cx.route("**/config.js*", cfg)
        await cx.route("**/data/packs/index.json", lambda r: r.fulfill(json={"packs": ["T-01"]})); await cx.route("**/data/packs/T-01.json", lambda r: r.fulfill(json=PACK))
        await cx.route(re.compile(r"cartocdn\.com"), lambda r: r.abort())
        now = int(time.time() * 1000); day = time.strftime("%Y-%m-%d")
        seed = {"mr_me": {"name": "विक्रम जी", "role": "owner"},
                "mr_c_inbox": [{"id": "ib1", "src": "mh177", "status": "new", "bill": "MH-4521", "ts": now, "by": "मनोज", "total": 2400, "items": [{"id": "r23", "n": "रिफाइंड तेल", "u": "L", "q": 15, "r": 160}]},
                               {"id": "ib2", "src": "mh177", "status": "new", "bill": "MH-4530", "ts": now, "by": "मनोज", "total": 300, "items": [{"id": "r58", "n": "नैपकिन", "u": "pkt", "q": 10, "r": 30}]}],
                "mr_c_live": [{"id": "u2", "name": "स्वरूप सा", "lat": 25.7532, "lng": 71.4181, "acc": 12, "ts": now - 60000, "seen": now - 60000, "running": True}, {"id": "u3", "name": "रमेश", "lat": 25.7601, "lng": 71.4105, "ts": now - 7200000, "seen": now - 7200000}],
                "mr_c_trk": [{"id": day + "_u2_09", "uid": "u2", "name": "स्वरूप सा", "date": day, "hr": 9, "pts": [f"{now - 3600000},25.7500,71.4100,10", f"{now - 1800000},25.7520,71.4150,15", f"{now - 900000},25.9,71.9,400", f"{now - 60000},25.7532,71.4181,12"]}]}
        await cx.add_init_script("const S=%s;if(!localStorage.getItem('mr_me'))for(const k in S)localStorage.setItem(k,JSON.stringify(S[k]));" % json.dumps(seed, ensure_ascii=False))
        s = await cx.new_page(); s.on("pageerror", lambda e: errs.append(str(e)))
        await s.goto("http://127.0.0.1:8825/"); await s.wait_for_selector(".sum.own"); await s.wait_for_timeout(600)
        # 🤖 खेप अपने-आप (मालिक के खुलते ही, एक ही बार)
        A = json.loads(await s.evaluate("localStorage.getItem('mr_c_assets')") or "[]"); ok(any(x["id"] == "a01" and x["q"] == 16 for x in A), "खेप से प्रॉपर्टी: " + str(A))
        await s.reload(); await s.wait_for_timeout(700); ok(len(json.loads(await s.evaluate("localStorage.getItem('mr_c_stock')"))) == 1, "खेप दोबारा नहीं लगी")
        # 🚚 177 से आया माल
        await s.click('[data-t="store"]'); await s.wait_for_selector("[data-ibok]"); t = await s.inner_text("#pg"); ok("177 MH कैंटीन से माल" in t and "MH-4521" in t and "30 L" in t, "आने वाला माल + खेप का स्टॉक: " + t[:200])
        await s.click('[data-ibok="ib1"]'); await s.wait_for_timeout(300); ok("45 L" in await s.inner_text("#pg") and await s.locator('[data-ibok="ib1"]').count() == 0, "मिल गया → स्टॉक 30+15")
        await s.click('[data-ibno="ib2"]'); await s.fill("#ibn", "10 की जगह 6 पैकेट आए"); await s.click("#ibs"); await s.wait_for_timeout(300); t = await s.inner_text("#pg"); ok("नहीं मिला / कम मिला" in t and "6 पैकेट" in t, "कम मिला → मालिक को लाल कार्ड")
        await s.screenshot(path=SH + "/rasoi-inbox.png")
        # 💰 उधारी + 🤖 कोड
        await s.click('[data-t="more"]'); await s.click('[data-a="code"]'); await s.fill("#cc", "MR1:xyz"); await s.click("#cgo"); ok("अधूरा या ग़लत" in await s.inner_text("#ce"), "ग़लत कोड रुका")
        await s.fill("#cc", CODE); await s.click("#cgo"); await s.wait_for_timeout(500); await s.click('[data-a="code"]'); await s.fill("#cc", CODE); await s.click("#cgo"); await s.wait_for_timeout(300); ok("पहले ही लग चुका" in await s.inner_text("#ce"), "कोड दोबारा नहीं"); await s.click("#sheet .sx")
        await s.click('[data-a="udhar"]'); await s.wait_for_selector("[data-uo]"); t = await s.inner_text("#ul"); ok("Hav Ramesh" in t and "₹1250" in t and "9829011111" in t, "कोड से उधारी: " + t[:120])
        await s.click("[data-uo]"); await s.fill("#ua", "500"); await s.fill("#uw", "नकद"); await s.click("[data-up]"); await s.wait_for_timeout(300); t = await s.inner_text("#ul"); ok("₹750" in t and "−₹500" in t and "विक्रम जी" in t, "जमा दर्ज, बाकी 750: " + t[:160])
        h = await s.get_attribute('#ul a[href*="wa.me"]', "href"); ok("wa.me/919829011111" in h and "750" in h, "WhatsApp याद: " + h[:80])
        await s.fill("#nn", "Nk Suresh"); await s.fill("#na", "300"); await s.click("#uadd"); await s.wait_for_timeout(300); ok("₹1050" in await s.inner_text("#ul"), "नया उधार, कुल 1050"); await s.screenshot(path=SH + "/rasoi-udhar.png"); await s.click("#sheet .sx")
        # 🗺️ नक्शा
        await s.click('[data-a="map"]'); await s.wait_for_selector(".pin"); ok(await s.locator(".pin").count() == 2 and await s.locator(".pin.off").count() == 1, "दो साथी, एक बंद")
        t = await s.inner_text("#ml"); ok("स्वरूप सा" in t and "चालू" in t and "2 घंटे पहले" in t and "3 जगह दर्ज" in t, "सूची (ख़राब GPS वाला बिंदु छूटा): " + t[:200])
        await s.click('[data-mu="u2"]'); await s.wait_for_timeout(300); ok(await s.locator("#mp path.leaflet-interactive").count() == 1 and await s.locator(".pin.sel").count() == 1, "आज का रास्ता"); await s.screenshot(path=SH + "/rasoi-map.png"); await s.click("#sheet .sx")
        # मैनेजर को नक्शा/कोड नहीं
        await s.evaluate("ME={name:'स्वरूप सा',role:'manager'};LS.set('mr_me',ME);draw()"); ok(await s.locator('[data-a="map"]').count() == 0 and await s.locator('[data-a="code"]').count() == 0 and await s.locator('[data-a="udhar"]').count() == 1, "मैनेजर: नक्शा/कोड नहीं, उधारी है")
        ok(not errs, "JS error: " + "; ".join(errs)); await b.close()
    print("✅ मारवाड़ रसोई: मालिक के औज़ार पास")
asyncio.run(main())
