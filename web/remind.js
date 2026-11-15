/* मारवाड़ रसोई — ⏰ रिमाइंडर + 🔔 20 घंटियाँ (चरण F, 15-11-2026; विक्रम जी के vbe-block-timer की सोच)
   conf/remind: {list:[{id, t (क्या), who: owner|manager|kitchen|all, at:["10:00",…], tone:"t11", here (रसोई पर हो तभी), on}], lat, lng}
   rlog/{id}: {rid, t, at, act: done|snooze|miss, by, role, ts} — APK (OrderRingService) लिखता है; ब्राउज़र में खुला हो तो यह फ़ाइल भी।
   APK: स्क्रीन बंद हो तब भी पूरी-स्क्रीन सूचना + घंटी + "✅ हो गया / ⏰ 10 मिनट बाद"; 15 मिनट में जवाब नहीं = "छूटा" (डायरेक्टर को दिखे)। */
const TONES = ["", "ऑर्डर-1", "ऑर्डर-2", "ऑर्डर-3", "ऑर्डर-4", "ऑर्डर-5", "ऑर्डर-6", "ऑर्डर-7", "ऑर्डर-8", "ऑर्डर-9", "ऑर्डर-10", "मंदिर की घंटी", "डिंग-डोंग", "तीन बीप", "सीढ़ी ऊपर", "सीढ़ी नीचे", "घड़ी टिक-टिक", "बाँसुरी", "मोबाइल रिंग", "तेज़ अलार्म", "हल्की याद"];
const RWHO = { owner: "🎩 डायरेक्टर", manager: "🧑‍💼 मैनेजर", kitchen: "🧑‍🍳 वाइस शेफ", all: "👥 सबको" };
const REM_SEED = [
  { id: "bartan", t: "बर्तन धुले या नहीं? धुलकर अलमारी में ठीक से रखे गए? सफ़ाई देख लें", who: "owner", at: ["11:00", "14:30", "17:30", "20:30", "23:00"], tone: "t11", on: true },
  { id: "udhar", t: "मारवाड़ रसोई की उधारी क्लियर करवाएँ — आज किससे लेना है देखें", who: "manager", at: ["18:15", "19:30", "20:45", "22:00"], tone: "t12", here: true, on: true },
  { id: "stock", t: "स्टोर देखें — कुछ खत्म तो नहीं? खरीद सूची भेजें", who: "manager", at: ["11:00", "17:00"], tone: "t14", here: true, on: true },
  { id: "raat", t: "रसोई में बचा सामान गिनकर ऐप में लिखें (रात की गिनती)", who: "kitchen", at: ["22:45"], tone: "t20", here: true, on: true }];
const RM = { conf: null, ts: 0 };
async function remLoad(force) { if (!force && RM.conf && now() - RM.ts < 60000) return RM.conf; const c = (await COL("conf").list().catch(() => [])).find(x => x.id === "remind"); RM.conf = c || { list: [] }; RM.ts = now(); return RM.conf }
const remSave = p => COL("conf").set("remind", p).then(() => { Object.assign(RM.conf, p); RM.ts = now() });
const tonePlay = t => { try { (RM.au = RM.au || new Audio()).src = "tones/" + t + ".wav"; RM.au.play().catch(() => 0) } catch (e) { } };

