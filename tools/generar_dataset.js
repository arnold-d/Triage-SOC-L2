// Generador de exports SIEM sintéticos con verdad de referencia. Determinista por semilla.
// Uso: node tools/generar_dataset.js --seed 42 --eventos 1500 --out datasets/sint_42.xlsx
// Escribe el .xlsx y, junto a él, sint_42.truth.json. No usa datos de ningún cliente.
const fs = require("fs");
const path = require("path");

const COLS = ["Log_ID", "Timestamp", "Hostname", "Event_ID", "User", "Source_IP", "Destination", "Log_Source", "Event_Description", "Process_CommandLine", "Result", "Severity"];
const MIN = 60e3;
const DOMINIOS = ["ACME", "NORDBANK", "CONTOSO", "LUMEN", "KESTREL", "VERTEX", "ORBITA", "HALCON"];
const NOMBRES = ["ana", "bruno", "carla", "diego", "elena", "fabio", "gloria", "hugo", "irene", "javier", "karla", "luis", "marta", "nico", "olga", "pablo", "rosa", "sergio", "tania", "ulises", "vera", "walter", "ximena", "yago", "zoe"];
const APELLIDOS = ["alonso", "benitez", "castro", "dominguez", "espinoza", "flores", "gimenez", "herrera", "ibarra", "jimenez", "kuhn", "lara", "mendez", "nunez", "ortega", "paredes", "quiroga", "rios", "salas", "toledo", "urbina", "vargas", "weiss", "yanez", "zarate"];
const SERVICIOS = ["bak", "sql", "web", "mon", "rep", "sync"];
const ESQUEMAS_PC = [n => `PC-${1000 + n}`, n => `LAP${200 + n}`, n => `WKS-${String(n + 1).padStart(3, "0")}`];
const ROLES_SRV = { dc: ["AD", "DOM"], fs: ["FILES", "NAS"], app: ["ERP", "CRM"], web: ["PORTAL", "EXT"], db: ["ORA", "PG"] };
const RECURSOS = ["Finance", "Legal", "RRHH", "Payroll"];
const WEB_RUTAS = ["/", "/index.html", "/css/site.css", "/js/app.js", "/login", "/contacto", "/img/logo.png"];
const DESTINOS_WEB = ["cdn.ejemplo.net:443", "api.proveedor.test:443", "correo.ejemplo.org:443", "updates.ejemplo.net:443"];
const PROCESOS = ["explorer.exe", "taskhostw.exe", "notepad.exe", "svchost.exe"];
const EVENTOS_NORMALES = [["4624", 16], ["4625", 10], ["4634", 13], ["4688", 13], ["5140", 10], ["5156", 9], ["4663", 9], ["7036", 8], ["PROXY", 6], ["HTTP", 6]];

// mulberry32: rápido y reproducible
function crearRng(seed) {
  let a = seed >>> 0;
  const rnd = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const int = (min, max) => min + Math.floor(rnd() * (max - min + 1));
  const pick = l => l[int(0, l.length - 1)];
  const shuffle = l => { const o = [...l]; for (let i = o.length - 1; i > 0; i--) { const j = int(0, i); [o[i], o[j]] = [o[j], o[i]]; } return o; };
  const weighted = l => { let n = rnd() * l.reduce((s, x) => s + x[1], 0); for (const [v, w] of l) if ((n -= w) < 0) return v; return l[0][0]; };
  return { rnd, int, pick, shuffle, weighted };
}

