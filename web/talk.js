/* मारवाड़ रसोई — 🎙️ वॉकी-टॉकी (15-11-2026): दबाए रखें → बोलें → छोड़ें = पूरी टीम के फोन पर अपने-आप बजे (APK: स्क्रीन बंद हो तब भी)
   talk/{id}: {a: base64 आवाज़ (≤20 से., opus), mt, d सेकंड, by, uid, role, ts} — APK का OrderRingService हर चक्कर में नए talk पूछकर बजाता है (अपना नहीं)। */
const TK = { rec: null, ch: [], t0: 0, seen: LS.get("mr_tk_seen", 0) || now(), list: [], au: null };
const b64 = blob => new Promise(r => { const f = new FileReader(); f.onload = () => r(String(f.result).split(",")[1] || ""); f.readAsDataURL(blob) });
async function tkStart(btn) { if (TK.rec) return;
  if (!navigator.mediaDevices || !window.MediaRecorder) return toast("इस फोन में आवाज़ रिकॉर्ड नहीं होती");
  let st; try { st = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }) } catch (e) { return toast("🎙️ माइक की इजाज़त दें") }
  const mt = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/webm", "audio/mp4"].find(x => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(x)) || "";
  TK.ch = []; TK.rec = new MediaRecorder(st, Object.assign({ audioBitsPerSecond: 24000 }, mt ? { mimeType: mt } : {})); TK.t0 = now();
  TK.rec.ondataavailable = e => e.data.size && TK.ch.push(e.data);
  TK.rec.onstop = async () => { st.getTracks().forEach(t => t.stop()); const d = (now() - TK.t0) / 1000, mime = TK.rec.mimeType || mt || "audio/webm"; TK.rec = null; btn && btn.classList.remove("on");
    if (d < 0.7) return toast("बटन दबाए रखकर बोलें"); const a = await b64(new Blob(TK.ch, { type: mime }));
    try { await COL("talk").add({ a, mt: mime.split(";")[0], d: Math.round(d * 10) / 10, by: ME.name, uid: ME.uid || "", role: ME.role }); toast("🎙️ टीम को भेज दिया ✔"); tkLoad(true) } catch (e) { toast("नहीं गया — नेट देखें") } };
  TK.rec.start(); btn && btn.classList.add("on"); navigator.vibrate && navigator.vibrate(40); setTimeout(() => TK.rec && TK.rec.state === "recording" && TK.rec.stop(), 20000) }
const tkStop = () => { if (TK.rec && TK.rec.state === "recording") TK.rec.stop() };
const tkPlay = m => { try { (TK.au = TK.au || new Audio()).src = "data:" + (m.mt || "audio/webm") + ";base64," + m.a; TK.au.play() } catch (e) { } };
/* Firestore में सिर्फ़ ज़रूरत भर पढ़ो (आवाज़ भारी होती है): ts > from, ज़्यादा से ज़्यादा n */
const tkQ = (from, n, last) => (FS_ON ? fsQuery({ from: [{ collectionId: "talk" }], where: { fieldFilter: { field: { fieldPath: "ts" }, op: "GREATER_THAN", value: { integerValue: String(Math.floor(from)) } } }, orderBy: [{ field: { fieldPath: "ts" }, direction: last ? "DESCENDING" : "ASCENDING" }], limit: n })
  : COL("talk").list().then(L => L.filter(x => x.ts > from))).then(L => { L.sort((a, c) => a.ts - c.ts); return last ? L.slice(-n) : L.slice(0, n) });
async function tkLoad(draw2) { const L = await tkQ(now() - 864e5, 25, true).catch(() => []); TK.list = L;
  if (draw2 && $("#tkl")) $("#tkl").innerHTML = tkRows(); return L }
const tkRows = () => TK.list.slice(-25).reverse().map(m => `<button class="tkr ${m.uid && m.uid === (ME.uid || "") || m.by === ME.name ? "me" : ""}" data-tp="${m.id}"><i>▶</i><span><b>${E(m.by || "")}</b> <small>${E(roleHi(m.role || ""))} · ${hm(m.ts)} · ${m.d || "?"} से.</small></span></button>`).join("") || `<div class="empty">आज अभी कोई संदेश नहीं</div>`;
async function talkSheet() { const b = sheet(`<h3>🎙️ वॉकी-टॉकी</h3><p class="hint">बटन <b>दबाए रखें</b> → बोलें → छोड़ें। पूरी टीम के फोन पर अपने-आप बजेगा (नई APK में स्क्रीन बंद हो तब भी)। ज़्यादा से ज़्यादा 20 सेकंड।</p>
  <button class="tkbig" id="tkb">🎙️<small>दबाए रखकर बोलें</small></button><div class="h">आज के संदेश</div><div id="tkl"><div class="empty">⏳…</div></div>`), btn = $("#tkb", b);
  const st = e => { e.preventDefault(); tkStart(btn) }, sp = e => { e.preventDefault(); tkStop() };
  btn.addEventListener("pointerdown", st); ["pointerup", "pointerleave", "pointercancel"].forEach(k => btn.addEventListener(k, sp)); btn.oncontextmenu = e => e.preventDefault();
  b.onclick = e => { const t = e.target.closest("[data-tp]"); if (t) tkPlay(TK.list.find(x => x.id === t.dataset.tp)) };
  await tkLoad(true) }
/* ब्राउज़र/ऐप खुला हो (APK की सेवा न हो) तो नए संदेश यहीं बजें */
setInterval(async () => { if (!ME || NAT() || !ROLES[ME.role] || DB.mode === "local" && !LS.get("mr_remdemo", 0)) return; const L = await tkQ(TK.seen, 3).catch(() => []);
  const nw = L.filter(m => m.ts > TK.seen && m.by !== ME.name); if (!nw.length) return; TK.seen = nw[nw.length - 1].ts; LS.set("mr_tk_seen", TK.seen); tkPlay(nw[nw.length - 1]); toast("🎙️ " + nw[nw.length - 1].by + " का संदेश") }, 10000);