async function remindSheet(tab) {
  const b = sheet(`<h3>⏰ रिमाइंडर</h3><div id="rm" class="empty">⏳…</div>`), own = ME.role === "owner", mg = own || ME.role === "manager";
  let C = await remLoad(true), L = [], ed = null; tab = tab || (mg ? "list" : "mine");
  const show = async () => { const list = (C.list || []).filter(x => own || x.who === ME.role || x.who === "all");
    if (tab === "log" && mg) L = (await COL("rlog").list().catch(() => [])).filter(x => x.ts >= today0()).sort((a, c) => c.ts - a.ts);
    const A = { done: ["✅", "हो गया", "#15803d"], snooze: ["⏰", "10 मिनट बाद", "#b45309"], miss: ["❌", "छूटा — जवाब नहीं", "#dc2626"] };
    $("#rm", b).outerHTML = `<div id="rm"><div class="seg">${[["list", "📋 रिमाइंडर"]].concat(mg ? [["log", "📊 आज का हाल"]] : [], own ? [["loc", "📍 रसोई की जगह"]] : []).map(([k, l]) => `<button data-rt="${k}" class="${tab === k || (tab === "mine" && k === "list") ? "on" : ""}">${l}</button>`).join("")}</div>
    ${tab === "log" ? `<div class="sum"><div><b>${L.filter(x => x.act === "done").length}</b><small>✅ हो गए</small></div><div><b>${L.filter(x => x.act === "snooze").length}</b><small>⏰ टाले</small></div><div><b style="${L.some(x => x.act === "miss") ? "color:#dc2626" : ""}">${L.filter(x => x.act === "miss").length}</b><small>❌ छूटे</small></div></div>
      ${L.map(x => `<div class="bl ${x.act === "miss" ? "bad" : ""}"><span><b>${A[x.act] ? A[x.act][0] + " " + A[x.act][1] : E(x.act)}</b> · ${E(x.t || "")}<small>${E(x.at || "")} का · ${hm(x.ts)} · ${E(x.by || "")}${x.role ? " (" + E(roleHi(x.role)) + ")" : ""}</small></span></div>`).join("") || `<div class="empty">आज अभी कोई रिमाइंडर नहीं बजा</div>`}`
    : tab === "loc" ? `<p class="hint">"रसोई पर हो तभी" वाले रिमाइंडर तभी बजते हैं जब फोन रसोई के 200 मीटर के अंदर हो (जैसे मैनेजर के आते ही)। रसोई में खड़े होकर नीचे दबाएँ।</p>
      <div class="kot"><div>📍 अभी की जगह<span>${C.lat ? C.lat.toFixed(5) + ", " + C.lng.toFixed(5) : "तय नहीं"}</span></div></div><button class="btn ok big" id="rloc">📍 यहीं मारवाड़ रसोई है — सेव करें</button>`
    : `${list.map((x, k) => `<div class="rmc ${x.on === false ? "off" : ""}"><div class="r1"><b>${E(x.t)}</b>${own ? `<button class="btn gh sm" data-ron="${x.id}">${x.on === false ? "▶ चालू" : "⏸ बंद"}</button>` : ""}</div>
      <div class="chips">${(x.at || []).map(t => `<span>⏰ ${E(t)}</span>`).join("")}<span>${RWHO[x.who] || ""}</span>${x.here ? `<span>📍 रसोई पर</span>` : ""}<span>🔔 ${E(TONES[+String(x.tone || "t11").slice(1)] || x.tone)}</span></div>${own ? `<button class="lnk" data-red="${x.id}">✏️ बदलें</button>` : ""}</div>`).join("") || `<div class="empty">अभी कोई रिमाइंडर नहीं</div>`}
      ${own ? `${!(C.list || []).length ? `<button class="btn big" id="rseed">⚡ तैयार रिमाइंडर जोड़ें (बर्तन, उधारी, स्टोर, रात की गिनती)</button>` : ""}<div class="rmf" id="rmf"><div class="h">${ed ? "✏️ रिमाइंडर बदलें" : "➕ नया रिमाइंडर"}</div>
        <textarea class="in" id="rt" rows="2" placeholder="क्या याद दिलाना है — जैसे: गैस का सिलेंडर देखें">${ed ? E(ed.t) : ""}</textarea>
        <input class="in" id="ra" placeholder="समय, कॉमा से — जैसे 10:00, 13:30, 19:00" value="${ed ? E((ed.at || []).join(", ")) : ""}">
        <div class="seg" id="rw">${Object.keys(RWHO).map(k => `<button data-rw="${k}" class="${(ed ? ed.who : "owner") === k ? "on" : ""}">${RWHO[k]}</button>`).join("")}</div>
        <label class="row" style="margin:6px 0"><input type="checkbox" id="rh" ${ed && ed.here ? "checked" : ""}> 📍 सिर्फ़ तब बजे जब वह रसोई पर हो</label>
        <div class="tgrid">${TONES.slice(11).map((n, i) => `<button data-rtn="t${i + 11}" class="${(ed ? ed.tone : "t11") === "t" + (i + 11) ? "on" : ""}">▶ ${n}</button>`).join("")}</div>
        <div class="err" id="re"></div><button class="btn ok big" id="rsv">✅ सेव करें</button></div>` : ""}`}</div>` };
  await show(); let W = ed ? ed.who : "owner", T = ed ? ed.tone : "t11";
  b.onclick = async e => { const t = e.target.closest("[data-rt],[data-ron],[data-red],[data-rw],[data-rtn],#rseed,#rsv,#rloc"); if (!t) return;
    try {
      if (t.dataset.rt) { tab = t.dataset.rt; ed = null; return show() }
      if (t.dataset.rw) { W = t.dataset.rw; return $$("#rw button", b).forEach(x => x.classList.toggle("on", x === t)) }
      if (t.dataset.rtn) { T = t.dataset.rtn; tonePlay(T); return $$(".tgrid button", b).forEach(x => x.classList.toggle("on", x === t)) }
      if (t.dataset.red) { ed = (C.list || []).find(x => x.id === t.dataset.red); W = ed.who; T = ed.tone || "t11"; await show(); return $("#rmf", b).scrollIntoView({ behavior: "smooth" }) }
      if (t.dataset.ron) { const list = (C.list || []).map(x => x.id === t.dataset.ron ? Object.assign({}, x, { on: x.on === false }) : x); await remSave({ list }); return show() }
      if (t.id === "rseed") { await remSave({ list: REM_SEED }); toast("तैयार रिमाइंडर जुड़ गए ✔"); return show() }
      if (t.id === "rloc") { if (!navigator.geolocation) return toast("इस फोन में लोकेशन नहीं"); t.textContent = "⏳ जगह ढूँढ रहे हैं…";
        navigator.geolocation.getCurrentPosition(async p => { await remSave({ lat: p.coords.latitude, lng: p.coords.longitude }); toast("📍 रसोई की जगह सेव ✔"); show() }, () => { t.textContent = "📍 जगह नहीं मिली — GPS चालू करके फिर दबाएँ" }, { enableHighAccuracy: true, timeout: 15000 }); return }
      if (t.id === "rsv") { const tx = $("#rt", b).value.trim(), at = $("#ra", b).value.split(/[,\s]+/).map(x => x.trim()).filter(Boolean), er = m => $("#re", b).textContent = m;
        if (tx.length < 4) return er("क्या याद दिलाना है — लिखें"); const bad = at.find(x => !/^([01]?\d|2[0-3]):[0-5]\d$/.test(x)); if (!at.length || bad) return er("समय ऐसे लिखें: 10:00, 13:30 (24 घंटे वाला)" + (bad ? " — ग़लत: " + bad : ""));
        const r = { id: ed ? ed.id : "r" + now().toString(36), t: tx, who: W, at: [...new Set(at.map(x => x.padStart(5, "0")))].sort(), tone: T, here: $("#rh", b).checked, on: ed ? ed.on !== false : true };
        const list = ed ? (C.list || []).map(x => x.id === ed.id ? r : x) : (C.list || []).concat([r]); await remSave({ list }); ed = null; toast("रिमाइंडर सेव ✔ — फोन पर 5 मिनट में पहुँच जाएगा"); return show() }
    } catch (x) { toast("सेव नहीं हुआ — नेट/नियम देखें") } };
}