function crearEntorno(R, total) {
  const dominio = R.pick(DOMINIOS);
  const n = Math.max(14, Math.round(total / 70));
  const combos = R.shuffle(NOMBRES.flatMap(a => APELLIDOS.map(b => `${a[0]}${b}`)));
  const personas = [...new Set(combos)].slice(0, n).map(u => `${dominio}\\${u}`);
  const admins = R.shuffle(["admin", "adm_it", "soporte_adm", "itadmin"]).slice(0, 3).map(u => `${dominio}\\${u}`);
  const servicios = R.shuffle(SERVICIOS).slice(0, 4).map(s => `${dominio}\\svc_${s}`);
  const esquema = R.pick(ESQUEMAS_PC);
  const pcs = R.shuffle([...Array(60).keys()]).slice(0, Math.max(6, Math.round(n / 3))).map(esquema);
  const srv = {};
  for (const [rol, nombres] of Object.entries(ROLES_SRV)) srv[rol] = `SRV-${R.pick(nombres)}-${String(R.int(1, 9)).padStart(2, "0")}`;
  const red = R.pick([() => `10.${R.int(0, 250)}`, () => `172.${R.int(16, 31)}`, () => `192.168`])();
  const ips = [...new Set(Array.from({ length: n * 3 }, () => `${red}.${R.int(1, 9)}.${R.int(2, 250)}`))].slice(0, n);
  const externas = () => R.pick([
    () => `192.0.2.${R.int(2, 250)}`, () => `198.51.100.${R.int(2, 250)}`, () => `203.0.113.${R.int(2, 250)}`,
    () => `${R.pick([45, 77, 91, 141, 185])}.${R.int(1, 250)}.${R.int(1, 250)}.${R.int(2, 250)}`])();
  return { dominio, personas, admins, servicios, pcs, srv, ips, externas, hosts: [...pcs, ...Object.values(srv)] };
}

// Cada escenario devuelve filas; las marcadas con clave:true son sus Log_ID clave.
function fila(t, host, evt, user, src, dst, logsrc, desc, cmd, result, sev, clave) {
  return { t, host, evt, user, src, dst, logsrc, desc, cmd, result, sev, clave: !!clave };
}
const ok = (t, host, evt, user, src, dst, desc, cmd = "", sev = "Warning", clave = true) => fila(t, host, evt, user, src, dst, evt === "7045" ? "System" : "Security", desc, cmd, "Success", sev, clave);

