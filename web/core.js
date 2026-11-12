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
const CALLS = { water: { ic: "💧", hi: "पानी", en: "Water" }, waiter: { ic: "🙋", hi: "वेटर बुलाया", en: "Call waiter" }, bill: { ic: "🧾", hi: "बिल माँगा", en: "Bill please" } };
const where = o => o.type === "table" ? "🍽️ टेबल " + o.table : o.type === "parcel" ? "🥡 पार्सल" : "🛵 डिलीवरी";

const DB = (() => {
  const K = "mr_orders"; let subs = [];
  const ch = ("BroadcastChannel" in window) ? new BroadcastChannel("mr") : null;
  const all = () => LS.get(K, []);
  const fire = () => { const a = all(); subs.forEach(f => { try { f(a) } catch (e) { console.error(e) } }) };
  const save = a => { LS.set(K, a); ch && ch.postMessage(1); fire() };
  if (ch) ch.onmessage = fire;
  addEventListener("storage", e => { if (e.key === K) fire() });
  return {
    mode: "local", all, on(f) { subs.push(f); f(all()) },
    add(o) { const a = all(); o.id = "o" + now().toString(36) + Math.random().toString(36).slice(2, 6); o.ts = now(); o.status = "new"; o.log = [{ s: "new", ts: o.ts, by: o.by || "" }]; a.push(o); save(a); return o },
    upd(id, p, by) { const a = all(), o = a.find(x => x.id === id); if (!o) return null; Object.assign(o, p); if (p.status) (o.log = o.log || []).push({ s: p.status, ts: now(), by: by || "" }); save(a); return o }
  };
})();

const MENU = { shop: {}, cats: [], items: [], byId: {}, async load() { const j = await (await fetch(ROOT + "menu.json", { cache: "no-cache" })).json(); this.shop = j.shop || {}; this.cats = j.cats || []; this.items = (j.items || []).filter(i => !i.off); this.items.forEach(i => this.byId[i.id] = i); return this } };
const title = s => String(s || "").toLowerCase().replace(/(^|[\s(/-])([a-z])/g, (m, a, b) => a + b.toUpperCase());
const vmark = v => `<i class="vm ${v ? "v" : "nv"}"></i>`;

/* फोटो वाला मेन्यू (वेटर और ग्राहक दोनों): cart = {id: गिनती} */
function menuUI(el, cart, onChange, o = {}) {
  let cat = "all", q = "", veg = !!o.veg;
  const draw = () => {
    const L = MENU.items.filter(i => (cat === "all" || i.c === cat) && (!veg || i.veg) && (!q || (i.n + " " + (i.hi || "")).toLowerCase().includes(q)));
    el.innerHTML = `<div class="mtop"><input class="msr" type="search" placeholder="${o.en ? "Search dish…" : "डिश खोजें…"}" value="${E(q)}"><button class="vt ${veg ? "on" : ""}" data-veg>${vmark(true)} Veg</button></div>
<div class="chips"><button class="${cat === "all" ? "on" : ""}" data-c="all">All</button>${MENU.cats.map(c => `<button class="${cat === c.k ? "on" : ""}" data-c="${c.k}">${c.em || ""} ${E(c.n.split(/[,&(]/)[0].trim())}</button>`).join("")}</div>
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
function sheet(html) { let s = $("#sheet"); if (!s) { s = document.createElement("div"); s.id = "sheet"; document.body.appendChild(s) } s.innerHTML = `<div class="scrim" data-x></div><div class="box">${html}</div>`; s.className = "open"; s.onclick = e => { if (e.target.closest("[data-x]")) closeSheet() }; return $(".box", s) }
function closeSheet() { const s = $("#sheet"); if (s) { s.className = ""; s.innerHTML = "" } }
function toast(t) { let e = $("#toast"); if (!e) { e = document.createElement("div"); e.id = "toast"; document.body.appendChild(e) } e.textContent = t; e.className = "on"; clearTimeout(toast.t); toast.t = setTimeout(() => e.className = "", 2200) }

/* घंटी (ब्राउज़र में): जब तक कोई नया ऑर्डर/पुकार बाकी है। APK में असली अलार्म OrderRingService बजाता है। */
const BELL = { ctx: null, t: null, on: false,
  beep() { try { this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)(); const c = this.ctx; [0, .22, .44].forEach((d, k) => { const o = c.createOscillator(), g = c.createGain(); o.type = "square"; o.frequency.value = k % 2 ? 1175 : 880; g.gain.setValueAtTime(.0001, c.currentTime + d); g.gain.exponentialRampToValueAtTime(.25, c.currentTime + d + .02); g.gain.exponentialRampToValueAtTime(.0001, c.currentTime + d + .18); o.connect(g).connect(c.destination); o.start(c.currentTime + d); o.stop(c.currentTime + d + .2) }); navigator.vibrate && navigator.vibrate([200, 100, 200]) } catch (e) { } },
  set(v) { if (v === this.on) return; this.on = v; clearInterval(this.t); if (v) { this.beep(); this.t = setInterval(() => this.beep(), 2500) } } };
