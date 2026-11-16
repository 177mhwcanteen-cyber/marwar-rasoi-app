/* मारवाड़ रसोई — डायरेक्टर के औज़ार: 🗺️ टीम का नक्शा · 💰 उधारी · 🤖 Claude का डेटा (खेप + कोड) · 🚚 177 MH से आया माल का मिलान
   नियम: docs/होटल-प्रबंधन-योजना-प्रॉम्प्ट.txt। लोकेशन APK की TrackService लिखती है: live/{uid} {name,lat,lng,acc,ts,seen,running} · trk/{तारीख_uid_घंटा} {uid,name,date,hr,pts["ts,lat,lng,…"]} */
const agoHi = ts => { const m = Math.floor((now() - ts) / 60000); return m < 1 ? "अभी" : m < 60 ? m + " मिनट पहले" : m < 1440 ? Math.floor(m / 60) + " घंटे पहले" : Math.floor(m / 1440) + " दिन पहले" };
const loadLib = () => window.L ? Promise.resolve() : new Promise((res, rej) => { const c = document.createElement("link"); c.rel = "stylesheet"; c.href = "lib/leaflet.css"; document.head.appendChild(c); const s = document.createElement("script"); s.src = "lib/leaflet.js"; s.onload = res; s.onerror = rej; document.head.appendChild(s) });
/* 🗺️ टीम कहाँ है + दिन का रास्ता (16-11, विक्रम जी: "कहाँ-कहाँ गया रिकॉर्ड हो, घर बैठा हो तो रसोई न दिखाए") — सब्ज़ी एक्सप्रेस (se-route.js) का तरीका:
   पक्की (GPS/वाई-फ़ाई ±60 मी) और अंदाज़े वाली (टावर) जगह अलग; उछाल हटाओ (cleanPts); 4+ मिनट एक जगह = ठहराव (findStops); बीच का सफ़र किमी में;
   📵 छेद = ऐप/GPS बंद या जगह नहीं मिली; ठहराव को नाम दो (conf/places → अगली बार अपने-आप "74 Armd पर")। "चालू" = फ़ोन से हाल आया; "जगह N मिनट पुरानी" अलग दिखती है। */
const GEO = { GOOD: 60, places: [] };
const gdist = (a, b) => { const r = x => x * Math.PI / 180, dA = r(b.lat - a.lat), dO = r(b.lng - a.lng), h = Math.sin(dA / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dO / 2) ** 2; return 12742000 * Math.asin(Math.min(1, Math.sqrt(h))) };
const placeAt = p => { let best = null, bd = 1e9; GEO.places.forEach(x => { const d = gdist(p, x); if (d <= (+x.r || 150) && d < bd) { bd = d; best = x } }); return best };
/* 🛵 चाल (नई APK लिखती है live.mode 0 रुके · 1 पैदल · 2 गाड़ी, kmh, still = आख़िरी बार कब चले) */
const modeTxt = u => { if (!u || u.mode == null || now() - (u.ts || 0) > 15 * 60000) return ""; return u.mode == 2 ? "🚗 चल रहे" + (u.kmh ? " · " + u.kmh + " किमी/घं" : "") : u.mode == 1 ? "🚶 चल रहे" : "🛑 रुके" + (u.still ? " " + durHi(now() - u.still) + " से" : "") };
const modeIc = u => !u || u.mode == null || now() - (u.ts || 0) > 15 * 60000 ? "" : u.mode == 2 ? "🚗 " : u.mode == 1 ? "🚶 " : "";
const accTxt = a => !a ? "" : a <= GEO.GOOD ? "±" + a + " मी" : "~" + (a >= 1000 ? (a / 1000).toFixed(1) + " किमी" : a + " मी") + " अंदाज़ा";
const durHi = ms => { const m = Math.max(0, Math.round(ms / 60000)); return m >= 60 ? Math.floor(m / 60) + " घं " + (m % 60 ? m % 60 + " मि" : "") : m + " मि" };
function trkParse(docs, uid) { const P = [], Ev = [];
  docs.filter(d => d.uid === uid).forEach(d => (d.pts || []).forEach(s => { const a = String(s).split(","), ts = +a[0]; if (!ts) return;
    if (a.length >= 3) { const p = { ts, lat: +a[1], lng: +a[2], acc: +a[3] || 0 }; if (isFinite(p.lat) && isFinite(p.lng) && p.lat && p.acc <= 2500) P.push(p) } else Ev.push({ ts, ev: a[1] }) }));
  P.sort((a, b) => a.ts - b.ts); Ev.sort((a, b) => a.ts - b.ts);
  const goodTs = P.filter(p => p.acc && p.acc <= GEO.GOOD).map(p => p.ts), nearGood = ts => goodTs.some(g => Math.abs(g - ts) <= 5 * 60000);
  let Q = P.filter((p, i, a) => (!i || p.ts !== a[i - 1].ts) && (p.acc <= GEO.GOOD || !nearGood(p.ts)));
  Q = Q.filter((p, i, a) => { if (!i || i === a.length - 1) return true; const x = a[i - 1], y = a[i + 1]; return !(gdist(x, p) > 300 && gdist(p, y) > 300 && gdist(x, y) < 150 && y.ts - x.ts <= 4 * 60000) });
  return { P: Q, Ev } }
