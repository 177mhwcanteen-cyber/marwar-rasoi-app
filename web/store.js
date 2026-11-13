/* मारवाड़ रसोई — 📦 स्टोर (आया / रसोई को दिया / स्टॉक), 🪑 प्रॉपर्टी, ✅ चेकलिस्ट।  नियम: docs/होटल-प्रबंधन-योजना-प्रॉम्प्ट.txt
   🚫 यहाँ से कोई बिल/रसीद नहीं छपती। कोई एंट्री मिटती नहीं — ग़लती हो तो "गिनती ठीक करें" (कारण के साथ, मालिक को दिखती है)।
   stock/{id}: {t: in|out|req|adj, ts, by, src, sph, to, items[{id,n,u,q,r}], total, note, status, gby, gts, oid}   sitems/{id}: {n,u,custom,min}
   assets/{id}: {g,n,q,c,cts,cby,ph}   checks/{तारीख}: {open:{id:{by,ts}},close:{…}}  checks/w-<साल>-<हफ़्ता>: {week:{…}}   conf/checklist: {open:[{id,t}],…} */
const ST8 = { cat: [], byId: {}, byBc: {}, mov: [], sit: {}, ready: false, view: "home", q: "" };
const canStore = () => ME && ["owner", "manager"].includes(ME.role);
async function storeLoad(force) {
  if (!ST8.cat.length) { const [a, b] = await Promise.all(["data/catalog.json", "data/raw.json"].map(f => fetch(f, { cache: "no-cache" }).then(r => r.json()).catch(() => []))); ST8.base = b.concat(a) }
  if (!ST8.ready || force) { const [m, s, ib] = await Promise.all([COL("stock").list().catch(() => ST8.mov), COL("sitems").list().catch(() => []), COL("inbox").list().catch(() => [])]); ST8.inbox = ib.sort((x, y) => y.ts - x.ts); ST8.mov = m.sort((x, y) => x.ts - y.ts); ST8.sit = {}; s.forEach(x => ST8.sit[x.id] = x); ST8.ready = true }
  ST8.cat = ST8.base.concat(Object.values(ST8.sit).filter(x => x.custom)); ST8.byId = {}; ST8.byBc = {};
  ST8.cat.forEach(i => { ST8.byId[i.id] = i; (i.bc || []).forEach(b => ST8.byBc[b] = i) });
}
const stockQty = () => { const q = {}; ST8.mov.forEach(m => { const s = m.t === "in" ? 1 : m.t === "out" ? -1 : m.t === "adj" ? 1 : 0; if (s) (m.items || []).forEach(l => q[l.id] = (q[l.id] || 0) + s * l.q) }); return q };
const itName = l => E((ST8.byId[l.id] || l).n || l.n);
const lowList = Q => Object.keys(ST8.sit).filter(id => ST8.sit[id].min > 0 && (Q[id] || 0) <= ST8.sit[id].min).map(id => ST8.byId[id] || ST8.sit[id]);
const movCard = m => { const k = { in: ["📥", "आया", "#15803d"], out: ["📤", "रसोई को दिया", "#b45309"], req: ["🙋", "माँगा", "#b91c1c"], adj: ["✏️", "गिनती ठीक की", "#475569"] }[m.t];
  return `<div class="oc" style="--sc:${k[2]}"><div class="r1"><span class="w">${k[0]} ${k[1]}${m.src ? " — " + E(m.src) : m.to ? " — " + E(m.to) : ""}</span><span class="t">${hm(m.ts)} · ${E(m.by || "")}</span></div>
  <div class="kot">${(m.items || []).map(l => `<div><b style="min-width:auto">${qf(l.q)} ${E(l.u || "")}</b>${itName(l)}${l.r ? `<span>${rs(l.q * l.r)}</span>` : ""}</div>`).join("")}${m.note ? `<div class="nt">📝 ${E(m.note)}</div>` : ""}</div>
  <div class="r3"><span class="tot">${m.total ? rs(m.total) : ""}${m.sph ? ` <small style="font-weight:600;color:var(--mut)">📞 ${E(m.sph)}</small>` : ""}${m.gby ? ` <small style="font-weight:600;color:var(--mut)">दिया: ${E(m.gby)}</small>` : ""}</span>
  ${m.t === "req" && canStore() ? `<button class="btn ok" data-give="${m.id}">✔ दे दिया</button>` : ""}</div></div>` };
