"""मारवाड़ रसोई — डायरेक्टर के औज़ार (डेमो मोड): 💰 उधारी · 🤖 Claude का कोड + अपने-आप खेप · 🚚 177 MH से आया माल का मिलान · 🗺️ टीम का नक्शा।
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
        # 🤖 खेप अपने-आप (डायरेक्टर के खुलते ही, एक ही बार)
        A = json.loads(await s.evaluate("localStorage.getItem('mr_c_assets')") or "[]"); ok(any(x["id"] == "a01" and x["q"] == 16 for x in A), "खेप से प्रॉपर्टी: " + str(A))
        await s.reload(); await s.wait_for_timeout(700); ok(len(json.loads(await s.evaluate("localStorage.getItem('mr_c_stock')"))) == 1, "खेप दोबारा नहीं लगी")
        # 🚚 177 से आया माल
        await s.click('[data-t="store"]'); await s.wait_for_selector("[data-ibok]"); t = await s.inner_text("#pg"); ok("177 MH कैंटीन से माल" in t and "MH-4521" in t and "30 L" in t, "आने वाला माल + खेप का स्टॉक: " + t[:200])
        await s.click('[data-ibok="ib1"]'); await s.wait_for_timeout(300); ok("45 L" in await s.inner_text("#pg") and await s.locator('[data-ibok="ib1"]').count() == 0, "मिल गया → स्टॉक 30+15")
        await s.click('[data-ibno="ib2"]'); await s.fill("#ibn", "10 की जगह 6 पैकेट आए"); await s.click("#ibs"); await s.wait_for_timeout(300); t = await s.inner_text("#pg"); ok("नहीं मिला / कम मिला" in t and "6 पैकेट" in t, "कम मिला → डायरेक्टर को लाल कार्ड")
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
        await s.click('[data-co="9000000002"]'); h = await s.get_attribute('[data-cw="9000000002"]', "href"); ok("wa.me/919000000002" in h and "bahut%20din" in h and "Fish%20Curry" in h and "order%2F%3Fs%3Drasoi" in h, "वापस बुलाने का संदेश: " + h[:120])
        await s.fill("#cn", "74 के मेस वाले"); await s.click('[data-cs="9000000002"]'); await s.wait_for_timeout(300)
        await s.click('[data-cf="ud"]'); t = await s.inner_text("#cl"); ok("ग्राहक 0003" in t and "उधारी ₹400" in t and await s.locator("[data-co]").count() == 1, "उधारी वाले: " + t[:200])
        await s.fill("#cq", "kadai"); await s.wait_for_timeout(600); t = await s.inner_text("#cl"); ok("Test Vip" in t and await s.locator("[data-co]").count() == 1, "डिश से खोज")
        await s.fill("#cq", ""); await s.wait_for_timeout(600); await s.click('[data-cf="win"]'); ok("74 के मेस वाले" in await s.inner_text("#cl"), "टिप्पणी बनी रही"); await s.screenshot(path=SH + "/rasoi-cust.png"); await s.click("#sheet .sx")
        await s.evaluate("DB.add({kind:'order',type:'delivery',items:[{id:'x',n:'Dal',q:1,s:100,veg:1}],total:100,by:'customer',name:'T',phone:'9000000001',status:'new',log:[]})"); await s.click('[data-t="orders"]'); await s.wait_for_selector(".ctag"); ok("28 ऑर्डर" in await s.inner_text(".ctag"), "ऑर्डर कार्ड पर ग्राहक की पहचान"); await s.click('[data-t="more"]')
        # 📊 रिपोर्ट + ⭐ ज़्यादा बिकने वाले
        await s.evaluate("(async()=>{for(const n of [3,2,1]) await DB.add({kind:'order',type:'table',table:n,items:[{id:'rs-dal-tadka',n:'Dal Tadka',q:n,s:150,veg:1},{id:'rs-butter-naan',n:'Butter Naan',q:1,s:45,veg:1},{id:'rs-jeera-rice',n:'Jeera Rice',q:1,s:120,veg:1}],total:n*150+165,by:'रमेश',status:'done',tm:n==1?'':'55'})})()")
        await s.wait_for_timeout(300); await s.click('[data-a="report"]'); await s.wait_for_selector(".bars"); t = await s.inner_text("#rp"); ok("Dal Tadka" in t and "6 बार" in t and "रमेश" in t and "3 ऑर्डर लिए" in t and "TMBill नंबर नहीं\n1" in t.replace("\n\n", "\n"), "रिपोर्ट: " + t[:400])
        ok(await s.locator(".bars > div").count() == 7, "7 दिन की पट्टियाँ"); await s.screenshot(path=SH + "/rasoi-report.png"); await s.click("#sheet .sx")
        await s.click('[data-t="take"]'); await s.click('[data-c="pop"]'); ok("Dal Tadka" in (await s.locator(".mc .nm").first.inner_text()).title() or "DAL" in (await s.locator(".mc .nm").first.inner_text()).upper(), "⭐ सबसे ऊपर दाल तड़का"); await s.click('[data-t="more"]')
        # मैनेजर को नक्शा/कोड नहीं
        await s.evaluate("ME={name:'स्वरूप सा',role:'manager'};LS.set('mr_me',ME);draw()"); ok(await s.locator('[data-a="map"]').count() == 0 and await s.locator('[data-a="code"]').count() == 0 and await s.locator('[data-a="udhar"]').count() == 1 and await s.locator('[data-a="cust"]').count() == 1, "मैनेजर: नक्शा/कोड नहीं; उधारी और ग्राहक हैं")
        await s.click('[data-a="cust"]'); await s.wait_for_selector("[data-co]"); ok(await s.locator("#cf").count() == 0 and await s.locator("[data-co]").count() >= 1, "मैनेजर ग्राहक देखे, फ़ाइल न चढ़ा सके"); await s.click('[data-co="9000000002"]'); h = await s.get_attribute('[data-cw="9000000002"]', "href"); ok("Good%20" in h and "Royal%20Customer" in h, "संदेश में Good morning/… + Royal Customer: " + h[:110]); await s.click("#sheet .sx")
        # 🔄 ऐप अपडेट: वर्ज़न वही → "ताज़ा"; पुराना वर्ज़न → ऊपर "अपडेट" बटन, दबाने पर ?u= के साथ ताज़ा
        ok(await s.evaluate("window.MR_BUILD") != "dev" and "वर्ज़न" in await s.inner_text("#updrow"), "बिल्ड का वर्ज़न लगा"); await s.evaluate("updCheck()"); await s.wait_for_timeout(400); ok("अपडेट" not in await s.inner_text("#me"), "ताज़ा ऐप पर अपडेट बटन नहीं")
        await s.evaluate("window.MR_BUILD='2020'; updCheck()"); await s.wait_for_function("document.querySelector('#me').textContent.includes('अपडेट')"); ok("नया अपडेट" in await s.inner_text("#updrow"), "नया वर्ज़न → अपडेट बटन")
        await s.click("#me", force=True); await s.wait_for_url("**/?u=*"); await s.wait_for_selector("#tabs"); await s.wait_for_timeout(700); ok("अपडेट" not in await s.inner_text("#me") and await s.evaluate("typeof MRW") == "object", "अपडेट के बाद ताज़ा ऐप + पहरेदार चालू"); await s.click('[data-t="more"]')
        # 💵 गल्ला: आया/गया, किसने लिया, दिन बंद पर फ़र्क
        await s.evaluate("ME={name:'स्वरूप सा',role:'manager'};LS.set('mr_me',ME);TAB='more';draw()"); await s.click('[data-a="galla"]'); await s.wait_for_selector('[data-g="in"]')
        await s.click('[data-g="in"]'); await s.fill("#ga", "5000"); await s.click("#gsv"); await s.wait_for_function("document.querySelector('#gl').innerText.includes('₹5000')")
        await s.click('[data-g="out"]'); await s.fill("#ga", "1200"); await s.click('[data-gc="1"]'); await s.click("#gsv"); ok("नाम लिखें" in await s.inner_text("#ge"), "बिना नाम पैसा नहीं निकलता"); await s.fill("#gw", "रमेश"); await s.click("#gsv"); await s.wait_for_function("document.querySelector('#gl').innerText.includes('₹3800')")
        await s.click('[data-g="close"]'); await s.fill("#ga", "3500"); await s.click("#gsv"); ok("कारण लिखें" in await s.inner_text("#ge"), "फ़र्क पर कारण ज़रूरी"); await s.fill("#gn", "300 की पर्ची नहीं मिली"); await s.click("#gsv"); await s.wait_for_function("document.querySelector('#gl').innerText.includes('दिन बंद')")
        t = await s.inner_text("#gl"); ok("फ़र्क" in t and "₹3500" in t and "रमेश" in t and "₹1200" in t and "किसने कितना लिया" in t, "गल्ला: " + t[:200].replace("\n", " ")); await s.screenshot(path=SH + "/rasoi-galla.png"); await s.click("#sheet .sx")
        # 🧑‍🍳 टीम: डायरेक्टर 5 साथी जोड़े + तनख्वाह; मैनेजर हाज़िरी/एडवांस (तनख्वाह न दिखे); गल्ले से दिया → गल्ले में भी
        await s.evaluate("ME={name:'विक्रम जी',role:'owner'};LS.set('mr_me',ME);TAB='more';draw()"); await s.click('[data-a="hr"]'); await s.click("#hseed"); await s.wait_for_selector('[data-he="new"]'); ok(await s.locator("[data-he]").count() == 6 and "9166753417" in await s.inner_text("#hb"), "5 साथी जुड़े (स्वरूप सा का नंबर)")
        await s.locator("[data-he]").nth(1).click(); await s.fill("#en1", "रामलाल"); await s.fill("#es1", "15000"); await s.click("#esv1"); await s.wait_for_function("document.querySelector('#hb').innerText.includes('₹15000')"); await s.click("#sheet .sx")
        await s.evaluate("ME={name:'स्वरूप सा',role:'manager'};LS.set('mr_me',ME);draw()"); await s.click('[data-a="hr"]'); await s.wait_for_selector("[data-ha]"); ok("तनख्वाह का खर्च" not in await s.inner_text("#hb"), "मैनेजर को तनख्वाह नहीं दिखती")
        eid = (await s.locator("[data-ha]").nth(4).get_attribute("data-ha")).split("|")[0]; await s.click(f'[data-ha="{eid}|P"]'); await s.wait_for_timeout(200); ok("1/5" in await s.inner_text("#hb"), "हाज़िरी लगी")
        await s.click('[data-ht="pay"]'); await s.select_option("#pe", eid); await s.fill("#pa", "500"); await s.click("#psv"); await s.wait_for_function("document.querySelector('#hb').innerText.includes('गल्ले से')"); await s.click('[data-ht="mon"]'); t = await s.inner_text("#hb"); ok("रामलाल" in t and "₹500" in t and "₹15000" not in t, "मैनेजर: लिया दिखे, तनख्वाह नहीं"); await s.click("#sheet .sx")
        await s.evaluate("ME={name:'विक्रम जी',role:'owner'};LS.set('mr_me',ME);draw()"); await s.click('[data-a="hr"]'); await s.wait_for_selector("[data-ha]"); ok("₹500" in await s.inner_text("#hb"), "आज का तनख्वाह-खर्च (15000÷30)"); await s.click('[data-ht="mon"]'); t = await s.inner_text("#hb"); ok("₹15000" in t and "बाकी देना" in t, "डायरेक्टर का महीने का हिसाब: " + t[:150].replace("\n", " ")); await s.screenshot(path=SH + "/rasoi-team.png"); await s.click("#sheet .sx")
        await s.click('[data-a="galla"]'); await s.wait_for_selector('[data-g="in"]'); ok("रामलाल" in await s.inner_text("#gl"), "गल्ले से दिया एडवांस गल्ले में भी दर्ज"); await s.click("#sheet .sx")
        # रसोइया: ऑर्डर/टेबल/ऑर्डर-लें नहीं — सिर्फ़ स्टोर और "और"
        await s.evaluate("ME={name:'रसोइया',role:'kitchen'};LS.set('mr_me',ME);TAB='orders';draw()"); ok(await s.locator('#tabs button:visible').count() == 2 and await s.locator('#tabs button.on').get_attribute("data-t") == "store", "रसोइया को ऑर्डर नहीं दिखते")
        # ग्राहक का टेबल-पेज: सिर्फ़ पानी/वेटर/बिल; तीनों लगातार चलें; मेन्यू PDF
        t = await cx.new_page(); t.on("pageerror", lambda e: errs.append(str(e))); await t.goto("http://127.0.0.1:8825/t/?t=1"); await t.wait_for_selector("[data-call]")
        ok(await t.locator("[data-call]").count() == 3 and await t.locator('[data-call="store"]').count() == 0, "टेबल-पेज पर सिर्फ़ 3 बटन")
        for k in ["water", "waiter", "bill"]: await t.click(f'[data-call="{k}"]'); await t.wait_for_selector(f'[data-call="{k}"].sent'); await t.wait_for_timeout(2700)
        ok(await t.locator("[data-call].sent").count() == 3 and "marwar-rasoi-menu.pdf" in await t.get_attribute("#mpdf", "href"), "तीनों पुकार चलीं + Menu PDF"); await t.close()
        # ⏰ रिमाइंडर (चरण F): तैयार सूची · नया जोड़ें (समय की जाँच) · अभी के समय पर बजे → हो गया → डायरेक्टर को "आज का हाल"; 🔔 20 घंटियाँ
        await s.evaluate("ME={name:'विक्रम जी',role:'owner'};LS.set('mr_me',ME);TAB='more';draw()"); await s.click('[data-a="remind"]'); await s.click("#rseed"); await s.wait_for_selector(".rmc")
        ok(await s.locator(".rmc").count() == 4 and "बर्तन धुले" in await s.inner_text("#sheet") and "📍 रसोई पर" in await s.inner_text("#sheet"), "तैयार रिमाइंडर")
        await s.fill("#rt", "गैस का सिलेंडर देखें"); await s.fill("#ra", "25:00"); await s.click("#rsv"); ok("ग़लत: 25:00" in await s.inner_text("#re"), "ग़लत समय रुका")
        hm_ = await s.evaluate("(() => { const d = new Date(); return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0') })()")
        await s.fill("#ra", hm_); await s.click('[data-rw="manager"]'); await s.click('[data-rtn="t19"]'); await s.click("#rsv"); await s.wait_for_timeout(300)
        ok(await s.evaluate("RM.conf.list.length") == 5 and await s.evaluate("RM.conf.list[4].who") == "manager" and await s.evaluate("RM.conf.list[4].tone") == "t19", "नया रिमाइंडर सेव"); await s.screenshot(path=SH + "/rasoi-remind.png", full_page=True); await s.click("#sheet .sx")
        await s.evaluate("ME={name:'स्वरूप सा',role:'manager'};LS.set('mr_me',ME);LS.set('mr_remdemo',1);draw()"); await s.evaluate("remTick()"); await s.wait_for_selector('[data-ra="done"]')
        ok("गैस का सिलेंडर" in await s.inner_text("#sheet"), "मैनेजर को अभी बजा"); await s.click('[data-ra="done"]'); await s.wait_for_timeout(300); await s.evaluate("remTick()"); await s.wait_for_timeout(300); ok(await s.locator('[data-ra="done"]').count() == 0, "दोबारा नहीं बजा")
        await s.evaluate("ME={name:'विक्रम जी',role:'owner'};LS.set('mr_me',ME);draw()"); await s.click('[data-a="remind"]'); await s.click('[data-rt="log"]'); await s.wait_for_timeout(300)
        t = await s.inner_text("#sheet"); ok("हो गया" in t and "स्वरूप सा" in t and "गैस का सिलेंडर" in t, "डायरेक्टर: आज का हाल"); await s.click("#sheet .sx")
        await s.click('[data-a="bells"]'); ok(await s.locator("[data-bt]").count() == 20, "20 घंटियाँ"); await s.click('[data-bt="t12"]'); await s.click("#bsv"); ok(await s.evaluate("LS.get('mr_tone')") == "t12", "ऑर्डर की घंटी चुनी")
        # 📒 ग्राहक-बही (चरण G): ऑर्डर पूरा → ग्राहक cbook में → डायरेक्टर की ग्राहक-सूची में "📲 ऐप से नया"
        await s.evaluate("DB.add({kind:'order',type:'delivery',items:[{id:'x',n:'PANEER TIKKA',q:2,s:150,veg:1}],total:300,by:'customer',name:'सूबेदार हरि सिंह',phone:'9414099999',addr:'Qtr 5/A · Unit 12 RAJRIF',status:'out',log:[]})")
        await s.evaluate("ME={name:'स्वरूप सा',role:'manager'};LS.set('mr_me',ME);TAB='orders';draw()"); await s.wait_for_timeout(300); await s.locator('.oc [data-a="done"]').last.click()
        await s.fill("#tmn", "880"); await s.click('[data-pm="qr"]'); await s.click("#tmo"); await s.wait_for_timeout(500)
        ok(await s.evaluate("COL('cbook').list().then(L => L.find(x => x.id === '9414099999'))") is not None, "ग्राहक-बही में जुड़ा")
        await s.evaluate("ME={name:'विक्रम जी',role:'owner'};LS.set('mr_me',ME);TAB='more';draw()"); await s.click('[data-a="cust"]'); await s.wait_for_timeout(500); await s.click('[data-cf="all"]'); await s.wait_for_timeout(200)
        t = await s.inner_text("#sheet"); ok("सूबेदार हरि सिंह" in t and "ऐप से नया" in t, "डायरेक्टर: ऐप वाला ग्राहक सूची में — " + t[:300]); await s.click("#sheet .sx")
        # 🎙️ वॉकी-टॉकी: शीट खुले, संदेश सूची में, दूसरे साथी के फोन पर बजे (नकली आवाज़)
        await s.click('[data-a="talk"]'); await s.wait_for_selector("#tkb"); ok("दबाए रखकर बोलें" in await s.inner_text("#sheet"), "वॉकी-टॉकी खुला")
        await s.evaluate("COL('talk').add({a:'AAAA'.repeat(40),mt:'audio/webm',d:2.1,by:'स्वरूप सा',uid:'u9',role:'manager'})"); await s.evaluate("tkLoad(true)"); await s.wait_for_timeout(300)
        ok("स्वरूप सा" in await s.inner_text("#tkl") and await s.locator("#tkl [data-tp]").count() == 1, "संदेश सूची में"); await s.screenshot(path=SH + "/rasoi-talk.png"); await s.click("#sheet .sx")
        # 🎙️ एक साथी को · 📲 फोन की तैयारी (नकली APK) · 📱 टीम के फोन
        await s.click('[data-a="talk"]'); await s.wait_for_selector('#tkto [data-to="r:manager"]'); await s.click('#tkto [data-to="r:manager"]'); ok(await s.evaluate("TK.to") == "r:manager", "एक पद को चुना"); await s.click("#sheet .sx")
        await s.evaluate("window.Capacitor={isNativePlatform:()=>true,Plugins:{BtPrinter:{_s:{notif:true,loc:false,gps:true,mic:false,cam:true,batt:true,fsi:true},async permAll(){return Object.assign({},this._s)},async permAsk(o){this._s[o.what]=true;return Object.assign({},this._s)},ringStart:async()=>({}),trackStart:async()=>({}),ringBattery:async()=>({}),ringSettings:async()=>({})}}}")
        if await s.evaluate("!!NAT()"):
            await s.evaluate("ME={name:'स्वरूप सा',role:'manager'};LS.set('mr_me',ME);LS.set('mr_ps_day','');phoneSetup(true)"); await s.wait_for_selector("#psgo"); ok(await s.locator(".psr:not(.ok)").count() == 2, "2 इजाज़त बंद दिखीं")
            await s.click("#psgo"); await s.wait_for_timeout(300); ok(await s.locator(".psr:not(.ok)").count() == 0 and "फोन तैयार" in await s.inner_text("#sheet"), "सब ठीक करें"); await s.click("#sheet .sx")
        await s.evaluate("delete window.Capacitor; ME={name:'विक्रम जी',role:'owner'};LS.set('mr_me',ME);COL('dev').add({name:'स्वरूप सा',role:'manager',ts:Date.now()-3600e3,notif:true,loc:false,gps:true,mic:true,cam:true,batt:true,fsi:true,bl:40,track:false});TAB='more';draw()")
        await s.click('[data-a="devs"]'); await s.wait_for_timeout(300); t = await s.inner_text("#sheet"); ok("स्वरूप सा" in t and "घंटे पहले" in t and "लोकेशन नहीं जा रही" in t, "डायरेक्टर: टीम के फोन — " + t[:200]); await s.screenshot(path=SH + "/rasoi-devs.png"); await s.click("#sheet .sx")
        # 🔐 ग्राहक-खाते: CSV में पासवर्ड/रेटिंग → कार्ड पर + WhatsApp संदेश; JSON → cacc (नकली डेटा)
        import tempfile, json as _j
        tdir = tempfile.mkdtemp(); csvp = tdir + "/c.csv"; jp = tdir + "/a.json"
        open(csvp, "w", encoding="utf-8").write("Mobile,Customer Name,Name Pakka,Total Orders,Total Spend,Last Order,Fav Dish 1,Unit,Udhaari,Password,Rating,Tier,Top\n9000011111,Test Jawan,Haan,12,5000,2026-11-10,Kadai Paneer,60,0,abc234,5.0,Royal VIP,Top 2% customer\n")
        open(jp, "w").write(_j.dumps({"v": 1, "acc": [{"h": "a" * 64, "n": "Test Jawan", "o": 12, "rt": 5.0, "hist": [{"d": "2026-11-10", "a": 300, "it": [{"n": "Kadai Paneer", "q": 1, "i": "rs-kadai-paneer"}]}]}]}))
        await s.evaluate("ME={name:'विक्रम जी',role:'owner'};LS.set('mr_me',ME);TAB='more';draw()"); await s.click('[data-a="cust"]'); await s.wait_for_selector("#cf", state="attached")
        await s.set_input_files("#cf", csvp); await s.wait_for_timeout(800); await s.set_input_files("#caf", jp); await s.wait_for_timeout(800)
        ok(await s.evaluate("LS.get('mr_c_cacc',[]).length") == 1, "खाते चढ़े"); await s.fill("#cq", "Test Jawan"); await s.wait_for_timeout(600); await s.click('[data-co="9000011111"]'); await s.wait_for_timeout(200)
        t = await s.inner_text("#sheet"); h = await s.get_attribute('a[href*="Username%3A%209000011111"]', "href")
        ok("abc234" in t and "5.0" in t and h and "Password%3A%20abc234" in h and "Jai%20Hind%20Test%20Jawan%20ji" in h, "कार्ड पर पासवर्ड + खाते वाला संदेश"); await s.screenshot(path=SH + "/rasoi-acc.png"); await s.click("#sheet .sx")
        ok(not errs, "JS error: " + "; ".join(errs)); await b.close()
    print("✅ मारवाड़ रसोई: डायरेक्टर के औज़ार पास")
asyncio.run(main())
