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
        # 👥 ग्राहक: CSV चढ़ाना, हिस्से, खोज, WhatsApp, टिप्पणी
        import datetime; D = lambda n: (datetime.date.today() - datetime.timedelta(days=n)).isoformat()
        H = "Sr,Mobile (Username),Customer Name,Name Pakka?,Delivery Address,Total Orders,Total Spend Rs,Avg Bill Rs,First Order,Last Order,Days Since Last,Customer Type,Fav Dish 1,Fav Dish 2,Fav Dish 3,Fav Dish 4,Fav Dish 5,All Dishes (qty),Veg / Non-Veg,Usual Order Time,Order Type,Payment Habit,Udhaari Pending Rs,Cancelled Bills,Other Names on Bills,Note,WhatsApp Link,Ready Message"
        CSV = "\ufeff" + H + "\n" + "\n".join([
            f'1,9000000001,Test Vip,Haan (UPI naam),"60, MH",28,11581,414,{D(90)},{D(3)},3,VIP,Kadai Chicken,Kadai Paneer,,,,"Kadai Chicken x11, Roti x20",Dono,Dinner (7-8 baje),Delivery,bharatpe,0,0,A | B,,x,y',
            f'2,9000000002,Test Gone,Haan (UPI naam),74,6,3000,500,{D(120)},{D(45)},45,Regular,Fish Curry,,,,,Fish Curry x6,Non-Veg,Dinner (8-9 baje),Delivery,bharatpe,0,1,,,x,y',
            f'3,9000000003,,Nahi - naam poochna hai,MH,2,400,200,{D(20)},{D(10)},10,Kabhi,Dal Tadka,,,,,Dal Tadka x2,Veg,Lunch,Pickup,pending,400,0,MH,,x,y',
            f'4,9000000001,Dup,Haan,60,1,1,1,{D(1)},{D(1)},1,Naya,X,,,,,X x1,Veg,Lunch,Pickup,cash,0,0,,,x,y'])
        await s.evaluate("ME={name:'विक्रम जी',role:'owner'};LS.set('mr_me',ME);draw()"); await s.click('[data-a="cust"]'); await s.wait_for_selector("#cf", state="attached")
        await s.set_input_files("#cf", {"name": "bad.csv", "mimeType": "text/csv", "buffer": b"a,b\n1,2\n"}); await s.wait_for_timeout(300); ok("ग्राहक-फ़ाइल नहीं" in await s.inner_text("#cerr"), "ग़लत फ़ाइल रुकी")
        await s.set_input_files("#cf", {"name": "c.csv", "mimeType": "text/csv", "buffer": CSV.encode()}); await s.wait_for_selector("[data-co]"); t = await s.inner_text("#cl")
        ok("3\nग्राहक" in t and "₹14981" in t and "₹400" in t and "Test Gone" in t and await s.locator("[data-co]").count() == 1, "चढ़ी (दोहरा नंबर छूटा), 'वापस बुलाएँ' में सिर्फ़ पुराना: " + t[:260])
        await s.click('[data-co="9000000002"]'); h = await s.get_attribute('[data-cw="9000000002"]', "href"); ok("wa.me/919000000002" in h and "Bahut%20din" in h and "Fish%20Curry" in h and "order%2F%3Fs%3Drasoi" in h, "वापस बुलाने का संदेश: " + h[:120])
        await s.fill("#cn", "74 के मेस वाले"); await s.click('[data-cs="9000000002"]'); await s.wait_for_timeout(300)
        await s.click('[data-cf="ud"]'); t = await s.inner_text("#cl"); ok("ग्राहक 0003" in t and "उधारी ₹400" in t and await s.locator("[data-co]").count() == 1, "उधारी वाले: " + t[:200])
        await s.fill("#cq", "kadai"); await s.wait_for_timeout(600); t = await s.inner_text("#cl"); ok("Test Vip" in t and await s.locator("[data-co]").count() == 1, "डिश से खोज")
        await s.fill("#cq", ""); await s.wait_for_timeout(600); await s.click('[data-cf="win"]'); ok("74 के मेस वाले" in await s.inner_text("#cl"), "टिप्पणी बनी रही"); await s.screenshot(path=SH + "/rasoi-cust.png"); await s.click("#sheet .sx")
        await s.evaluate("DB.add({kind:'order',type:'delivery',items:[{id:'x',n:'Dal',q:1,s:100,veg:1}],total:100,by:'customer',name:'T',phone:'9000000001',status:'new',log:[]})"); await s.click('[data-t="orders"]'); await s.wait_for_selector(".ctag"); ok("28 ऑर्डर" in await s.inner_text(".ctag"), "ऑर्डर कार्ड पर ग्राहक की पहचान"); await s.click('[data-t="more"]')
        # मैनेजर को नक्शा/कोड नहीं
        await s.evaluate("ME={name:'स्वरूप सा',role:'manager'};LS.set('mr_me',ME);draw()"); ok(await s.locator('[data-a="map"]').count() == 0 and await s.locator('[data-a="code"]').count() == 0 and await s.locator('[data-a="udhar"]').count() == 1 and await s.locator('[data-a="cust"]').count() == 0, "मैनेजर: नक्शा/कोड/ग्राहक नहीं, उधारी है")
        ok(not errs, "JS error: " + "; ".join(errs)); await b.close()
    print("✅ मारवाड़ रसोई: मालिक के औज़ार पास")
asyncio.run(main())