const ESCENARIOS = {
  spray(R, E, t, A) {
    const ip = A.ip(), victimas = R.shuffle(E.personas).slice(0, R.int(6, 10)), exito = R.rnd() < .6, out = [];
    const n = R.int(15, 40);
    for (let i = 0; i < n; i++) out.push(fila(t + i * R.int(15, 30) * 1e3, E.srv.dc, "4625", victimas[i % victimas.length], ip, E.srv.dc, "Security", "An account failed to log on - bad password", "", "Failure", "Warning", true));
    let fin = out.at(-1).t, cats = ["brute"], sevMin = "Medio";
    if (exito) {
      const u = victimas[0], pc = R.pick(E.pcs);
      out.push(ok(fin + 2 * MIN, pc, "4624", u, ip, pc, "An account was successfully logged on", "", "High"));
      out.push(ok(fin + 3 * MIN, pc, "4672", u, ip, pc, "Special privileges assigned to new logon", "", "Medium"));
      cats = ["brute", "logon", "priv"]; sevMin = "Alto";
    }
    return { tipo: "spray", categorias: cats, sevMin, actor: ip, filas: out };
  },
  rdp(R, E, t, A) {
    const ip = A.ip(), u = A.admin(), app = E.srv.app, fs_ = E.srv.fs, interna = R.pick(E.ips), rec = R.pick(RECURSOS), out = [];
    let m = t;
    const paso = (a, b) => (m += R.int(a, b) * MIN);
    const n = R.int(4, 6);
    for (let i = 0; i < n; i++) out.push(fila(paso(1, 1), app, "4625", u, ip, app, "Security", "An account failed to log on (LogonType=10; RDP)", "", "Failure", "Warning", true));
    out.push(ok(paso(1, 2), app, "4624", u, ip, app, "An account was successfully logged on (LogonType=10; RDP)", "", "High"));
    out.push(ok(paso(1, 2), app, "4672", u, ip, app, "Special privileges assigned to new logon", "", "High"));
    out.push(ok(paso(1, 2), app, "4688", u, ip, "", "New process created; parent=cmd.exe", "powershell.exe -NoProfile -EncodedCommand SQBFAFgA", "High"));
    out.push(fila(paso(1, 2), app, "4104", u, ip, "", "PowerShell", "PowerShell Script Block: Get-LocalGroupMember Administrators; Get-SmbShare", "powershell.exe", "Success", "High", true));
    out.push(ok(paso(1, 2), app, "4688", u, ip, "", "New process created; parent=powershell.exe", `net.exe view \\\\${fs_}`, "High"));
    out.push(ok(paso(1, 2), fs_, "4624", u, interna, fs_, `An account was successfully logged on (LogonType=3; source=${app})`, "", "High"));
    out.push(ok(paso(1, 2), fs_, "5140", u, interna, fs_, `Network share accessed: \\\\${fs_}\\${rec}`, "", "High"));
    out.push(ok(paso(1, 3), app, "4688", u, ip, "", "New process created; possible staging archive", `tar.exe -a -c -f C:\\Temp\\${rec.toLowerCase()}.zip C:\\Temp\\reports`, "High"));
    out.push(fila(paso(1, 2), app, "5156", u, interna, `${A.ip()}:443`, "Firewall", "Allowed outbound connection (process=powershell.exe)", "powershell.exe", "Success", "High", true));
    return { tipo: "rdp", categorias: ["brute", "logon", "priv", "exec", "lateral", "other"], sevMin: "Crítico", actor: u, filas: out };
  },
  ransomware(R, E, t, A) {
    const u = A.persona(), ip = R.pick(E.ips), pc = R.pick(E.pcs), fs_ = E.srv.fs, rec = R.pick(RECURSOS), out = [], n = R.int(12, 30);
    for (let i = 0; i < n; i++) out.push(ok(t + i * R.int(10, 20) * 1e3, fs_, "4663", u, ip, `\\\\${fs_}\\${rec}`, "An attempt was made to access an object", `File access: ${rec}\\doc_${String(i).padStart(3, "0")}.xlsx`));
    out.push(ok(out.at(-1).t + 2 * MIN, pc, "4688", u, ip, "", "A new process has been created", "vssadmin.exe delete shadows /all /quiet"));
    return { tipo: "ransomware", categorias: ["exec", "other"], sevMin: "Crítico", actor: u, filas: out };
  },
  exfiltracion(R, E, t, A) {
    const u = A.persona(), ip = R.pick(E.ips), pc = R.pick(E.pcs), fs_ = E.srv.fs, rec = R.pick(RECURSOS), dst = `${A.ip()}:443`, out = [];
    out.push(ok(t, fs_, "5140", u, ip, `\\\\${fs_}\\${rec}`, "A network share object was accessed", "", "Informational"));
    out.push(ok(t + 2 * MIN, pc, "4688", u, ip, "", "A new process has been created", R.pick([`7z.exe a C:\\Users\\Public\\datos.7z C:\\${rec}\\*.docx`, `tar.exe -a -c -f C:\\Temp\\datos.zip C:\\${rec}`]), "Informational"));
    const n = R.int(8, 22);
    for (let i = 0; i < n; i++) out.push(fila(t + (3 + i * .4) * MIN, pc, "PROXY_ACCESS", u, ip, dst, "Proxy", "HTTPS POST outbound", `bytes_out=${R.int(6e6, 20e6)} uri=/upload/session/${i + 1}`, "Allowed", "Warning", true));
    return { tipo: "exfiltracion", categorias: ["exec", "other"], sevMin: "Crítico", actor: u, filas: out };
  },
  persistencia(R, E, t, A) {
    const u = A.persona(), ip = R.pick(E.ips), host = E.srv.app, bin = `updsvc${R.int(10, 99)}`, ruta = R.pick(["C:\\ProgramData", "C:\\Users\\Public\\AppData", "C:\\Windows\\Temp"]), out = [];
    if (R.rnd() < .5) out.push(ok(t, host, "4698", u, ip, "", "A scheduled task was created", `TaskName=\\Microsoft\\Windows\\${bin}; Action=powershell.exe -File ${ruta}\\${bin}.ps1`));
    else out.push(fila(t, host, "7045", u, ip, "", "System", "A service was installed in the system", `ServiceName=${bin}; ImagePath=${ruta}\\${bin}.exe`, "Success", "Warning", true));
    const n = R.int(5, 8), cada = R.int(4, 8);
    for (let i = 0; i < n; i++) out.push(ok(t + (2 + i * cada) * MIN, host, "4688", u, ip, "", "A new process has been created", `${ruta}\\${bin}.exe`, "Informational"));
    return { tipo: "persistencia", categorias: ["other"], sevMin: "Alto", actor: u, filas: out };
  },
  webshell(R, E, t, A) {
    const ip = A.ip(), web = E.srv.web, out = [], n = R.int(12, 25), arch = `/uploads/${R.pick(["test", "shell", "img"])}.aspx`;
    for (let i = 0; i < n; i++) out.push(fila(t + i * 12e3, web, "HTTP_ACCESS", "-", ip, `${web}:443`, "IIS", "HTTP request", `${arch}?cmd=${R.pick(["whoami", "dir", "ipconfig"])}`, R.pick(["200", "404", "500"]), "Warning", true));
    out.push(ok(out.at(-1).t + MIN, web, "4688", "IIS APPPOOL\\DefaultAppPool", ip, "", "A new process has been created", "cmd.exe /c whoami"));
    return { tipo: "webshell", categorias: ["exec", "other"], sevMin: "Crítico", actor: ip, filas: out };
  },
  fuera_horario(R, E, t, A) {
    const ip = A.ip(), u = A.persona(), pc = R.pick(E.pcs), d = new Date(t);
    if (d.getHours() >= 7 && d.getHours() < 20) d.setHours(R.pick([5, 6, 21, 22]));
    return { tipo: "fuera_horario", categorias: ["logon"], sevMin: "Medio", actor: ip, filas: [ok(d.getTime(), pc, "4624", u, ip, pc, "An account was successfully logged on", "", "Warning")] };
  },
};

