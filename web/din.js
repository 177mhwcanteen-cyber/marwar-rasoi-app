/* 🏠 मेरा दिन (योजना-3 चरण C, 16-11-2026) — साथी का घर: नमस्ते-पट्टी → 🗺️ आज की विज़िट → 📋 काम (समय-सीमा, कब से, ⭐) → 💬 संदेश → ✅ आज किया
   डेटा (सब VBE से, डायरेक्टर के खाते से लिखा; साथी सिर्फ़ अपना पढ़े — नियम v13): tkaam · tvisit {em, day, n, v:[{u, time, meet:[{n,ph}], ids, note}]} · tmsg {em, fr: d|s, t, kid, at, by} · tprof
   जवाब: tkr (done/gaya/nahi/note/seen) · tvr (pahuncha/mila/nahi) · tmsg (fr 's')। नेट न हो तो LS "mr_out" कतार — नेट आते ही अपने-आप।
   नया काम/संदेश/विज़िट = छोटी "टिक" + कंपन + कार्ड 3 बार चमके (लंबी घंटी सिर्फ़ 🚨 पर, वह APK करता है)। रात 9 – सुबह 7 आवाज़ नहीं। */
const DIN = Object.assign(LS.get("mr_din", { V: [], M: [], P: null, at: 0 }), { off: false });
const OUT = { busy: false };
const dinQuiet = () => { const h = new Date().getHours(); return h >= 21 || h < 7 };
const myFirst = () => String(ME && ME.name || "").split(" ")[0];
/* ── नेट न हो तो कतार ── */
function qSend(col, id, doc) { const q = LS.get("mr_out", []); q.push({ col, id, doc }); LS.set("mr_out", q); return flushOut() }
async function flushOut() {
  if (OUT.busy || DB.mode !== "fs") { if (DB.mode !== "fs") LS.set("mr_out", []); return }
  OUT.busy = true; let q = LS.get("mr_out", []);
  try { while (q.length) { const x = q[0]; try { await fsSet(x.col, x.id, x.doc) } catch (e) { if (e.code === 403 || e.code === 400) { q.shift(); LS.set("mr_out", q); continue } break } q.shift(); LS.set("mr_out", q) } }
  finally { OUT.busy = false } const h = $("#outq"); if (h) h.outerHTML = outBar() }
const outBar = () => { const n = LS.get("mr_out", []).length; return `<div id="outq">${n ? `<div class="tkrej" style="background:#fef3c7;color:#92400e">⏳ ${n} जवाब भेजना बाकी — नेट आते ही अपने-आप चले जाएँगे</div>` : ""}</div>` };
addEventListener("online", () => flushOut()); setInterval(() => flushOut(), 30000);
/* ── लाना ── */
async function dinLoad() {
  if (DB.mode !== "fs" || !AUTH.u) return;
  const em = kmEm(), q = c => fsQuery({ from: [{ collectionId: c }], where: { fieldFilter: { field: { fieldPath: "em" }, op: "EQUAL", value: { stringValue: em } } }, limit: 200 });
  try { const [V, M, P] = await Promise.all([q("tvisit").catch(() => []), q("tmsg").catch(() => []), q("tprof").catch(() => [])]);
    DIN.V = V; DIN.M = M.sort((a, b) => (a.at || 0) - (b.at || 0)).slice(-40); DIN.P = P[0] || null; DIN.at = now(); DIN.off = false;
    LS.set("mr_din", { V: DIN.V, M: DIN.M, P: DIN.P, at: DIN.at, L: KM.L }); dinNew() }
  catch (e) { DIN.off = true; if (!KM.L.length && LS.get("mr_din", {}).L) KM.L = LS.get("mr_din", {}).L }
}
/* ── नया आया? टिक + चमक (एक बार) ── */
const TICK = { n: 0, au: null };
function tick() { if (dinQuiet()) return; TICK.n++; try { (TICK.au = TICK.au || new Audio("tones/tick.wav")).currentTime = 0; TICK.au.play().catch(() => 0) } catch (e) { } try { navigator.vibrate && navigator.vibrate([40, 60, 40]) } catch (e) { } }
function dinNew() {
  const known = LS.get("mr_known", null), cur = kmOpen().map(k => "k" + k.id + (k.rej ? "r" : "")).concat(DIN.M.filter(m => m.fr === "d").map(m => "m" + m.id), DIN.V.map(v => "v" + v.id + (v.mt || 0)));
  if (known === null) { LS.set("mr_known", cur); return }
  const fresh = cur.filter(x => !known.includes(x)); DIN.fresh = fresh; LS.set("mr_known", Array.from(new Set(known.concat(cur))).slice(-600)); if (fresh.length) tick() }
