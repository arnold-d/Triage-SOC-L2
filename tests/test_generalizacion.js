// Prueba de generalización: datasets sintéticos con verdad de referencia contra el motor.
// Cada dataset recorre el camino real: .xlsx en memoria → parser → motor.
// Uso: node tests/test_generalizacion.js [semillas=30] [--detalle]
const path = require("path");
const root = path.join(__dirname, "..");
const XLSX = require(path.join(root, "app", "vendor", "xlsx.full.min.js"));
const Engine = require(path.join(root, "app", "js", "engine.js"));
const { buildRows, readWorkbook } = require(path.join(root, "app", "js", "parser.js"));
const { generar, aLibro } = require(path.join(root, "tools", "generar_dataset.js"));

const semillas = +process.argv.find(a => /^\d+$/.test(a)) || 30;
const detalle = process.argv.includes("--detalle");
const SEV = Engine.SEV_RANK;
const MARGEN_VENTANA_MIN = 90;
const stats = {}, fallos = [], falsos = [];
const cuenta = (tipo, acierto) => { const s = stats[tipo] ||= { detectados: 0, insertados: 0 }; s.insertados++; if (acierto) s.detectados++; };

for (let seed = 1; seed <= semillas; seed++) {
  const ds = generar({ seed });
  const buf = XLSX.write(aLibro(XLSX, ds), { type: "buffer", bookType: "xlsx" });
  const { aoa } = readWorkbook(buf, XLSX);
  const { rows, sinFecha } = buildRows(aoa[0], aoa.slice(1));
  const res = Engine.analyze(rows);
  const t = ds.truth;
  if (sinFecha) fallos.push(`semilla ${seed}: ${sinFecha} filas sin fecha legible (${t.formato})`);
  const horaMal = rows.filter(r => r.ts !== ds.horas.get(r.id));
  if (horaMal.length) fallos.push(`semilla ${seed}: ${horaMal.length} filas con hora distinta (${t.formato}): ${horaMal[0].ts} en lugar de ${ds.horas.get(horaMal[0].id)}`);
  cuenta(`fecha ${t.formato}`, !sinFecha && !horaMal.length);

  for (const e of t.escenarios) {
    const inc = res.incidents.find(i => e.clave.every(id => i.evidence.includes(id)));
    let motivo = "";
    if (!inc) {
      const parcial = res.incidents.filter(i => e.clave.some(id => i.evidence.includes(id))).map(i => `${i.id}:${e.clave.filter(id => i.evidence.includes(id)).length}/${e.clave.length}`);
      motivo = `sin incidente con todos sus Log_ID clave (parcial: ${parcial.join(" ") || "ninguno"})`;
    } else if (SEV[inc.sev] < SEV[e.sevMin]) motivo = `criticidad ${inc.sev} < ${e.sevMin}`;
    else { const falta = e.categorias.filter(c => !inc.cats.includes(c)); if (falta.length) motivo = `faltan categorías ${falta.join(",")}`; }
    if (inc && !motivo) {
      // las señales débiles cercanas pueden ampliar el incidente, pero no estirarlo con actividad ajena;
      // si dos ataques comparten actor y el motor los une, cuenta la duración de ambos
      const unidos = t.escenarios.filter(o => o.clave.some(id => inc.evidence.includes(id)));
      const horas = unidos.flatMap(o => o.clave).map(id => Date.parse(ds.horas.get(id).replace(" ", "T"))).sort((a, b) => a - b);
      const propia = horas.at(-1) - horas[0], total = inc.end.tsDate - inc.start.tsDate;
      if (total > propia + MARGEN_VENTANA_MIN * 6e4) motivo = `ventana inflada: ${Math.round(total / 6e4)} min frente a ${Math.round(propia / 6e4)} del ataque`;
    }
    cuenta(e.tipo, !motivo);
    if (motivo) fallos.push(`semilla ${seed} · ${e.tipo} (${e.actor}): ${motivo}`);
  }
  if (t.parecido) {
    const hit = res.validations.some(v => v.title.includes(t.parecido.variante));
    const enIncidente = res.incidents.some(i => i.findings.some(f => f.rule.includes("nombre parecido")));
    cuenta("parecido", hit && !enIncidente);
    if (!hit || enIncidente) fallos.push(`semilla ${seed} · parecido ${t.parecido.base}/${t.parecido.variante}: no quedó a validar`);
  }

  const enIncidentes = new Set(res.incidents.flatMap(i => i.evidence));
  for (const c of t.casiAtaques) {
    const dentro = c.ids.filter(id => enIncidentes.has(id)).length;
    cuenta(`casi ${c.tipo}`, !dentro);
    if (dentro) falsos.push({ seed, id: "-", sev: "-", reglas: `casi-ataque ${c.tipo} dentro de un incidente`, n: dentro, casi: c.tipo });
  }
  const ataque = new Set(t.escenarios.flatMap(e => e.clave));
  for (const i of res.incidents) {
    if (i.evidence.some(id => ataque.has(id))) continue;
    const casi = t.casiAtaques.filter(c => c.ids.some(id => i.evidence.includes(id))).map(c => c.tipo);
    falsos.push({ seed, id: i.id, sev: i.sev, reglas: [...new Set(i.findings.map(f => f.rule))].join(", "), n: i.evidence.length, casi: casi.join(",") || "normal" });
  }
}

console.log("Tipo de escenario     detectados / insertados");
for (const [tipo, s] of Object.entries(stats).sort()) console.log(`  ${tipo.padEnd(18)} ${String(s.detectados).padStart(5)} / ${s.insertados}`);
const porRegla = {};
for (const f of falsos) for (const r of f.reglas.split(", ")) porRegla[r] = (porRegla[r] || 0) + 1;
console.log(`\nFalsos positivos: ${falsos.length} incidentes en ${new Set(falsos.map(f => f.seed)).size} de ${semillas} semillas`);
for (const [r, n] of Object.entries(porRegla).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${r}`);
if (detalle) { for (const f of falsos.slice(0, 25)) console.log("  FP", JSON.stringify(f)); }
console.log(`\nFallos de cobertura: ${fallos.length}`);
for (const f of fallos.slice(0, detalle ? 40 : 12)) console.log("  " + f);
const ok = !fallos.length && !falsos.length;
console.log(ok ? "\nOK: 100 % de cobertura y 0 incidentes falsos" : "\nFALLA: revisar cobertura o falsos positivos");
process.exit(ok ? 0 : 1);
