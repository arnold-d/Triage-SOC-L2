// Sirve app/ solo en este equipo y abre el navegador. Sin dependencias.
// Uso: node tools/servir.js [--puerto 8765] [--no-abrir]
// Ollama acepta peticiones de http://127.0.0.1 sin configuración; abierta con doble clic (file://),
// la página envía "Origin: null" y Ollama la rechaza. La única forma de admitirla sería
// OLLAMA_ORIGINS=*, que expone Ollama a cualquier web visitada.
const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const HOST = "127.0.0.1";
const MARCA = "triage-soc-l2";
const raiz = path.join(__dirname, "..", "app");
const arg = k => { const i = process.argv.indexOf("--" + k); return i > 0 ? process.argv[i + 1] : undefined; };
const puerto = +(arg("puerto") || 8765);
const url = `http://${HOST}:${puerto}/`;
const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon" };
const hostsValidos = new Set([`${HOST}:${puerto}`, `localhost:${puerto}`]);

function abrirNavegador() {
  if (process.argv.includes("--no-abrir")) return;
  const [cmd, args] = process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
  const p = spawn(cmd, args, { stdio: "ignore", detached: true });
  p.on("error", () => console.log(`Abre ${url} en tu navegador.`));
  p.unref();
}
function responder(res, codigo, texto) {
  res.writeHead(codigo, { "content-type": "text/plain; charset=utf-8", "x-content-type-options": "nosniff" });
  res.end(texto);
}

const servidor = http.createServer((req, res) => {
  // Evita que una web ajena alcance este servidor mediante DNS rebinding
  if (!hostsValidos.has(req.headers.host)) return responder(res, 403, "Host no permitido");
  if (req.method !== "GET" && req.method !== "HEAD") return responder(res, 405, "Método no permitido");
  let ruta;
  try { ruta = decodeURIComponent(new URL(req.url, url).pathname); } catch { return responder(res, 400, "Ruta no válida"); }
  if (ruta === "/__servir") return responder(res, 200, MARCA);
  const archivo = path.resolve(raiz, "." + (ruta.endsWith("/") ? ruta + "index.html" : ruta));
  if (archivo !== raiz && !archivo.startsWith(raiz + path.sep)) return responder(res, 403, "Fuera de la app");
  fs.stat(archivo, (err, info) => {
    if (err || !info.isFile()) return responder(res, 404, "No encontrado");
    res.writeHead(200, { "content-type": TIPOS[path.extname(archivo).toLowerCase()] || "application/octet-stream", "content-length": info.size, "cache-control": "no-store", "x-content-type-options": "nosniff" });
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(archivo).pipe(res);
  });
});

servidor.on("error", async e => {
  if (e.code !== "EADDRINUSE") { console.error(`No se pudo iniciar: ${e.message}`); process.exit(1); }
  try {
    const r = await fetch(url + "__servir");
    if ((await r.text()) === MARCA) { console.log(`La app ya estaba en marcha en ${url}`); abrirNavegador(); return; }
  } catch { /* lo ocupa otro programa */ }
  console.error(`El puerto ${puerto} está ocupado por otro programa. Prueba con: node tools/servir.js --puerto ${puerto + 1}`);
  process.exit(1);
});
servidor.listen(puerto, HOST, () => {
  console.log(`Triage SOC L2 en ${url} (solo en este equipo). Cierra esta ventana o pulsa Ctrl+C para detenerla.`);
  abrirNavegador();
});