const isFresh = key => (DIN.fresh || []).includes(key);
/* ── देखा (एक बार) ── */
function dinSeen() { if (DB.mode !== "fs") return; const S = LS.get("mr_seen", {}); let ch = false;
  kmOpen().forEach(k => { if (S[k.id]) return; S[k.id] = now(); ch = true; const at = now(); qSend("tkr", k.id.slice(0, 60) + "_s" + at.toString(36), { kid: k.id, em: kmEm(), ans: "seen", at, by: ME.name }) });
  if (ch) LS.set("mr_seen", S) }
/* ── समय-सीमा और उम्र ── */
function dueText(k) { if (!k.due) return ""; const d = Math.round((new Date(k.due + "T00:00") - new Date(today0())) / 864e5), tm = k.time ? (+k.time.split(":")[0] % 12 || 12) + (k.time.split(":")[1] !== "00" ? ":" + k.time.split(":")[1] : "") + " बजे" : "";
  return d === 0 ? "⏰ आज " + (tm ? tm + " तक" : "") : d === 1 ? "कल " + tm : d > 1 ? d + " दिन बाकी" : "🔴 " + (-d) + " दिन ऊपर" }
const ageText = k => { const a = k.sent || k.at; if (!a) return ""; const d = Math.floor((now() - a) / 864e5); return d <= 0 ? "आज मिला" : d + " दिन पहले मिला" };
/* ── 🗺️ विज़िट ── */
function vVisit() {
  const td = kmToday(), tm = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0") })();
  const day = v => DIN.V.find(x => x.day === v), A = LS.get("mr_tvr", {}), card = (vd, x, i) => { const key = vd.id + "|" + i, a = A[key] || {}, done = a.ans === "mila", ids = x.ids || [], ks = KM.L.filter(k => ids.includes(String(k.id).split("_").slice(0, -1).join("_")) || ids.includes(k.id));
    return `<div class="vz ${done ? "dn" : ""} ${isFresh("v" + vd.id + (vd.mt || 0)) ? "fl" : ""}"><div class="tk1"><b>${i + 1}. 🏢 ${E(x.u)}</b><span>${x.time ? "🕘 " + E(x.time) : ""}</span></div>
     ${(x.meet || []).map(m => `<div class="vzm">👤 ${E(m.n)}${m.ph ? ` <a href="tel:${E(m.ph)}">📞</a> <a href="https://wa.me/91${E(m.ph)}" target="_blank" rel="noopener">💬</a>` : ""}</div>`).join("")}
     ${ks.length ? `<small>📋 ${ks.length} काम: ${ks.slice(0, 3).map(k => E(k.t)).join(" · ")}${ks.length > 3 ? " …" : ""}</small>` : ""}${x.note ? `<small>📝 ${E(x.note)}</small>` : ""}
     ${a.ans ? `<div class="tksent">${a.ans === "mila" ? "✅ मिल लिया" : a.ans === "nahi" ? "⏳ नहीं मिले" : "📍 पहुँच गया"} · ${hm(a.at)}${a.note ? " — " + E(a.note) : ""}</div>` : ""}
     ${vd.day === td && !done ? `<div class="tkb">${a.ans !== "pahuncha" ? `<button class="btn" data-tk="vz" data-a2="pahuncha" data-v="${E(vd.id)}" data-i="${i}">📍 पहुँच गया</button>` : ""}<button class="btn ok" data-tk="vz" data-a2="mila" data-v="${E(vd.id)}" data-i="${i}">✅ मिल लिया</button><button class="btn gh" data-tk="vz" data-a2="nahi" data-v="${E(vd.id)}" data-i="${i}">⏳ नहीं मिले</button></div>` : ""}</div>` };
  const T = day(td), N = new Date().getHours() >= 18 ? day(tm) : null;
  return (T && (T.v || []).length ? `<div class="h">🗺️ आज की विज़िट <small>${T.v.length} यूनिट</small></div>${T.v.map((x, i) => card(T, x, i)).join("")}` : "")
    + (N && (N.v || []).length ? `<div class="h">🌙 कल की विज़िट <small>${N.v.length} यूनिट — पहले से तैयारी</small></div>${N.v.map((x, i) => card(N, x, i)).join("")}` : "") }