/* 🔔 घंटियाँ: ऑर्डर की घंटी चुनें + 20 धुनें सुनें (APK में फोन की अलार्म-आवाज़ में) */
function bellSheet() { const cur = LS.get("mr_tone", "t1");
  const b = sheet(`<h3>🔔 घंटियाँ</h3><p class="hint">दबाकर सुनें। "ऑर्डर की घंटी" वाली धुन नए ऑर्डर पर बजेगी; रिमाइंडर की धुन हर रिमाइंडर में अलग चुन सकते हैं।</p>
  <div class="tgrid">${TONES.slice(1).map((n, i) => `<button data-bt="t${i + 1}" class="${cur === "t" + (i + 1) ? "on" : ""}">▶ ${n}${cur === "t" + (i + 1) ? " ✓" : ""}</button>`).join("")}</div>
  <button class="btn big" id="bsv">✅ चुनी धुन = ऑर्डर की घंटी</button>${NAT() ? `<button class="btn gh big" id="bph">📱 फोन की अलार्म-आवाज़ में बजाकर देखें</button>` : ""}`); let T = cur;
  b.onclick = e => { const t = e.target.closest("[data-bt],#bsv,#bph"); if (!t) return;
    if (t.dataset.bt) { T = t.dataset.bt; tonePlay(T); return $$(".tgrid button", b).forEach(x => x.classList.toggle("on", x === t)) }
    if (t.id === "bph") { const P = NAT(); P && P.ringTest({ tone: T }).catch(() => toast("नई APK चाहिए")); return }
    LS.set("mr_tone", T); toast("ऑर्डर की घंटी: " + TONES[+T.slice(1)] + " ✔"); closeSheet(); native() } }

/* 🌐 ब्राउज़र/ऐप खुला हो (APK की सेवा न हो) तो यहीं से याद — हर 30 सेकंड */
async function remTick() { if (!ME || NAT() || DB.mode === "local" && !LS.get("mr_remdemo", 0)) return;
  const C = await remLoad().catch(() => null); if (!C) return; const d = new Date(), m = d.getHours() * 60 + d.getMinutes(), day = dkey(), F = LS.get("mr_remf", {});
  for (const x of C.list || []) { if (x.on === false || (x.who !== "all" && x.who !== ME.role)) continue;
    for (const t of x.at || []) { const am = +t.slice(0, 2) * 60 + +t.slice(3), k = day + "|" + x.id + "|" + t; if (F[k] || m < am || m > am + (x.here ? 240 : 20)) continue;
      F[k] = 1; LS.set("mr_remf", Object.fromEntries(Object.entries(F).filter(([q]) => q.startsWith(day)))); tonePlay(x.tone || "t11");
      const b = sheet(`<h3>⏰ ${E(x.t)}</h3><p class="hint">मारवाड़ रसोई · ${E(t)} — देखकर "हो गया" दबाएँ (डायरेक्टर को दिखता है)</p><button class="btn ok big" data-ra="done">✅ हो गया</button><button class="btn gh big" data-ra="snooze">⏰ 10 मिनट बाद</button>`);
      b.onclick = e => { const a = e.target.closest("[data-ra]"); if (!a) return; const act = a.dataset.ra; COL("rlog").add({ rid: x.id, t: x.t, at: t, act, by: ME.name, role: ME.role }).catch(() => 0);
        if (act === "snooze") setTimeout(() => { const G = LS.get("mr_remf", {}); delete G[k]; LS.set("mr_remf", G) }, 9.5 * 60000); try { RM.au && RM.au.pause() } catch (z) { } closeSheet() };
      return } } }
setInterval(() => remTick().catch(() => 0), 30000);
