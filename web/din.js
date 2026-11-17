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
/* 🎧 योजना-4: वेब की आवाज़ सिर्फ़ जब ऐप सामने हो — पीछे से बजे तो WebView फ़ोन का पूरा ऑडियो-फ़ोकस ले लेता (YouTube रुक जाता); पीछे की आवाज़ APK देता है */
const ktTone = () => LS.get("mr_ktone", "tick"), ktBlink = () => +LS.get("mr_kblink", 30);
function tick() { if (dinQuiet() || document.hidden) return; TICK.n++; try { (TICK.au = TICK.au || new Audio("tones/" + ktTone() + ".wav")).currentTime = 0; TICK.au.play().catch(() => 0) } catch (e) { } try { navigator.vibrate && navigator.vibrate([40, 60, 40]) } catch (e) { } }
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
  return `<div class="h">💬 विक्रम जी से बात</div><div class="msgs">${M.map(m => `<div class="tmg ${m.fr === "s" ? "me" : ""} ${m.fr === "d" && isFresh("m" + m.id) ? "fl" : ""}">${m.kt ? `<small>📋 ${E(m.kt)}</small>` : ""}${E(m.t)}<em>${hm(m.at)}</em></div>`).join("") || `<div class="empty" style="padding:8px">कोई बात हो तो यहाँ लिखिए — सीधे विक्रम जी तक</div>`}</div>
   <div class="msgin"><input class="in" id="msgt" maxlength="500" placeholder="लिखिए… (क्या हुआ, क्या चाहिए)"><button class="btn" data-tk="msend">भेजें</button></div>
   <button class="lnk" data-tk="kreq">🆕 कोई नया काम दिखा? विक्रम जी को बताएँ — वे आपके नाम कर देंगे</button>` }
function kreqSend() { noteSheet("🆕 नया काम बताएँ", "जो काम आपको फ़ील्ड में दिखा — विक्रम जी एक दबाव में उसे आपके नाम कर देंगे", "जैसे: 17 MAC में कूलर ठीक कराना है, सूबेदार साहब 98…", t => { const at = now(), doc = { em: kmEm(), fr: "s", t: "🆕 काम: " + t, at, by: ME.name };
  DIN.M.push(Object.assign({ id: "loc" + at }, doc)); qSend("tmsg", "s" + at.toString(36) + Math.random().toString(36).slice(2, 6), doc); toast("🆕 विक्रम जी को भेज दिया — शाबाश!"); dinRedraw() }) }
function msgSend() { const i = $("#msgt"); const t = (i && i.value || "").trim(); if (t.length < 2) return toast("कुछ लिखिए"); const at = now(), doc = { em: kmEm(), fr: "s", t, at, by: ME.name };
  DIN.M.push(Object.assign({ id: "loc" + at }, doc)); qSend("tmsg", "s" + at.toString(36) + Math.random().toString(36).slice(2, 6), doc); toast("💬 भेज दिया"); dinRedraw() }
/* ── छोटी शीट: कारण / स्थिति ── */
function noteSheet(h, sub, ph, cb, quick) {
  const b = sheet2(`<div class="sh"><h3>${h}</h3><p class="hint">${E(sub)}</p>${(quick || []).length ? `<div class="qr">${quick.map(q => `<button data-q="${E(q)}">${E(q)}</button>`).join("")}</div><p class="hint" style="margin:4px 0">या अपने शब्दों में:</p>` : ""}<textarea class="in" id="kmn" rows="3" maxlength="500" placeholder="${E(ph)}"></textarea><div class="err" id="kme"></div><button class="btn big" id="kmo">भेजें</button> <button class="btn gh" id="kmx">रहने दें</button></div>`);
  const shut = () => { const w = $("#sheet2"); w && w.remove() }; b.querySelector("#kmx").onclick = shut;
  b.querySelectorAll("[data-q]").forEach(q => q.onclick = () => { shut(); cb(q.dataset.q) });
  b.querySelector("#kmo").onclick = () => { const n = b.querySelector("#kmn").value.trim(); if (n.length < 3) return b.querySelector("#kme").textContent = "थोड़ा लिखिए"; shut(); cb(n) } }