async function vzAns(vid, i, ans) {
  const vd = DIN.V.find(x => x.id === vid); if (!vd) return; const x = (vd.v || [])[i]; if (!x) return;
  const go = async (note, ll) => { const at = now(), doc = Object.assign({ vid, em: kmEm(), u: String(x.u).slice(0, 80), ans, at, by: ME.name }, note ? { note } : {}, ll || {});
    const A = LS.get("mr_tvr", {}); A[vid + "|" + i] = { ans, at, note }; LS.set("mr_tvr", A); qSend("tvr", vid.slice(0, 50) + "_" + i + "_" + at.toString(36), doc);
    toast(ans === "mila" ? "✅ बढ़िया! विक्रम जी को पता चल गया" : ans === "nahi" ? "ठीक है — विक्रम जी को पता चल गया, मिलकर हल करेंगे" : "📍 दर्ज"); dinRedraw() };
  if (ans === "nahi") return noteSheet("⏳ क्या हुआ?", x.u, "जैसे: साहब छुट्टी पर / कल 11 बजे बुलाया", n => go(n));
  if (ans === "pahuncha" && navigator.geolocation) return navigator.geolocation.getCurrentPosition(p => go("", { lat: +p.coords.latitude.toFixed(5), lng: +p.coords.longitude.toFixed(5) }), () => go(""), { timeout: 8000, maximumAge: 120000 });
  go("") }
/* ── 💬 संदेश ── */
function vMsg() {
  const M = DIN.M.slice(-12);
  return `<div class="h">💬 विक्रम जी से बात</div><div class="msgs">${M.map(m => `<div class="mg ${m.fr === "s" ? "me" : ""} ${m.fr === "d" && isFresh("m" + m.id) ? "fl" : ""}">${m.kt ? `<small>📋 ${E(m.kt)}</small>` : ""}${E(m.t)}<em>${hm(m.at)}</em></div>`).join("") || `<div class="empty" style="padding:8px">कोई बात हो तो यहाँ लिखिए — सीधे विक्रम जी तक</div>`}</div>
   <div class="msgin"><input class="in" id="msgt" maxlength="500" placeholder="लिखिए… (क्या हुआ, क्या चाहिए)"><button class="btn" data-tk="msend">भेजें</button></div>` }
function msgSend() { const i = $("#msgt"); const t = (i && i.value || "").trim(); if (t.length < 2) return toast("कुछ लिखिए"); const at = now(), doc = { em: kmEm(), fr: "s", t, at, by: ME.name };
  DIN.M.push(Object.assign({ id: "loc" + at }, doc)); qSend("tmsg", "s" + at.toString(36) + Math.random().toString(36).slice(2, 6), doc); toast("💬 भेज दिया"); dinRedraw() }
/* ── छोटी शीट: कारण / स्थिति ── */
function noteSheet(h, sub, ph, cb) {
  const b = sheet2(`<div class="sh"><h3>${h}</h3><p class="hint">${E(sub)}</p><textarea class="in" id="kmn" rows="3" maxlength="500" placeholder="${E(ph)}"></textarea><div class="err" id="kme"></div><button class="btn big" id="kmo">भेजें</button> <button class="btn gh" id="kmx">रहने दें</button></div>`);
  const shut = () => { const w = $("#sheet2"); w && w.remove() }; b.querySelector("#kmx").onclick = shut;
  b.querySelector("#kmo").onclick = () => { const n = b.querySelector("#kmn").value.trim(); if (n.length < 3) return b.querySelector("#kme").textContent = "थोड़ा लिखिए"; shut(); cb(n) } }
