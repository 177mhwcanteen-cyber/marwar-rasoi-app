/* 🤝 साथी — खाते, घंटी, साथी का ऐप (योजना-3 चरण A, 16-11-2026; vikram7charan-del/vbe-block-timer → docs/योजना-3-एक-टीम-ऐप.md)
   • डायरेक्टर खुद खाता बनाए: नाम + मोबाइल + भूमिका → ऐप 6 अंक का पिन बनाए → WhatsApp पर भेजें (पिन कहीं सहेजा नहीं जाता)।
   • hello/{sha256("mrh|"+मोबाइल)} = {n, e?} → लॉगिन में नंबर डालते ही "🙏 नमस्ते कैलाश भाई"; e = पिन बदला हो तो नया लॉगिन-पता।
   • घंटी (staff.ring): all = हर ऑर्डर/पुकार (मैनेजर) · call = सिर्फ़ टेबल की पुकार 💧🙋🧾 (वेटर) · none (वाइस शेफ, साथी)। डायरेक्टर: all, 180 से. बाद।
   • साथी (role saathi): 4 टैब — 🏠 मेरा दिन · ➕ ऑर्डर लें · ⭐ मेरा हाल · ☰ और। ऑर्डर/टेबल/स्टोर/गल्ला नहीं। */
const TEAM_NAMES = ["कैलाश भाई", "मनोज भाई", "दिनेश जी", "स्वरूप जी", "रविंद्र जी", "मुकेश भाई", "नरपत भाई", "गणेश भाई"];
const RING_DEF = { owner: "all", manager: "all", waiter: "call" };
const ringKind = () => !ME ? "none" : (ME.ring || RING_DEF[ME.role] || "none");
const ringOK = o => { const k = ringKind(); return k === "all" || (k === "call" && o.kind === "call" && ["water", "waiter", "bill"].includes(o.call)) };
const MENU_PDF_URL = "https://177mhwcanteen-cyber.github.io/177-MH-/order/marwar-rasoi-menu.pdf";
const helloKey = ph => sha256("mrh|" + String(ph).replace(/\D/g, "").slice(-10));
async function helloGet(ph) { if (!FS_ON) return LS.get("mr_hello", {})[String(ph).slice(-10)] || null; try { return await fsGet("hello", await helloKey(ph)) } catch (e) { return null } }
async function helloSet(ph, o) { if (!FS_ON) { const h = LS.get("mr_hello", {}); h[String(ph).slice(-10)] = o; return LS.set("mr_hello", h) } return fsSet("hello", await helloKey(ph), o) }
const newPin = () => { const a = new Uint32Array(1); crypto.getRandomValues(a); return String(100000 + (a[0] % 900000)) };
/* नए साथी का Firebase खाता — डायरेक्टर का अपना लॉगिन नहीं छेड़ता (जवाब का टोकन फेंक देते हैं) */
async function mkAcct(email, pin) {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FB.apiKey}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: pin, returnSecureToken: true }) });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error((j.error || {}).message || "नहीं बना"); return j.localId }
const pinMsg = (n, ph, pin) => `🙏 ${n}, यह हमारी टीम का ऐप है — मारवाड़ रसोई।\nइसमें आपके काम, रास्ता और स्टार आएँगे — ताकि हर यूनिट तक समय पर सेवा पहुँचे।\n\n1) ऐप डालें: ${CFG.base ? "https://github.com/177mhwcanteen-cyber/marwar-rasoi-app/releases/latest/download/marwar-rasoi.apk" : ""}\n2) मोबाइल नंबर: ${ph}\n3) पिन: ${pin}\n\nएक बार लॉगिन के बाद दोबारा नहीं माँगेगा।\n— विक्रम`;
function pinSheet(n, ph, pin) {
  const b = sheet(`<h3>✅ ${E(n)} जुड़ गए</h3><p class="hint">यह पिन अभी WhatsApp पर भेज दीजिए — ऐप इसे कहीं नहीं रखता।</p>
   <div class="kot"><div>📱 मोबाइल<span><b>${E(ph)}</b></span></div><div>🔑 पिन<span><b id="pinv" style="font-size:22px;letter-spacing:3px">${E(pin)}</b></span></div></div>
   <a class="btn ok big" id="pinwa" href="https://wa.me/91${E(ph)}?text=${encodeURIComponent(pinMsg(n, ph, pin))}" target="_blank" rel="noopener">💬 WhatsApp पर भेजें</a>`);
  return b }