function vStore() {
  if (!ST8.ready) { storeLoad().then(() => TAB === "store" && draw()).catch(() => 0); return `<div class="empty">⏳ स्टोर खुल रहा है…</div>` }
  const Q = stockQty(), T = ST8.mov.filter(m => m.ts >= today0()), req = ST8.mov.filter(m => m.t === "req"), low = lowList(Q), inT = T.filter(m => m.t === "in");
  const wk = ST8.mov.filter(m => m.t === "in" && m.ts >= today0() - 6 * 864e5).reduce((t, m) => t + (m.total || 0), 0);
  const L = Object.keys(Q).map(id => ST8.byId[id] || { id, n: id, u: "" }).filter(i => !ST8.q || i.n.toLowerCase().includes(ST8.q)).sort((a, b) => a.n.localeCompare(b.n));
  return `<div class="sgrid"><button class="sbig in" data-se="in"><span>📥</span>आया<small>खरीद / माल आया</small></button>${canStore() ? `<button class="sbig out" data-se="out"><span>📤</span>रसोई को दिया<small>स्टॉक से निकला</small></button>` : `<button class="sbig out" data-se="req"><span>🙋</span>सामान चाहिए<small>मैनेजर से माँगें</small></button>`}</div>
  <div class="sum"><div><b>${rs(inT.reduce((t, m) => t + (m.total || 0), 0))}</b><small>आज की खरीद</small></div><div><b>${rs(wk)}</b><small>7 दिन की खरीद</small></div><div><b style="${low.length ? "color:#b91c1c" : ""}">${low.length}</b><small>कम स्टॉक</small></div></div>
  ${(ST8.inbox || []).filter(x => x.status === "new" || (x.status === "no" && ME.role === "owner")).map(x => `<div class="oc ${x.status === "no" ? "late" : ""}" style="--sc:#1d4ed8"><div class="r1"><span class="w">🚚 177 MH कैंटीन से माल${x.bill ? " · बिल " + E(x.bill) : ""}</span><span class="t">${new Date(x.ts).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} ${hm(x.ts)}</span></div>
    ${x.status === "no" ? `<div class="esc">⚠ मैनेजर ने कहा: नहीं मिला / कम मिला — ${E(x.rnote || "")} (${E(x.rby || "")})</div>` : `<div class="who">वहाँ से भेजा: ${E(x.by || "")} — गिनकर मिलाएँ, फिर दबाएँ</div>`}
    <div class="kot">${(x.items || []).map(l => `<div><b style="min-width:auto">${qf(l.q)} ${E(l.u || "")}</b>${itName(l)}<span>${rs(l.q * (l.r || 0))}</span></div>`).join("")}</div>
    <div class="r3"><span class="tot">${rs(x.total)}</span>${x.status === "new" && canStore() ? `<button class="btn gh sm" data-ibno="${x.id}">❌ नहीं / कम मिला</button><button class="btn ok" data-ibok="${x.id}">✔ पूरा मिल गया</button>` : ""}</div></div>`).join("")}
  ${req.length ? `<div class="h">🙋 रसोई की माँग <small>${req.length}</small></div>${req.map(movCard).join("")}` : ""}
  ${low.length ? `<div class="h">🔴 खत्म होने वाला</div><div class="chips">${low.map(i => `<button data-si="${i.id}">${E(i.n)} · ${qf(Q[i.id] || 0)} ${E(i.u)}</button>`).join("")}</div>` : ""}
  <div class="h">📊 स्टॉक <small>${Object.keys(Q).length} सामान</small><button class="btn gh sm" data-sr style="margin-left:auto">🔄</button></div>
  <input class="msr" id="stq" type="search" placeholder="स्टॉक में खोजें…" value="${E(ST8.q)}" style="width:100%;margin-bottom:6px">
  ${L.length ? `<div class="slist">${L.map(i => `<button data-si="${i.id}" class="${(Q[i.id] || 0) < 0 ? "neg" : ""}"><span>${E(i.n)}</span><b>${qf(Q[i.id] || 0)} ${E(i.u)}</b></button>`).join("")}</div>` : `<div class="empty">अभी स्टॉक खाली है — जो माल रखा है उसे 📥 "आया" से चढ़ाएँ</div>`}
  <div class="h">🧾 आज की एंट्री <small>${T.filter(m => m.t !== "req").length}</small></div>${T.filter(m => m.t !== "req").reverse().map(movCard).join("") || `<div class="empty">आज अभी कुछ नहीं लिखा</div>`}`;
}
/* 📷 कैमरे से बारकोड (जहाँ BarcodeDetector हो) — वरना बारकोड टाइप करें / स्कैनर-गन (कीबोर्ड की तरह) */
async function scanCode() {
  if (!("BarcodeDetector" in window) || !navigator.mediaDevices) { toast("इस फोन में कैमरा-स्कैन नहीं — बारकोड टाइप करें या स्कैनर-गन लगाएँ"); return "" }
  let stream; try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }) } catch (e) { toast("कैमरे की इजाज़त दें"); return "" }
  return new Promise(res => { const o = document.createElement("div"); o.className = "scan"; o.innerHTML = `<video playsinline autoplay muted></video><i></i><button class="btn">✕ बंद</button>`; document.body.appendChild(o);
    const v = $("video", o); v.srcObject = stream; const det = new BarcodeDetector(); let on = true;
    const end = c => { on = false; stream.getTracks().forEach(t => t.stop()); o.remove(); res(c) }; $("button", o).onclick = () => end("");
    (async function loop() { while (on) { try { const r = await det.detect(v); if (r.length) { navigator.vibrate && navigator.vibrate(80); return end(r[0].rawValue) } } catch (e) { } await new Promise(r => setTimeout(r, 250)) } })() });
}
/* एंट्री की शीट: in = आया · out = रसोई को दिया · req = रसोइया माँगे */
function storeEntry(kind) {
  const Q = stockQty(), lines = [], sup = [...new Map(ST8.mov.filter(m => m.t === "in" && m.src).map(m => [m.src, m.sph || ""])).entries()].slice(-30), who = [...new Set(ST8.mov.filter(m => m.to).map(m => m.to))].slice(-20);
  const T = { in: "📥 आया — खरीद की एंट्री", out: "📤 रसोई को दिया", req: "🙋 सामान चाहिए" }[kind];
  const b = sheet(`<h3>${T}</h3>${kind === "in" ? `<input class="in" id="es" list="esl" placeholder="कहाँ से आया — दुकान / सप्लायर का नाम"><datalist id="esl">${["177 MH कैंटीन", "सब्ज़ी एक्सप्रेस"].concat(sup.map(x => x[0])).map(x => `<option value="${E(x)}">`).join("")}</datalist><input class="in" id="ep" inputmode="numeric" maxlength="10" placeholder="दुकान का मोबाइल (हो तो)">`
    : `<input class="in" id="et" list="etl" placeholder="${kind === "out" ? "किसको दिया (रसोइया का नाम)" : "किस काम के लिए (हो तो)"}" value="${kind === "req" ? "" : ""}"><datalist id="etl">${who.map(x => `<option value="${E(x)}">`).join("")}</datalist>`}
  <div class="mtop" style="position:static;padding:4px 0"><input class="msr" id="sq" type="search" placeholder="सामान खोजें या बारकोड स्कैन करें…"><button class="vt" id="sc">📷 स्कैन</button></div>
  <div id="sres" class="slist"></div><div id="sl"></div><input class="in" id="en" placeholder="नोट (हो तो)"><div class="err" id="ee"></div><button class="btn ok big" id="esv">✅ सेव करें</button>`);
  const add = it => { let l = lines.find(x => x.id === it.id); if (l) l.q += 1; else lines.unshift({ id: it.id, n: it.n, u: it.u, q: 1, r: 0 }); $("#sq", b).value = ""; res(""); dl() };
  const res = q => { q = q.trim().toLowerCase(); if (!q) return $("#sres", b).innerHTML = ""; const hit = ST8.byBc[q.toUpperCase()] || ST8.byBc[q]; if (hit) return add(hit);
    const L = ST8.cat.filter(i => i.n.toLowerCase().includes(q)).slice(0, 25);
    $("#sres", b).innerHTML = L.map(i => `<button data-add="${i.id}"><span>${E(i.n)}</span><b>${qf(Q[i.id] || 0)} ${E(i.u)}</b></button>`).join("") + (q.length > 2 ? `<button data-new="1"><span>➕ नया सामान: "${E(q)}"</span><b>जोड़ें</b></button>` : "") };
  const dl = () => { const tot = lines.reduce((t, l) => t + l.q * (l.r || 0), 0); $("#sl", b).innerHTML = lines.map((l, k) => `<div class="sline"><span>${E(l.n)}${kind !== "in" ? `<small>स्टॉक: ${qf(Q[l.id] || 0)} ${E(l.u)}</small>` : ""}</span><input type="number" inputmode="decimal" step="any" min="0" value="${l.q}" data-q="${k}" aria-label="मात्रा"><em>${E(l.u)}</em>${kind === "in" ? `<input type="number" inputmode="decimal" step="any" min="0" value="${l.r || ""}" placeholder="₹ भाव" data-r="${k}" aria-label="भाव">` : ""}<button data-rm="${k}">✕</button></div>`).join("") + (kind === "in" && lines.length ? `<div class="stot">कुल ${rs(tot)}</div>` : "") };
  b.oninput = e => { const t = e.target; if (t.id === "sq") res(t.value); else if (t.dataset.q != null) { lines[+t.dataset.q].q = +t.value || 0; const s = $(".stot", b); if (s) s.textContent = "कुल " + rs(lines.reduce((x, l) => x + l.q * (l.r || 0), 0)) } else if (t.dataset.r != null) { lines[+t.dataset.r].r = +t.value || 0; $(".stot", b).textContent = "कुल " + rs(lines.reduce((x, l) => x + l.q * (l.r || 0), 0)) } };
  b.onclick = async e => { const t = e.target.closest("[data-add],[data-new],[data-rm],#sc,#esv"); if (!t) return;
    if (t.dataset.add) add(ST8.byId[t.dataset.add]); else if (t.dataset.rm != null) { lines.splice(+t.dataset.rm, 1); dl() }
    else if (t.id === "sc") { const c = await scanCode(); if (c) { const hit = ST8.byBc[c]; if (hit) { add(hit); toast("✔ " + hit.n) } else { $("#sq", b).value = c; toast("यह बारकोड सूची में नहीं — नाम से खोजें") } } }
    else if (t.dataset.new) { const n = $("#sq", b).value.trim(); const u = await new Promise(r => { const x = sheet2(`<h3>नया सामान: ${E(n)}</h3><div class="seg">${["kg", "L", "pc", "pkt", "g", "दर्जन"].map(u => `<button data-u="${u}">${u}</button>`).join("")}</div>`); x.onclick = ev => { const k = ev.target.closest("[data-u]"); if (k) { x.parentNode.remove(); r(k.dataset.u) } } });
      try { const it = await COL("sitems").add({ n, u, custom: true, by: ME.name }); ST8.sit[it.id] = it; await storeLoad(); add(ST8.byId[it.id]) } catch (er) { $("#ee", b).textContent = "नया सामान नहीं जुड़ा — नेट देखें" } }
    else if (t.id === "esv") { const er = m => $("#ee", b).textContent = m, L = lines.filter(l => l.q > 0);
      if (!L.length) return er("कम से कम एक सामान और मात्रा डालें"); const src = ($("#es", b) || {}).value || "", to = ($("#et", b) || {}).value || "";
      if (kind === "in" && src.trim().length < 2) return er("कहाँ से आया — दुकान का नाम लिखें"); if (kind === "out" && to.trim().length < 2) return er("किसको दिया — नाम लिखें");
      const o = { t: kind, by: ME.name, items: L.map(l => Object.assign({ id: l.id, n: l.n, u: l.u, q: l.q }, kind === "in" && l.r ? { r: l.r } : {})), note: $("#en", b).value.trim() };
      if (kind === "in") Object.assign(o, { src: src.trim(), sph: (($("#ep", b) || {}).value || "").replace(/\D/g, ""), total: Math.round(L.reduce((x, l) => x + l.q * (l.r || 0), 0)) }); else o.to = kind === "req" ? ME.name + (to ? " · " + to.trim() : "") : to.trim();
      if (kind === "req") o.status = "new"; t.disabled = true;
      try { const d = await COL("stock").add(o); ST8.mov.push(d);
        if (kind === "req") { const c = await DB.add({ kind: "call", call: "store", type: "parcel", table: 0, by: ME.name, note: L.map(l => qf(l.q) + " " + l.u + " " + l.n).join(", ").slice(0, 190) }).catch(() => null); if (c) COL("stock").set(d.id, { oid: c.id }).catch(() => 0), d.oid = c.id }
        closeSheet(); toast(kind === "in" ? "खरीद चढ़ गई ✔" : kind === "out" ? "स्टॉक से निकला ✔" : "मैनेजर को माँग चली गई ✔"); draw() } catch (x) { t.disabled = false; er("सेव नहीं हुआ — नेट देखें (" + String(x.message).slice(0, 50) + ")") } } };
}
function sheet2(html) { const s = document.createElement("div"); s.className = "open"; s.id = "sheet2"; s.style.cssText = "position:fixed;inset:0;z-index:25"; s.innerHTML = `<div class="scrim"></div><div class="box">${html}</div>`; document.body.appendChild(s); return $(".box", s) }
function storeItem(id) {
  const Q = stockQty(), it = ST8.byId[id] || { id, n: id, u: "" }, H = ST8.mov.filter(m => m.t !== "req" && (m.items || []).some(l => l.id === id)).slice(-25).reverse(), mn = (ST8.sit[id] || {}).min || 0;
  const b = sheet(`<h3>${E(it.n)}</h3><div class="sum" style="grid-template-columns:1fr 1fr"><div><b>${qf(Q[id] || 0)} ${E(it.u)}</b><small>अभी स्टॉक</small></div><div><b>${mn ? qf(mn) + " " + E(it.u) : "—"}</b><small>कम-स्टॉक की सीमा</small></div></div>
  ${canStore() ? `<div class="sline" style="margin-top:8px"><span>🔴 इतने पर "खत्म होने वाला" दिखे</span><input type="number" id="mn" inputmode="decimal" step="any" value="${mn || ""}"><em>${E(it.u)}</em><button id="mns" class="btn sm" style="width:auto;height:auto;padding:6px 9px">सेव</button></div>
  <div class="sline"><span>✏️ असली गिनती (गिनकर लिखें)</span><input type="number" id="aq" inputmode="decimal" step="any" placeholder="${qf(Q[id] || 0)}"><em>${E(it.u)}</em><button id="aqs" class="btn sm" style="width:auto;height:auto;padding:6px 9px">ठीक करें</button></div><div class="err" id="ie"></div>` : ""}
  <div class="h">इतिहास</div>${H.map(m => { const l = m.items.find(x => x.id === id); return `<div class="row" style="font-weight:600;font-size:13.5px">${{ in: "📥", out: "📤", adj: "✏️" }[m.t]} ${new Date(m.ts).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} ${hm(m.ts)} · ${E(m.src || m.to || m.note || "")} · ${E(m.by || "")}<b style="margin-left:auto;white-space:nowrap">${m.t === "out" ? "−" : l.q > 0 ? "+" : ""}${qf(l.q)}</b></div>` }).join("") || `<div class="empty">कोई एंट्री नहीं</div>`}`);
  if (!canStore()) return;
  $("#mns", b).onclick = async () => { const v = +$("#mn", b).value || 0; try { await COL("sitems").set(id, { min: v, n: it.n, u: it.u }); ST8.sit[id] = Object.assign(ST8.sit[id] || { id }, { min: v, n: it.n, u: it.u }); closeSheet(); toast("सीमा सेव ✔"); draw() } catch (e) { $("#ie", b).textContent = "सेव नहीं हुआ" } };
  $("#aqs", b).onclick = async () => { const v = $("#aq", b).value; if (v === "") return $("#ie", b).textContent = "गिनी हुई मात्रा लिखें"; const d = +v - (Q[id] || 0); if (!d) return closeSheet();
    try { const m = await COL("stock").add({ t: "adj", by: ME.name, items: [{ id, n: it.n, u: it.u, q: d }], note: "गिनती: ऐप में " + qf(Q[id] || 0) + ", असल " + qf(+v) }); ST8.mov.push(m); closeSheet(); toast("गिनती ठीक की ✔ (मालिक को दिखेगी)"); draw() } catch (e) { $("#ie", b).textContent = "सेव नहीं हुआ" } };
}
async function storeGive(id) { const m = ST8.mov.find(x => x.id === id); if (!m) return; try { await COL("stock").set(id, { t: "out", status: "given", gby: ME.name, gts: now() }); Object.assign(m, { t: "out", status: "given", gby: ME.name, gts: now() }); if (m.oid) DB.upd(m.oid, { status: "done" }, ME.name).catch(() => 0); toast("दे दिया — स्टॉक घटा ✔"); draw() } catch (e) { toast("सेव नहीं हुआ — नेट देखें") } }
/* 🚚 177 MH से आया माल: मिल गया → स्टॉक में "आया"; नहीं/कम मिला → मालिक को लाल कार्ड (दोनों तरफ़ का मिलान) */
async function inboxDo(id, okk) { const x = (ST8.inbox || []).find(v => v.id === id); if (!x) return;
  try { if (okk) { const m = await COL("stock").add({ t: "in", by: ME.name, src: "177 MH कैंटीन", ref: x.bill || "", items: x.items, total: x.total || 0, note: "177 का बिल " + (x.bill || "") + " — मिलान से" }); ST8.mov.push(m); await COL("inbox").set(id, { status: "ok", rby: ME.name, rts: now() }); x.status = "ok"; toast("स्टॉक में जुड़ गया ✔"); return draw() }
    const b = sheet(`<h3>❌ क्या नहीं मिला / कम मिला?</h3><textarea class="in" id="ibn" rows="3" placeholder="जैसे: तेल 15 की जगह 10 लीटर आया"></textarea><button class="btn big" id="ibs">मालिक को बताएँ</button>`);
    $("#ibs", b).onclick = async () => { const n = $("#ibn", b).value.trim(); if (n.length < 3) return toast("लिखें क्या कम है"); await COL("inbox").set(id, { status: "no", rnote: n, rby: ME.name, rts: now() }); Object.assign(x, { status: "no", rnote: n, rby: ME.name }); closeSheet(); toast("मालिक को दिखेगा"); draw() } } catch (e) { toast("सेव नहीं हुआ — नेट देखें") } }
