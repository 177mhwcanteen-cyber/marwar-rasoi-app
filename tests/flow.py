"""मारवाड़ रसोई — पूरा बहाव (डेमो मोड): टेबल-QR से ऑर्डर + पानी → मैनेजर स्वीकार → बनाना → परोसा → TMBill नं. → पूरा; वेटर का ऑर्डर; मालिक को देर की घंटी।
चलाएँ: node scripts/build.mjs && python3 tests/flow.py www <shots-dir>"""
import asyncio, sys, threading, http.server, functools, os
from playwright.async_api import async_playwright
WWW, SH = sys.argv[1], (sys.argv[2] if len(sys.argv) > 2 else "/tmp")
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 8822), functools.partial(http.server.SimpleHTTPRequestHandler, directory=WWW))
srv.RequestHandlerClass.log_message = lambda *a: None
threading.Thread(target=srv.serve_forever, daemon=True).start()
B = "http://127.0.0.1:8822/"
def ok(c, m):
    if not c: print("❌", m); os._exit(1)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); cx = await b.new_context(viewport={"width": 390, "height": 780}, device_scale_factor=2)
        errs = []
        st = await cx.new_page(); st.on("pageerror", lambda e: errs.append("staff: " + str(e)))
        await st.goto(B); await st.wait_for_selector("#lgo"); ok(await st.input_value("#ln") == "स्वरूप सा", "मैनेजर का नाम पहले से"); await st.click("#lgo")
        await st.wait_for_selector(".empty"); ok(await st.locator("#demo").is_visible(), "डेमो पट्टी")
        cu = await cx.new_page(); cu.on("pageerror", lambda e: errs.append("table: " + str(e)))
        await cu.goto(B + "t/?t=5"); await cu.wait_for_selector(".mc"); ok(await cu.inner_text("#tno") == "Table 5", "टेबल नंबर")
        ok(await cu.locator(".mc").count() == 60, "60 डिश: %d" % await cu.locator(".mc").count())
        ok(await cu.locator(".mc .ph[style*=menu]").count() >= 58, "फोटो")
        await cu.click('.mc[data-id="rs-dal-tadka"] .ad'); await cu.click('.mc[data-id="rs-dal-tadka"] [data-d="1"]'); await cu.click('.mc[data-id="rs-butter-naan"] .ad')
        ok("3 items · ₹345" in await cu.inner_text("#bar"), "कार्ट: " + await cu.inner_text("#bar"))
        await cu.click("#bar"); await cu.fill("#nt", "less spicy"); await cu.click("#send"); await cu.wait_for_selector(".trk")
        ok("waiting for the kitchen" in await cu.inner_text(".trk"), "ग्राहक: भेजा")
        await cu.click('[data-call="water"]'); await cu.wait_for_selector('[data-call="water"].sent')
        await cu.screenshot(path=SH + "/rasoi-table.png")
        # मैनेजर के फोन पर
        await st.bring_to_front(); await st.wait_for_selector(".oc"); ok(await st.locator(".oc").count() == 2, "मैनेजर को 2 कार्ड (ऑर्डर + पानी)")
        ok(await st.inner_text("#nb") == "2", "बैज 2"); ok(await st.evaluate("BELL.on") is True, "घंटी बज रही")
        t = await st.inner_text("#pg"); ok("टेबल 5" in t and "2×" in t and "Dal Tadka" in t and "less spicy" in t and "₹345" in t and "पानी" in t, "KOT: " + t[:200])
        await st.screenshot(path=SH + "/rasoi-orders.png")
        await st.click('.oc [data-a="acc"]'); await st.click('#sheet [data-m="25"]'); await st.wait_for_timeout(200)
        await st.click('.oc [data-a="done"]')  # पानी: जा रहे हैं
        await st.wait_for_timeout(200); ok(await st.evaluate("BELL.on") is False, "स्वीकार के बाद घंटी बंद")
        await cu.bring_to_front(); await cu.wait_for_timeout(300); ok("Accepted · ready in ~25 min" in await cu.inner_text(".trk"), "ग्राहक: स्वीकार + समय — " + await cu.inner_text(".trk"))
        ok(await cu.locator('[data-call="water"].sent').count() == 0, "पानी की पुकार पूरी")
        await st.bring_to_front(); await st.click('.oc [data-a="cook"]'); await st.wait_for_timeout(150); await st.click('.oc [data-a="out"]'); await st.wait_for_timeout(150)
        await st.click('.oc [data-a="done"]'); await st.fill("#tmn", "4521"); await st.click("#tmo"); await st.wait_for_timeout(200)
        ok("TMBill 4521" in await st.inner_text("#pg"), "TMBill नंबर दर्ज")
        # वेटर का ऑर्डर
        await st.click('[data-t="take"]'); await st.wait_for_selector(".mc"); await st.click('[data-tn="7"]'); await st.click('.mc[data-id="rs-chicken-biryani"] .ad'); await st.click("#bar"); await st.click("#send")
        await st.wait_for_selector(".oc"); t = await st.inner_text("#pg"); ok("टेबल 7" in t and "Chicken Biryani" in t and "रसोई में" in t, "वेटर का ऑर्डर सीधा रसोई में")
        ok(await st.evaluate("BELL.on") is False, "वेटर के ऑर्डर पर घंटी नहीं")
        await st.click('[data-t="tables"]'); ok(await st.locator(".tb.busy").count() == 1 and "₹219" in await st.inner_text('.tb[data-tb="7"]'), "टेबल 7 व्यस्त")
        await st.screenshot(path=SH + "/rasoi-tables.png")
        await st.click('[data-t="take"]'); await st.wait_for_selector(".mc"); await st.screenshot(path=SH + "/rasoi-take.png")
        # मालिक: 3 मिनट पुराना नया ऑर्डर ही बजे
        await st.evaluate("""()=>{ME={name:'विक्रम जी',role:'owner'};LS.set('mr_me',ME);const o=DB.add({kind:'order',type:'delivery',items:[{id:'x',n:'Dal Fry',q:1,s:150,veg:true}],total:150,by:'customer',name:'Test',addr:'Q 12'});}""")
        await st.click('[data-t="orders"]'); await st.wait_for_timeout(200); ok(await st.evaluate("BELL.on") is False, "मालिक: ताज़ा ऑर्डर पर घंटी नहीं")
        await st.evaluate("""()=>{const a=DB.all();a[a.length-1].ts=Date.now()-200000;LS.set('mr_orders',a);ALL=a;draw()}"""); await st.wait_for_timeout(200)
        ok(await st.evaluate("BELL.on") is True and await st.locator(".oc.late .esc").count() == 1, "मालिक: 3 मिनट बाद घंटी + लाल कार्ड")
        await st.click('[data-t="more"]'); ok("मालिक तक पहुँचे" in await st.inner_text("#pg"), "मालिक की रिपोर्ट")
        q = await cx.new_page(); await q.goto(B + "qr.html"); await q.wait_for_timeout(500); ok(await q.locator(".c img, .c canvas").count() >= 16, "16 QR कार्ड")
        ok(not errs, "JS error: " + "; ".join(errs)); await b.close()
    print("✅ मारवाड़ रसोई: पूरा बहाव पास")
asyncio.run(main())
