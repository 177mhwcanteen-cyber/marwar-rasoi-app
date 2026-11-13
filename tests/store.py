"""मारवाड़ रसोई — 📦 स्टोर (आया/दिया/माँग/स्टॉक/कम-स्टॉक/गिनती), 🪑 प्रॉपर्टी, ✅ चेकलिस्ट, 📣 मालिक का संदेश (डेमो मोड)।
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
        await s.click("#esv"); ok("दुकान का नाम" in await s.inner_text("#ee"), "सप्लायर ज़रूरी"); await s.fill("#es", "हनीफ़ चिकन सेंटर"); await s.fill("#ep", "9414000000"); await s.click("#esv")
        await s.wait_for_selector(".slist"); t = await s.inner_text("#pg"); ok("5 kg" in t and "हनीफ़ चिकन सेंटर" in t and "₹1200" in t.replace(",", "") and "9414000000" in t, "आया चढ़ा: " + t[:300])
        # कम-स्टॉक सीमा + 📤 रसोई को दिया
        await s.click('.slist [data-si="r01"]'); await s.fill("#mn", "4"); await s.click("#mns"); await s.wait_for_timeout(200)
        await s.click('[data-se="out"]'); await s.fill("#sq", "चिकन"); await s.click('#sres [data-add="r01"]'); ok("स्टॉक: 5 kg" in await s.inner_text("#sl"), "देते समय स्टॉक दिखे")
        await s.fill('[data-q="0"]', "2"); await s.click("#esv"); ok("किसको दिया" in await s.inner_text("#ee"), "नाम ज़रूरी"); await s.fill("#et", "रमेश उस्ताद"); await s.click("#esv"); await s.wait_for_timeout(300)
        t = await s.inner_text("#pg"); ok("3 kg" in t and "खत्म होने वाला" in t and "रमेश उस्ताद" in t, "दिया → स्टॉक 3, कम-स्टॉक में: " + t[:200])
        await s.screenshot(path=SH + "/rasoi-store.png")
        # 🙋 रसोइया माँगे → मैनेजर को कार्ड + घंटी → दे दिया
        await s.evaluate("ME={name:'रमेश उस्ताद',role:'kitchen'};LS.set('mr_me',ME);draw()"); ok(await s.locator('[data-se="req"]').count() == 1 and await s.locator('[data-se="out"]').count() == 0, "रसोइया: सिर्फ़ माँग")
        await s.click('[data-se="req"]'); await s.fill("#sq", "रिफाइंड"); await s.click("#sres [data-add]"); await s.fill('[data-q="0"]', "2"); await s.click("#esv"); await s.wait_for_timeout(300)
        await s.evaluate("ME={name:'स्वरूप सा',role:'manager'};LS.set('mr_me',ME);TAB='orders';draw()"); await s.wait_for_timeout(200)
        t = await s.inner_text("#pg"); ok("रसोई ने सामान माँगा" in t and "रिफाइंड तेल" in t and await s.evaluate("BELL.on") is True, "मैनेजर को माँग + घंटी: " + t[:160])
        await s.click('[data-t="store"]'); await s.click("[data-give]"); await s.wait_for_timeout(300); t = await s.inner_text("#pg")
        ok("-2 L" in t.replace("−", "-") and await s.locator("[data-give]").count() == 0 and await s.evaluate("BELL.on") is False, "दे दिया → स्टॉक −2 (पहले चढ़ाया नहीं था), माँग बंद, घंटी बंद: " + t[:200])
        # ✏️ असली गिनती
        await s.click('.slist [data-si="r01"]'); await s.fill("#aq", "2.5"); await s.click("#aqs"); await s.wait_for_timeout(300); ok("2.5 kg" in await s.inner_text("#pg") and "गिनती ठीक की" in await s.inner_text("#pg"), "गिनती-सुधार दर्ज")
        # 🪑 प्रॉपर्टी: मालिक रजिस्टर भरे, मैनेजर की गिनती कम → लाल
        await s.evaluate("ME={name:'विक्रम जी',role:'owner'};LS.set('mr_me',ME);TAB='more';draw()"); await s.click('[data-a="assets"]'); await s.wait_for_selector(".arow")
        ok(await s.locator(".arow").count() >= 45, "प्रॉपर्टी की सूची"); r = s.locator('.arow[data-id="a02"]'); await r.locator('[data-f="q"]').fill("64"); await r.locator('[data-f="q"]').blur(); await s.wait_for_timeout(250)
        r = s.locator('.arow[data-id="a02"]'); await r.locator('[data-f="c"]').fill("62"); await r.locator('[data-f="c"]').blur(); await s.wait_for_timeout(250)
        ok(await s.locator('.arow.bad[data-id="a02"]').count() == 1 and "गिना:" in await s.inner_text('.arow[data-id="a02"]'), "कुर्सी 64 में से 62 → लाल"); await s.screenshot(path=SH + "/rasoi-assets.png"); await s.click("#sheet .sx")
        # ✅ चेकलिस्ट
        await s.click('[data-a="check"]'); await s.wait_for_selector(".crow"); await s.click('[data-ct="open"]'); n = await s.locator(".crow").count(); await s.locator(".crow").first.click(); await s.wait_for_timeout(200)
        ok(n == 11 and await s.locator(".crow.on").count() == 1 and "1 / 11" in await s.inner_text("#cl") and "विक्रम जी" in await s.inner_text(".crow.on"), "चेकलिस्ट ✔ नाम-समय के साथ")
        await s.fill("#cn", "जनरेटर का डीज़ल देखा"); await s.click("#cadd"); await s.wait_for_timeout(200); ok(await s.locator(".crow").count() == 12, "नया बिंदु जुड़ा"); await s.screenshot(path=SH + "/rasoi-check.png"); await s.click("#sheet .sx")
        # 📣 मालिक का संदेश → मैनेजर को घंटी
        await s.click('[data-a="msg"]'); await s.fill("#mt", "शाम 7 बजे 20 लोगों की पार्टी है"); await s.click("#ms"); await s.wait_for_timeout(300)
        await s.evaluate("ME={name:'स्वरूप सा',role:'manager'};LS.set('mr_me',ME);draw()"); await s.wait_for_timeout(200); t = await s.inner_text("#pg")
        ok("मालिक का संदेश" in t and "20 लोगों की पार्टी" in t and "पढ़ लिया" in t and await s.evaluate("BELL.on") is True, "संदेश + घंटी")
        ok("print" not in open(os.path.join(WWW, "store.js"), encoding="utf8").read().lower() and "print(" not in open(os.path.join(WWW, "index.html"), encoding="utf8").read(), "🚫 इस ऐप में छपाई का कोई कोड नहीं")
        ok(not errs, "JS error: " + "; ".join(errs)); await b.close()
    print("✅ मारवाड़ रसोई: स्टोर + प्रॉपर्टी + चेकलिस्ट पास")
asyncio.run(main())
