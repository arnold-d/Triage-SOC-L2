// Comprueba que las cifras del Dashboard cuadran con el resultado del motor.
// Usa el Excel del cliente, si está, y datasets sintéticos. Uso: node tests/test_dashboard.js [semillas=10]
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const XLSX = require(path.join(root, "app", "vendor", "xlsx.full.min.js"));
const Engine = require(path.join(root, "app", "js", "engine.js"));
const { buildRows, readWorkbook } = require(path.join(root, "app", "js", "parser.js"));
const SOCDashboard = require(path.join(root, "app", "js", "dashboard-data.js"));
const { generar, aLibro } = require(path.join(root, "tools", "generar_dataset.js"));

const fallos = [];
function comprobar(nombre, aoa) {
  const { rows } = buildRows(aoa[0], aoa.slice(1));
  const A = Engine.analyze(rows), D = SOCDashboard.build(rows, A);
  const activos = A.findings.filter(f => !f.needsValidation);
  const evidencia = new Set(A.incidents.flatMap(i => i.evidence));
  const conFecha = rows.filter(r => r.tsDate).length;
  const suma = (l, k) => l.reduce((s, x) => s + x[k], 0);
  const ids = new Set(rows.map(r => r.id));
  const checks = [
    ["incidentes = tarjetas de Análisis", D.kpis.incidents === A.incidents.length],
    ["criticidades suman los incidentes", suma(D.sev, "n") === A.incidents.length],
    ["hallazgos = activos del motor", D.kpis.findings === activos.length],
    ["categorías suman los hallazgos", suma(D.cats, "n") === activos.length],
    ["eventos implicados = evidencias", D.kpis.events === evidencia.size],
    ["histograma suma todas las filas con fecha", suma(D.hist.bins, "normal") + suma(D.hist.bins, "flagged") === conFecha],
    ["histograma marca todas las evidencias", suma(D.hist.bins, "flagged") === evidencia.size],
    ["cada fila cae dentro de su intervalo", D.hist.bins.every(b => b.ids.every(id => { const t = rows.find(r => r.id === id).tsDate.getTime(); return t >= b.t0 && t < b.t1; }))],
    ["no más de 48 intervalos", D.hist.bins.length <= 48],
    ["cuentas comprometidas salen de las evidencias", A.compromised.every(c => evidencia.has(c.evidence))],
    ["rankings ordenados y con Log_ID reales", [D.hosts, D.users, D.ips, D.mitre].every(l => l.every((x, i) => (!i || l[i - 1].n >= x.n) && x.ids.every(id => ids.has(id))))],
    ["toda técnica sale de un hallazgo activo", D.mitre.every(m => activos.some(f => f.mitre.includes(m.key)))],
  ];
  for (const [c, ok] of checks) if (!ok) fallos.push(`${nombre}: ${c}`);
  return { D, checks: checks.length };
}

const semillas = +process.argv[2] || 10;
let total = 0;
const xlsxFiles = fs.readdirSync(root).filter(f => /\.xlsx$/i.test(f)).sort((a, b) => a.length - b.length);
if (xlsxFiles.length) {
  const r = comprobar("cliente", readWorkbook(fs.readFileSync(path.join(root, xlsxFiles[0])), XLSX).aoa);
  total += r.checks; console.log("cliente:", JSON.stringify(r.D.kpis));
} else console.log("AVISO: sin Excel del cliente; se prueba solo con datasets sintéticos.");
const demo = path.join(root, "datasets", "demo_publico.xlsx");
if (fs.existsSync(demo)) { const r = comprobar("demo", readWorkbook(fs.readFileSync(demo), XLSX).aoa); total += r.checks; console.log("demo:   ", JSON.stringify(r.D.kpis)); }
for (let seed = 1; seed <= semillas; seed++) {
  const ds = generar({ seed });
  total += comprobar(`semilla ${seed}`, readWorkbook(XLSX.write(aLibro(XLSX, ds), { type: "buffer", bookType: "xlsx" }), XLSX).aoa).checks;
}
console.log(`\n${total - fallos.length} de ${total} comprobaciones correctas`);
for (const f of fallos.slice(0, 15)) console.log("  FALLA " + f);
process.exit(fallos.length ? 1 : 0);
