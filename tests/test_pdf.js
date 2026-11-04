// Genera los PDF en Node y comprueba que salen completos y que la fuente tiene todos sus caracteres.
// Uso: node tests/test_pdf.js [semillas=10]
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const XLSX = require(path.join(root, "app", "vendor", "xlsx.full.min.js"));
const pdfMake = require(path.join(root, "app", "vendor", "pdfmake.min.js"));
const vfs = require(path.join(root, "app", "vendor", "vfs_fonts.js"));
const Engine = require(path.join(root, "app", "js", "engine.js"));
const AI = require(path.join(root, "app", "js", "ai.js"));
const Report = require(path.join(root, "app", "js", "report.js"));
const Pdf = require(path.join(root, "app", "js", "pdf.js"));
const { buildRows, readWorkbook } = require(path.join(root, "app", "js", "parser.js"));
const { generar, aLibro } = require(path.join(root, "tools", "generar_dataset.js"));
pdfMake.addVirtualFileSystem(vfs);

// Caracteres de la fuente, leídos de su tabla cmap
function cmap(b64) {
  const b = Buffer.from(b64, "base64"), n = b.readUInt16BE(4), set = new Set();
  let off = 0; for (let i = 0; i < n; i++) { const r = 12 + i * 16; if (b.toString("latin1", r, r + 4) === "cmap") off = b.readUInt32BE(r + 8); }
  for (let i = 0; i < b.readUInt16BE(off + 2); i++) {
    const so = off + b.readUInt32BE(off + 4 + i * 8 + 4), fmt = b.readUInt16BE(so);
    if (fmt === 4) { const seg = b.readUInt16BE(so + 6) / 2; for (let s = 0; s < seg; s++) { const end = b.readUInt16BE(so + 14 + s * 2), start = b.readUInt16BE(so + 16 + seg * 2 + s * 2); for (let c = start; c <= end && c !== 0xFFFF; c++) set.add(c); } }
  }
  return set;
}
const glifos = ["Roboto-Regular.ttf", "Roboto-Medium.ttf"].map(f => cmap(vfs[f]));
const sinGlifo = text => [...new Set([...text].filter(ch => ch !== "\n" && !glifos.every(g => g.has(ch.codePointAt(0)))))];

