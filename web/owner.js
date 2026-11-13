/* मारवाड़ रसोई — मालिक के औज़ार: 🗺️ टीम का नक्शा · 💰 उधारी · 🤖 Claude का डेटा (खेप + कोड) · 🚚 177 MH से आया माल का मिलान
   नियम: docs/होटल-प्रबंधन-योजना-प्रॉम्प्ट.txt। लोकेशन APK की TrackService लिखती है: live/{uid} {name,lat,lng,acc,ts,seen,running} · trk/{तारीख_uid_घंटा} {uid,name,date,hr,pts["ts,lat,lng,…"]} */
const agoHi = ts => { const m = Math.floor((now() - ts) / 60000); return m < 1 ? "अभी" : m < 60 ? m + " मिनट पहले" : m < 1440 ? Math.floor(m / 60) + " घंटे पहले" : Math.floor(m / 1440) + " दिन पहले" };
const loadLib = () => window.L ? Promise.resolve() : new Promise((res, rej) => { const c = document.createElement("link"); c.rel = "stylesheet"; c.href = "lib/leaflet.css"; document.head.appendChild(c); const s = document.createElement("script"); s.src = "lib/leaflet.js"; s.onload = res; s.onerror = rej; document.head.appendChild(s) });
async function mapSheet() {
  const b = sheet(`<h3>🗺️ टीम कहाँ है</h3><div id="mp" class="mapbox"></div><div id="ml" class="empty">⏳…</div>`); let live = [], trk = [], map, lay;
  try { await loadLib(); live = (await COL("live").list()).filter(x => x.lat && x.lng);
    trk = FS_ON ? await fsQuery({ from: [{ collectionId: "trk" }], where: { fieldFilter: { field: { fieldPath: "date" }, op: "EQUAL", value: { stringValue: dkey() } } }, limit: 400 }) : (await COL("trk").list()).filter(x => x.date === dkey()) } catch (e) { return $("#ml", b).textContent = "नक्शा नहीं खुला — नेट देखें (" + String(e.message || e).slice(0, 60) + ")" }
  if (!live.length) { $("#mp", b).remove(); return $("#ml", b).innerHTML = "अभी किसी की लोकेशन नहीं आई।<br>साथी के फोन में APK हो, उसमें लॉगिन हो और लोकेशन की इजाज़त 'हमेशा' दी हो — तब यहाँ दिखेगा।" }
  map = L.map($("#mp", b), { attributionControl: true, zoomControl: false }); lay = L.layerGroup().addTo(map);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", { maxZoom: 19, subdomains: "abcd", attribution: "© OpenStreetMap · © CARTO" }).addTo(map);
  const path = uid => trk.filter(t => t.uid === uid).sort((a, c) => a.hr - c.hr).flatMap(t => (t.pts || []).map(s => String(s).split(",")).filter(a => +a[0] && +a[1] && +a[2] && !(+a[3] > 60)).map(a => [+a[1], +a[2], +a[0]]));
  const show = sel => { lay.clearLayers(); const pts = [];
    live.forEach(u => { const on = now() - (u.seen || u.ts || 0) < 15 * 60000; L.marker([u.lat, u.lng], { icon: L.divIcon({ className: "", html: `<div class="pin ${on ? "" : "off"} ${sel === u.id ? "sel" : ""}">${E((u.name || "?").slice(0, 8))}</div>`, iconSize: [0, 0] }) }).addTo(lay).on("click", () => show(u.id)); pts.push([u.lat, u.lng]) });
    if (sel) { const P = path(sel); if (P.length > 1) { L.polyline(P.map(p => [p[0], p[1]]), { color: "#b91c1c", weight: 4, opacity: .8 }).addTo(lay); P.forEach(p => pts.push([p[0], p[1]])) } }
    map.fitBounds(L.latLngBounds(pts).pad(.25), { maxZoom: 17 });
    $("#ml", b).outerHTML = `<div id="ml">${live.sort((a, c) => (c.seen || 0) - (a.seen || 0)).map(u => { const P = path(u.id), on = now() - (u.seen || u.ts || 0) < 15 * 60000; return `<button class="row ${sel === u.id ? "sel" : ""}" data-mu="${u.id}"><span class="dot ${on ? "on" : ""}"></span><span style="flex:1">${E(u.name || "?")}<small style="display:block;color:var(--mut);font-weight:600">${on ? "🟢 चालू" : "⚪ बंद"} · ${agoHi(u.seen || u.ts || 0)}${u.acc ? " · ±" + u.acc + " मी" : ""}${P.length ? " · आज " + hm(P[0][2]) + " से " + P.length + " जगह दर्ज" : ""}</small></span><b>${sel === u.id ? "रास्ता ✓" : "रास्ता ›"}</b></button>` }).join("")}<p class="hint">नाम दबाएँ → आज का रास्ता लाल लाइन में। लोकेशन सिर्फ़ तब आती है जब साथी के फोन में ऐप चालू हो (ऊपर पट्टी "Marwar Rasoi चालू है" दिखती है)।</p></div>` };
  show(""); setTimeout(() => map.invalidateSize(), 200);
  b.addEventListener("click", e => { const t = e.target.closest("[data-mu]"); if (t) show(t.dataset.mu) });
}
/* ───────── 💰 उधारी: udhar/{id} {name, phone, note, ts, by, lines[{amt, ts, by, why}], pays[{amt, ts, by, how}]} — बाकी = Σlines − Σpays ───────── */
const udDue = u => (u.lines || []).reduce((t, l) => t + (+l.amt || 0), 0) - (u.pays || []).reduce((t, l) => t + (+l.amt || 0), 0);
async function udharSheet() {
  const b = sheet(`<h3>💰 उधारी</h3><div id="ul" class="empty">⏳…</div>`); let U = [];
  try { U = await COL("udhar").list() } catch (e) { return $("#ul", b).textContent = "नहीं खुली — नेट/नियम देखें" }
  const waMsg = u => `नमस्ते ${u.name} जी, Marwar Rasoi (Amenity Centre, Jalipa) में आपका ₹${Math.round(udDue(u))} बाकी है। कृपया सुविधा से जमा करा दें। धन्यवाद 🙏`;
  const show = open => { const L = U.filter(u => Math.abs(udDue(u)) > .5 || open === u.id).sort((a, c) => udDue(c) - udDue(a)), tot = U.reduce((t, u) => t + Math.max(0, udDue(u)), 0);
    $("#ul", b).outerHTML = `<div id="ul"><div class="sum" style="grid-template-columns:1fr 1fr"><div><b>${rs(tot)}</b><small>कुल बाकी</small></div><div><b>${L.filter(u => udDue(u) > .5).length}</b><small>लोग</small></div></div>
    ${L.map(u => `<div class="oc" style="--sc:${udDue(u) > .5 ? "#b91c1c" : "#15803d"}"><button class="r1" data-uo="${u.id}" style="width:100%;border:0;background:none;padding:0;text-align:left"><span class="w">${E(u.name)}</span><span class="t" style="font-size:15px;color:var(--ink)">${rs(udDue(u))}</span></button>
      <div class="who">${u.phone ? "📞 " + E(u.phone) + " · " : ""}${E(u.note || "")}</div>
      ${open === u.id ? `<div class="kot">${(u.lines || []).map(l => `<div>📒 ${new Date(l.ts).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · ${E(l.why || "उधार")} · ${E(l.by || "")}<span>+${rs(l.amt)}</span></div>`).join("")}${(u.pays || []).map(l => `<div>💵 ${new Date(l.ts).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · ${E(l.how || "जमा")} · ${E(l.by || "")}<span>−${rs(l.amt)}</span></div>`).join("")}</div>
      <div class="sline"><span>रकम ₹</span><input type="number" inputmode="decimal" id="ua" style="width:90px"><span><input class="in" id="uw" placeholder="किस बात का / नकद-UPI" style="margin:0"></span></div>
      <div class="r3"><button class="btn ok sm" data-up="${u.id}">💵 पैसा आया</button><button class="btn gh sm" data-ul="${u.id}">📒 और उधार</button>${u.phone ? `<a class="btn sm" style="text-decoration:none;background:#128c7e" href="https://wa.me/91${E(u.phone)}?text=${encodeURIComponent(waMsg(u))}" target="_blank" rel="noopener">💬 WhatsApp याद</a>` : ""}</div>` : ""}</div>`).join("") || `<div class="empty">कोई उधारी नहीं 🎉</div>`}
    <div class="h">➕ नया उधार वाला</div><input class="in" id="nn" placeholder="नाम"><input class="in" id="np" inputmode="numeric" maxlength="10" placeholder="मोबाइल (WhatsApp याद के लिए)"><input class="in" id="na" type="number" inputmode="decimal" placeholder="कितना उधार ₹"><input class="in" id="nw" placeholder="किस बात का (जैसे: 12 नवंबर का खाना)"><div class="err" id="ue"></div><button class="btn big" id="uadd">जोड़ें</button></div>` };
  show("");
  b.onclick = async e => { const t = e.target.closest("[data-uo],[data-up],[data-ul],#uadd"); if (!t) return; const er = m => $("#ue", b).textContent = m;
    try { if (t.dataset.uo) return show(t.dataset.uo);
      if (t.id === "uadd") { const name = $("#nn", b).value.trim(), amt = +$("#na", b).value, ph = $("#np", b).value.replace(/\D/g, ""); if (name.length < 2) return er("नाम लिखें"); if (!(amt > 0)) return er("रकम लिखें"); if (ph && ph.length !== 10) return er("मोबाइल 10 अंक का");
        const u = await COL("udhar").add({ name, phone: ph, note: "", by: ME.name, lines: [{ amt, ts: now(), by: ME.name, why: $("#nw", b).value.trim() }], pays: [] }); U.push(u); toast("उधार दर्ज ✔"); return show(u.id) }
      const u = U.find(x => x.id === (t.dataset.up || t.dataset.ul)), amt = +$("#ua", b).value, w = $("#uw", b).value.trim(); if (!(amt > 0)) return toast("रकम लिखें");
      if (t.dataset.up) { const pays = (u.pays || []).concat([{ amt, ts: now(), by: ME.name, how: w }]); await COL("udhar").set(u.id, { pays }); u.pays = pays; toast("जमा दर्ज ✔") }
      else { const lines = (u.lines || []).concat([{ amt, ts: now(), by: ME.name, why: w }]); await COL("udhar").set(u.id, { lines }); u.lines = lines; toast("उधार जुड़ा ✔") } show(u.id) } catch (x) { toast("सेव नहीं हुआ — नेट/नियम देखें") } };
}
/* ───────── 🤖 Claude का डेटा: (1) खेप web/data/packs/<id>.json — मालिक का ऐप खुलते ही अपने-आप; (2) निजी कोड "MR1:…" — मालिक चिपकाए ─────────
   खेप/कोड का ढाँचा: {id, note, assets:{a02:{q:64}}, sitems:[{id,n,u,min}], stock:[{t:"in",src,items[{id,n,u,q,r}],total,note}], udhar:[{name,phone,amt,why}], checklist:{open:["…"],close:[],week:[]}}
   सिर्फ़ जोड़ता है — जो भरा है उसे नहीं बदलता; हर खेप एक ही बार (conf/packs)। */
async function applyPack(P, who) {
  const out = [];
  if (P.assets) { const A = {}; (await COL("assets").list()).forEach(x => A[x.id] = x); let n = 0; for (const id of Object.keys(P.assets)) { if (A[id] && A[id].q != null) continue; await COL("assets").set(id, Object.assign({}, P.assets[id])); n++ } out.push("प्रॉपर्टी " + n) }
  if (P.sitems) { for (const s of P.sitems) await COL("sitems").set(s.id, Object.assign({ custom: !/^(r\d+|b\d+|g-)/.test(s.id) }, s)); out.push("सामान " + P.sitems.length) }
  if (P.stock) { for (const m of P.stock) await COL("stock").add(Object.assign({ by: who }, m)); out.push("स्टोर एंट्री " + P.stock.length) }
  if (P.udhar) { for (const u of P.udhar) await COL("udhar").add({ name: u.name, phone: String(u.phone || "").replace(/\D/g, "").slice(-10), note: u.note || "", by: who, lines: [{ amt: +u.amt, ts: u.ts || now(), by: who, why: u.why || "पुराना बाकी" }], pays: [] }); out.push("उधारी " + P.udhar.length) }
  if (P.checklist) { const c = (await COL("conf").list().catch(() => [])).find(x => x.id === "checklist") || {}; for (const k of Object.keys(P.checklist)) { const arr = (c[k] || []).concat(P.checklist[k].map((t, i) => ({ id: "p" + now().toString(36) + i, t }))); await COL("conf").set("checklist", { [k]: arr }) } out.push("चेकलिस्ट") }
  return out.join(" · ");
}
async function autoPacks() {
  if (!ME || ME.role !== "owner") return;
  try { const ix = await fetch("data/packs/index.json", { cache: "no-cache" }).then(r => r.ok ? r.json() : { packs: [] }); if (!(ix.packs || []).length) return;
    const done = (await COL("conf").list()).find(x => x.id === "packs") || {};
    for (const id of ix.packs) { const k = "p_" + id.replace(/\W/g, "_"); if (done[k]) continue; const P = await fetch("data/packs/" + id + ".json", { cache: "no-cache" }).then(r => r.json()); const r = await applyPack(P, "Claude (खेप " + id + ")"); await COL("conf").set("packs", { [k]: now() }); toast("🤖 नया डेटा लगा: " + r); ST8.ready = false } } catch (e) { console.warn("packs", e) }
}
function codeSheet() {
  const b = sheet(`<h3>🤖 Claude का कोड लगाएँ</h3><p class="hint">Claude जो "MR1:…" वाला कोड दे, उसे यहाँ पूरा चिपकाएँ (ग्राहकों/उधारी जैसा निजी डेटा GitHub पर नहीं रखा जाता, इसलिए कोड से आता है)।</p><textarea class="in" id="cc" rows="5" placeholder="MR1:…"></textarea><div class="err" id="ce"></div><button class="btn big" id="cgo">जाँचें और लगाएँ</button>`);
  $("#cgo", b).onclick = async () => { const er = m => $("#ce", b).textContent = m; let P; try { const t = $("#cc", b).value.trim(); if (!t.startsWith("MR1:")) throw 0; P = JSON.parse(decodeURIComponent(escape(atob(t.slice(4).replace(/\s/g, ""))))) } catch (e) { return er("कोड अधूरा या ग़लत है — पूरा कोड दोबारा कॉपी करके चिपकाएँ") }
    const k = "c_" + String(P.id || "").replace(/\W/g, "_"); if (!P.id) return er("कोड में पहचान (id) नहीं है"); $("#cgo", b).disabled = true;
    try { const done = (await COL("conf").list()).find(x => x.id === "packs") || {}; if (done[k]) { $("#cgo", b).disabled = false; return er("यह कोड पहले ही लग चुका है (" + new Date(done[k]).toLocaleDateString("en-IN") + ") — दोबारा नहीं लगेगा") }
      const r = await applyPack(P, "Claude (कोड " + P.id + ")"); await COL("conf").set("packs", { [k]: now() }); ST8.ready = false; closeSheet(); toast("🤖 लग गया: " + r); draw() } catch (e) { $("#cgo", b).disabled = false; er("नहीं लगा — नेट/नियम देखें (" + String(e.message).slice(0, 50) + ")") } };
}