/* ── पूरा घर ── */
function vDin() {
  const op = kmOpen(), V = DIN.V.find(x => x.day === kmToday()), P = DIN.P || {}, today = KM.L.filter(k => (k.st === "claim" || k.st === "done") && (k.doneAt || k.mt || 0) >= today0());
  const goal = P.goal || 100, st = P.today || 0, pct = Math.min(100, Math.round(st * 100 / goal));
  return `<div class="dhi"><div class="ring" style="--p:${pct}"><b>${st}</b><small>⭐</small></div><div><b>🙏 नमस्ते ${E(myFirst())}</b><span>आज ${V ? (V.v || []).length + " यूनिट · " : ""}${op.length} काम — समय पर सेवा, हमारी पहचान${P.streak ? ` · 🔥 ${P.streak} दिन` : ""}</span></div></div>
   ${DIN.off ? `<div class="tkrej" style="background:#e2e8f0;color:#334155">📶 नेट नहीं — पिछली बार का दिखा रहे हैं</div>` : ""}${outBar()}
   ${vSiren()}${vVisit()}${vKaam()}${vMsg()}
   ${today.length ? `<details class="tkg"><summary><b>✅ आज किया</b><span>${today.length}</span></summary>${today.map(k => `<div class="row"><span>${E(k.t)}</span><b>⭐ ${k.stars || k.earn || ""}</b></div>`).join("")}</details>` : ""}` }
/* 🚨 योजना-9 (17-11): विक्रम जी का सायरन वाला संदेश — सबसे ऊपर लाल; "✅ देख लिया" = tkh रसीद (न दबाएँ तो 3 मिनट बाद विक्रम जी के फ़ोन पर अलार्म) */
const sirAck = () => LS.get("mr_sack", []);
const sirens = () => DIN.M.filter(m => m.fr === "d" && m.ring && now() - (m.at || 0) < 12 * 3600e3 && !sirAck().includes(m.id));
function vSiren() { const L = sirens(); if (!L.length) return "";
  return L.map(m => `<div class="tkrej" style="background:#dc2626;color:#fff;padding:12px;border-radius:14px;margin:8px 0;animation:kbl 2s infinite"><b style="font-size:16px">🚨 विक्रम जी का ज़रूरी संदेश</b><div style="font-size:16px;margin:6px 0">${E(m.t)}</div><small>${hm(m.at)}</small><button class="btn big" data-tk="mack" data-id="${E(m.id)}" style="background:#fff;color:#b91c1c;margin-top:8px">✅ देख लिया</button></div>`).join("") }
async function sirAckDo(id) { LS.set("mr_sack", sirAck().concat([id]).slice(-80)); try { const P = NAT(); P && P.kAck && P.kAck({ id }) } catch (e) { }
  try { await fsSet("tkh", id + "_" + ME.uid, { m: id, uid: ME.uid, by: ME.name, at: now() }) } catch (e) { qSend("tkh", id + "_" + ME.uid, { m: id, uid: ME.uid, by: ME.name, at: now() }) }
  toast("✅ विक्रम जी को पता चल गया — आपने देख लिया"); dinRedraw() }
function dinRedraw() { if (DIN.host && DIN.host.isConnected) DIN.host.innerHTML = vDin(); else if (ME && ME.role === "saathi") saathiDraw() }
/* ── क्लिक (साथी के पन्ने पर) ── */
function dinClick(x) { const k = x.dataset.tk;
  if (k === "ref") return Promise.all([kaamLoad(true), dinLoad()]).then(dinRedraw);
  if (k === "msend") return msgSend();
  if (k === "mack") return sirAckDo(x.dataset.id);
  if (k === "kreq") return kreqSend();
  if (k === "vz") return vzAns(x.dataset.v, +x.dataset.i, x.dataset.a2);
  kaamAns(x.dataset.id, k, $("#kmh")) }