const fallos = [];
let total = 0;
const check = (n, ok, extra = "") => { total++; if (!ok) fallos.push(`${n}${extra ? " · " + extra : ""}`); };
const paginas = buf => (buf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;

async function comprobar(nombre, aoa, conIA) {
  const { rows } = buildRows(aoa[0], aoa.slice(1));
  const A = Engine.analyze(rows);
  // Textos de IA de prueba con caracteres que Roboto no tiene, para comprobar la sustitución
  const explanations = conIA ? new Map(A.incidents.map(i => [i.id, { text: `Acceso → movimiento ✓ ⚠ [${i.evidence[0]}].`, model: "modelo", cit: AI.citations(`[${i.evidence[0]}]`, rows, i.evidence) }])) : new Map();
  const executiveAI = conIA ? { text: `Se identificaron ${A.incidents.length} incidentes → revisar.`, model: "modelo", check: Report.checkExecutive(`Se identificaron ${A.incidents.length} incidentes.`, rows, A) } : null;
  const meta = { analista: "Ana Pérez", cliente: "Cliente de prueba", fecha: "2026-11-04", reviewed: true };
  const R = Report.build(rows, A, { meta, explanations, executiveAI });
  for (const kind of ["executive", "technical"]) {
    const doc = Pdf.docDefinition(R, kind, { meta, source: `${nombre} · ${rows.length} eventos` });
    const text = Pdf.allText(doc);
    check(`${nombre} ${kind}: todos los caracteres existen en la fuente`, !sinGlifo(text).length, JSON.stringify(sinGlifo(text)));
    check(`${nombre} ${kind}: la portada indica la revisión`, text.includes("Sí, Ana Pérez"));
    if (kind === "technical") {
      const ids = new Set(rows.map(r => r.id));
      const enPdf = new Set(AI.citations(text, rows).items.filter(i => i.kind === "log").map(i => i.token));
      const enInforme = new Set(AI.citations(Report.toText(R), rows).items.filter(i => i.kind === "log").map(i => i.token));
      check(`${nombre} técnico: lleva todos los Log_ID del informe y existen`, [...enInforme].every(id => enPdf.has(id)) && [...enPdf].every(id => ids.has(id)), `${enPdf.size} frente a ${enInforme.size}`);
      check(`${nombre} técnico: las 9 secciones`, R.technical.every(s => text.includes(Pdf.safe(s.title))));
      if (conIA) check(`${nombre} técnico: el texto de IA va marcado`, (text.match(/TEXTO DE IA/g) || []).length === A.incidents.length + 1);
    } else {
      check(`${nombre} ejecutivo: las 5 secciones`, R.executive.every(s => text.includes(s.title)));
      if (conIA) check(`${nombre} ejecutivo: el resumen de IA va marcado`, text.includes("TEXTO DE IA"));
    }
    // El resumen de IA sustituye al de plantilla (nunca los dos) y su etiqueta habla de cifras, no de citas
    const plantilla = R[kind][0].blocks.filter(b => b.kind === "p" && b.source === "plantilla" && /eventos del SIEM identific/.test(b.text));
    const ia = R[kind][0].blocks.filter(b => b.kind === "ai");
    check(`${nombre} ${kind}: un solo resumen`, conIA ? ia.length === 1 && !plantilla.length : !ia.length && plantilla.length === 1);
    if (conIA) {
      check(`${nombre} ${kind}: el resumen de IA no dice "0 citas"`, !/0 citas verificadas, 0 no encontradas/.test(text));
      check(`${nombre} ${kind}: etiqueta de cifras comprobadas`, text.includes("cifras comprobadas con el motor"));
    }
    const buf = await pdfMake.createPdf(doc).getBuffer();
    const n = paginas(Buffer.from(buf));
    check(`${nombre} ${kind}: el PDF se genera`, buf.length > 20000 && Buffer.from(buf).slice(0, 5).toString() === "%PDF-", `${buf.length} bytes`);
    check(`${nombre} ${kind}: número de páginas razonable`, kind === "executive" ? n >= 1 && n <= 4 : n >= 9, `${n} páginas`);
    if (nombre === "demo") console.log(`demo ${kind}: ${n} páginas, ${Math.round(buf.length / 1024)} KB`);
    if (nombre === "demo" && conIA && process.env.PDF_SALIDA) fs.writeFileSync(path.join(process.env.PDF_SALIDA, Pdf.fileName(kind, meta.fecha)), Buffer.from(buf));
  }
}

(async () => {
  check("nombre del ejecutivo", Pdf.fileName("executive", "2026-11-04") === "Informe_Ejecutivo_2026-11-04.pdf");
  check("nombre del técnico", Pdf.fileName("technical", "2026-11-04") === "Informe_Tecnico_2026-11-04.pdf");
  check("sustituye los caracteres que faltan", Pdf.safe("a → b ← c ✓ d ⚠") === "a -> b <- c  d !");
  const demo = readWorkbook(fs.readFileSync(path.join(root, "datasets", "demo_publico.xlsx")), XLSX).aoa;
  await comprobar("demo", demo, true);
  await comprobar("demo sin IA", demo, false);
  const xlsx = fs.readdirSync(root).filter(f => /\.xlsx$/i.test(f)).sort((a, b) => a.length - b.length)[0];
  if (xlsx) await comprobar("cliente", readWorkbook(fs.readFileSync(path.join(root, xlsx)), XLSX).aoa, true);
  for (let seed = 1; seed <= (+process.argv[2] || 10); seed++) {
    const ds = generar({ seed });
    await comprobar(`semilla ${seed}`, readWorkbook(XLSX.write(aLibro(XLSX, ds), { type: "buffer", bookType: "xlsx" }), XLSX).aoa, seed % 2 === 0);
  }
  console.log(`\n${total - fallos.length} de ${total} comprobaciones correctas`);
  for (const f of fallos.slice(0, 15)) console.log("  FALLA " + f);
  process.exit(fallos.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