/* ➕ नया साथी (डायरेक्टर, 👥 खाते-मंज़ूरी शीट के ऊपर) */
function mateForm() {
  return `<details class="tkg" id="mtf"><summary><b>➕ नया साथी जोड़ें</b><span>पिन ऐप बनाएगा</span></summary>
   <input class="in" id="mtn" list="mtnl" placeholder="नाम (जैसे: कैलाश भाई)"><datalist id="mtnl">${TEAM_NAMES.map(n => `<option value="${E(n)}">`).join("")}</datalist>
   <input class="in" id="mtp" inputmode="numeric" maxlength="10" placeholder="मोबाइल नंबर (10 अंक) — इसी से लॉगिन">
   <div class="seg" id="mtr">${[["saathi", "साथी (काम)"], ["manager", "मैनेजर"], ["waiter", "वेटर"], ["kitchen", "वाइस शेफ"]].map(([r, l], i) => `<button data-mr="${r}" class="${i ? "" : "on"}">${l}</button>`).join("")}</div>
   <div class="err" id="mte"></div><button class="btn big" id="mtgo">✅ खाता बनाएँ</button></details>` }
async function mateCreate(b, after) {
  const n = $("#mtn", b).value.trim(), ph = $("#mtp", b).value.replace(/\D/g, ""), role = ($("#mtr .on", b) || {}).dataset.mr || "saathi", er = t => $("#mte", b).textContent = t;
  if (n.length < 2) return er("नाम लिखें"); if (ph.length !== 10) return er("मोबाइल 10 अंक का"); const bt = $("#mtgo", b); bt.disabled = true; bt.textContent = "⏳ बना रहे हैं…";
  const pin = newPin(), em = ph + "@marwar-rasoi.app";
  try { let uid;
    if (DB.mode === "fs") uid = await mkAcct(em, pin); else uid = "d" + ph;
    const st = { name: n, phone: ph, role, em, ts: now(), by: "dir" }; if (RING_DEF[role]) st.ring = RING_DEF[role];
    if (DB.mode === "fs") await fsSet("staff", uid, st); else { const L = LS.get("mr_demo_staff", []); L.push(Object.assign({ id: uid }, st)); LS.set("mr_demo_staff", L) }
    await helloSet(ph, { n, e: em }); after && after(); pinSheet(n, ph, pin);
  } catch (e) { bt.disabled = false; bt.textContent = "✅ खाता बनाएँ"; er(/EMAIL_EXISTS/.test(e.message) ? "इस नंबर का खाता पहले से है — नीचे सूची में भूमिका बदलें, या 🔁 नया पिन दें" : "नहीं बना — " + AERR(e.message)) }
}
/* 🔁 नया पिन (साथी भूल गया): नया लॉगिन-पता <मोबाइल>.k@…, पुराना खाता "off" (मिटता नहीं), hello.e नया */
async function mateRepin(u, after) {
  const ph = String(u.phone || "").replace(/\D/g, "").slice(-10); if (ph.length !== 10) return toast("इस खाते में मोबाइल नहीं");
  const pin = newPin(); let em = "", uid = "";
  for (let k = 2; k < 12 && !uid; k++) { em = ph + "." + k + "@marwar-rasoi.app"; try { uid = await mkAcct(em, pin) } catch (e) { if (!/EMAIL_EXISTS/.test(e.message)) return toast("नहीं हुआ — " + AERR(e.message)) } }
  if (!uid) return toast("नहीं हुआ");
  const st = { name: u.name, phone: ph, role: u.role === "off" ? "saathi" : u.role, em, ts: now(), by: "dir", prev: u.id }; if (u.ring) st.ring = u.ring;
  await fsSet("staff", uid, st); await fs("PATCH", `/staff/${u.id}?updateMask.fieldPaths=role&updateMask.fieldPaths=moved`, { fields: encF({ role: "off", moved: uid }) });
  await helloSet(ph, { n: u.name, e: em }); after && after(); pinSheet(u.name, ph, pin);
}
/* 🔑 अपना पिन बदलें (हर कोई) */
function pinChange() {
  const b = sheet(`<h3>🔑 अपना पिन बदलें</h3><input class="in big" id="pn1" type="password" inputmode="numeric" placeholder="नया पिन (6 अंक)"><input class="in big" id="pn2" type="password" inputmode="numeric" placeholder="फिर से वही पिन"><div class="err" id="pne"></div><button class="btn big" id="pngo">बदलें</button>`);
  $("#pngo", b).onclick = async () => { const a = $("#pn1", b).value, c = $("#pn2", b).value, er = t => $("#pne", b).textContent = t;
    if (!/^\d{6,}$/.test(a)) return er("पिन कम से कम 6 अंक"); if (a !== c) return er("दोनों पिन एक जैसे नहीं");
    try { if (DB.mode === "fs") { const j = await AUTH.idt("update", { password: a, returnSecureToken: true }); AUTH.save(j) } closeSheet(); toast("✅ पिन बदल गया — अगली बार यही डालें") } catch (e) { er("नहीं बदला — " + AERR(e.message)) } } }
