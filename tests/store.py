"""मारवाड़ रसोई — 📦 स्टोर (आया/दिया/माँग/स्टॉक/कम-स्टॉक/गिनती), 🪑 प्रॉपर्टी, ✅ चेकलिस्ट, 📣 डायरेक्टर का संदेश (डेमो मोड)।
चलाएँ: node scripts/build.mjs && python3 tests/store.py www <shots-dir>"""
import asyncio, re, sys, threading, http.server, functools, os
from playwright.async_api import async_playwright
WWW, SH = sys.argv[1], (sys.argv[2] if len(sys.argv) > 2 else "/tmp")
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 8824), functools.partial(http.server.SimpleHTTPRequestHandler, directory=WWW))
srv.RequestHandlerClass.log_message = lambda *a: None
threading.Thread(target=srv.serve_forever, daemon=True).start()
def ok(c, m):
    if not c: print("❌", m); os._exit(1)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); cx = await b.new_context(viewport={"width": 390, "height": 780}, device_scale_factor=2); errs = []
        async def cfg(route):
            r = await route.fetch(); await route.fulfill(response=r, body=re.sub(r'projectId: "[^"]*"', 'projectId: ""', await r.text()))
        await cx.route("**/config.js*", cfg)
        s = await cx.new_page(); s.on("pageerror", lambda e: errs.append(str(e)))
        await s.goto("http://127.0.0.1:8824/"); await s.wait_for_selector("#lgo"); await s.click("#lgo")  # स्वरूप सा · मैनेजर
        await s.click('[data-t="store"]'); await s.wait_for_selector(".sbig"); ok("स्टॉक खाली है" in await s.inner_text("#pg"), "खाली स्टोर")
        # 📥 आया: चिकन 5 kg @220 + बारकोड से एक सामान
        await s.click('[data-se="in"]'); await s.click("#esv"); ok("एक सामान" in await s.inner_text("#ee"), "खाली एंट्री रुकी")
        await s.fill("#sq", "चिकन"); await s.click('#sres [data-add="r01"]'); await s.fill('[data-q="0"]', "5"); await s.fill('[data-r="0"]', "220")
        bc = await s.evaluate("Object.keys(ST8.byBc)[0]"); nm = await s.evaluate("ST8.byBc[Object.keys(ST8.byBc)[0]].n")
        await s.fill("#sq", bc); await s.wait_for_timeout(150); ok(nm[:12] in await s.inner_text("#sl") and await s.input_value("#sq") == "", "बारकोड टाइप/गन → सीधा जुड़ा")
        await s.fill('[data-r="0"]', "100"); ok("कुल ₹1,200" in (await s.inner_text(".stot")).replace("₹1200", "₹1,200"), "कुल: " + await s.inner_text(".stot"))
        await s.click("#esv"); ok("दुकान का नाम" in await s.inner_text("#ee"), "सप्लायर ज़रूरी"); await s.click("[data-loc=\"रैक\"]"); await s.fill("#es", "हनीफ़ चिकन सेंटर"); await s.fill("#ep", "9414000000"); await s.click("#esv")
        await s.wait_for_selector(".stk"); t = await s.inner_text("#pg"); ok("5 kg" in t and "हनीफ़ चिकन सेंटर" in t and "₹1200" in t.replace(",", "") and "9414000000" in t, "आया चढ़ा: " + t[:300])
        # कम-स्टॉक सीमा + 📤 रसोई को दिया
        await s.click('.stk [data-si="r01"]'); await s.fill("#mn", "4"); await s.click("#mns"); await s.wait_for_timeout(200)
        await s.click('[data-se="out"]'); await s.fill("#sq", "चिकन"); await s.click('#sres [data-add="r01"]'); ok("स्टॉक: 5 kg" in await s.inner_text("#sl"), "देते समय स्टॉक दिखे")
        await s.fill('[data-q="0"]', "2"); await s.click("#esv"); ok("किसको दिया" in await s.inner_text("#ee"), "नाम ज़रूरी"); await s.fill("#et", "रमेश उस्ताद"); await s.click("#esv"); await s.wait_for_timeout(300)
        t = await s.inner_text("#pg"); ok("3 kg" in t and "खत्म होने वाला" in t and "रमेश उस्ताद" in t, "दिया → स्टॉक 3, कम-स्टॉक में: " + t[:200])
        await s.screenshot(path=SH + "/rasoi-store.png")
        # 🙋 रसोइया माँगे → मैनेजर को कार्ड + घंटी → दे दिया
        await s.evaluate("ME={name:'रमेश उस्ताद',role:'kitchen'};LS.set('mr_me',ME);draw()"); ok(await s.locator('[data-se="req"]').count() == 1 and await s.locator('[data-se="out"]').count() == 1 and "स्टोर से लिया" in await s.inner_text("#pg"), "वाइस शेफ: माँग + स्टोर से लिया")
        await s.click('[data-se="req"]'); await s.fill("#sq", "रिफाइंड"); await s.click("#sres [data-add]"); await s.fill('[data-q="0"]', "2"); await s.click("#esv"); await s.wait_for_timeout(300)
        await s.evaluate("ME={name:'स्वरूप सा',role:'manager'};LS.set('mr_me',ME);TAB='orders';draw()"); await s.wait_for_timeout(200)
        t = await s.inner_text("#pg"); ok("रसोई ने सामान माँगा" in t and "रिफाइंड तेल" in t and await s.evaluate("BELL.on") is True, "मैनेजर को माँग + घंटी: " + t[:160])
        await s.click('[data-t="store"]'); await s.click("[data-give]"); await s.wait_for_timeout(300); t = await s.inner_text("#pg")
        ok("-2 L" in t.replace("−", "-") and await s.locator("[data-give]").count() == 0 and await s.evaluate("BELL.on") is False, "दे दिया → स्टॉक −2 (पहले चढ़ाया नहीं था), माँग बंद, घंटी बंद: " + t[:200])
        # ✏️ असली गिनती
        await s.click('.stk [data-si="r01"]'); await s.fill("#aq", "2.5"); await s.click("#aqs"); await s.wait_for_timeout(300); ok("2.5 kg" in await s.inner_text("#pg") and "गिनती ठीक की" in await s.inner_text("#pg"), "गिनती-सुधार दर्ज")
        # 🪑 प्रॉपर्टी: डायरेक्टर रजिस्टर भरे, मैनेजर की गिनती कम → लाल
        await s.evaluate("ME={name:'विक्रम जी',role:'owner'};LS.set('mr_me',ME);TAB='more';draw()"); await s.click('[data-a="assets"]'); await s.wait_for_selector(".arow")
        ok(await s.locator(".arow").count() >= 45, "प्रॉपर्टी की सूची"); r = s.locator('.arow[data-id="a02"]'); await r.locator('[data-f="q"]').fill("64"); await r.locator('[data-f="q"]').blur(); await s.wait_for_timeout(250)
        r = s.locator('.arow[data-id="a02"]'); await r.locator('[data-f="c"]').fill("62"); await r.locator('[data-f="c"]').blur(); await s.wait_for_timeout(250)
        ok(await s.locator('.arow.bad[data-id="a02"]').count() == 1 and "गिना:" in await s.inner_text('.arow[data-id="a02"]'), "कुर्सी 64 में से 62 → लाल"); await s.screenshot(path=SH + "/rasoi-assets.png"); await s.click("#sheet .sx")
        # ✅ चेकलिस्ट
        await s.click('[data-a="check"]'); await s.wait_for_selector(".crow"); await s.click('[data-ct="open"]'); n = await s.locator(".crow").count(); await s.locator(".crow").first.click(); await s.wait_for_timeout(200)
        ok(n == 11 and await s.locator(".crow.on").count() == 1 and "1 / 11" in await s.inner_text("#cl") and "विक्रम जी" in await s.inner_text(".crow.on"), "चेकलिस्ट ✔ नाम-समय के साथ")
        await s.fill("#cn", "जनरेटर का डीज़ल देखा"); await s.click("#cadd"); await s.wait_for_timeout(200); ok(await s.locator(".crow").count() == 12, "नया बिंदु जुड़ा"); await s.screenshot(path=SH + "/rasoi-check.png"); await s.click("#sheet .sx")
        # 📣 डायरेक्टर का संदेश → मैनेजर को घंटी
        await s.click('[data-a="msg"]'); await s.fill("#mt", "शाम 7 बजे 20 लोगों की पार्टी है"); await s.click("#ms"); await s.wait_for_timeout(300)
        await s.evaluate("ME={name:'स्वरूप सा',role:'manager'};LS.set('mr_me',ME);draw()"); await s.wait_for_timeout(200); t = await s.inner_text("#pg")
        ok("डायरेक्टर का संदेश" in t and "20 लोगों की पार्टी" in t and "पढ़ लिया" in t and await s.evaluate("BELL.on") is True, "संदेश + घंटी")
        ok("print" not in open(os.path.join(WWW, "store.js"), encoding="utf8").read().lower() and "print(" not in open(os.path.join(WWW, "index.html"), encoding="utf8").read(), "🚫 इस ऐप में छपाई का कोई कोड नहीं")
        # ── चरण 2: फोटो-टाइल + श्रेणी, बिल नंबर, खरीद के बिल, ट्रांसफ़र, रैंडम जाँच
        await s.evaluate("ME={name:'स्वरूप सा',role:'manager'};LS.set('mr_me',ME);TAB='store';draw()"); await s.wait_for_selector('[data-se="in"]'); await s.click('[data-se="in"]')
        await s.click('[data-cat="meat"]'); await s.wait_for_selector('#sres [data-add="r05"]'); ok(await s.locator("#sres [data-add]").count() >= 8, "श्रेणी 🥩 की टाइलें")
        await s.click('[data-cat="k177"]'); await s.wait_for_selector("#sres [data-add] img"); ok(await s.locator("#sres [data-add]").count() > 300 and "177-MH-/p/" in await s.locator("#sres img").first.get_attribute("src"), "177 का पूरा सामान फोटो के साथ")
        bc = await s.evaluate("ST8.cat.find(i => i.bc && /^0?\\d{12}$/.test(i.bc[0])).bc[0]"); await s.fill("#sq", bc.lstrip("0")); await s.wait_for_selector('[data-q="0"]'); ok(await s.locator(".sline").count() == 1, "बारकोड (आगे के 0 के बिना भी) से सीधा जुड़ा")
        await s.fill('[data-q="0"]', "6"); await s.fill('[data-r="0"]', "50"); await s.click("[data-loc=\"रैक\"]"); await s.fill("#es", "श्याम किराना"); await s.fill("#eb", "B-101"); await s.click("#esv"); await s.wait_for_selector('[data-sx="bills"]')
        await s.click('[data-sx="bills"]'); t = await s.inner_text("#sheet"); ok("श्याम किराना" in t and "B-101" in t and "₹300" in t, "खरीद के बिल: " + t[:160]); await s.click("#sheet .sx")
        await s.click('[data-sx="move"]'); await s.fill("#sq", bc); await s.wait_for_selector('[data-q="0"]'); await s.fill('[data-q="0"]', "2"); await s.fill("#et", "काउंटर — रमेश"); await s.click("#esv"); await s.wait_for_timeout(400)
        ok(await s.evaluate("(() => { const i = ST8.cat.find(x => x.bc && x.bc[0] === '%s'); return stockQty()[i.id] })()" % bc) == 4, "ट्रांसफ़र से स्टॉक घटा (6 − 2 = 4)")
        await s.click('[data-sx="audit"]'); n = await s.locator("[data-ac]").count(); ok(1 <= n <= 5, "जाँच के सामान चुने")
        for k in range(n): await s.fill(f'[data-ac="{k}"]', "1")
        await s.click("#as"); await s.wait_for_selector("#ar .kot"); ok("फ़र्क" in await s.inner_text("#ar"), "रैंडम जाँच में फ़र्क दिखा"); await s.screenshot(path=SH + "/rasoi-audit.png"); await s.click("#sheet .sx")
        await s.click('[data-se="in"]'); await s.click('[data-cat="k177"]'); await s.wait_for_timeout(500); await s.screenshot(path=SH + "/rasoi-store-tiles.png"); await s.click("#sheet .sx")
        # ── चरण A (15-11): कहाँ से (4 टाइल) · सब्ज़ी एक्सप्रेस कट्टा→kg · पिछला भाव · कहाँ रखा · किसने (पद) · वाइस शेफ चढ़ाए → मैनेजर को सूचना
        await s.click('[data-se="in"]'); await s.click('[data-src="sx"]'); await s.wait_for_selector('#sres [data-add="r38"] img'); ok(await s.locator("#sres [data-add]").count() >= 40 and await s.input_value("#es") == "सब्ज़ी एक्सप्रेस", "सब्ज़ी एक्सप्रेस की सूची")
        await s.click('#sres [data-add="r38"]'); ok(await s.input_value('[data-q="0"]') == "29" and await s.input_value('[data-r="0"]') == "50", "प्याज़: 1 छोटा कट्टा ≈ 29 kg @50")
        await s.fill('[data-pc="0"]', "2"); ok(await s.input_value('[data-q="0"]') == "58", "2 कट्टे ≈ 58 kg"); await s.select_option('[data-pn="0"]', "बड़ा कट्टा"); ok(await s.input_value('[data-q="0"]') == "100", "बड़ा कट्टा 50 kg")
        await s.fill('[data-q="0"]', "97.5"); ok("4875" in (await s.inner_text(".stot")).replace(",", ""), "रकम = असली kg × भाव: " + await s.inner_text(".stot"))
        await s.click("#esv"); ok("कहाँ रखा" in await s.inner_text("#ee"), "जगह ज़रूरी"); await s.click('[data-loc="बक्सा"]'); await s.screenshot(path=SH + "/rasoi-store-sabji.png"); await s.click("#esv"); await s.wait_for_selector(".stk")
        t = await s.inner_text("#pg"); ok("97.5 kg" in t and "रखा: बक्सा" in t and "(मैनेजर)" in t and "2 बड़ा कट्टा" in t, "सब्ज़ी की एंट्री: जगह + पद + पैक")
        await s.evaluate("ME={name:'रमेश',role:'kitchen'};LS.set('mr_me',ME);draw()"); await s.click('[data-se="in"]'); await s.click('[data-src="sx"]'); await s.click('#sres [data-add="r38"]')
        ok("पिछला भाव ₹50" in await s.inner_text("#sl"), "पिछला भाव दिखा"); await s.fill('[data-r="0"]', "55"); ok(await s.locator(".sline.chg").count() == 1, "भाव बदला → लाल")
        await s.click('[data-loc="रैक"]'); await s.click("#esv"); await s.wait_for_selector(".stk"); await s.wait_for_timeout(300)
        await s.evaluate("ME={name:'स्वरूप सा',role:'manager'};LS.set('mr_me',ME);TAB='orders';draw()"); await s.wait_for_timeout(300); t = await s.inner_text("#pg")
        ok("वाइस शेफ ने माल चढ़ाया" in t and "सब्ज़ी एक्सप्रेस से" in t and "प्याज़" in t, "वाइस शेफ ने चढ़ाया → मैनेजर/डायरेक्टर को कार्ड"); await s.click('[data-t="store"]'); await s.wait_for_selector(".stk"); await s.screenshot(path=SH + "/rasoi-store-home.png", full_page=True)
        # ── चरण A-2: 🧑‍🍳 रसोई में (चार्ज → बची गिनती → खपत) · 🛒 खरीद सूची · 📊 खर्च · 🏁 ओपनिंग स्टॉक (सिर्फ़ डायरेक्टर)
        await s.click('[data-se="out"]'); await s.fill("#sq", "प्याज़"); await s.click('#sres [data-add="r38"]'); await s.fill('[data-q="0"]', "10"); await s.fill("#et", "रमेश"); await s.click("#esv"); await s.wait_for_timeout(300)
        await s.click('[data-sx="kit"]'); t = await s.inner_text("#sheet"); ok("चार्ज में: 10 kg" in t and "प्याज़" in t, "रसोई के चार्ज में 10 kg प्याज़")
        k = await s.evaluate("Object.keys(kitQty()).filter(id => kitQty()[id] > 0).indexOf('r38')"); await s.fill(f'[data-kc="{k}"]', "99"); await s.click("#ks"); ok("ज़्यादा नहीं" in await s.inner_text("#ke"), "बचा > चार्ज रुका")
        await s.fill(f'[data-kc="{k}"]', "4"); await s.screenshot(path=SH + "/rasoi-store-kit.png"); await s.click("#ks"); await s.wait_for_timeout(300)
        ok(await s.evaluate("kitQty().r38") == 4 and await s.evaluate("ST8.mov.filter(m => m.t === 'use')[0].total") == 330, "खपत 6 kg × ₹55 = ₹330; चार्ज में 4 बचा")
        await s.click('[data-sx="buy"]'); t = await s.inner_text("#sheet"); ok("चिकन-मछली" in t and "चिकन" in t and "WhatsApp" in t, "खरीद सूची: कम-स्टॉक, कहाँ से लेना है"); await s.click("#sheet .sx")
        await s.click('[data-sx="cost"]'); t = await s.inner_text("#sheet"); ok("प्याज़" in t and await s.locator(".bars > div").count() == 7 and "रमेश" in t, "खर्च: 7 दिन का चार्ट + महँगे सामान + किसने चढ़ाया"); await s.screenshot(path=SH + "/rasoi-store-cost.png"); await s.click("#sheet .sx")
        await s.click('[data-se="in"]'); ok(await s.locator('[data-src="open"]').count() == 0, "ओपनिंग स्टॉक मैनेजर को नहीं"); await s.click("#sheet .sx")
        buy0 = await s.evaluate("ST8.mov.filter(isBuy).length"); await s.evaluate("ME={name:'विक्रम जी',role:'owner'};LS.set('mr_me',ME);draw()"); await s.click('[data-se="in"]'); await s.click('[data-src="open"]')
        await s.fill("#sq", "मटन"); await s.click('#sres [data-add="r05"]'); await s.fill('[data-q="0"]', "3"); await s.fill('[data-r="0"]', "700"); await s.click('[data-loc="डीप-फ्रीज़र"]'); await s.click("#esv"); await s.wait_for_selector(".stk")
        ok(await s.evaluate("stockQty().r05") == 3 and await s.evaluate("ST8.mov.filter(isBuy).length") == buy0 and "ओपनिंग स्टॉक" in await s.inner_text("#pg"), "ओपनिंग स्टॉक: स्टॉक में जुड़ा, खरीद में नहीं गिना")
        await s.evaluate("ME={name:'स्वरूप सा',role:'manager'};LS.set('mr_me',ME);draw()"); await s.wait_for_selector(".stool"); await s.screenshot(path=SH + "/rasoi-store-home.png")
        ok(not errs, "JS error: " + "; ".join(errs)); await b.close()
    print("✅ मारवाड़ रसोई: स्टोर + प्रॉपर्टी + चेकलिस्ट पास")
asyncio.run(main())
