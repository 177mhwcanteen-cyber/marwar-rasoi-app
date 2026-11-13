/* मारवाड़ रसोई — साझा हिस्सा (मैनेजर/वेटर ऐप index.html और टेबल-पेज t/ दोनों में)
   DB = डेटा की परत: अभी "local" (इसी ब्राउज़र में), Firebase की config आते ही "fs" — बाकी कोड वही रहता है। */
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const E = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const LS = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v) } catch (e) { return d } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)) } catch (e) { } } };
const CFG = window.MR_CONFIG || {};
const now = () => Date.now();
const rs = n => "₹" + Math.round(n || 0);
const hm = ts => new Date(ts).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
const mins = ts => Math.floor((now() - ts) / 60000);
const today0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return +d };
const ROOT = (document.currentScript && document.currentScript.dataset.root) || "";

/* ऑर्डर की हालत — एक ही क्रम हर जगह */
const FLOW = ["new", "acc", "cook", "out", "done"];
const ST = {
  new: { hi: "नया", en: "Placed", c: "#b91c1c" }, acc: { hi: "स्वीकार", en: "Accepted", c: "#b45309" }, cook: { hi: "बन रहा है", en: "Cooking", c: "#a16207" },
  out: { hi: "परोसा / निकला", en: "Served", c: "#15803d" }, done: { hi: "पूरा", en: "Completed", c: "#475569" }, rej: { hi: "मना", en: "Cancelled", c: "#64748b" }
};
const CALLS = { water: { ic: "💧", hi: "पानी", en: "Water" }, waiter: { ic: "🙋", hi: "वेटर बुलाया", en: "Call waiter" }, bill: { ic: "🧾", hi: "बिल माँगा", en: "Bill please" }, store: { ic: "📦", hi: "रसोई ने सामान माँगा", en: "Store request" }, msg: { ic: "📣", hi: "मालिक का संदेश", en: "Message" } };
const where = o => o.type === "table" ? "🍽️ टेबल " + o.table : o.type === "parcel" ? "🥡 पार्सल" : "🛵 डिलीवरी";

/* ───────── Firestore (REST, बिना SDK — हल्का) + लॉगिन (मोबाइल नंबर + पिन → Firebase Email/Password) ───────── */
const FB = CFG.firebase || {}, FS_ON = !!FB.projectId;
const FSB = `https://firestore.googleapis.com/v1/projects/${FB.projectId}/databases/(default)/documents`;
const enc = v => v === null || v === undefined ? { nullValue: null } : typeof v === "boolean" ? { booleanValue: v } : typeof v === "number" ? (Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v })
  : typeof v === "string" ? { stringValue: v } : Array.isArray(v) ? { arrayValue: { values: v.map(enc) } } : { mapValue: { fields: encF(v) } };
const encF = o => Object.fromEntries(Object.keys(o).filter(k => o[k] !== undefined).map(k => [k, enc(o[k])]));
const dec = v => "stringValue" in v ? v.stringValue : "integerValue" in v ? +v.integerValue : "doubleValue" in v ? v.doubleValue : "booleanValue" in v ? v.booleanValue
  : "arrayValue" in v ? (v.arrayValue.values || []).map(dec) : "mapValue" in v ? decF(v.mapValue.fields || {}) : null;