/* ───── साथी का ऐप: 4 टैब ───── */
function saathiHome() {
  const tb = $("#tabs"); if (!tb.dataset.sa) { tb.dataset.sa = 1; tb.innerHTML = [["din", "🏠", "मेरा दिन"], ["take", "➕", "ऑर्डर लें"], ["haal", "⭐", "मेरा हाल"], ["more", "☰", "और"]].map(([t, i, l]) => `<button data-t="${t}"><span>${i}</span>${l}</button>`).join("") }
  tb.style.display = ""; if (!["din", "take", "haal", "more"].includes(TAB)) TAB = "din";
  DIN.host = null; const pull = () => Promise.all([kaamLoad(true), dinLoad()]).then(() => { if (TAB === "din" && !$("#sheet.open") && !$("#sheet2") && !(document.activeElement && document.activeElement.id === "msgt")) { saathiDraw(); dinSeen() } }).catch(() => 0);
  pull(); clearInterval(KM.iv); KM.iv = setInterval(pull, 30000); flushOut();
  const pg = $("#pg"); if (!pg.dataset.km) { pg.dataset.km = 1; pg.addEventListener("click", e => { const x = e.target.closest("[data-tk]"); if (!x || !ME || ME.role !== "saathi") return; e.stopPropagation(); dinClick(x) }, true) }
  saathiDraw() }
function saathiDraw() {
  $("#me").textContent = "👤 " + ME.name; $$("#tabs button").forEach(b => b.classList.toggle("on", b.dataset.t === TAB)); const pg = $("#pg");
  pg.innerHTML = TAB === "take" ? `<a class="btn gh sm" href="${MENU_PDF_URL}" target="_blank" rel="noopener" style="margin:0 6px 8px 0">📄 मेन्यू PDF</a><a class="btn gh sm" href="https://wa.me/?text=${encodeURIComponent("🍽️ मारवाड़ रसोई का मेन्यू: " + MENU_PDF_URL + "\nघर बैठे ऑर्डर: " + (CFG.homeUrl || ""))}" target="_blank" rel="noopener">📤 मेन्यू भेजें</a>${vTake()}${sMine()}`
    : TAB === "haal" ? (typeof vHaal === "function" ? vHaal() : `<div class="empty">⭐ आपका हाल जल्द यहाँ</div>`)
    : TAB === "more" ? `<div class="mme"><b>👤 ${E(ME.name)}</b><span>हमारी टीम</span><button class="row" data-a="upd" id="updrow">🔄 ऐप अपडेट जाँचें · वर्ज़न ${window.MR_BUILD}</button></div><div class="mtg">${tl("pin", "🔑", "पिन बदलें")}${tl("psetup", "📲", "फोन की तैयारी")}${tl("logout", "🚪", "लॉगआउट")}</div>`
    : `<div id="kmh">${typeof vDin === "function" ? vDin() : vKaam()}</div>`;
  if (TAB === "take") menuUI($("#menu"), TAKE.cart, bar, { pop: typeof popCount === "function" ? popCount : null });
  bar(); updShow() }
/* साथी के भेजे ऑर्डर (id से पढ़ते हैं — सूची की इजाज़त नहीं) */
const SMINE = { L: [] };
function sMine() { const ids = LS.get("mr_my_orders", []).filter(x => x.ts > today0()); if (!ids.length) return "";
  if (!SMINE.t || now() - SMINE.t > 15000) { SMINE.t = now(); Promise.all(ids.map(x => DB.mode === "fs" ? fsGet("orders", x.id).catch(() => null) : Promise.resolve((DB.all() || []).find(o => o.id === x.id)))).then(a => { SMINE.L = a.filter(Boolean); if (TAB === "take" && ME.role === "saathi" && !$("#sheet.open")) { const h = $("#smine"); h && (h.outerHTML = sMine()) } }) }
  return `<div id="smine"><div class="h">🧾 आज मेरे भेजे ऑर्डर</div>${SMINE.L.map(o => `<div class="row"><span>${E(where(o))} · ${rs(o.total)}<small> ${hm(o.ts)}</small></span><b style="color:${(ST[o.status] || {}).c || "#475569"}">${E((ST[o.status] || {}).hi || o.status)}</b></div>`).join("") || `<div class="empty">⏳ …</div>`}</div>` }