(() => { const st = document.createElement("style"); st.textContent = `
.dhi{display:flex;gap:12px;align-items:center;background:linear-gradient(135deg,#7a1c1c,#b45309);color:#fff;border-radius:16px;padding:12px 14px;margin:0 0 10px}.dhi b{font-size:16.5px;display:block}.dhi span{font-size:12.5px;opacity:.92}
.dhi .ring{--p:0;flex:0 0 58px;height:58px;border-radius:50%;background:conic-gradient(#ffd77a calc(var(--p)*1%),#ffffff33 0);display:grid;place-items:center;position:relative}.dhi .ring:after{content:"";position:absolute;inset:6px;border-radius:50%;background:#8b2a14}.dhi .ring b,.dhi .ring small{position:relative;z-index:1;line-height:1;text-align:center}.dhi .ring b{font-size:17px;margin-top:6px}.dhi .ring small{font-size:10px;margin-top:-14px}
.vz{background:#fff;border-radius:14px;padding:10px 12px;margin:8px 0;box-shadow:0 1px 3px #0002;border-left:5px solid #2563eb}.vz.dn{border-left-color:#15803d;opacity:.8}.vz small{display:block;color:#475569;margin:3px 0}.vzm{font-size:14px;margin:3px 0}.vzm a{text-decoration:none;margin-left:6px}
.tk2{display:flex;gap:8px;flex-wrap:wrap;font-size:12.5px;color:#64748b;margin:3px 0}.tk2 .red{color:#dc2626;font-weight:700}.tk2 .earn{color:#b45309;font-weight:700}
.msgs{display:flex;flex-direction:column;gap:6px;margin:6px 0}.tmg{align-self:flex-start;max-width:84%;background:#fff;border-radius:14px 14px 14px 4px;padding:7px 10px;box-shadow:0 1px 2px #0001;font-size:14px}.tmg.me{align-self:flex-end;background:#dcfce7;border-radius:14px 14px 4px 14px}.tmg em{display:block;font-size:10.5px;color:#64748b;font-style:normal;text-align:right}.tmg small{display:block;color:#64748b}
.msgin{display:flex;gap:6px;margin-bottom:10px}.msgin .in{flex:1;margin:0}
.fl{animation:flz 1s ease 3}@keyframes flz{0%,100%{box-shadow:0 1px 3px #0002}50%{box-shadow:0 0 0 4px #f59e0b88}}`; document.head.appendChild(st) })();
/* ⭐ मेरा हाल (योजना-3 चरण D) — सब VBE के गिने (tprof): आज/लक्ष्य छल्ला, लेवल, 7 दिन, बिल्ले, रैंक (ऊपर के 3 + मेरा स्थान), टिप, मैंने क्या किया।
   स्टार सिर्फ़ जुड़ते दिखते हैं; नीचे वालों के नाम किसी को नहीं। */
