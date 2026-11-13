/* मारवाड़ रसोई — 👥 ग्राहक (सिर्फ़ मालिक): TMBill से बनी "Customer Biodata" CSV मालिक अपने फोन से चढ़ाए → Firestore cust/p0… (हर टुकड़े में 150 ग्राहक, rows = JSON)।
   निजी डेटा GitHub पर कभी नहीं। नई फ़ाइल चढ़ाने पर सूची ताज़ा होती है; मालिक की लिखी टिप्पणी/"संदेश भेजा" अलग cnote/{मोबाइल} में — वह नहीं बदलती।
   ग्राहक: {m मोबाइल, n नाम, pk नाम पक्का, ad पता, o ऑर्डर, sp खर्च, f पहला, l आख़िरी, d[पसंद], all, vg, tm, ty, pay, ud उधारी, cx रद्द, on दूसरे नाम, nt} */
const CU = { rows: [], by: {}, notes: {}, ready: false, ts: 0 };
function csvRows(t) { const R = []; let r = [], c = "", q = false; t = t.replace(/^﻿/, "");
  for (let i = 0; i < t.length; i++) { const ch = t[i]; if (q) { if (ch === '"') { if (t[i + 1] === '"') { c += '"'; i++ } else q = false } else c += ch } else if (ch === '"') q = true; else if (ch === ",") { r.push(c); c = "" } else if (ch === "\n" || ch === "\r") { if (ch === "\r" && t[i + 1] === "\n") i++; r.push(c); c = ""; if (r.some(x => x)) R.push(r); r = [] } else c += ch }
  r.push(c); if (r.some(x => x)) R.push(r); return R }
function custParse(t) { const R = csvRows(t), H = (R[0] || []).map(h => h.trim().toLowerCase()), ix = k => H.findIndex(h => h.startsWith(k)), g = (r, k) => { const i = ix(k); return i < 0 ? "" : String(r[i] || "").trim() };
  if (ix("mobile") < 0 || ix("total orders") < 0) throw new Error("यह ग्राहक-फ़ाइल नहीं लगती (Mobile / Total Orders के खाने नहीं मिले)");
  const out = [], seen = {}; R.slice(1).forEach(r => { const m = g(r, "mobile").replace(/\D/g, "").slice(-10); if (m.length !== 10 || seen[m]) return; seen[m] = 1;
    out.push({ m, n: g(r, "customer name"), pk: /^haan/i.test(g(r, "name pakka")) ? 1 : 0, ad: g(r, "delivery address"), o: +g(r, "total orders") || 0, sp: Math.round(+g(r, "total spend") || 0), f: g(r, "first order"), l: g(r, "last order"),
      d: [1, 2, 3, 4, 5].map(i => g(r, "fav dish " + i)).filter(Boolean), all: g(r, "all dishes").slice(0, 600), vg: g(r, "veg"), tm: g(r, "usual order time"), ty: g(r, "order type"), pay: g(r, "payment habit"), ud: Math.round(+g(r, "udhaari") || 0), cx: +g(r, "cancelled") || 0, on: g(r, "other names").slice(0, 200), nt: g(r, "note").slice(0, 400) }) });
  if (!out.length) throw new Error("फ़ाइल में कोई ग्राहक नहीं मिला"); return out }
async function custSave(rows) { const N = 150, parts = Math.ceil(rows.length / N), ts = now(); for (let i = 0; i < parts; i++) await COL("cust").set("p" + i, { i, parts, ts, by: ME.name, rows: JSON.stringify(rows.slice(i * N, i * N + N)) }) }
async function custLoad(force) { if (CU.ready && !force) return CU; const P = (await COL("cust").list()).filter(x => x.rows), ts = Math.max(0, ...P.map(x => x.ts || 0));
  CU.rows = P.filter(x => x.ts === ts && x.i < x.parts).sort((a, b) => a.i - b.i).flatMap(x => JSON.parse(x.rows)); CU.ts = ts; CU.by = {}; CU.rows.forEach(c => CU.by[c.m] = c);
  CU.notes = {}; (await COL("cnote").list().catch(() => [])).forEach(x => CU.notes[x.id] = x); CU.ready = true; return CU }
