/* 📋 हमारी टीम के काम (16-11-2026, विक्रम जी: "ये सिर्फ़ मेरे नहीं, हम सबके काम हैं")
   काम विक्रम जी के "VBE मैनेजर" ऐप से आते हैं (वहीं जोड़े/सौंपे जाते हैं) — Firestore `tkaam/{कामid}`:
     {em (साथी का लॉगिन = मोबाइल@marwar-rasoi.app), who (नाम), t, x, unit, party, ph, due (YYYY-MM-DD), time, urgent, st: open|claim|done|gone, rej, mt}
   हर साथी को सिर्फ़ अपने (नियम v12)। जवाब `tkr/{id}` {kid, em, ans: done|gaya|nahi, note, at, by} → VBE उठाकर मुहर/फ़ॉलो-अप/स्टार।
   कुछ मिटता नहीं। भूमिका `saathi` = रसोई से बाहर के साथी (कैलाश भाई जैसे) — उन्हें सिर्फ़ यही पन्ना दिखे। */
const KM = { L: [], ts: 0, err: "", busy: false };
const KANS = { done: ["✅", "हो गया"], gaya: ["🚗", "गया / कर रहे हैं"], nahi: ["❌", "नहीं हुआ"] };
const kmEm = () => AUTH.u && AUTH.u.ph ? mail(AUTH.u.ph) : "";
const kmSent = () => LS.get("mr_tkans", {});
const kmDay = s => { if (!s) return ""; const d = new Date(s + "T00:00"), t = new Date(today0()), n = Math.round((d - t) / 864e5);
  return n === 0 ? "आज" : n === 1 ? "कल" : n === -1 ? "कल था" : n < 0 ? (-n) + " दिन लेट" : d.toLocaleDateString("hi-IN", { day: "numeric", month: "short" }) };