function vHaal() {
  const P = DIN.P; if (!P) return `<div class="empty">⭐ पहला काम पूरा कीजिए — पहला स्टार आपका!<br><small>विक्रम जी का ऐप जुड़ते ही यहाँ आपका पूरा हाल दिखेगा</small></div>`;
  const pct = Math.min(100, Math.round((P.today || 0) * 100 / (P.goal || 100))), L = P.level || {}, W = P.week || [], mx = Math.max(10, ...W.map(x => x.s || 0)), R = P.rank || {}, M = ["🥇", "🥈", "🥉"], dn = P.done30 || [], ot = P.ontime || {};
  const day = d => ["रवि", "सोम", "मंगल", "बुध", "गुरु", "शुक्र", "शनि"][new Date(d + "T00:00").getDay()];
  return `<div class="hl1"><div class="ring big" style="--p:${pct}"><b>${P.today || 0}</b><small>आज ⭐ / ${P.goal || 100}</small></div>
    <div><b>${E(myFirst())} जी</b><span>${L.ic || "🌱"} ${E(L.n || "शुरुआत")} · कुल ⭐ ${P.tot || 0}</span>${P.streak ? `<span>🔥 ${P.streak} दिन लगातार</span>` : ""}
    ${L.next ? `<div class="lvb"><i style="width:${L.pc || 0}%"></i></div><small>${E(L.nn || "")} तक ${L.next} ⭐ और</small>` : ""}</div></div>
   ${P.reward ? `<div class="rwd">🏆 इस हफ़्ते का इनाम: <b>${E(P.reward)}</b></div>` : ""}<div class="tip">💡 ${E(P.tip || "")}</div>
   <div class="h">📅 पिछले 7 दिन</div><div class="hbars">${W.map(x => `<div><i style="height:${Math.round((x.s || 0) * 100 / mx)}%"></i><b>${x.s || ""}</b><small>${day(x.d)}</small></div>`).join("")}</div>
   <div class="sum"><div><b>${ot.n ? Math.round(ot.d * 100 / ot.n) + "%" : "—"}</b><small>⏱ समय पर (हफ़्ता)</small></div><div><b>${dn.length}</b><small>✅ 30 दिन में</small></div><div><b>${P.open || 0}</b><small>📋 खुले</small></div></div>
   ${(P.badges || []).length ? `<div class="chips" style="margin:6px 0">${P.badges.map(b => `<span class="bdg">${E(b)}</span>`).join("")}</div>` : ""}
   <div class="h">🏆 हफ़्ते की टीम</div><div class="rk">${(R.top || []).map((r, i) => `<div class="${r.n === ME.name ? "me" : ""}">${M[i]} <b>${E(r.n)}</b><span>⭐ ${r.s}</span></div>`).join("") || `<div class="empty" style="padding:6px">इस हफ़्ते अभी कोई नहीं — पहले आप!</div>`}
   ${R.pos > 3 ? `<div class="me">#${R.pos} <b>आप</b><span>#${R.pos - 1} से सिर्फ़ ${R.gap} ⭐ दूर</span></div>` : !R.pos ? `<div class="me">🌱 <b>आप</b><span>3 काम पूरे होते ही रैंक में</span></div>` : ""}</div>
   ${dn.length ? `<details class="tkg"><summary><b>✅ मैंने किया (30 दिन)</b><span>${dn.length}</span></summary>${dn.map(x => `<div class="row"><span>${E(x.t)}<small> ${x.unit ? "🏢 " + E(x.unit) + " · " : ""}${new Date(x.doneAt).toLocaleDateString("hi-IN", { day: "numeric", month: "short" })}</small></span><b>⭐ ${x.stars}</b></div>`).join("")}</details>` : ""}` }
async function haalSheet() { const b = sheet(`<div id="hlh" class="empty">⏳…</div>`); await dinLoad(); const h = $("#hlh", b); h.className = ""; h.innerHTML = vHaal() }
function burstStars(n) { try { const w = document.createElement("div"); w.className = "brst"; w.innerHTML = Array.from({ length: 14 }, (_, i) => `<i style="--a:${i * 26}deg;--d:${60 + (i % 4) * 22}px">⭐</i>`).join("") + (n ? `<b>+${n}</b>` : ""); document.body.appendChild(w); setTimeout(() => w.remove(), 1400) } catch (e) { } }
(() => { const st = document.createElement("style"); st.textContent = `
.hl1{display:flex;gap:14px;align-items:center;background:#fff;border-radius:16px;padding:12px;box-shadow:0 1px 3px #0002}.hl1>div:last-child{flex:1;min-width:0}.hl1 b{font-size:17px;display:block}.hl1 span{display:block;font-size:13px;color:#475569}.hl1 small{font-size:11.5px;color:#64748b}
.ring.big{--p:0;flex:0 0 92px;height:92px;border-radius:50%;background:conic-gradient(#d97706 calc(var(--p)*1%),#fde68a55 0);display:grid;place-items:center;position:relative;align-content:center}.ring.big:after{content:"";position:absolute;inset:9px;border-radius:50%;background:#fff}.ring.big b,.ring.big small{position:relative;z-index:1;text-align:center}.ring.big b{font-size:26px;color:#7a1c1c;line-height:1}.ring.big small{font-size:10px;color:#64748b}
.lvb{height:7px;background:#f1f5f9;border-radius:9px;margin:6px 0 2px;overflow:hidden}.lvb i{display:block;height:100%;background:linear-gradient(90deg,#f59e0b,#b45309);border-radius:9px}
.rwd{background:linear-gradient(135deg,#7f1d1d,#b45309);color:#fde68a;border-radius:12px;padding:9px 12px;margin:8px 0;font-size:14px}.rwd b{color:#fff}
.qr{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:6px 0}.qr button{padding:10px 6px;border-radius:12px;background:#f1f5f9;border:1px solid #e2e8f0;font-weight:600;font-size:13.5px}
.kst{margin:5px 0 3px}.kstb{height:6px;border-radius:5px;background:#e5e7eb;overflow:hidden}.kstb i{display:block;height:100%;background:linear-gradient(90deg,#16a34a,#86efac)}.kst small{display:block;font-size:12px;color:#64748b;margin-top:3px}
.tip{background:#fffbeb;color:#92400e;border-radius:12px;padding:8px 11px;margin:8px 0;font-weight:600;font-size:14px}
.hbars{display:grid;grid-template-columns:repeat(7,1fr);gap:6px;height:96px;align-items:end;background:#fff;border-radius:14px;padding:8px}.hbars div{display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%}.hbars i{display:block;width:70%;min-height:3px;background:linear-gradient(#f59e0b,#b45309);border-radius:5px 5px 2px 2px}.hbars b{font-size:10.5px;color:#7a1c1c}.hbars small{font-size:10.5px;color:#64748b}
.bdg{background:#fef3c7!important;color:#92400e!important;font-weight:700}
.rk{background:#fff;border-radius:14px;padding:4px 10px}.rk div{display:flex;gap:8px;align-items:center;padding:7px 0;border-bottom:1px solid #f1f5f9}.rk div:last-child{border:0}.rk b{flex:1}.rk span{color:#b45309;font-weight:700;font-size:13px}.rk .me{background:#fef3c7;margin:0 -10px;padding:7px 10px;border-radius:10px}
.brst{position:fixed;left:50%;top:45%;z-index:60;pointer-events:none}.brst i{position:absolute;font-style:normal;font-size:20px;animation:bst 1.2s ease-out forwards;transform:rotate(var(--a)) translateY(0)}.brst b{position:absolute;transform:translate(-50%,-50%);font-size:26px;color:#b45309;animation:bsb 1.2s ease-out forwards}
@keyframes bst{to{transform:rotate(var(--a)) translateY(calc(var(--d)*-1));opacity:0}}@keyframes bsb{0%{opacity:0;transform:translate(-50%,-50%) scale(.6)}30%{opacity:1;transform:translate(-50%,-80%) scale(1.2)}100%{opacity:0;transform:translate(-50%,-140%)}}`; document.head.appendChild(st) })();

/* 🎵 काम की धुन + 🔁 हर N मिनट याद (योजना-4, विक्रम जी: "उनके पास ऑप्शन हो कौन सी ट्यून रखें" · "संदेश थोड़ी देर में ब्लिंक हो") */
function ktSheet() { const KT = ["tick"].concat(Array.from({ length: 20 }, (_, i) => "t" + (i + 1))), nm = t => t === "tick" ? "टिक (छोटी)" : (typeof TONES !== "undefined" && TONES[+t.slice(1)]) || t;
  let T = ktTone(), B = ktBlink();
  const b = sheet(`<h3>🎵 काम की धुन और याद</h3><p class="hint">नया काम या याद आने पर यही धुन बजेगी (फ़ोन साइलेंट हो तो सिर्फ़ कंपन)। YouTube/रील चल रही हो तो वह <b>बस थोड़ी धीमी</b> होगी, रुकेगी नहीं।</p>
  <div class="tgrid" id="ktg">${KT.map(t => `<button data-kt="${t}" class="${T === t ? "on" : ""}">▶ ${E(nm(t))}</button>`).join("")}</div>
  <div class="h" style="margin-top:12px">🔁 खुले काम हों तो हर कितनी देर याद दिलाए</div>
  <div class="seg" id="kbs">${[[15, "15 मिनट"], [30, "30 मिनट"], [60, "1 घंटा"], [0, "बंद"]].map(([v, l]) => `<button data-kb="${v}" class="${B === v ? "on" : ""}">${l}</button>`).join("")}</div>
  <p class="hint">सुबह 7 से रात 9 तक ही — ऊपर से सूचना उतरेगी, बत्ती चमकेगी, धुन एक बार।</p>
  <div class="h" style="margin-top:12px">🫧 हर ऐप के ऊपर काम का बबल</div><p class="hint">गोले में आपके बाकी काम की गिनती — दबाओ तो सूची। पहली बार "दूसरे ऐप के ऊपर दिखाएँ" की अनुमति दें।</p>
  <div class="seg"><button id="kbon" style="flex:1">🫧 चालू</button><button id="kboff" style="flex:1">बंद</button></div>
  <button class="btn big" id="ksv">✅ सहेजें</button>`);
  b.onclick = e => { const t = e.target.closest("[data-kt],[data-kb],#ksv,#kbon,#kboff"); if (!t) return;
    if (t.id === "kbon" || t.id === "kboff") { const P = NAT(); if (!P || !P.bubble) return toast("नई APK डालें — तभी बबल"); P.bubble({ on: t.id === "kbon", ask: true }).then(r => toast(r.on ? (r.can ? "🫧 बबल चालू ✓ (1 मिनट में दिखेगा)" : "अनुमति दें: VBE मारवाड़ → दूसरे ऐप के ऊपर ✓") : "बबल बंद")).catch(() => 0); return }
    if (t.dataset.kt) { T = t.dataset.kt; try { (TICK.pv = TICK.pv || new Audio()).src = "tones/" + T + ".wav"; TICK.pv.play().catch(() => 0) } catch (x) { } return $$("#ktg button", b).forEach(x => x.classList.toggle("on", x === t)) }
    if (t.dataset.kb != null) { B = +t.dataset.kb; return $$("#kbs button", b).forEach(x => x.classList.toggle("on", x === t)) }
    LS.set("mr_ktone", T); LS.set("mr_kblink", B); toast("✔ धुन: " + nm(T) + " · याद: " + (B ? "हर " + B + " मिनट" : "बंद")); closeSheet(); try { native() } catch (x) { } } }
(() => { const st = document.createElement("style"); st.textContent = `.tk.urg:not(.dn),.tk.late:not(.dn){animation:kbl 9s ease-in-out infinite}@keyframes kbl{0%,86%,100%{box-shadow:0 1px 3px #0002}90%,96%{box-shadow:0 0 0 4px #ef444466}}`; document.head.appendChild(st) })();