// Nombres parecidos: se reparten en tráfico normal, así que deben quedar "a validar"
function aplicarParecido(R, E, normales) {
  const cuenta = R.rnd() < .5;
  const base = cuenta ? R.pick(E.servicios) : R.pick(Object.values(E.srv));
  const variante = cuenta ? base.replace(/svc_(\w+)$/, "$1svc") : base.replace(/-/g, "");
  const campo = cuenta ? "user" : "host";
  const candidatas = normales.filter(f => f.evt !== "HTTP_ACCESS" && f.user !== "-");
  // que la original exista siempre, con más eventos que la variante
  for (const f of R.shuffle(candidatas).slice(0, 24)) f[campo] = base;
  for (const f of R.shuffle(candidatas.filter(f => f[campo] !== base)).slice(0, 12)) f[campo] = variante;
  return { tipo: "parecido", campo, base, variante };
}

const CASI = {
  typo(R, E, t, A) {
    const u = A.persona(), ip = R.pick(E.ips), pc = R.pick(E.pcs);
    return [fila(t, pc, "4625", u, ip, pc, "Security", "An account failed to log on", "", "Failure", "Informational"),
      fila(t + 20e3, pc, "4625", u, ip, pc, "Security", "An account failed to log on", "", "Failure", "Informational"),
      fila(t + 45e3, pc, "4624", u, ip, pc, "Security", "An account was successfully logged on", "", "Success", "Informational")];
  },
  typos_internos(R, E, t, A) {
    const u = A.persona(), ip = R.pick(E.ips), pc = R.pick(E.pcs), n = R.int(3, 4);
    const fallos = Array.from({ length: n }, (_, i) => fila(t + i * 25e3, pc, "4625", u, ip, pc, "Security", "An account failed to log on", "", "Failure", "Informational"));
    return [...fallos, fila(t + n * 25e3, pc, "4624", u, ip, pc, "Security", "An account was successfully logged on", "", "Success", "Informational")];
  },
  subida_pequena(R, E, t, A) {
    const u = A.persona(), ip = R.pick(E.ips), pc = R.pick(E.pcs), dst = R.pick(DESTINOS_WEB);
    return Array.from({ length: R.int(3, 6) }, (_, i) => fila(t + i * MIN, pc, "PROXY_ACCESS", u, ip, dst, "Proxy", "HTTPS POST outbound", `bytes_out=${R.int(1e6, 7e6)} uri=/upload/${i}`, "Allowed", "Informational"));
  },
  tarea_legitima(R, E, t, A) {
    const u = A.admin(), ip = R.pick(E.ips), host = R.pick(Object.values(E.srv));
    return [fila(t, host, "4698", u, ip, "", "Security", "A scheduled task was created", `TaskName=\\Mantenimiento\\Limpieza; Action=C:\\Windows\\System32\\cleanmgr.exe /sagerun:1`, "Success", "Informational")];
  },
  copia_nocturna(R, E, t, A) {
    const u = A.servicio(), ip = R.pick(E.ips), fs_ = E.srv.fs, rec = R.pick(RECURSOS), d = new Date(t);
    d.setHours(R.pick([1, 2, 3]));
    const t0 = d.getTime();
    return Array.from({ length: R.int(20, 40) }, (_, i) => fila(t0 + i * 8e3, fs_, "4663", u, ip, `\\\\${fs_}\\${rec}`, "Security", "An attempt was made to access an object", `File access: ${rec}\\archivo_${i}.xlsx`, "Success", "Informational"));
  },
  admin_4672(R, E, t, A) {
    const u = A.admin(), ip = R.pick(E.ips), host = R.pick(Object.values(E.srv));
    return [fila(t, host, "4624", u, ip, host, "Security", "An account was successfully logged on", "", "Success", "Informational"),
      fila(t + 2e3, host, "4672", u, ip, host, "Security", "Special privileges assigned to new logon", "", "Success", "Informational")];
  },
  escaneo_leve(R, E, t, A) {
    const ip = A.ip(), web = E.srv.web;
    return Array.from({ length: R.int(3, 4) }, (_, i) => fila(t + i * 20e3, web, "HTTP_ACCESS", "-", ip, `${web}:443`, "IIS", "HTTP request", R.pick(["/admin", "/wp-login.php", "/.env", "/phpmyadmin"]), "404", "Informational"));
  },
};

