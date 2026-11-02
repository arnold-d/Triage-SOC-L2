// Prueba del motor contra el Excel del cliente (solo local: esos datos no van a git).
// Uso: node tests/test_cliente.js [--sample] [ruta.xlsx]
//   Sin argumentos usa el .xlsx de nombre más corto de la raíz y, si no hay, app/sample.local.js.
//   Con --sample usa directamente app/sample.local.js.
// Esperado: 6 incidentes (4 Crítico, 2 Alto) y 2 anomalías a validar.
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const Engine = require(path.join(root, "app", "js", "engine.js"));
const { buildRows, readWorkbook } = require(path.join(root, "app", "js", "parser.js"));

function loadExcel(file) {
  const XLSX = require(path.join(root, "app", "vendor", "xlsx.full.min.js"));
  const { aoa } = readWorkbook(fs.readFileSync(file), XLSX);
  return { label: path.basename(file), header: aoa[0], data: aoa.slice(1) };
}
function loadSample(file) {
  global.window = {};
  require(file);
  const s = global.window.SOC_SAMPLE;
  return { label: "sample.local.js", header: s.cols, data: s.rows };
}
function findData() {
  const args = process.argv.slice(2);
  const sampleFile = path.join(root, "app", "sample.local.js");
  const hasSample = fs.existsSync(sampleFile);
  if (args.includes("--sample")) return hasSample ? loadSample(sampleFile) : null;
  if (args[0]) return loadExcel(args[0]);
  const xlsxFiles = fs.readdirSync(root).filter(f => /\.xlsx$/i.test(f)).sort((a, b) => a.length - b.length);
  if (xlsxFiles.length) return loadExcel(path.join(root, xlsxFiles[0]));
  return hasSample ? loadSample(sampleFile) : null;
}

const src = findData();
if (!src) {
  console.log("AVISO: no se encontró el Excel del cliente ni app/sample.local.js; prueba omitida.");
  process.exit(0);
}
const { rows } = buildRows(src.header, src.data);
const res = Engine.analyze(rows);
const incidents = [...res.incidents].sort((a, b) => a.id.localeCompare(b.id));
console.log(`Datos: ${src.label} · ${rows.length} eventos`);
for (const i of incidents) {
  console.log(`\n${i.id} [${i.sev}] ${i.title}  ${i.start.ts.slice(11, 16)}-${i.end.ts.slice(11, 16)}  evidencias=${i.evidence.length}`);
  for (const f of i.findings) console.log(`   ${f.id} ${f.sev.padEnd(7)} ${f.title}`);
}
console.log("\nA validar:");
for (const f of res.validations) console.log("  ", f.title);

const bySev = s => res.incidents.filter(i => i.sev === s).length;
const known = new Set(rows.map(r => r.id));
const badIds = res.findings.flatMap(f => f.evidence).filter(id => !known.has(id));
const checks = [
  ["6 incidentes", res.incidents.length === 6],
  ["4 Crítico", bySev("Crítico") === 4],
  ["2 Alto", bySev("Alto") === 2],
  ["2 anomalías a validar", res.validations.length === 2],
  ["todos los Log_ID citados existen", badIds.length === 0],
];
console.log("");
for (const [name, ok] of checks) console.log(`${ok ? "OK  " : "FALLA"} ${name}`);
process.exit(checks.every(c => c[1]) ? 0 : 1);