function trkDay(docs, uid) { const { P, Ev } = trkParse(docs, uid), stops = []; let c = null, km = 0;
  const close = () => { if (c && c.end - c.start >= 4 * 60000) stops.push(c) };
  for (const p of P) { const w = 1 / Math.max(5, Math.min(p.acc || GEO.GOOD, 400)) ** 2, rr = Math.max(100, Math.min(p.acc || 0, 400));
    if (c && gdist(c, p) <= rr && p.ts - c.end <= 25 * 60000) { const W = c.w + w; c.lat = (c.lat * c.w + p.lat * w) / W; c.lng = (c.lng * c.w + p.lng * w) / W; c.w = W; c.n++; c.end = p.ts; c.acc = Math.min(c.acc, p.acc || 999) }
    else { close(); c = { lat: p.lat, lng: p.lng, w, n: 1, start: p.ts, end: p.ts, acc: p.acc || 999 } } }
  close(); for (let i = 1; i < P.length; i++) { const d = gdist(P[i - 1], P[i]); if (d > 40 && d < 8000 && P[i].acc <= 300 && P[i - 1].acc <= 300) km += d / 1000 }
  const gaps = []; let off = null; Ev.forEach(e => { if (["OFF", "STOP", "NOPERM"].includes(e.ev)) { if (!off) off = { start: e.ts, why: e.ev } } else if (["ON", "START"].includes(e.ev) && off) { gaps.push(Object.assign(off, { end: e.ts })); off = null } });
  if (off) gaps.push(Object.assign(off, { end: 0 })); for (let i = 1; i < P.length; i++) if (P[i].ts - P[i - 1].ts > 20 * 60000 && gdist(P[i - 1], P[i]) > 300) gaps.push({ start: P[i - 1].ts, end: P[i].ts, why: "NOFIX" });
  stops.forEach(s => s.place = placeAt(s)); return { P, stops, gaps: gaps.sort((a, b) => a.start - b.start), km: Math.round(km * 10) / 10 } }