const kmToday = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0") };
const kmLate = k => !!k.due && k.due < kmToday() && (k.st === "open" || !k.st);
const kmOpen = () => KM.L.filter(k => !k.st || k.st === "open");
async function kaamLoad(force) {
  if (DB.mode !== "fs" || !AUTH.u) { KM.L = LS.get("mr_tk_demo", []); return KM.L }
  if (!force && now() - KM.ts < 60000) return KM.L;
  if (KM.busy) return KM.L; KM.busy = true;
  try {
    const own = ME && ME.role === "owner", em = kmEm();
    const q = own ? { from: [{ collectionId: "tkaam" }], limit: 400 } : { from: [{ collectionId: "tkaam" }], where: { fieldFilter: { field: { fieldPath: "em" }, op: "EQUAL", value: { stringValue: em } } }, limit: 200 };
    KM.L = own || em ? await fsQuery(q) : []; KM.ts = now(); KM.err = "";
  } catch (e) { KM.err = e.code === 403 ? "नियम v12 अभी Firebase में नहीं लगे" : "नेट नहीं"; } finally { KM.busy = false }
  return KM.L;
}
/* एक काम का कार्ड — बड़े बटन, कॉल/WhatsApp, विक्रम जी का "↺ फिर देखें" लाल पट्टी में */
function kmCard(k, ro) {
  const s = kmSent()[k.id], ph = String(k.ph || "").split(/[ ,]+/).filter(x => /^\d{10}$/.test(x))[0], late = kmLate(k), done = k.st === "done" || k.st === "claim";
  return `<div class="tk ${k.urgent ? "urg" : ""} ${late ? "late" : ""} ${done ? "dn" : ""}">
   <div class="tk1"><b>${k.urgent ? "🚨 " : ""}${E(k.t)}</b><span class="${late ? "red" : ""}">${E(kmDay(k.due))}${k.time ? " · " + E(k.time) : ""}</span></div>
   ${k.x && k.x !== k.t ? `<small>${E(String(k.x).slice(0, 220))}</small>` : ""}
   <div class="chips">${k.unit ? `<span>🏢 ${E(k.unit)}</span>` : ""}${k.party ? `<span>👤 ${E(k.party)}</span>` : ""}${ro ? `<span>🙋 ${E(k.who || "")}</span>` : ""}</div>
   ${k.rej && k.st === "open" ? `<div class="tkrej">↺ विक्रम जी: अभी पूरा नहीं माना — फिर देखिए</div>` : ""}
   ${k.st === "claim" ? `<div class="tksent">✅ आपने "हो गया" भेजा — विक्रम जी की मुहर बाकी</div>` : k.st === "done" ? `<div class="tksent">✅ पूरा</div>` : s && s.at > (k.mt || 0) - 5000 ? `<div class="tksent">${KANS[s.ans][0]} भेजा: ${KANS[s.ans][1]} · ${hm(s.at)}${s.note ? " — " + E(s.note) : ""}</div>` : ""}
   ${ro || done ? "" : `<div class="tkb"><button class="btn ok" data-tk="done" data-id="${E(k.id)}">✅ हो गया</button><button class="btn" data-tk="gaya" data-id="${E(k.id)}">🚗 गया</button><button class="btn gh" data-tk="nahi" data-id="${E(k.id)}">❌ नहीं</button></div>`}
   ${ph && !ro ? `<div class="tkc"><a class="btn gh sm" href="tel:${ph}">📞 ${E(k.party || ph)}</a><a class="btn gh sm" href="https://wa.me/91${ph}" target="_blank" rel="noopener">💬 WhatsApp</a></div>` : ""}</div>`;
}
/* पूरा पन्ना: साथी = अपने खुले काम (ज़रूरी/लेट ऊपर) + पूरे हुए मोड़कर; डायरेक्टर = हर साथी के कितने खुले, नाम दबाओ तो सूची (सिर्फ़ देखना — बदलाव VBE में) */
function vKaam() {
  const own = ME.role === "owner", L = KM.L.filter(k => k.st !== "gone");
  const ord = (a, b) => (b.urgent - a.urgent) || (kmLate(b) - kmLate(a)) || String(a.due || "9").localeCompare(String(b.due || "9"));
  const op = L.filter(k => !k.st || k.st === "open").sort(ord), dn = L.filter(k => k.st === "done" || k.st === "claim").sort((a, b) => (b.mt || 0) - (a.mt || 0)).slice(0, 15);
  const head = `<div class="sum"><div><b>${op.length}</b><small>खुले काम</small></div><div><b style="${op.some(k => k.urgent) ? "color:#dc2626" : ""}">${op.filter(k => k.urgent).length}</b><small>🚨 ज़रूरी</small></div><div><b style="${op.some(kmLate) ? "color:#dc2626" : ""}">${op.filter(kmLate).length}</b><small>⏰ लेट</small></div></div>`;
  const err = KM.err ? `<div class="empty">⚠ ${E(KM.err)}</div>` : "";
  if (own) {
    const by = {}; op.forEach(k => (by[k.who || "?"] = by[k.who || "?"] || []).push(k));
    return `<div class="h">📋 हमारी टीम के काम</div>${head}${err}<p class="hint">काम VBE मैनेजर में जोड़ें/सौंपें — यहाँ हर साथी का हाल।</p>
    ${Object.keys(by).sort((a, b) => by[b].length - by[a].length).map(n => `<details class="tkg"><summary><b>${E(n)}</b><span>${by[n].length} खुले${by[n].some(k => k.urgent) ? " · 🚨 " + by[n].filter(k => k.urgent).length : ""}</span></summary>${by[n].map(k => kmCard(k, true)).join("")}</details>`).join("") || `<div class="empty">अभी किसी के पास खुला काम नहीं</div>`}`;
  }
  return `<div class="h">📋 हमारी टीम के काम</div>${head}${err}${op.map(k => kmCard(k)).join("") || `<div class="empty">🎉 अभी आपके पास कोई खुला काम नहीं</div>`}
   ${dn.length ? `<details class="tkg"><summary><b>✅ पूरे हुए</b><span>${dn.length}</span></summary>${dn.map(k => kmCard(k)).join("")}</details>` : ""}
   <button class="btn gh" data-tk="ref">🔄 ताज़ा करें</button>`;
}
/* जवाब भेजना — "नहीं" पर कारण ज़रूरी */
async function kaamAns(id, ans, host) {
  const k = KM.L.find(x => x.id === id); if (!k) return;
  const go = async note => {
    const at = now(), rid = id.slice(0, 60) + "_" + at.toString(36), doc = { kid: id, em: kmEm(), ans, at, by: ME.name };
    if (note) doc.note = note.slice(0, 300);
    try { if (DB.mode === "fs") await fsSet("tkr", rid, doc); const S = kmSent(); S[id] = { ans, at, note: note || "" }; LS.set("mr_tkans", S);
      if (ans === "done") { k.st = "claim"; k.mt = at } toast(KANS[ans][0] + " भेज दिया — विक्रम जी को दिखेगा"); kaamDraw(host) }
    catch (e) { toast("नहीं गया — नेट देखें") } };
  if (ans !== "nahi") return go("");
  const b = sheet2(`<div class="sh"><h3>❌ क्यों नहीं हुआ?</h3><p class="hint">${E(k.t)}</p><textarea class="in" id="kmn" rows="3" maxlength="300" placeholder="जैसे: पार्टी फोन नहीं उठा रही / कल जाऊँगा"></textarea><div class="err" id="kme"></div><button class="btn big" id="kmo">भेजें</button> <button class="btn gh" id="kmx">रहने दें</button></div>`);
  const shut = () => { const w = $("#sheet2"); w && w.remove() };
  b.querySelector("#kmx").onclick = shut;
  b.querySelector("#kmo").onclick = () => { const n = b.querySelector("#kmn").value.trim(); if (n.length < 3) return b.querySelector("#kme").textContent = "कारण लिखें"; shut(); go(n) };
}
function kaamDraw(host) { if (host && host.isConnected) host.innerHTML = vKaam(); else if (typeof draw === "function") draw() }
/* ☰ और से खुलने वाली शीट (मैनेजर/वेटर/वाइस शेफ/डायरेक्टर) */
async function kaamSheet() {
  const b = sheet(`<div id="kmh" class="empty">⏳…</div>`); const host = $("#kmh", b); host.className = "";
  await kaamLoad(true); kaamDraw(host);
  b.addEventListener("click", e => { const x = e.target.closest("[data-tk]"); if (!x) return; if (x.dataset.tk === "ref") return kaamLoad(true).then(() => kaamDraw(host)); kaamAns(x.dataset.id, x.dataset.tk, host) });
}
/* 🧑‍🔧 साथी (रसोई से बाहर): पूरा ऐप = यही पन्ना */
async function saathiHome() {
  $("#me").textContent = "👤 " + ME.name; $("#tabs").style.display = "none"; const bar = $("#bar"); if (bar) bar.style.display = "none";
  const pg = $("#pg"); pg.innerHTML = `<div class="empty">⏳ आपके काम आ रहे हैं…</div>`;
  const paint = async f => { await kaamLoad(f); pg.innerHTML = `<div id="kmh">${vKaam()}</div><div class="mtg" style="margin-top:14px">${tl("upd", "🔄", "ऐप अपडेट")}${tl("psetup", "📲", "फोन की तैयारी")}${tl("logout", "🚪", "लॉगआउट")}</div>` };
  await paint(true);
  if (!pg.dataset.km) { pg.dataset.km = 1; pg.addEventListener("click", e => { const x = e.target.closest("[data-tk]"); if (!x) return; e.stopPropagation(); if (x.dataset.tk === "ref") return paint(true); kaamAns(x.dataset.id, x.dataset.tk, $("#kmh")) }, true) }
  clearInterval(KM.iv); KM.iv = setInterval(() => !$("#sheet2") && paint(true), 120000);
}
(() => { const st = document.createElement("style"); st.textContent = `
.tk{background:#fff;border-radius:14px;padding:10px 12px;margin:8px 0;box-shadow:0 1px 3px #0002;border-left:5px solid #b45309}
.tk.urg{border-left-color:#dc2626}.tk.late{background:#fff7f7}.tk.dn{opacity:.75;border-left-color:#15803d}
.tk1{display:flex;gap:8px;align-items:flex-start;justify-content:space-between}.tk1 b{font-size:15.5px;line-height:1.35}.tk1 span{white-space:nowrap;font-size:12.5px;color:#64748b}.tk1 span.red{color:#dc2626;font-weight:700}
.tk small{display:block;color:#475569;margin:3px 0}.tk .chips{margin:4px 0}
.tkb{display:grid;grid-template-columns:1.3fr 1fr 1fr;gap:6px;margin-top:8px}.tkb .btn{padding:10px 4px;font-size:14px}
.tkc{display:flex;gap:6px;margin-top:6px;flex-wrap:wrap}.tkrej{background:#fee2e2;color:#991b1b;border-radius:8px;padding:5px 8px;margin-top:6px;font-weight:700;font-size:13px}
.tksent{background:#ecfdf5;color:#166534;border-radius:8px;padding:5px 8px;margin-top:6px;font-size:13px}
.tkg{background:#fff;border-radius:12px;margin:8px 0;padding:6px 10px}.tkg summary{display:flex;justify-content:space-between;padding:6px 0;cursor:pointer}.tkg summary span{color:#64748b}
.tkstrip{display:block;width:100%;text-align:left;border:0;border-radius:12px;padding:9px 12px;margin:0 0 8px;background:#fef3c7;color:#7c2d12;font:inherit;font-weight:700}.tkstrip.red{background:#fee2e2;color:#991b1b}`;
  document.head.appendChild(st) })();