const cDays = c => c.l ? Math.max(0, Math.floor((now() - new Date(c.l + "T12:00:00").getTime()) / 864e5)) : 999;
const cKind = c => c.o >= 10 ? "vip" : c.o >= 4 ? "reg" : c.o >= 2 ? "some" : "new";
const CK = { vip: "👑 VIP", reg: "🔁 रेगुलर", some: "🙂 कभी-कभी", new: "🆕 नया" };
const cName = c => c.n || "ग्राहक " + c.m.slice(-4);
const dmy = s => s ? s.split("-").reverse().join("-") : "—";
/* ऑर्डर कार्ड पर पहचान (सिर्फ़ मालिक के फोन में डेटा होता है) */
const custTag = ph => { const c = CU.by[String(ph || "").replace(/\D/g, "").slice(-10)]; return c ? `<div class="ctag">${CK[cKind(c)]} · ${c.o} ऑर्डर · ${rs(c.sp)}${c.d[0] ? " · पसंद: " + E(c.d[0]) : ""}${c.ud > 0 ? ` · <b>उधारी ${rs(c.ud)}</b>` : ""}</div>` : "" };
function custMsg(c, kind) { const nm = c.n ? c.n + " ji" : "ji", link = CFG.homeUrl, fav = c.d.slice(0, 2).join(", ");
  return kind === "ud" ? `Jai Hind ${nm}. Marwar Rasoi (Amenity Centre, Jalipa) mein aapka Rs ${c.ud} baaki hai. Kripya suvidha se jama kara dein. Dhanyavaad.`
    : kind === "back" ? `Jai Hind ${nm}. Marwar Rasoi, Jalipa se namaskar. Bahut din ho gaye aapka order nahi aaya${fav ? " - aapki pasand " + fav + " aaj bhi taiyaar hai" : ""}. Ab ghar baithe order karein, free delivery: ${link} . Dhanyavaad.`
    : kind === "name" ? `Jai Hind. Marwar Rasoi, Jalipa se namaskar. Aap hamare purane grahak hain - kripya apna naam bata dein taaki agli baar order jaldi lag sake. Ab online order bhi: ${link} . Dhanyavaad.`
    : `Jai Hind ${nm}. Marwar Rasoi, Jalipa. Ab tak aapke ${c.o} order - dhanyavaad!${fav ? " Aapki pasand: " + fav + "." : ""} Ab ghar baithe order karein, free delivery: ${link} . Dhanyavaad.` }