function normal(R, E, t) {
  const tipo = R.weighted(EVENTOS_NORMALES), u = R.pick(E.personas), ip = R.pick(E.ips), host = R.pick(E.hosts), dst = R.pick(E.hosts);
  const base = desc => fila(t, host, tipo, u, ip, dst, "Security", desc, "", "Success", "Informational");
  switch (tipo) {
    case "4624": return base("An account was successfully logged on");
    case "4625": return fila(t, host, "4625", u, ip, dst, "Security", "An account failed to log on", "", "Failure", "Informational");
    case "4634": return base("An account was logged off");
    case "4688": { const f = base("A new process has been created"); f.cmd = R.pick(PROCESOS); f.dst = ""; return f; }
    case "5140": return base("A network share object was accessed");
    case "5156": return base("Windows Filtering Platform permitted a connection");
    case "4663": return base("An attempt was made to access an object");
    case "7036": { const f = base("Service entered running state"); f.logsrc = "System"; return f; }
    case "PROXY": return fila(t, R.pick(E.pcs), "PROXY_ACCESS", u, ip, R.pick(DESTINOS_WEB), "Proxy", "HTTPS GET outbound", `bytes_out=${R.int(200, 90000)} uri=/recurso/${R.int(1, 400)}`, "Allowed", "Informational");
    default: return fila(t, E.srv.web, "HTTP_ACCESS", "-", R.rnd() < .5 ? ip : E.externas(), `${E.srv.web}:443`, "IIS", "HTTP request", R.pick(WEB_RUTAS), R.pick(["200", "200", "200", "304", "404"]), "Informational");
  }
}

const pad = n => String(n).padStart(2, "0");
const fmtIso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const fmtDmy = d => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const serialExcel = d => (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()) / 864e5) + 25569;

