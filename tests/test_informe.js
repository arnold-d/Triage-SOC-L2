// Comprueba que los informes salen completos del motor, sin IA, y que no citan nada que no exista.
// Usa el Excel del cliente si está, la demo y datasets sintéticos. Uso: node tests/test_informe.js [semillas=30]
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const XLSX = require(path.join(root, "app", "vendor", "xlsx.full.min.js"));
const Engine = require(path.join(root, "app", "js", "engine.js"));
const AI = require(path.join(root, "app", "js", "ai.js"));
const Report = require(path.join(root, "app", "js", "report.js"));
const { buildRows, readWorkbook } = require(path.join(root, "app", "js", "parser.js"));
const { generar, aLibro } = require(path.join(root, "tools", "generar_dataset.js"));

const fallos = [], tipos = {};
let total = 0;
function comprobar(nombre, aoa, truth) {
  const { rows } = buildRows(aoa[0], aoa.slice(1));
  const A = Engine.analyze(rows), R = Report.build(rows, A);
  const texto = Report.toText(R);
  const cit = AI.citations(texto, rows);
  const plan = R.technical.find(s => s.id === "t7").blocks;
  const checks = [
    ["5 secciones en el ejecutivo y 9 en el técnico", R.executive.length === 5 && R.technical.length === 9],
    ["ninguna sección, frase, elemento ni celda vacíos", [...R.executive, ...R.technical].every(s => s.blocks.length && s.blocks.every(b => b.kind === "table" ? b.rows.flat().every(c => String(c).trim()) : b.kind === "list" ? b.items.length && b.items.every(x => x.trim()) : String(b.text).trim()))],
    ["sin dobles espacios de un dato ausente", !/[^\n ] {2,}[^ ]/.test(texto), (texto.match(/.{30}[^\n ] {2,}[^ ].{20}/) || [""])[0]],
    ["el riesgo global se justifica", A.incidents.length === 0 || texto.includes(A.criteria[A.incidents[0].sev])],
    ["decisiones sin repetir", new Set(R.executive[4].blocks[0].items).size === R.executive[4].blocks[0].items.length && R.executive[4].blocks[0].items.length <= 5],
    ["todo Log_ID del informe existe", cit.items.filter(i => i.kind === "log").length > 0 && cit.missing === 0, cit.items.filter(i => i.status === "missing").map(i => i.token).slice(0, 5).join()],
    ["sin restos de plantilla", !/undefined|NaN|\bnull\b|\[object/.test(texto), (texto.match(/.{30}(undefined|NaN|\bnull\b).{30}/) || [""])[0]],
    ["la cifra de incidentes es la del motor", texto.includes(`${rows.length.toLocaleString("es")} eventos`) && (A.incidents.length === 0 || texto.includes(String(A.incidents.length)))],
    ["cada incidente tiene fila, explicación, evidencias y plan completo", A.incidents.every(i => texto.includes(`${i.id} · ${i.title}`) && plan.filter(b => b.kind === "list").length === A.incidents.length * 3 && plan.filter(b => b.kind === "list").every(b => b.items.length && b.items.every(x => x.length > 10)))],
    ["cada hallazgo activo está en la tabla", A.findings.filter(f => !f.needsValidation).every(f => texto.includes(f.id))],
    ["las anomalías a validar están en el anexo", A.validations.every(v => texto.includes(v.title))],
  ];
  if (truth) for (const k of R.kinds) tipos[k.kind] = (tipos[k.kind] || 0) + 1;
  if (truth) checks.push(["ningún ataque queda como tipo 'otro'", R.kinds.every(k => k.kind !== "other"), JSON.stringify(R.kinds)]);
  for (const [c, ok, extra] of checks) { total++; if (!ok) fallos.push(`${nombre}: ${c}${extra ? " · " + extra : ""}`); }
  return { R, A, rows, texto };
}

const xlsx = fs.readdirSync(root).filter(f => /\.xlsx$/i.test(f)).sort((a, b) => a.length - b.length)[0];
if (xlsx) comprobar("cliente", readWorkbook(fs.readFileSync(path.join(root, xlsx)), XLSX).aoa);
else console.log("AVISO: sin Excel del cliente; se prueba con datasets sintéticos.");
const demo = comprobar("demo", readWorkbook(fs.readFileSync(path.join(root, "datasets", "demo_publico.xlsx")), XLSX).aoa, true);
const semillas = +process.argv[2] || 30;
for (let seed = 1; seed <= semillas; seed++) {
  const ds = generar({ seed });
  comprobar(`semilla ${seed}`, readWorkbook(XLSX.write(aLibro(XLSX, ds), { type: "buffer", bookType: "xlsx" }), XLSX).aoa, ds.truth);
}

// Comprobación de cifras del resumen ejecutivo con IA
const { rows, A } = demo, n = A.incidents.length;
const bien = Report.checkExecutive(`Se detectaron ${n} incidentes, entre ellos ${A.incidents[0].id}, en ${rows.length} eventos.`, rows, A);
const malCifra = Report.checkExecutive(`Se detectaron ${n + 37} incidentes.`, rows, A);
const malId = Report.checkExecutive("El incidente INC-99 es grave.", rows, A);
for (const [c, ok] of [["resumen con cifras del motor: válido", bien.ok], ["resumen con una cifra inventada: marcada", !malCifra.ok && malCifra.cifras.includes(String(n + 37))],
  ["resumen con un incidente inexistente: marcado", !malId.ok && malId.ids.includes("INC-99")], ["las horas no cuentan como cifras", Report.checkExecutive("A las 09:15 empezó.", rows, A).ok]]) { total++; if (!ok) fallos.push(c); }
const msgs = Report.executiveMessages(rows, A);
total++; if (/\[[A-Z]+-?\d{3,}\]|EVT-|LOG-/.test(msgs[1].content)) fallos.push("el prompt ejecutivo no debe llevar filas de log");

console.log("Tipos de incidente en datasets sintéticos:", JSON.stringify(tipos));
console.log(`\n${total - fallos.length} de ${total} comprobaciones correctas`);
for (const f of fallos.slice(0, 15)) console.log("  FALLA " + f);
process.exit(fallos.length ? 1 : 0);
