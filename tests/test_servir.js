// Prueba el servidor local de tools/servir.js. Uso: node tests/test_servir.js
const { spawn } = require("child_process");
const http = require("http");
const net = require("net");
const os = require("os");
const path = require("path");
const root = path.join(__dirname, "..");
const PUERTO = 18765;
let fallos = 0, total = 0;
const check = (n, ok, extra = "") => { total++; if (!ok) fallos++; console.log(`${ok ? "OK   " : "FALLA"} ${n}${ok ? "" : " " + extra}`); };
const lanzar = (...a) => spawn(process.execPath, [path.join(root, "tools", "servir.js"), "--puerto", String(PUERTO), "--no-abrir", ...a], { stdio: "pipe" });
const pedir = (ruta, { host = `127.0.0.1:${PUERTO}`, method = "GET" } = {}) => new Promise((ok, mal) => {
  const r = http.request({ host: "127.0.0.1", port: PUERTO, path: ruta, method, headers: { host } }, res => { let b = ""; res.on("data", d => b += d); res.on("end", () => ok({ code: res.statusCode, tipo: res.headers["content-type"] || "", body: b })); });
  r.on("error", mal); r.end();
});
const conecta = host => new Promise(ok => { const s = net.connect({ host, port: PUERTO, timeout: 800 }); s.on("connect", () => { s.destroy(); ok(true); }); s.on("error", () => ok(false)); s.on("timeout", () => { s.destroy(); ok(false); }); });
const esperar = p => new Promise(ok => p.on("exit", c => ok(c)));

(async () => {
  const srv = lanzar();
  await new Promise(ok => srv.stdout.once("data", ok));
  const i = await pedir("/");
  check("sirve index.html con su tipo", i.code === 200 && /text\/html/.test(i.tipo) && /<!doctype html>/i.test(i.body));
  check("sirve js y css con su tipo", /javascript/.test((await pedir("/js/engine.js")).tipo) && /text\/css/.test((await pedir("/css/app.css")).tipo));
  check("archivo inexistente", (await pedir("/no-existe.js")).code === 404);
  check("no sale de app/ con ..", ![200].includes((await pedir("/../CLAUDE.md")).code));
  check("no sale de app/ con codificación", (await pedir("/%2e%2e/CLAUDE.md")).code !== 200 && (await pedir("/..%2fCLAUDE.md")).code !== 200 && (await pedir("/..%5cCLAUDE.md")).code !== 200);
  check("no sirve el Excel de la raíz", (await pedir("/%2e%2e/SOC_L2.xlsx")).code !== 200);
  check("rechaza otros métodos", (await pedir("/", { method: "POST" })).code === 405);
  check("rechaza un Host ajeno (DNS rebinding)", (await pedir("/", { host: "web-maliciosa.example" })).code === 403);
  check("acepta localhost como Host", (await pedir("/", { host: `localhost:${PUERTO}` })).code === 200);
  const lan = Object.values(os.networkInterfaces()).flat().find(a => a.family === "IPv4" && !a.internal);
  if (lan) check(`no escucha en la red (${lan.address})`, !(await conecta(lan.address)));
  else console.log("AVISO: sin interfaz de red; no se comprueba la escucha externa.");
  const segundo = lanzar(); let salida = "";
  segundo.stdout.on("data", d => salida += d);
  check("segundo arranque reutiliza el que ya está en marcha", await esperar(segundo) === 0 && /ya estaba en marcha/.test(salida), salida);
  const fin = esperar(srv); srv.kill(); await fin;

  const ajeno = http.createServer((q, r) => r.end("otro programa"));
  await new Promise(ok => ajeno.listen(PUERTO, "127.0.0.1", ok));
  const tercero = lanzar(); let error = "";
  tercero.stderr.on("data", d => error += d);
  check("puerto ocupado por otro programa: error claro", await esperar(tercero) === 1 && /ocupado por otro programa/.test(error), error);
  ajeno.close();
  console.log(`\n${total - fallos} de ${total} comprobaciones correctas`);
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