function generar({ seed = 1, eventos } = {}) {
  const R = crearRng(seed);
  const total = eventos || R.int(300, 5000);
  const E = crearEntorno(R, total);
  const duracion = R.int(4, 10) * 3600e3;
  const inicio = new Date(R.int(2025, 2027), R.int(0, 11), R.int(1, 28), R.int(0, 23), R.int(0, 59)).getTime();
  const formato = R.pick(["iso", "nativa", "dmy"]);

  const personas = R.shuffle(E.personas), admins = R.shuffle(E.admins), servicios = R.shuffle(E.servicios);
  const usadas = new Set();
  const A = {
    ip: () => { let ip; do ip = E.externas(); while (usadas.has(ip)); usadas.add(ip); return ip; },
    persona: () => personas.pop(), admin: () => admins.pop() || `${E.dominio}\\adm_${R.int(10, 99)}`, servicio: () => servicios.pop(),
  };

  const nombres = R.shuffle(Object.keys(ESCENARIOS)).slice(0, R.int(3, 7));
  const casi = R.shuffle(Object.keys(CASI)).slice(0, R.int(2, 4));
  const huecos = nombres.length + casi.length;
  const hueco = i => inicio + (i + .1 + R.rnd() * .3) / huecos * duracion;
  const orden = R.shuffle([...Array(huecos).keys()]);

  const escenarios = nombres.map((n, i) => ESCENARIOS[n](R, E, hueco(orden[i]), A));
  const casiAtaques = casi.map((n, i) => ({ tipo: n, filas: CASI[n](R, E, hueco(orden[nombres.length + i]), A) }));
  const n = Math.max(0, total - escenarios.flatMap(e => e.filas).length - casiAtaques.flatMap(c => c.filas).length);
  const normales = Array.from({ length: n }, () => normal(R, E, inicio + R.rnd() * duracion));
  const parecido = R.rnd() < .6 ? aplicarParecido(R, E, normales) : null;

  const todas = [...normales, ...escenarios.flatMap(e => e.filas), ...casiAtaques.flatMap(c => c.filas)].sort((a, b) => a.t - b.t);
  const prefijo = R.pick(["EVT-", "LOG-", "SIEM-", "ID"]);
  todas.forEach((f, i) => f.id = prefijo + String(i + 1).padStart(6, "0"));

  const extra = "Ticket_Ref";
  const cols = R.shuffle([...COLS, extra]);
  const valor = (f, c) => ({
    Log_ID: f.id, Hostname: f.host, Event_ID: f.evt, User: f.user, Source_IP: f.src, Destination: f.dst, Log_Source: f.logsrc,
    Event_Description: f.desc, Process_CommandLine: f.cmd, Result: f.result, Severity: f.sev,
    Ticket_Ref: "", Timestamp: formato === "iso" ? fmtIso(new Date(f.t)) : formato === "dmy" ? fmtDmy(new Date(f.t)) : serialExcel(new Date(f.t)),
  })[c];
  const rows = todas.map(f => cols.map(c => valor(f, c)));

  const truth = {
    seed, eventos: todas.length, formato,
    escenarios: escenarios.map(e => ({ tipo: e.tipo, categorias: e.categorias, sevMin: e.sevMin, actor: e.actor, clave: e.filas.filter(f => f.clave).map(f => f.id) })),
    casiAtaques: casiAtaques.map(c => ({ tipo: c.tipo, ids: c.filas.map(f => f.id) })),
    parecido,
  };
  const horas = new Map(todas.map(f => [f.id, fmtIso(new Date(f.t))]));
  return { cols, rows, truth, formato, horas };
}

// Hoja .xlsx en memoria; la columna de fecha nativa se escribe como serial con formato de fecha
function aLibro(XLSX, { cols, rows, formato }) {
  const ws = XLSX.utils.aoa_to_sheet([cols, ...rows]);
  if (formato === "nativa") {
    const c = cols.indexOf("Timestamp");
    for (let r = 1; r <= rows.length; r++) { const cell = ws[XLSX.utils.encode_cell({ r, c })]; cell.t = "n"; cell.z = "yyyy-mm-dd hh:mm:ss"; }
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "SIEM Export");
  return wb;
}

if (require.main === module) {
  const arg = k => { const i = process.argv.indexOf("--" + k); return i > 0 ? process.argv[i + 1] : undefined; };
  const seed = +(arg("seed") || 1), eventos = arg("eventos") ? +arg("eventos") : undefined;
  const out = arg("out") || path.join("datasets", `sint_${seed}.xlsx`);
  const XLSX = require(path.join(__dirname, "..", "app", "vendor", "xlsx.full.min.js"));
  const ds = generar({ seed, eventos });
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, XLSX.write(aLibro(XLSX, ds), { type: "buffer", bookType: "xlsx" }));
  fs.writeFileSync(out.replace(/\.xlsx$/i, ".truth.json"), JSON.stringify(ds.truth, null, 2), "utf8");
  console.log(`${out}: ${ds.truth.eventos} eventos, ${ds.truth.escenarios.length} escenarios, fecha ${ds.formato}`);
}

module.exports = { generar, aLibro };