document.addEventListener("click", e => { if (TAB !== "store") return; const t = e.target.closest("#pg [data-se],#pg [data-si],#pg [data-give],#pg [data-sr],#pg [data-ibok],#pg [data-ibno]"); if (!t) return;
  if (t.dataset.ibok || t.dataset.ibno) return inboxDo(t.dataset.ibok || t.dataset.ibno, !!t.dataset.ibok);
  if (t.dataset.se) storeEntry(t.dataset.se); else if (t.dataset.si) storeItem(t.dataset.si); else if (t.dataset.give) storeGive(t.dataset.give); else storeLoad(true).then(draw) });
document.addEventListener("input", e => { if (e.target.id === "stq") { ST8.q = e.target.value.trim().toLowerCase(); const p = e.target.selectionStart; draw(); const n = $("#stq"); n.focus(); try { n.setSelectionRange(p, p) } catch (x) { } } });

/* ───────── 🪑 प्रॉपर्टी रजिस्टर: रजिस्टर की गिनती (मालिक तय करे) बनाम आख़िरी गिनती (मैनेजर गिने) ───────── */
async function assetsSheet() {
  const b = sheet(`<h3>🪑 प्रॉपर्टी रजिस्टर</h3><div id="al" class="empty">⏳…</div>`); let base = [], A = {};
  try { base = await fetch("data/assets.json", { cache: "no-cache" }).then(r => r.json()); (await COL("assets").list()).forEach(x => A[x.id] = x) } catch (e) { }
  const own = ME.role === "owner";
  const show = () => { const all = base.map(x => Object.assign({}, x, A[x.id] || {})).concat(Object.values(A).filter(x => x.custom)), G = [...new Set(all.map(x => x.g))], miss = all.filter(x => x.q > 0 && x.c != null && x.c < x.q);
    $("#al", b).outerHTML = `<div id="al"><div class="sum" style="grid-template-columns:repeat(3,1fr)"><div><b>${all.filter(x => x.q > 0).length}</b><small>चीज़ें दर्ज</small></div><div><b>${all.reduce((t, x) => t + (+x.q || 0), 0)}</b><small>कुल नग</small></div><div><b style="${miss.length ? "color:#b91c1c" : ""}">${miss.length}</b><small>गिनती में कम</small></div></div>
    <p class="hint">${own ? "रजिस्टर = जितना होना चाहिए (आप भरें)।" : "रजिस्टर की गिनती मालिक भरते हैं।"} गिनती = मैनेजर ने गिनकर जो पाया। 📷 से फोटो लगाएँ।</p>
    ${G.map(g => `<div class="h">${E(g)}</div>${all.filter(x => x.g === g).map(x => `<div class="arow ${x.q > 0 && x.c != null && x.c < x.q ? "bad" : ""}" data-id="${x.id}"><label class="aph" ${x.ph ? `style="background-image:url(${x.ph})"` : ""}>${x.ph ? "" : "📷"}<input type="file" accept="image/*" capture="environment" hidden></label><span>${E(x.n)}${x.cts ? `<small>गिना: ${new Date(x.cts).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · ${E(x.cby || "")}</small>` : ""}</span>
      <i>रजिस्टर<input type="number" inputmode="numeric" data-f="q" value="${x.q ?? ""}" ${own ? "" : "disabled"}></i><i>गिनती<input type="number" inputmode="numeric" data-f="c" value="${x.c ?? ""}"></i></div>`).join("")}`).join("")}
    <div class="sline" style="margin-top:10px"><span><input class="in" id="an" placeholder="➕ नई चीज़ का नाम" style="margin:0"></span><button class="btn sm" id="aadd" style="width:auto;height:auto;padding:8px 10px">जोड़ें</button></div></div>` };
  show();
  b.onchange = async e => { const t = e.target, r = t.closest(".arow"); if (!r) return; const id = r.dataset.id, bx = base.find(x => x.id === id) || A[id] || {};
    try { if (t.type === "file") { if (!t.files[0]) return; const ph = await shrink(t.files[0]); await COL("assets").set(id, { ph, g: bx.g, n: bx.n }); A[id] = Object.assign(A[id] || { id }, { ph }); show(); toast("फोटो लगी ✔") }
      else { const v = t.value === "" ? null : +t.value, p = t.dataset.f === "q" ? { q: v, g: bx.g, n: bx.n } : { c: v, cts: now(), cby: ME.name, g: bx.g, n: bx.n }; await COL("assets").set(id, p); A[id] = Object.assign(A[id] || { id }, p); show(); toast("सेव ✔") } } catch (er) { toast("सेव नहीं हुआ — नेट देखें") } };
  b.onclick = async e => { if (e.target.id !== "aadd") return; const n = $("#an", b).value.trim(); if (n.length < 2) return toast("नाम लिखें"); try { const x = await COL("assets").add({ g: "और", n, custom: true, by: ME.name }); A[x.id] = x; show() } catch (er) { toast("नहीं जुड़ा") } };
}
/* ───────── ✅ चेकलिस्ट: सुबह खोलते समय · रात बंद करते समय · हफ़्ते की ───────── */
const wkey = () => { const d = new Date(), o = new Date(d.getFullYear(), 0, 1); return "w-" + d.getFullYear() + "-" + Math.ceil(((d - o) / 864e5 + o.getDay() + 1) / 7) };
async function chkData() { const base = await fetch("data/checklist.json", { cache: "no-cache" }).then(r => r.json()), all = await COL("checks").list().catch(() => []), conf = (await COL("conf").list().catch(() => [])).find(x => x.id === "checklist") || {};
  const L = {}; ["open", "close", "week"].forEach(k => L[k] = base[k].concat(conf[k] || [])); return { L, conf, day: all.find(x => x.id === dkey()) || {}, wk: all.find(x => x.id === wkey()) || {} } }
async function checkSheet(tab) {
  const b = sheet(`<h3>✅ चेकलिस्ट</h3><div id="cl" class="empty">⏳…</div>`); let D; try { D = await chkData() } catch (e) { return $("#cl", b).textContent = "नहीं खुली — नेट देखें" }
  tab = tab || (new Date().getHours() < 15 ? "open" : "close");
  const show = () => { const done = (tab === "week" ? D.wk : D.day)[tab] || {}, L = D.L[tab], n = L.filter(x => done[x.id]).length;
    $("#cl", b).outerHTML = `<div id="cl"><div class="seg">${[["open", "🌅 सुबह खोलते समय"], ["close", "🌙 रात बंद करते समय"], ["week", "📅 हफ़्ते की"]].map(([k, l]) => `<button data-ct="${k}" class="${tab === k ? "on" : ""}">${l}</button>`).join("")}</div>
    <div class="steps" style="margin:8px 0">${L.map(x => `<i class="${done[x.id] ? "on" : ""}"></i>`).join("")}</div><b>${n} / ${L.length} पूरे</b>
    ${L.map(x => `<button class="crow ${done[x.id] ? "on" : ""}" data-ck="${x.id}"><i>${done[x.id] ? "✔" : ""}</i><span>${E(x.t)}${done[x.id] ? `<small>${E(done[x.id].by)} · ${hm(done[x.id].ts)}</small>` : ""}</span></button>`).join("")}
    ${canStore() ? `<div class="sline" style="margin-top:10px"><span><input class="in" id="cn" placeholder="➕ नया बिंदु जोड़ें" style="margin:0"></span><button class="btn sm" id="cadd" style="width:auto;height:auto;padding:8px 10px">जोड़ें</button></div>` : ""}</div>` };
  show();
  b.onclick = async e => { const t = e.target.closest("[data-ct],[data-ck],#cadd"); if (!t) return;
    if (t.dataset.ct) { tab = t.dataset.ct; return show() }
    try { if (t.dataset.ck) { const doc = tab === "week" ? D.wk : D.day, done = Object.assign({}, doc[tab] || {}); if (done[t.dataset.ck]) return toast("यह पहले ही ✔ है — " + done[t.dataset.ck].by); done[t.dataset.ck] = { by: ME.name, ts: now() }; await COL("checks").set(tab === "week" ? wkey() : dkey(), { [tab]: done }); doc[tab] = done; show() }
      else { const n = $("#cn", b).value.trim(); if (n.length < 3) return toast("बिंदु लिखें"); const arr = (D.conf[tab] || []).concat([{ id: "x" + now().toString(36), t: n }]); await COL("conf").set("checklist", { [tab]: arr }); D.conf[tab] = arr; D.L[tab].push(arr[arr.length - 1]); show() } } catch (er) { toast("सेव नहीं हुआ — नेट देखें") } };
}