async function mapSheet() {
  const b = sheet(`<h3>🗺️ टीम कहाँ है</h3><div class="seg" id="mpd" style="margin-bottom:8px">${[0, 1, 2].map(i => { const d = new Date(now() - i * 864e5); return `<button data-md="${i}" class="${i ? "" : "on"}">${i ? i === 1 ? "कल" : "परसों" : "आज"}</button>` }).join("")}</div><div id="mp" class="mapbox"></div><div id="ml" class="empty">⏳…</div>`);
  let live = [], trk = [], map, lay, day = 0, sel = "";
  const dk = n => dkey(new Date(now() - n * 864e5)), loadTrk = async n => FS_ON ? fsQuery({ from: [{ collectionId: "trk" }], where: { fieldFilter: { field: { fieldPath: "date" }, op: "EQUAL", value: { stringValue: dk(n) } } }, limit: 500 }) : (await COL("trk").list()).filter(x => x.date === dk(n));
  try { await loadLib(); live = (await COL("live").list()).filter(x => x.lat && x.lng); trk = await loadTrk(0);
    try { const c = FS_ON ? await fsGet("conf", "places") : LS.get("mr_places", null); GEO.places = (c && c.L) || [] } catch (e) { GEO.places = [] } } catch (e) { return $("#ml", b).textContent = "नक्शा नहीं खुला — नेट देखें (" + String(e.message || e).slice(0, 60) + ")" }
  if (!live.length && !trk.length) { $("#mp", b).remove(); return $("#ml", b).innerHTML = "अभी किसी की लोकेशन नहीं आई।<br>साथी के फोन में APK हो, उसमें लॉगिन हो और लोकेशन की इजाज़त 'हमेशा' दी हो — तब यहाँ दिखेगा।" }
  map = L.map($("#mp", b), { attributionControl: true, zoomControl: false }); lay = L.layerGroup().addTo(map);
  /* 16-11: CARTO ने बिना चाबी के नक्शा बंद कर दिया — अब बिना चाबी वाले: 🗺️ साधारण (OpenStreetMap) + 🛰️ सैटेलाइट (Esri, नाम के साथ); चुनाव याद रहे */
  const osm = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }),
    sat = L.layerGroup([L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, maxNativeZoom: 18, attribution: "© Esri, Maxar" }),
      L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, maxNativeZoom: 18 })]);
  (LS.get("mr_maplayer", "map") === "sat" ? sat : osm).addTo(map);
  L.control.layers({ "🗺️ नक्शा": osm, "🛰️ सैटेलाइट": sat }, null, { position: "topright", collapsed: false }).addTo(map);
  map.on("baselayerchange", e => LS.set("mr_maplayer", e.layer === sat ? "sat" : "map"));
  const people = () => { const m = new Map(); live.forEach(u => m.set(u.id, u.name || "?")); trk.forEach(t => { if (t.uid && !m.has(t.uid)) m.set(t.uid, t.name || "?") }); return [...m.entries()] };
  const show = () => { lay.clearLayers(); const pts = [], D = sel ? trkDay(trk, sel) : null;
    if (!day) live.forEach(u => { const on = now() - (u.seen || u.ts || 0) < 15 * 60000, old = now() - (u.ts || 0) > 15 * 60000, coarse = (u.acc || 0) > GEO.GOOD;
      if (coarse) L.circle([u.lat, u.lng], { radius: Math.min(u.acc, 3000), color: "#64748b", weight: 1, fillOpacity: .08 }).addTo(lay);
      L.marker([u.lat, u.lng], { icon: L.divIcon({ className: "", html: `<div class="pin ${on && !old ? "" : "off"} ${sel === u.id ? "sel" : ""}">${modeIc(u)}${E((u.name || "?").slice(0, 8))}${old ? " ⏳" : ""}</div>`, iconSize: [0, 0] }) }).addTo(lay).on("click", () => { sel = u.id; show() }); pts.push([u.lat, u.lng]) });
    if (D && D.P.length) { const good = D.P.filter(p => p.acc <= 300);
      if (good.length > 1) L.polyline(good.map(p => [p.lat, p.lng]), { color: "#b91c1c", weight: 4, opacity: .8 }).addTo(lay);
      D.P.filter(p => p.acc > 300).forEach(p => L.circleMarker([p.lat, p.lng], { radius: 4, color: "#94a3b8", weight: 1, fillOpacity: .5 }).addTo(lay));
      D.stops.forEach((s, i) => { L.marker([s.lat, s.lng], { icon: L.divIcon({ className: "", html: `<div class="pin" style="background:#1d4ed8">${i + 1}</div>`, iconSize: [0, 0] }) }).addTo(lay); pts.push([s.lat, s.lng]) });
      D.P.forEach(p => pts.push([p.lat, p.lng])) }
    if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(.2), { maxZoom: 17 });
    const P = people(), lv = id => live.find(x => x.id === id);
    $("#ml", b).outerHTML = `<div id="ml">${P.map(([id, nm]) => { const u = lv(id), on = u && now() - (u.seen || u.ts || 0) < 15 * 60000, fa = u ? now() - (u.ts || 0) : 0, d1 = trkDay(trk, id);
      return `<button class="row ${sel === id ? "sel" : ""}" data-mu="${id}"><span class="dot ${on ? "on" : ""}"></span><span style="flex:1">${E(nm)}<small style="display:block;color:var(--mut);font-weight:600">${day ? "" : u ? `${on ? "🟢 फ़ोन चालू" : "⚪ फ़ोन से हाल नहीं"} · ${agoHi(u.seen || u.ts || 0)} · 📍 ${fa > 15 * 60000 ? `<b style="color:#b91c1c">जगह ${agoHi(u.ts || 0).replace(" पहले", "")} पुरानी</b>` : "जगह " + agoHi(u.ts || 0)}${u.acc ? " · " + accTxt(u.acc) : ""}${u.gps === false ? " · <b style='color:#b91c1c'>GPS बंद</b>" : ""}${modeTxt(u) ? " · <b>" + modeTxt(u) + "</b>" : ""} · ` : ""}${d1.P.length ? `${hm(d1.P[0].ts)}–${hm(d1.P[d1.P.length - 1].ts)} · ${d1.stops.length} ठहराव · ${d1.km} किमी` : "इस दिन रास्ता नहीं"}</small></span><b>${sel === id ? "रास्ता ✓" : "रास्ता ›"}</b></button>` }).join("")}
      ${D ? tlHTML(D) : ""}<p class="hint">नाम दबाएँ → उस दिन का रास्ता, कहाँ कितनी देर रुके। ठहराव पर "📍 नाम दें" — अगली बार अपने-आप नाम दिखेगा। धूसर गोल = टावर वाली अंदाज़े की जगह।</p></div>` };
  const tlHTML = D => { const T = D.stops.map((s, i) => ({ t: s.start, h: `<div class="row" style="align-items:flex-start"><b style="background:#1d4ed8;color:#fff;border-radius:50%;min-width:24px;height:24px;display:grid;place-items:center;font-size:12px">${i + 1}</b><span style="flex:1">🕘 ${hm(s.start)}–${hm(s.end)} · ${durHi(s.end - s.start)}<small style="display:block;color:var(--mut)">${s.place ? "📍 " + E(s.place.n) : "बिना नाम की जगह"}${s.acc > GEO.GOOD ? " · " + accTxt(Math.round(s.acc)) : ""}</small></span>${s.place ? "" : `<button class="btn gh sm" data-pn="${i}">📍 नाम दें</button>`}</div>` }))
      .concat(D.gaps.map(g => ({ t: g.start, h: `<div class="row" style="color:#b91c1c"><span>📵 ${hm(g.start)}${g.end ? "–" + hm(g.end) : " से"} · ${g.why === "OFF" ? "GPS बंद किया" : g.why === "NOFIX" ? "जगह नहीं मिली" : g.why === "NOPERM" ? "लोकेशन की इजाज़त नहीं" : "ऐप बंद"}</span></div>` }))).sort((a, c) => a.t - c.t);
    return `<div class="h">🛣️ दिन का रास्ता · ${D.km} किमी · ${D.stops.length} ठहराव</div>${T.map(x => x.h).join("") || `<div class="empty">इस दिन कोई ठहराव नहीं</div>`}` };
  b.addEventListener("click", async e => {
    const md = e.target.closest("[data-md]"); if (md) { day = +md.dataset.md; $$("#mpd button", b).forEach(x => x.classList.toggle("on", x === md)); $("#ml", b).outerHTML = `<div id="ml" class="empty">⏳…</div>`; try { trk = await loadTrk(day) } catch (er) { trk = [] } show(); return }
    const pn = e.target.closest("[data-pn]"); if (pn) { const s = trkDay(trk, sel).stops[+pn.dataset.pn]; const n = prompt("इस जगह का नाम (जैसे: 74 Armd, स्वरूप सा का घर, मार्केट)"); if (!n || !s) return;
      GEO.places.push({ n: n.trim().slice(0, 40), lat: +s.lat.toFixed(6), lng: +s.lng.toFixed(6), r: 150 });
      try { if (FS_ON) await fsSet("conf", "places", { L: GEO.places, mt: now() }); else LS.set("mr_places", { L: GEO.places }); toast("📍 नाम सहेजा") } catch (er) { toast("नहीं सहेजा") } show(); return }
    const r = e.target.closest("[data-mu]"); if (r) { sel = sel === r.dataset.mu ? "" : r.dataset.mu; show() } });
  show(); setTimeout(() => map.invalidateSize(), 200);
  /* 🔴 लाइव: शीट खुली रहे तो हर 30 से. नई जगह (स्विगी/ओला जैसे नक्शे पर चलता दिखे) */
  const iv = setInterval(async () => { if (!$("#mp", b) || !$("#mp", b).isConnected) return clearInterval(iv); if (day) return;
    try { live = (await COL("live").list()).filter(x => x.lat && x.lng); trk = await loadTrk(0); show() } catch (e) { } }, 30000);
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
/* ───────── 🤖 Claude का डेटा: (1) खेप web/data/packs/<id>.json — डायरेक्टर का ऐप खुलते ही अपने-आप; (2) निजी कोड "MR1:…" — डायरेक्टर चिपकाए ─────────
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

/* ───────── 📊 रिपोर्ट (सिर्फ़ डायरेक्टर; 177 के डैशबोर्ड जैसा): पिछले 7 दिन के ऑर्डर — रोज़ की बिक्री, डिश, तरीका, साथी-वार काम, देर/मना/बिना TMBill ─────────
   ध्यान: यह ऐप में आए ऑर्डर का हिसाब है; पक्की बिक्री TMBill में। ⭐ "ज़्यादा बिकने वाले" (ऑर्डर लें) इसी गिनती से — LS mr_pop + आज के ऑर्डर। */
