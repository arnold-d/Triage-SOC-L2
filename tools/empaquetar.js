// Crea el zip de entrega para un Release de GitHub, a partir del último commit (HEAD), y su SHA-256.
// Uso: node tools/empaquetar.js [--version 1.0]  →  entrega/triage-soc-l2-v<version>.zip y .zip.sha256
// Solo entra lo que está en la lista y en git: nunca datos del cliente ni archivos .local.
// Requiere git; el zip resultante no necesita nada para usarse.
const { execFileSync } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const raiz = path.join(__dirname, "..");
const arg = k => { const i = process.argv.indexOf("--" + k); return i > 0 ? process.argv[i + 1] : undefined; };
const version = arg("version") || "1.0";
const nombre = `triage-soc-l2-v${version}`;
const INCLUIR = ["ABRIR_AQUI.html", "README.md", "LICENSE", "iniciar.bat", "iniciar.sh", "tools/servir.js",
  "datasets/demo_publico.xlsx", "app/index.html", "app/ai.config.example.js", "app/css", "app/js", "app/vendor"];
const PROHIBIDO = /\.local(\.|$)|(^|\/)(CLAUDE|docs|tests|legacy|entrega|video)(\/|\.|$)|\.(mp4|m4a)$/i;

const git = (...a) => execFileSync("git", ["-C", raiz, "-c", "core.autocrlf=false", ...a], { encoding: "buffer", maxBuffer: 1 << 28 });

// Lista las entradas de un zip leyendo su directorio central
function entradas(buf) {
  let fin = buf.length - 22;
  while (fin >= 0 && buf.readUInt32LE(fin) !== 0x06054b50) fin--;
  if (fin < 0) throw new Error("zip sin directorio central");
  const total = buf.readUInt16LE(fin + 10);
  let p = buf.readUInt32LE(fin + 16);
  const lista = [];
  for (let i = 0; i < total; i++) {
    const largo = buf.readUInt16LE(p + 28), extra = buf.readUInt16LE(p + 30), coment = buf.readUInt16LE(p + 32);
    lista.push({ nombre: buf.toString("utf8", p + 46, p + 46 + largo), tam: buf.readUInt32LE(p + 24), modo: buf.readUInt32LE(p + 38) >>> 16 });
    p += 46 + largo + extra + coment;
  }
  return lista;
}

const cambios = git("status", "--porcelain", "--", ...INCLUIR).toString().trim();
if (cambios) console.warn(`Aviso: hay cambios sin commit que NO entran en el zip (se usa HEAD):\n${cambios}\n`);

const zip = git("archive", "--format=zip", `--prefix=${nombre}/`, "HEAD", "--", ...INCLUIR);
const lista = entradas(zip).filter(e => !e.nombre.endsWith("/"));
const relativos = lista.map(e => e.nombre.slice(nombre.length + 1));
const malos = relativos.filter(r => PROHIBIDO.test(r) || (/\.xlsx$/i.test(r) && r !== "datasets/demo_publico.xlsx")
  || !INCLUIR.some(i => r === i || r.startsWith(i + "/")));
if (malos.length) { console.error("El zip incluiría archivos no permitidos:", malos); process.exit(1); }
for (const r of ["ABRIR_AQUI.html", "app/index.html", "LICENSE", "README.md", "datasets/demo_publico.xlsx"])
  if (!relativos.includes(r)) { console.error(`Falta ${r} en el zip`); process.exit(1); }

const salida = path.join(raiz, "entrega");
fs.mkdirSync(salida, { recursive: true });
const archivo = path.join(salida, `${nombre}.zip`);
fs.writeFileSync(archivo, zip);
const sha = crypto.createHash("sha256").update(zip).digest("hex");
fs.writeFileSync(`${archivo}.sha256`, `${sha}  ${nombre}.zip\n`);

const commit = git("rev-parse", "--short", "HEAD").toString().trim();
console.log(`${path.relative(raiz, archivo)} (commit ${commit}, ${lista.length} archivos, ${(zip.length / 1024).toFixed(0)} KB)`);
console.log(`SHA-256 ${sha}`);