async function custSheet() {
  const b = sheet(`<h3>👥 ग्राहक</h3><div id="cl" class="empty">⏳…</div>`); let F = "win", Q = "", open = "";
  try { await custLoad(true) } catch (e) { return $("#cl", b).innerHTML = "नहीं खुला — Firebase के नए नियम (v4) Publish करें, फिर दोबारा खोलें।" }
  const up = `<label class="btn gh sm" style="display:inline-block">📂 ${CU.rows.length ? "नई फ़ाइल चढ़ाएँ (ताज़ा करें)" : "ग्राहक-फ़ाइल (CSV) चुनें"}<input type="file" id="cf" accept=".csv,text/csv,text/comma-separated-values" hidden></label><div class="err" id="cerr"></div>`;
  const SEG = { win: ["😴 वापस बुलाएँ", c => c.o >= 4 && cDays(c) >= 30], vip: ["👑 VIP", c => c.o >= 10], reg: ["🔁 रेगुलर", c => c.o >= 4 && c.o < 10], ud: ["💰 उधारी", c => c.ud > 0], name: ["❓ नाम पूछना", c => !c.pk && c.o >= 2], nw: ["🆕 नए", c => c.o === 1 && cDays(c) <= 14], all: ["सब", c => true] };
  const show = () => { const R = CU.rows; if (!R.length) return $("#cl", b).outerHTML = `<div id="cl"><p class="hint">Claude की बनाई <b>Marwar-Rasoi-Customer-Biodata.csv</b> फ़ाइल यहाँ चुनें। डेटा सिर्फ़ आपके Firebase में जाएगा — सिर्फ़ मालिक देख सकता है।</p>${up}</div>`;
    const q = Q.toLowerCase(), L = R.filter(c => q ? (c.m + " " + c.n + " " + c.ad + " " + c.on + " " + c.all).toLowerCase().includes(q) : SEG[F][1](c)).sort((a, c) => F === "ud" && !q ? c.ud - a.ud : c.sp - a.sp);
    const kind = F === "ud" ? "ud" : F === "win" ? "back" : F === "name" ? "name" : "";
    $("#cl", b).outerHTML = `<div id="cl"><div class="sum"><div><b>${R.length}</b><small>ग्राहक</small></div><div><b>${rs(R.reduce((t, c) => t + c.sp, 0))}</b><small>कुल बिक्री</small></div><div><b>${rs(R.reduce((t, c) => t + Math.max(0, c.ud), 0))}</b><small>उधारी · ${R.filter(c => c.ud > 0).length} लोग</small></div></div>
    <input class="in" id="cq" placeholder="🔍 नाम / मोबाइल / यूनिट / डिश" value="${E(Q)}" style="margin:8px 0 4px">
    <div class="chips">${Object.keys(SEG).map(k => `<button data-cf="${k}" class="${!Q && F === k ? "on" : ""}">${SEG[k][0]} ${R.filter(SEG[k][1]).length}</button>`).join("")}</div>
    <p class="hint" style="margin:0 0 6px">${Q ? "खोज के नतीजे" : { win: "4+ बार आए, पर 30 दिन से नहीं आए — इन्हें पहले संदेश भेजें", vip: "10+ ऑर्डर वाले — सबसे क़ीमती", reg: "4 से 9 ऑर्डर", ud: "जिन पर पैसा बाकी है (TMBill के हिसाब से)", name: "बिल पर नाम नहीं — नाम पूछ लें", nw: "पिछले 14 दिन में पहली बार आए", all: "सब ग्राहक, ज़्यादा खर्च वाले ऊपर" }[F]} · ${L.length}${L.length > 60 ? " (पहले 60)" : ""}</p>
    ${L.slice(0, 60).map(c => { const nt = CU.notes[c.m] || {}, dy = cDays(c); return `<div class="oc" style="--sc:${c.ud > 0 ? "#b91c1c" : c.o >= 10 ? "#b45309" : "#15803d"}"><button class="r1" data-co="${c.m}" style="width:100%;border:0;background:none;padding:0;text-align:left"><span class="w">${E(cName(c))}</span><span class="t" style="font-size:14px;color:var(--ink)">${c.o} ऑर्डर · ${rs(c.sp)}</span></button>
      <div class="who">${CK[cKind(c)]} · ${dy} दिन पहले${c.ad ? " · 📍 " + E(c.ad) : ""}${c.ud > 0 ? ` · <b style="color:#b91c1c">उधारी ${rs(c.ud)}</b>` : ""}${nt.wa ? " · ✅ संदेश " + agoHi(nt.wa) : ""}</div>
      ${open === c.m ? `<div class="kot"><div>📞 ${c.m}<span>${E(c.vg)} · ${E(c.ty)}</span></div><div>🗓️ पहला ${dmy(c.f)} · आख़िरी ${dmy(c.l)}<span>औसत ${rs(Math.round(c.sp / (c.o || 1)))}</span></div><div>⏰ ${E(c.tm)}<span>${E(c.pay)}${c.cx ? " · रद्द " + c.cx : ""}</span></div>${c.d.length ? `<div>❤️ ${E(c.d.join(", "))}</div>` : ""}<div style="font-size:12px;color:var(--mut)">${E(c.all)}</div>${c.on ? `<div style="font-size:12px;color:var(--mut)">बिल पर नाम: ${E(c.on)}</div>` : ""}${c.nt ? `<div>⚠️ ${E(c.nt)}</div>` : ""}</div>
      <input class="in" id="cn" placeholder="अपनी टिप्पणी (जैसे: मेजर साहब के ड्राइवर)" value="${E(nt.t || "")}" style="margin:6px 0">
      <div class="r3"><a class="btn sm" data-cw="${c.m}" style="text-decoration:none;background:#128c7e" href="https://wa.me/91${c.m}?text=${encodeURIComponent(custMsg(c, c.ud > 0 && F === "ud" ? "ud" : kind || (!c.pk ? "name" : dy >= 30 ? "back" : "")))}" target="_blank" rel="noopener">💬 WhatsApp</a><a class="btn gh sm" style="text-decoration:none" href="tel:${c.m}">📞 कॉल</a><button class="btn gh sm" data-cs="${c.m}">💾 टिप्पणी</button></div>` : (nt.t ? `<div class="who">📝 ${E(nt.t)}</div>` : "")}</div>` }).join("") || `<div class="empty">इस सूची में कोई नहीं</div>`}
    <p class="hint">सूची ${new Date(CU.ts).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} को चढ़ी। ऑर्डर/उधारी के अंक TMBill की फ़ाइल के हैं — नई फ़ाइल चढ़ाने पर ताज़ा होंगे।</p>${up}</div>`;
    const i = $("#cq", b); i.oninput = () => { Q = i.value.trim(); clearTimeout(i._t); i._t = setTimeout(() => { show(); const j = $("#cq", b); j.focus(); j.setSelectionRange(j.value.length, j.value.length) }, 350) } };
  show();
  b.addEventListener("change", async e => { if (e.target.id !== "cf" || !e.target.files[0]) return; const er = m => $("#cerr", b).textContent = m; er("⏳ पढ़ रहे हैं…");
    try { const rows = custParse(await e.target.files[0].text()); er("⏳ " + rows.length + " ग्राहक चढ़ रहे हैं…"); await custSave(rows); await custLoad(true); toast("👥 " + rows.length + " ग्राहक चढ़ गए ✔"); F = "win"; show(); draw() } catch (x) { er("नहीं चढ़ी — " + String(x.message || x).slice(0, 90)) } });
  b.addEventListener("click", async e => { const t = e.target.closest("[data-cf],[data-co],[data-cw],[data-cs]"); if (!t) return;
    if (t.dataset.cf) { F = t.dataset.cf; Q = ""; open = ""; return show() } if (t.dataset.co) { open = open === t.dataset.co ? "" : t.dataset.co; return show() }
    const m = t.dataset.cw || t.dataset.cs, o = t.dataset.cw ? { wa: now() } : { t: $("#cn", b).value.trim().slice(0, 200) };
    try { await COL("cnote").set(m, o); CU.notes[m] = Object.assign(CU.notes[m] || { id: m }, o); if (t.dataset.cs) { toast("टिप्पणी सेव ✔"); show() } else setTimeout(show, 800) } catch (x) { if (t.dataset.cs) toast("सेव नहीं हुई — नेट/नियम देखें") } });
}