function popCount() { const P = Object.assign({}, LS.get("mr_pop", {})); (typeof ALL !== "undefined" ? ALL : []).forEach(o => o.kind !== "call" && o.status !== "rej" && (o.items || []).forEach(i => P[i.id] = (P[i.id] || 0) + (+i.q || 1))); return P }
async function reportSheet() {
  const b = sheet(`<h3>📊 रिपोर्ट — 7 दिन</h3><div id="rp" class="empty">⏳…</div>`), from = today0() - 6 * 864e5; let O = [];
  try { O = FS_ON ? await fsQuery({ from: [{ collectionId: "orders" }], where: { fieldFilter: { field: { fieldPath: "ts" }, op: "GREATER_THAN_OR_EQUAL", value: { integerValue: String(from) } } }, orderBy: [{ field: { fieldPath: "ts" } }], limit: 3000 }) : DB.all().filter(o => o.ts >= from) } catch (e) { return $("#rp", b).textContent = "नहीं खुली — नेट देखें" }
  const T = O.filter(o => o.kind !== "call"), ok = T.filter(o => o.status !== "rej"), tot = ok.reduce((t, o) => t + (+o.total || 0), 0);
  const days = Array.from({ length: 7 }, (_, i) => { const a = from + i * 864e5, L = ok.filter(o => o.ts >= a && o.ts < a + 864e5); return { d: new Date(a), n: L.length, v: L.reduce((t, o) => t + (+o.total || 0), 0) } }), mx = Math.max(1, ...days.map(d => d.v));
  const dish = {}, pop = {}; ok.forEach(o => (o.items || []).forEach(i => { const k = i.n || i.id; dish[k] = dish[k] || { q: 0, v: 0 }; dish[k].q += +i.q || 1; dish[k].v += (+i.q || 1) * (+i.s || 0); pop[i.id] = (pop[i.id] || 0) + (+i.q || 1) }));
  const todayPop = {}; ok.filter(o => o.ts >= today0()).forEach(o => (o.items || []).forEach(i => todayPop[i.id] = (todayPop[i.id] || 0) + (+i.q || 1))); Object.keys(todayPop).forEach(k => pop[k] -= todayPop[k]); LS.set("mr_pop", pop);
  const top = Object.entries(dish).sort((a, c) => c[1].q - a[1].q).slice(0, 10), TY = { table: "🍽️ टेबल", parcel: "🥡 पार्सल", delivery: "🛵 डिलीवरी" };
  const who = {}; T.forEach(o => (o.log || []).forEach(l => { if (!l.by || l.by === "customer" || l.s === "new") return; who[l.by] = who[l.by] || { n: 0 }; who[l.by].n++ })); T.filter(o => o.by && o.by !== "customer").forEach(o => { who[o.by] = who[o.by] || { n: 0 }; who[o.by].t = (who[o.by].t || 0) + 1 });
  const acc = T.filter(o => o.by === "customer" && (o.log || []).some(l => l.s === "acc")), avg = acc.length ? Math.round(acc.reduce((t, o) => t + (o.log.find(l => l.s === "acc").ts - o.ts) / 1000, 0) / acc.length) : 0;
  const hr = {}; ok.forEach(o => { const h = new Date(o.ts).getHours(); hr[h] = (hr[h] || 0) + 1 }); const peak = Object.entries(hr).sort((a, c) => c[1] - a[1])[0];
  $("#rp", b).outerHTML = `<div id="rp"><div class="sum"><div><b>${ok.length}</b><small>ऑर्डर</small></div><div><b>${rs(tot)}</b><small>कुल</small></div><div><b>${ok.length ? rs(Math.round(tot / ok.length)) : "—"}</b><small>औसत ऑर्डर</small></div></div>
  <div class="h">📅 रोज़ की बिक्री</div><div class="bars">${days.map(d => `<div><i style="height:${Math.round(d.v / mx * 70) + 2}px"></i><b>${d.v >= 1000 ? (d.v / 1000).toFixed(1) + "k" : d.v}</b><small>${d.d.toLocaleDateString("hi-IN", { weekday: "short" })}<br>${d.n}</small></div>`).join("")}</div>
  <div class="h">🍛 सबसे ज़्यादा बिकी डिश</div><div class="kot">${top.map(([n, x], i) => `<div><b>${i + 1}.</b> ${E(n)}<span>${x.q} बार · ${rs(x.v)}</span></div>`).join("") || "<div>अभी कोई ऑर्डर नहीं</div>"}</div>
  <div class="h">🛵 ऑर्डर का तरीका</div><div class="sum">${Object.keys(TY).map(k => { const L = ok.filter(o => o.type === k); return `<div><b>${L.length}</b><small>${TY[k]} · ${rs(L.reduce((t, o) => t + (+o.total || 0), 0))}</small></div>` }).join("")}</div>
  <div class="h">👥 किसने कितना काम किया</div><div class="kot">${Object.entries(who).sort((a, c) => c[1].n - a[1].n).map(([n, x]) => `<div>${E(n)}<span>${x.t ? x.t + " ऑर्डर लिए · " : ""}${x.n} बार हाथ लगाया</span></div>`).join("") || "<div>—</div>"}</div>
  <div class="h">🚨 ध्यान देने लायक</div><div class="kot"><div>⏱ ग्राहक का ऑर्डर स्वीकार होने में औसत<span>${avg ? avg + " से." : "—"}</span></div><div>❌ मना किए ऑर्डर<span>${T.length - ok.length}</span></div><div>🧾 पूरे हुए पर TMBill नंबर नहीं<span>${T.filter(o => o.status === "done" && !o.tm).length}</span></div><div>💧 टेबल की पुकार (पानी/वेटर/बिल)<span>${O.filter(o => o.kind === "call" && ["water", "waiter", "bill"].includes(o.call)).length}</span></div>${peak ? `<div>🔥 सबसे व्यस्त समय<span>${peak[0] % 12 || 12}–${(+peak[0] + 1) % 12 || 12} ${peak[0] < 12 ? "AM" : "PM"} · ${peak[1]} ऑर्डर</span></div>` : ""}</div>
  <p class="hint">यह ऐप में आए ऑर्डर का हिसाब है — पक्की बिक्री TMBill में देखें। "बिना TMBill नंबर" वाले ऑर्डर ज़रूर पूछें।</p></div>`;
}