/* ── पूरा घर ── */
function vDin() {
  const op = kmOpen(), V = DIN.V.find(x => x.day === kmToday()), P = DIN.P || {}, today = KM.L.filter(k => (k.st === "claim" || k.st === "done") && (k.doneAt || k.mt || 0) >= today0());
  const goal = P.goal || 100, st = P.today || 0, pct = Math.min(100, Math.round(st * 100 / goal));
  return `<div class="dhi"><div class="ring" style="--p:${pct}"><b>${st}</b><small>⭐</small></div><div><b>🙏 नमस्ते ${E(myFirst())}</b><span>आज ${V ? (V.v || []).length + " यूनिट · " : ""}${op.length} काम — समय पर सेवा, हमारी पहचान${P.streak ? ` · 🔥 ${P.streak} दिन` : ""}</span></div></div>
   ${DIN.off ? `<div class="tkrej" style="background:#e2e8f0;color:#334155">📶 नेट नहीं — पिछली बार का दिखा रहे हैं</div>` : ""}${outBar()}
   ${vVisit()}${vKaam()}${vMsg()}
   ${today.length ? `<details class="tkg"><summary><b>✅ आज किया</b><span>${today.length}</span></summary>${today.map(k => `<div class="row"><span>${E(k.t)}</span><b>⭐ ${k.stars || k.earn || ""}</b></div>`).join("")}</details>` : ""}` }
function dinRedraw() { if (DIN.host && DIN.host.isConnected) DIN.host.innerHTML = vDin(); else if (ME && ME.role === "saathi") saathiDraw() }
/* ── क्लिक (साथी के पन्ने पर) ── */
function dinClick(x) { const k = x.dataset.tk;
  if (k === "ref") return Promise.all([kaamLoad(true), dinLoad()]).then(dinRedraw);
  if (k === "msend") return msgSend();
  if (k === "vz") return vzAns(x.dataset.v, +x.dataset.i, x.dataset.a2);
  kaamAns(x.dataset.id, k, $("#kmh")) }
(() => { const st = document.createElement("style"); st.textContent = `
.dhi{display:flex;gap:12px;align-items:center;background:linear-gradient(135deg,#7a1c1c,#b45309);color:#fff;border-radius:16px;padding:12px 14px;margin:0 0 10px}.dhi b{font-size:16.5px;display:block}.dhi span{font-size:12.5px;opacity:.92}
.dhi .ring{--p:0;flex:0 0 58px;height:58px;border-radius:50%;background:conic-gradient(#ffd77a calc(var(--p)*1%),#ffffff33 0);display:grid;place-items:center;position:relative}.dhi .ring:after{content:"";position:absolute;inset:6px;border-radius:50%;background:#8b2a14}.dhi .ring b,.dhi .ring small{position:relative;z-index:1;line-height:1;text-align:center}.dhi .ring b{font-size:17px;margin-top:6px}.dhi .ring small{font-size:10px;margin-top:-14px}
.vz{background:#fff;border-radius:14px;padding:10px 12px;margin:8px 0;box-shadow:0 1px 3px #0002;border-left:5px solid #2563eb}.vz.dn{border-left-color:#15803d;opacity:.8}.vz small{display:block;color:#475569;margin:3px 0}.vzm{font-size:14px;margin:3px 0}.vzm a{text-decoration:none;margin-left:6px}
.tk2{display:flex;gap:8px;flex-wrap:wrap;font-size:12.5px;color:#64748b;margin:3px 0}.tk2 .red{color:#dc2626;font-weight:700}.tk2 .earn{color:#b45309;font-weight:700}
.msgs{display:flex;flex-direction:column;gap:6px;margin:6px 0}.mg{align-self:flex-start;max-width:84%;background:#fff;border-radius:14px 14px 14px 4px;padding:7px 10px;box-shadow:0 1px 2px #0001;font-size:14px}.mg.me{align-self:flex-end;background:#dcfce7;border-radius:14px 14px 4px 14px}.mg em{display:block;font-size:10.5px;color:#64748b;font-style:normal;text-align:right}.mg small{display:block;color:#64748b}
.msgin{display:flex;gap:6px;margin-bottom:10px}.msgin .in{flex:1;margin:0}
.fl{animation:flz 1s ease 3}@keyframes flz{0%,100%{box-shadow:0 1px 3px #0002}50%{box-shadow:0 0 0 4px #f59e0b88}}`; document.head.appendChild(st) })();