const decF = f => Object.fromEntries(Object.keys(f || {}).map(k => [k, dec(f[k])]));
const docOf = d => Object.assign(decF(d.fields), { id: d.name.slice(d.name.lastIndexOf("/") + 1) });
const mail = ph => String(ph).replace(/\D/g, "").slice(-10) + "@marwar-rasoi.app";
const AUTH = {
  u: LS.get("mr_auth", null),
  save(r, ph) { this.u = { rt: r.refreshToken || r.refresh_token, idt: r.idToken || r.id_token, uid: r.localId || r.user_id, exp: now() + (+(r.expiresIn || r.expires_in || 3600)) * 1000, ph: ph || (this.u || {}).ph }; LS.set("mr_auth", this.u) },
  async call(what, ph, pin) {
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:${what}?key=${FB.apiKey}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: mail(ph), password: pin, returnSecureToken: true }) });
    const j = await r.json(); if (!r.ok) throw new Error((j.error || {}).message || "लॉगिन नहीं हुआ"); this.save(j, String(ph).replace(/\D/g, "").slice(-10)); return this.u
  },
  signIn(ph, pin) { return this.call("signInWithPassword", ph, pin) }, signUp(ph, pin) { return this.call("signUp", ph, pin) },
  async tok() {
    if (!this.u) return ""; if (now() < this.u.exp - 60000) return this.u.idt;
    const r = await fetch(`https://securetoken.googleapis.com/v1/token?key=${FB.apiKey}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=refresh_token&refresh_token=" + encodeURIComponent(this.u.rt) });
    if (!r.ok) { if (r.status === 400) this.out(); return "" } this.save(await r.json()); return this.u.idt
  },
  out() { this.u = null; try { localStorage.removeItem("mr_auth") } catch (e) { } }
};
async function fs(method, path, body) {
  const t = await AUTH.tok(), r = await fetch(FSB + path, { method, headers: Object.assign({ "Content-Type": "application/json" }, t ? { Authorization: "Bearer " + t } : {}), body: body ? JSON.stringify(body) : undefined });
  if (r.status === 404) return null; const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(((j[0] || j).error || {}).message || "HTTP " + r.status); e.code = r.status; throw e } return j
}
const fsGet = async (col, id) => { const d = await fs("GET", `/${col}/${id}`); return d ? docOf(d) : null };
const fsSet = (col, id, o) => fs("PATCH", `/${col}/${id}`, { fields: encF(o) });
const fsQuery = async q => ((await fs("POST", ":runQuery", { structuredQuery: q })) || []).filter(x => x.document).map(x => docOf(x.document));

/* DB — दो रूप, एक ही चेहरा: all() · on(f) · start({staff|ids}) · add(o) · upd(id, patch, by) */
const newId = () => "o" + now().toString(36) + Math.random().toString(36).slice(2, 8);
const DB = FS_ON ? (() => {
  let cache = [], subs = [], opt = null, timer = null, busy = false;
  const fire = () => subs.forEach(f => { try { f(cache) } catch (e) { console.error(e) } });
  const poll = async () => {
    if (!opt || busy) return; busy = true;
    try {
      if (opt.staff) cache = await fsQuery({ from: [{ collectionId: "orders" }], where: { fieldFilter: { field: { fieldPath: "ts" }, op: "GREATER_THAN_OR_EQUAL", value: { integerValue: String(today0()) } } }, orderBy: [{ field: { fieldPath: "ts" } }], limit: 600 });
      else { const ids = opt.ids().slice(-12), got = await Promise.all(ids.map(id => fsGet("orders", id).catch(() => cache.find(o => o.id === id) || null))); cache = got.filter(Boolean) }
      DB.err = ""; fire()
    } catch (e) { DB.err = e.message; fire() } busy = false
  };
  return {
    mode: "fs", err: "", all: () => cache, on(f) { subs.push(f); f(cache) }, poll,
    start(o) { opt = o; clearInterval(timer); poll(); timer = setInterval(() => { if (!document.hidden) poll() }, o.staff ? 5000 : 7000); document.addEventListener("visibilitychange", () => { if (!document.hidden) poll() }) },
    async add(o) { o.ts = now(); o.status = o.status || "new"; o.log = [{ s: o.status, ts: o.ts, by: o.by || "" }]; const id = newId(), d = Object.assign({}, o); await fs("POST", `/orders?documentId=${id}`, { fields: encF(d) }); o.id = id; cache = cache.concat([o]); fire(); return o },
    async upd(id, p, by) { const o = cache.find(x => x.id === id); if (!o) return null; const old = Object.assign({}, o); Object.assign(o, p); if (p.status) o.log = (o.log || []).concat([{ s: p.status, ts: now(), by: by || "" }]); fire();
      const f = Object.assign({}, p, p.status ? { log: o.log } : {}); try { await fs("PATCH", `/orders/${id}?` + Object.keys(f).map(k => "updateMask.fieldPaths=" + k).join("&"), { fields: encF(f) }) } catch (e) { Object.assign(o, old); fire(); throw e } return o }
  };
})() : (() => {
  const K = "mr_orders"; let subs = [];
  const ch = ("BroadcastChannel" in window) ? new BroadcastChannel("mr") : null;
  const all = () => LS.get(K, []);
  const fire = () => { const a = all(); subs.forEach(f => { try { f(a) } catch (e) { console.error(e) } }) };
  const save = a => { LS.set(K, a); ch && ch.postMessage(1); fire() };
  if (ch) ch.onmessage = fire;
  addEventListener("storage", e => { if (e.key === K) fire() });
  return {
    mode: "local", err: "", all, on(f) { subs.push(f); f(all()) }, start() { }, poll() { },
    async add(o) { const a = all(); o.id = newId(); o.ts = now(); o.status = o.status || "new"; o.log = [{ s: o.status, ts: o.ts, by: o.by || "" }]; a.push(o); save(a); return o },
    async upd(id, p, by) { const a = all(), o = a.find(x => x.id === id); if (!o) return null; Object.assign(o, p); if (p.status) (o.log = o.log || []).push({ s: p.status, ts: now(), by: by || "" }); save(a); return o }
  };
})();
/* सामान्य संग्रह (stock, sitems, assets, checks, conf): डेमो में इसी फोन में, असली मोड में Firestore। list() · add(o) · set(id, खाने) */
const COL = name => FS_ON ? {
  list: () => fsQuery({ from: [{ collectionId: name }], limit: 3000 }),
  async add(o) { const id = newId(); o.ts = o.ts || now(); await fs("POST", `/${name}?documentId=${id}`, { fields: encF(o) }); return Object.assign(o, { id }) },
  async set(id, o) { await fs("PATCH", `/${name}/${id}?` + Object.keys(o).map(k => "updateMask.fieldPaths=" + k).join("&"), { fields: encF(o) }); return o }
} : {
  async list() { return LS.get("mr_c_" + name, []) },
  async add(o) { const a = LS.get("mr_c_" + name, []); o.id = newId(); o.ts = o.ts || now(); a.push(o); LS.set("mr_c_" + name, a); return o },
  async set(id, o) { const a = LS.get("mr_c_" + name, []); let x = a.find(v => v.id === id); if (!x) { x = { id }; a.push(x) } Object.assign(x, o); LS.set("mr_c_" + name, a); return x }
};
const dkey = (t = now()) => { const d = new Date(t); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0") };
const qf = n => (Math.round(n * 1000) / 1000).toLocaleString("en-IN");
/* 📷 फोटो ≤20 KB (प्रॉपर्टी/पर्ची) */
const shrink = file => new Promise((res, rej) => { const im = new Image(); im.onload = () => { let w = 480, q = .7, out = ""; for (let k = 0; k < 8; k++) { const c = document.createElement("canvas"), r = Math.min(1, w / Math.max(im.width, im.height)); c.width = im.width * r; c.height = im.height * r; c.getContext("2d").drawImage(im, 0, 0, c.width, c.height); out = c.toDataURL("image/jpeg", q); if (out.length * .75 <= 20000) break; if (q > .4) q -= .12; else w *= .82 } URL.revokeObjectURL(im.src); res(out) }; im.onerror = rej; im.src = URL.createObjectURL(file) });
/* APK के भीतर? (Capacitor) — असली अलार्म/लोकेशन की सेवा */
const NAT = () => { try { return window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform() ? Capacitor.Plugins.BtPrinter : null } catch (e) { return null } };

const MENU = { shop: {}, cats: [], items: [], byId: {}, async load() { const j = await (await fetch(ROOT + "menu.json", { cache: "no-cache" })).json(); this.shop = j.shop || {}; this.cats = j.cats || []; this.items = (j.items || []).filter(i => !i.off); this.items.forEach(i => this.byId[i.id] = i); return this } };
const hmin = t => { const [h, m] = String(t).split(":").map(Number); return h * 60 + (m || 0) };
const h12 = t => { const m = hmin(t); return ((m / 60 | 0) % 12 || 12) + ":" + String(m % 60).padStart(2, "0") + (m < 720 ? " AM" : " PM") };
/* ⏰ ग्राहक अभी ऑर्डर कर सकता है? → {ok, tone: closed|hurry|first|open, en, hi}  (config: orderFrom/orderTo/hurryFrom/lunch/dinner/eveFrom)
   रात 10:30–सुबह 8:00: बंद। 9 बजे के बाद: जल्दी करें। रसोई चालू न हो (सुबह / दोपहर बाद / शाम 5 के बाद): "रसोई __ पर शुरू — सबसे पहले आपका ऑर्डर"। */
function orderState(at) {
  const d = new Date(), n = at != null ? hmin(at) : CFG.testClock ? hmin(CFG.testClock) : d.getHours() * 60 + d.getMinutes();
  const F = hmin(CFG.orderFrom || "08:00"), T = hmin(CFG.orderTo || "22:30"), L = (CFG.lunch || ["11:30", "14:30"]), D = (CFG.dinner || ["19:15", "22:30"]);
  if (n < F || n >= T) return { ok: false, tone: "closed", en: `Restaurant is closed for the night — ordering opens at ${h12(CFG.orderFrom || "08:00")}. You can still see the menu.`, hi: `रात ${h12(CFG.orderTo || "22:30")} के बाद ऑर्डर बंद — सुबह ${h12(CFG.orderFrom || "08:00")} से फिर चालू` };
  if (n >= hmin(CFG.hurryFrom || "21:00")) return { ok: true, tone: "hurry", en: `We close at ${h12(CFG.orderTo || "22:30")} — please order quickly so we can prepare it in time!`, hi: "रेस्टोरेंट बंद होने वाला है — जल्दी ऑर्डर करें ताकि आपका ऑर्डर बन सके" };
  if (n < hmin(L[0])) return { ok: true, tone: "first", en: `Kitchen starts at ${h12(L[0])} — order now and yours will be prepared first!`, hi: `रसोई ${h12(L[0])} पर शुरू होगी — सबसे पहले आपका ऑर्डर बनेगा` };
  if (n > hmin(L[1]) && n < hmin(D[0])) return { ok: true, tone: "first", en: `Kitchen starts at ${h12(D[0])} — order now and yours will be packed first!`, hi: `रसोई ${h12(D[0])} पर शुरू होगी — सबसे पहले आपका ऑर्डर पैक होगा` };
  return { ok: true, tone: "open", en: "Kitchen is open — hot food, freshly made for you", hi: "रसोई चालू है" };
}
const title = s => String(s || "").toLowerCase().replace(/(^|[\s(/-])([a-z])/g, (m, a, b) => a + b.toUpperCase());
const vmark = v => `<i class="vm ${v ? "v" : "nv"}"></i>`;

/* फोटो वाला मेन्यू (वेटर और ग्राहक दोनों): cart = {id: गिनती} */
function menuUI(el, cart, onChange, o = {}) {
  let cat = "all", q = "", veg = !!o.veg;
  const draw = () => {
    const POP = o.pop ? o.pop() : {}, hasPop = Object.keys(POP).length >= 3;
    const L = MENU.items.filter(i => (cat === "all" || (cat === "pop" ? POP[i.id] : i.c === cat)) && (!veg || i.veg) && (!q || (i.n + " " + (i.hi || "")).toLowerCase().includes(q)));
    if (cat === "pop") L.sort((x, y) => POP[y.id] - POP[x.id]);
    el.innerHTML = `<div class="mtop"><input class="msr" type="search" placeholder="${o.en ? "Search dish…" : "डिश खोजें…"}" value="${E(q)}"><button class="vt ${veg ? "on" : ""}" data-veg>${vmark(true)} Veg</button></div>
<div class="chips"><button class="${cat === "all" ? "on" : ""}" data-c="all">All</button>${hasPop ? `<button class="${cat === "pop" ? "on" : ""}" data-c="pop">⭐ ज़्यादा बिकने वाले</button>` : ""}${MENU.cats.map(c => `<button class="${cat === c.k ? "on" : ""}" data-c="${c.k}">${c.em || ""} ${E(c.n.split(/[,&(]/)[0].trim())}</button>`).join("")}</div>
<div class="mg">${L.map(i => { const n = cart[i.id] || 0; return `<div class="mc ${n ? "has" : ""}" data-id="${i.id}"><div class="ph" ${i.p ? `style="background-image:url('${ROOT}${i.p}')"` : ""}>${i.p ? "" : (i.em || "🍽️")}${n ? `<b class="cn">${n}</b>` : ""}</div><div class="nm">${vmark(i.veg)}${E(title(i.n))}</div><div class="pr"><b>${rs(i.s)}</b>${n ? `<span class="qt"><button data-d="-1">−</button><button data-d="1">+</button></span>` : `<button class="ad" data-d="1">ADD</button>`}</div></div>` }).join("") || `<div class="empty">${o.en ? "No dish found" : "कोई डिश नहीं मिली"}</div>`}</div>`;
  };
  el.onclick = e => {
    const c = e.target.closest("[data-c]"), d = e.target.closest("[data-d]"), v = e.target.closest("[data-veg]");
    if (c) { cat = c.dataset.c; draw() } else if (v) { veg = !veg; draw() }
    else if (d) { const id = d.closest(".mc").dataset.id; cart[id] = Math.max(0, (cart[id] || 0) + (+d.dataset.d)); if (!cart[id]) delete cart[id]; draw(); onChange && onChange() }
  };
  el.oninput = e => { if (e.target.classList.contains("msr")) { q = e.target.value.trim().toLowerCase(); const p = e.target.selectionStart; draw(); const n = $(".msr", el); n.focus(); try { n.setSelectionRange(p, p) } catch (x) { } } };
  draw(); return { draw };
}
const cartLines = cart => Object.keys(cart).filter(id => MENU.byId[id]).map(id => ({ id, n: title(MENU.byId[id].n), q: cart[id], s: MENU.byId[id].s, veg: !!MENU.byId[id].veg }));
const cartTotal = cart => cartLines(cart).reduce((t, l) => t + l.q * l.s, 0);

/* नीचे से उठने वाली शीट */
function sheet(html) { let s = $("#sheet"); if (!s) { s = document.createElement("div"); s.id = "sheet"; document.body.appendChild(s) } s.innerHTML = `<div class="scrim" data-x></div><div class="box"><button class="sx" data-x aria-label="बंद करें">✕</button>${html}</div>`; s.className = "open"; s.onclick = e => { if (e.target.closest("[data-x]")) closeSheet() }; return $(".box", s) }
function closeSheet() { const s = $("#sheet"); if (s) { s.className = ""; s.innerHTML = "" } }
function toast(t) { let e = $("#toast"); if (!e) { e = document.createElement("div"); e.id = "toast"; document.body.appendChild(e) } e.textContent = t; e.className = "on"; clearTimeout(toast.t); toast.t = setTimeout(() => e.className = "", 2200) }

/* घंटी (ब्राउज़र में): जब तक कोई नया ऑर्डर/पुकार बाकी है। APK में असली अलार्म OrderRingService बजाता है। */
const BELL = { ctx: null, t: null, on: false,
  beep() { try { this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)(); const c = this.ctx; [0, .22, .44].forEach((d, k) => { const o = c.createOscillator(), g = c.createGain(); o.type = "square"; o.frequency.value = k % 2 ? 1175 : 880; g.gain.setValueAtTime(.0001, c.currentTime + d); g.gain.exponentialRampToValueAtTime(.25, c.currentTime + d + .02); g.gain.exponentialRampToValueAtTime(.0001, c.currentTime + d + .18); o.connect(g).connect(c.destination); o.start(c.currentTime + d); o.stop(c.currentTime + d + .2) }); navigator.vibrate && navigator.vibrate([200, 100, 200]) } catch (e) { } },
  set(v) { if (v === this.on) return; this.on = v; clearInterval(this.t); if (v) { this.beep(); this.t = setInterval(() => this.beep(), 2500) } } };
