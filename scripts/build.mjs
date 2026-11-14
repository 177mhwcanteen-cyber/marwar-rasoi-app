// web/ → www/ (APK के भीतर: ऑफ़लाइन पन्ना) और dist/ (GitHub Pages — ऐप यहीं से हमेशा ताज़ा खुलता है)
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), W = path.join(R, "web");
const VERSION = process.env.SE_VERSION || new Date().toISOString().slice(0, 16).replace(/[-T:]/g, "");
const cp = (a, b) => fs.cpSync(a, b, { recursive: true });
for (const out of ["www", "dist"]) {
  const O = path.join(R, out); fs.rmSync(O, { recursive: true, force: true }); cp(W, O);
  fs.mkdirSync(path.join(O, "fonts"), { recursive: true }); fs.mkdirSync(path.join(O, "lib"), { recursive: true });
  for (const [pk, f] of [["mukta", "mukta-devanagari-500-normal"], ["mukta", "mukta-devanagari-700-normal"], ["mukta", "mukta-latin-500-normal"], ["mukta", "mukta-latin-700-normal"], ["baloo-2", "baloo-2-devanagari-700-normal"], ["baloo-2", "baloo-2-latin-700-normal"], ["baloo-2", "baloo-2-latin-800-normal"]])
    fs.copyFileSync(path.join(R, `node_modules/@fontsource/${pk}/files/${f}.woff2`), path.join(O, `fonts/${f}.woff2`));
  for (const f of ["leaflet.js", "leaflet.css"]) fs.copyFileSync(path.join(R, "node_modules/leaflet/dist", f), path.join(O, "lib", f));
  fs.copyFileSync(path.join(R, "node_modules/qrcodejs/qrcode.min.js"), path.join(O, "lib/qrcode.min.js"));
  fs.writeFileSync(path.join(O, "version.json"), JSON.stringify({ version: VERSION, built: new Date().toISOString() }));
  // हर बार ताज़ा फ़ाइलें: css/js के आगे ?v=…
  for (const f of ["index.html", "t/index.html", "qr.html"]) { const p = path.join(O, f); fs.writeFileSync(p, fs.readFileSync(p, "utf8").replace(/((?:href|src)="(?:\.\.\/)?(?:app\.css|core\.js|store\.js|owner\.js|cust\.js|galla\.js|team\.js|watch\.js|config\.js))"/g, `$1?v=${VERSION}"`).replace('window.MR_BUILD="dev"', `window.MR_BUILD="${VERSION}"`).replace(/\?v=[^"]*"\?v=/g, "?v=")) }
}
fs.writeFileSync(path.join(R, "www/offline.html"), `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;display:grid;place-items:center;height:100vh;background:#7a1c1c;color:#ffd77a;font:700 18px system-ui;text-align:center"><div>📶 इंटरनेट नहीं है<br><small style="font-weight:500">नेट चालू करके दोबारा खोलें</small><br><br><button onclick="location.href='https://177mhwcanteen-cyber.github.io/marwar-rasoi-app/'" style="font:inherit;padding:10px 20px;border-radius:12px;border:0">फिर कोशिश करें</button></div>`);
console.log("बना:", VERSION);
