// Genera app/sample.local.js desde el Excel del cliente, para el botón "Abrir el export del cliente".
// Uso: node tools/generar_sample.js [ruta.xlsx]   → sin ruta, usa el .xlsx de nombre más corto de la raíz.
// El resultado no va a git.
const fs = require("fs");
const path = require("path");
const XLSX = require(path.join(__dirname, "..", "app", "vendor", "xlsx.full.min.js"));
const { readWorkbook } = require(path.join(__dirname, "..", "app", "js", "parser.js"));

const root = path.join(__dirname, "..");
const xlsxFiles = fs.readdirSync(root).filter(f => /\.xlsx$/i.test(f)).sort((a, b) => a.length - b.length);
const file = process.argv[2] || (xlsxFiles[0] && path.join(root, xlsxFiles[0]));
if (!file) { console.error("No hay ningún .xlsx en la raíz del proyecto. Indica la ruta como argumento."); process.exit(1); }

const { sheetName, aoa } = readWorkbook(fs.readFileSync(file), XLSX);
const text = c => c instanceof Date ? c.toISOString() : String(c);
const sample = { name: path.basename(file), sheet: sheetName, cols: aoa[0].map(text), rows: aoa.slice(1).map(r => r.map(text)) };
const out = path.join(root, "app", "sample.local.js");
fs.writeFileSync(out, "window.SOC_SAMPLE = " + JSON.stringify(sample) + ";\n", "utf8");
console.log(`${out}: ${sample.rows.length} eventos de ${sample.name}`);
