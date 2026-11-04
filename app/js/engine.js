// ===== Motor de detección SOC L2 =====
// Reglas genéricas basadas en umbrales y patrones. No contiene IPs, usuarios ni hosts fijos:
// todo hallazgo se deriva de los registros cargados y cita sus Log_ID.
const SOCEngine = (() => {
  const MIN = 60e3;
  const CAT = {
    brute: "Fuerza bruta",
    logon: "Inicios sospechosos",
    priv: "Escalamiento de privilegios",
    exec: "Comandos y procesos",
    lateral: "Movimiento lateral",
    other: "Otras anomalías",
  };
  const SEV_RANK = { Crítico: 4, Alto: 3, Medio: 2, Bajo: 1 };

  const isFail = r => r.evt === "4625" || /failed to log on/i.test(r.desc);
  const isSuccessLogon = r => r.evt === "4624";
  const logonType = r => { const m = /LogonType=(\d+)/i.exec(r.desc); return m ? +m[1] : null; };
  const t = r => r.tsDate ? r.tsDate.getTime() : 0;
  const fmtBytes = b => b >= 1e6 ? (b / 1e6).toFixed(1) + " MB" : b >= 1e3 ? (b / 1e3).toFixed(1) + " KB" : b + " B";
  const hhmm = r => r.ts.slice(11, 16);
  const uniq = a => [...new Set(a.filter(Boolean))];

  // Grupos encadenados: eventos ordenados separados como máximo winMs, con al menos min eventos.
  function bursts(events, winMs, min) {
    const ev = [...events].sort((a, b) => t(a) - t(b));
    const out = []; let i = 0;
    while (i < ev.length) {
      let j = i;
      while (j + 1 < ev.length && t(ev[j + 1]) - t(ev[j]) <= winMs) j++;
      const grp = ev.slice(i, j + 1);
      if (grp.length >= min) out.push(grp);
      i = j + 1;
    }
    return out;
  }
  // Ventana deslizante real: tramos donde caben al menos min eventos dentro de winMs.
  function denseBursts(events, winMs, min) {
    const ev = [...events].sort((a, b) => t(a) - t(b));
    const hit = new Array(ev.length).fill(false);
    for (let i = 0, j = 0; i < ev.length; i++) {
      while (t(ev[i]) - t(ev[j]) > winMs) j++;
      if (i - j + 1 >= min) hit.fill(true, j, i + 1);
    }
    const out = []; let cur = [];
    ev.forEach((r, i) => { if (hit[i]) cur.push(r); else if (cur.length) { out.push(cur); cur = []; } });
    if (cur.length) out.push(cur);
    return out;
  }
  const groupBy = (rows, keyFn) => {
    const m = new Map();
    for (const r of rows) { const k = keyFn(r); if (k == null || k === "") continue; if (!m.has(k)) m.set(k, []); m.get(k).push(r); }
    return m;
  };

  function analyze(rows, opt = {}) {
    const cfg = Object.assign({
      bruteWindowMin: 15, bruteMin: 10, sprayUsers: 5,   // spraying/fuerza bruta por IP
      pairFailMin: 3, pairFailMinInternal: 5, pairWindowMin: 10, // fallos repetidos usuario+IP seguidos de éxito (IP externa / interna)
      followMin: 30,                                      // éxito tras ataque
      privAfterMin: 10,                                   // privilegios tras inicio sospechoso
      massAccessMin: 10, massAccessWindowMin: 10,         // acceso masivo a ficheros
      exfilBytes: 50e6, exfilWindowMin: 30,               // volumen saliente
      beaconMin: 4, beaconJitterSec: 30,                  // ejecución periódica
      webErrMin: 10, webWindowMin: 10,                    // escaneo / abuso web
      workStart: 7, workEnd: 20,                          // horario laboral (inicios fuera de horario)
      incidentGapMin: 90, weakAttachMin: 30,              // agrupación: señales fuertes / señal débil junto a una fuerte
    }, opt);

    const R = rows.filter(r => r.tsDate).sort((a, b) => t(a) - t(b));
    const findings = [];
    const add = f => { f.id = "H-" + String(findings.length + 1).padStart(2, "0"); f.evidence = uniq(f.evidence.map(e => e.id)); findings.push(f); return f; };
    const compromised = []; // {user, src, row, time}

    // ---- 1. Fuerza bruta / password spraying por IP de origen ----
    const fails = R.filter(isFail);
    for (const [src, evs] of groupBy(fails, r => r.src)) {
      for (const g of denseBursts(evs, cfg.bruteWindowMin * MIN, cfg.bruteMin)) {
        const users = uniq(g.map(r => r.user));
        const spray = users.length >= cfg.sprayUsers;
        const end = t(g.at(-1));
        const succ = R.filter(r => isSuccessLogon(r) && r.src === src && users.includes(r.user) && t(r) > t(g[0]) && t(r) - end <= cfg.followMin * MIN);
        const f = add({
          cat: "brute", rule: spray ? "Password spraying" : "Fuerza bruta",
          mitre: spray ? "T1110.003" : "T1110.001",
          title: `${spray ? "Password spraying" : "Fuerza bruta"} desde ${src}`,
          sev: succ.length ? "Alto" : "Medio",
          detail: `${g.length} inicios fallidos desde ${src} entre ${hhmm(g[0])} y ${hhmm(g.at(-1))} contra ${users.length} cuenta(s) (${users.join(", ")}) en ${uniq(g.map(r => r.host)).join(", ")}.`,
          why: succ.length
            ? `El ataque tuvo éxito: ${succ.length} inicio(s) de sesión correcto(s) desde la misma IP justo después (${succ.map(r => r.user + " " + hhmm(r)).join(", ")}).`
            : `No se observa ningún inicio de sesión correcto de las cuentas atacadas desde esa IP tras el ataque.`,
          actors: { ips: [src], users: [] }, evidence: g, start: g[0], end: g.at(-1),
        });
        for (const s of succ) compromised.push({ user: s.user, src, row: s, via: f });
      }
    }
    // Fallos repetidos usuario+IP seguidos de éxito (p. ej. RDP), cuando no lo cubrió la regla anterior
    for (const [key, evs] of groupBy(fails, r => r.user + "|" + r.src)) {
      const [user, src] = key.split("|");
      if (!src || compromised.some(c => c.src === src)) continue;
      for (const g of denseBursts(evs, cfg.pairWindowMin * MIN, evs[0].ext ? cfg.pairFailMin : cfg.pairFailMinInternal)) {
        const end = t(g.at(-1));
        const succ = R.find(r => isSuccessLogon(r) && r.user === user && r.src === src && t(r) > end && t(r) - end <= cfg.followMin * MIN);
        if (!succ) continue;
        const ext = !!g[0].ext;
        const lt = logonType(g[0]);
        const f = add({
          cat: "brute", rule: "Fuerza bruta con éxito", mitre: "T1110.001",
          title: `Fuerza bruta${lt === 10 ? " RDP" : ""} sobre ${user} desde ${src}`,
          sev: ext ? "Crítico" : "Alto",
          detail: `${g.length} fallos consecutivos de ${user} desde ${src}${lt ? ` (LogonType=${lt}${lt === 10 ? ", RDP" : ""})` : ""} entre ${hhmm(g[0])} y ${hhmm(g.at(-1))}, seguidos de un inicio correcto a las ${hhmm(succ)} en ${succ.host}.`,
          why: `Credenciales obtenidas por adivinación${ext ? " desde una IP externa" : ""}${/admin/i.test(user) ? " sobre una cuenta administrativa" : ""}: el atacante tiene acceso válido al equipo.`,
          actors: { ips: [src], users: [user] }, evidence: [...g, succ], start: g[0], end: succ,
        });
        compromised.push({ user, src, row: succ, via: f });
      }
    }

    // ---- 2. Inicios sospechosos ----
    for (const r of R.filter(r => isSuccessLogon(r) && r.ext)) {
      const c = compromised.find(c => c.row === r);
      const lt = logonType(r);
      add({
        cat: "logon", rule: "Inicio desde IP externa", mitre: "T1078",
        title: `Inicio de sesión de ${r.user} desde IP externa ${r.src}`,
        sev: c ? "Alto" : "Medio",
        detail: `Inicio correcto en ${r.host} a las ${hhmm(r)} desde ${r.src}${lt ? ` (LogonType=${lt}${lt === 10 ? ", RDP" : ""})` : ""}.`,
        why: c ? `Ocurre inmediatamente después del ataque ${c.via.id}; se trata de una cuenta comprometida.` : `Las cuentas del dominio solo deberían autenticarse desde la red interna.`,
        actors: { ips: [r.src], users: [r.user] }, evidence: [r], start: r, end: r,
      });
    }
    for (const r of R.filter(r => isSuccessLogon(r) && r.tsDate && (r.tsDate.getHours() < cfg.workStart || r.tsDate.getHours() >= cfg.workEnd))) {
      add({ cat: "logon", rule: "Inicio fuera de horario", mitre: "T1078", title: `Inicio fuera de horario: ${r.user}`, sev: "Bajo", weak: true,
        detail: `Inicio correcto a las ${hhmm(r)} en ${r.host}.`, why: `Fuera de la franja ${cfg.workStart}:00–${cfg.workEnd}:00.`,
        actors: { ips: [], users: [r.user] }, evidence: [r], start: r, end: r });
    }

    // ---- 3. Escalamiento: privilegios especiales tras un inicio sospechoso ----
    for (const r of R.filter(r => r.evt === "4672")) {
      const c = compromised.find(c => c.user === r.user && t(r) >= t(c.row) && t(r) - t(c.row) <= cfg.privAfterMin * MIN);
      if (!c && !r.ext) continue;
      add({
        cat: "priv", rule: "Privilegios especiales a cuenta comprometida", mitre: "T1078.002",
        title: `Privilegios especiales para ${r.user} en ${r.host}`,
        sev: "Alto",
        detail: `Evento 4672 a las ${hhmm(r)} en ${r.host}${r.ext ? ` con origen ${r.src}` : ""}.`,
        why: c ? `La sesión con privilegios administrativos llega ${Math.round((t(r) - t(c.row)) / MIN)} min después del acceso indebido (${c.via.id}).` : `Se asignan privilegios a una sesión originada fuera de la red.`,
        actors: { ips: r.ext ? [r.src] : [], users: [r.user] }, evidence: c ? [c.row, r] : [r], start: c ? c.row : r, end: r,
      });
    }

    // ---- 4. Comandos y procesos ----
    const CMD_RULES = [
      { re: /-enc(odedcommand)?\b/i, cat: "exec", rule: "PowerShell ofuscado", mitre: "T1059.001 / T1027", sev: "Alto", why: "PowerShell con -EncodedCommand oculta el script ejecutado; técnica habitual para evadir detección." },
      { re: /vssadmin(\.exe)?\s+delete\s+shadows/i, cat: "exec", rule: "Borrado de instantáneas (VSS)", mitre: "T1490", sev: "Crítico", why: "Eliminar las copias de sombra impide recuperar ficheros; es el paso previo típico a un cifrado por ransomware." },
      { re: /\b(w3wp|iis apppool)\b/i, field: "user", also: /cmd\.exe|powershell/i, cat: "exec", rule: "Shell lanzada por el servidor web", mitre: "T1505.003", sev: "Crítico", why: "El proceso del servidor web (IIS) no debe lanzar intérpretes de comandos: indica una webshell con ejecución remota de código." },
      { re: /\bwhoami\b/i, cat: "exec", rule: "Reconocimiento de identidad", mitre: "T1033", sev: "Medio", why: "whoami se usa para saber con qué privilegios se ejecuta un atacante." },
      { re: /Get-LocalGroupMember|Get-SmbShare|net(\.exe)?\s+(view|group|localgroup|user)\b/i, cat: "exec", rule: "Reconocimiento de red y permisos", mitre: "T1087 / T1135", sev: "Medio", why: "Enumeración de administradores y recursos compartidos para preparar el movimiento lateral." },
      { re: /\b(tar|7z|rar|zip)(\.exe)?\b.*\s(-a|a|-c)\b|Compress-Archive/i, cat: "exec", rule: "Compresión de datos (staging)", mitre: "T1560.001", sev: "Alto", why: "Empaquetar documentos en un archivo comprimido es la preparación habitual antes de sacarlos de la red." },
      { re: /\\ProgramData\\[^\s;]+\.(exe|ps1|dll)/i, cat: "exec", rule: "Ejecutable en ruta inusual", mitre: "T1036.005", sev: "Medio", why: "Binarios en C:\\ProgramData con nombres que imitan a Windows suelen ser malware." },
    ];
    const cmdHits = new Map(); // rule -> rows
    for (const r of R) {
      const text = r.cmd + " " + r.desc;
      for (const cr of CMD_RULES) {
        const target = cr.field ? r[cr.field] : text;
        if (cr.re.test(target) && (!cr.also || cr.also.test(text))) {
          if (cr.rule === "Reconocimiento de identidad" && (/iis apppool|w3wp/i.test(r.user) || /HTTP/i.test(r.logsrc + r.evt))) continue; // cubierto por webshell / ataque web
          if (cr.rule === "Ejecutable en ruta inusual" && (r.evt === "7045" || r.evt === "4698")) continue; // cubierto por persistencia
          const k = cr.rule + "|" + r.user + "|" + r.host;
          if (!cmdHits.has(k)) cmdHits.set(k, { cr, rows: [] });
          cmdHits.get(k).rows.push(r);
        }
      }
    }
    const best = x => (x.cmd && /\s/.test(x.cmd)) ? x.cmd : (x.desc.includes(":") ? x.desc.split(/:\s*/).slice(1).join(": ") : x.cmd || x.desc);
    for (const { cr, rows: rs } of cmdHits.values()) {
      const r = rs[0];
      add({
        cat: cr.cat, rule: cr.rule, mitre: cr.mitre, sev: cr.sev,
        title: `${cr.rule} en ${r.host} (${r.user})`,
        detail: rs.length === 1 ? `${hhmm(r)} · ${best(r)}` : `${rs.length} ejecuciones entre ${hhmm(r)} y ${hhmm(rs.at(-1))}: ${uniq(rs.map(best)).join(" | ")}`,
        why: cr.why, actors: { ips: uniq(rs.filter(x => x.ext).map(x => x.src)), users: [r.user] }, evidence: rs, start: r, end: rs.at(-1),
      });
    }

    // ---- 4b. Persistencia: tareas programadas y servicios nuevos ----
    for (const r of R.filter(r => r.evt === "4698" || r.evt === "7045")) {
      const sus = /ProgramData|AppData|\\Temp\\|powershell|\.ps1|cmd\.exe/i.test(r.cmd);
      add({
        cat: "other", rule: r.evt === "4698" ? "Persistencia: tarea programada" : "Persistencia: servicio instalado",
        mitre: r.evt === "4698" ? "T1053.005" : "T1543.003", sev: sus ? "Alto" : "Medio", weak: !sus,
        title: `${r.evt === "4698" ? "Tarea programada creada" : "Servicio instalado"} en ${r.host}`,
        detail: `${hhmm(r)} · ${r.cmd} (usuario ${r.user}).`,
        why: sus ? "Ejecuta un script o intérprete, o un binario en una ruta escribible por usuarios: patrón de persistencia de malware." : "Nuevo mecanismo de arranque automático; validar con el propietario del equipo.",
        actors: { ips: [], users: [r.user] }, evidence: [r], start: r, end: r,
      });
    }
    // Ejecución periódica (beacon)
    for (const [key, evs] of groupBy(R.filter(r => r.evt === "4688" && r.cmd), r => r.host + "|" + r.cmd)) {
      if (evs.length < cfg.beaconMin) continue;
      const gaps = evs.slice(1).map((r, i) => (t(r) - t(evs[i])) / 1000);
      const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      if (!gaps.every(g => Math.abs(g - avg) <= cfg.beaconJitterSec) || avg < 60) continue;
      add({
        cat: "other", rule: "Ejecución periódica (beacon)", mitre: "T1071 / T1053", sev: "Alto",
        title: `${evs[0].cmd.split("\\").pop()} se ejecuta cada ${Math.round(avg / 60)} min en ${evs[0].host}`,
        detail: `${evs.length} ejecuciones de ${evs[0].cmd} a intervalos regulares de ${Math.round(avg)} s, entre ${hhmm(evs[0])} y ${hhmm(evs.at(-1))}.`,
        why: "La regularidad exacta es propia de un implante que contacta con su servidor de control, no de un usuario.",
        actors: { ips: [], users: [evs[0].user] }, evidence: evs, start: evs[0], end: evs.at(-1),
      });
      // el beacon ya explica el ejecutable en ruta inusual
      const ids = new Set(evs.map(r => r.id));
      for (let k = findings.length - 1; k >= 0; k--) if (findings[k].rule === "Ejecutable en ruta inusual" && findings[k].evidence.every(id => ids.has(id))) findings.splice(k, 1);
    }

    // ---- 5. Movimiento lateral ----
    for (const r of R.filter(r => (isSuccessLogon(r) || isFail(r)) && logonType(r) === 3 && /source=([\w.-]+)/i.test(r.desc))) {
      const from = /source=([\w.-]+)/i.exec(r.desc)[1];
      if (from.toLowerCase() === r.host.toLowerCase()) continue;
      if (!isSuccessLogon(r)) continue;
      const prior = R.filter(x => x.user === r.user && x.host === r.host && isFail(x) && t(x) <= t(r) && t(r) - t(x) <= 10 * MIN);
      add({
        cat: "lateral", rule: "Salto entre sistemas", mitre: "T1021.002",
        title: `Movimiento lateral de ${r.user}: ${from} → ${r.host}`,
        sev: "Alto",
        detail: `Inicio de red (LogonType=3) en ${r.host} a las ${hhmm(r)} originado en ${from}${prior.length ? `, tras ${prior.length} intento(s) fallido(s)` : ""}.`,
        why: `La cuenta ${r.user} inicia sesión de red en ${r.host} desde ${from}; es compatible con la propagación de un atacante.`,
        actors: { ips: [], users: [r.user] }, evidence: [...prior, r], start: prior[0] || r, end: r,
      });
    }

    // ---- 6. Otras anomalías ----
    // Acceso masivo a ficheros
    for (const [key, evs] of groupBy(R.filter(r => r.evt === "4663" && /File access|\.(xlsx?|docx?|pdf|csv)/i.test(r.cmd + r.dst)), r => r.user)) {
      for (const g of bursts(evs, cfg.massAccessWindowMin * MIN, cfg.massAccessMin)) {
        const share = uniq(g.map(r => r.dst)).join(", ");
        add({
          cat: "other", rule: "Acceso masivo a ficheros", mitre: "T1039 / T1005", sev: "Alto", weak: true,
          title: `${g.length} ficheros leídos por ${key} en ${Math.max(1, Math.round((t(g.at(-1)) - t(g[0])) / MIN))} min`,
          detail: `Lectura secuencial de ${g.length} ficheros en ${share || g[0].host} entre ${hhmm(g[0])} y ${hhmm(g.at(-1))}.`,
          why: "Un patrón automatizado de lectura de documentos puede ser recolección de datos o preparación de un cifrado; también una copia de seguridad legítima si no hay otras señales.",
          actors: { ips: [], users: [key] }, evidence: g, start: g[0], end: g.at(-1),
        });
      }
    }
    // Acceso a recursos compartidos sensibles
    const SHARES = "Finance|Finanzas|Legal|RRHH|HR|Payroll|Nominas";
    const SENS = new RegExp(`\\\\\\\\[^\\\\]+\\\\(${SHARES})`, "i");
    const SENS_FILE = new RegExp(`(?<![\\w\\\\])(?:${SHARES})\\\\[^\\s;]+`, "i"); // detalle del 5145: "Recurso\\archivo"
    const sensitive = r => {
      if (r.evt !== "5140" && r.evt !== "5145") return null;
      const share = SENS.exec(r.dst + " " + r.desc);
      return share ? share[0] : r.evt === "5145" ? SENS_FILE.exec(r.desc)?.[0] : null;
    };
    for (const r of R.filter(sensitive)) {
      add({
        cat: "other", rule: "Acceso a recurso sensible", mitre: "T1039", sev: "Medio", weak: true,
        title: `${r.user} accede a ${sensitive(r)}`,
        detail: `${hhmm(r)} · ${r.desc} (${r.host}).`,
        why: "Recurso con información confidencial; relevante si la misma cuenta tiene otras acciones sospechosas cerca.",
        actors: { ips: [], users: [r.user] }, evidence: [r], start: r, end: r,
      });
    }
    // Volumen saliente hacia el exterior
    const outRows = R.filter(r => /bytes_out=\d+/i.test(r.cmd));
    for (const [key, evs] of groupBy(outRows, r => r.user + "|" + r.dst)) {
      for (const g of bursts(evs, cfg.exfilWindowMin * MIN, 1)) {
        const bytes = g.reduce((a, r) => a + +(/bytes_out=(\d+)/i.exec(r.cmd)[1]), 0);
        if (bytes < cfg.exfilBytes) continue;
        add({
          cat: "other", rule: "Exfiltración de datos", mitre: "T1567 / T1048", sev: "Crítico",
          title: `${fmtBytes(bytes)} enviados a ${g[0].dst} por ${g[0].user}`,
          detail: `${g.length} subidas HTTPS POST desde ${g[0].host} entre ${hhmm(g[0])} y ${hhmm(g.at(-1))}, total ${fmtBytes(bytes)}.`,
          why: "Volumen de subida muy superior al uso normal, troceado en sesiones, hacia un destino externo: salida de datos confirmada.",
          actors: { ips: [], users: [g[0].user], dsts: [g[0].dst] }, evidence: g, start: g[0], end: g.at(-1),
        });
      }
    }
    // Conexiones salientes de procesos de scripting hacia IP externa
    for (const r of R.filter(r => r.evt === "5156" && /(\d{1,3}\.){3}\d{1,3}/.test(r.dst) && /powershell|cmd\.exe|wscript|mshta|rundll32/i.test(r.cmd + r.desc))) {
      const ip = /((\d{1,3}\.){3}\d{1,3})/.exec(r.dst)[1];
      const priv = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|127\.)/.test(ip);
      if (priv) continue;
      add({
        cat: "other", rule: "Conexión saliente de PowerShell", mitre: "T1041 / T1071.001", sev: "Alto",
        title: `PowerShell conecta con ${r.dst} desde ${r.host}`,
        detail: `${hhmm(r)} · ${r.desc} (usuario ${r.user}).`,
        why: "Un intérprete de scripts abriendo una conexión hacia una IP externa puede indicar exfiltración o canal de control. Sin bytes salientes registrados no se puede confirmar salida de datos.",
        actors: { ips: [], users: [r.user], dsts: [r.dst] }, evidence: [r], start: r, end: r,
      });
    }
    // Abuso/escaneo web desde una IP
    for (const [src, evs] of groupBy(R.filter(r => /HTTP/i.test(r.logsrc + r.evt)), r => r.src)) {
      for (const g of bursts(evs, cfg.webWindowMin * MIN, cfg.webErrMin)) {
        const errs = g.filter(r => /^[45]\d\d$/.test(r.result)).length;
        const paths = uniq(g.map(r => r.cmd.split("?")[0]));
        const cmdParam = g.filter(r => /[?&](cmd|exec|command)=/i.test(r.cmd));
        add({
          cat: "other", rule: "Ataque a aplicación web", mitre: "T1190 / T1505.003", sev: cmdParam.length ? "Alto" : "Medio",
          title: `${g.length} peticiones hostiles a ${g[0].host} desde ${src}`,
          detail: `${hhmm(g[0])}–${hhmm(g.at(-1))}: rutas ${paths.join(", ")}; ${errs} respuestas 4xx/5xx${cmdParam.length ? `; ${cmdParam.length} con parámetro de comando (${cmdParam[0].cmd})` : ""}.`,
          why: cmdParam.length ? "Peticiones a un script subido con parámetro cmd= son el uso típico de una webshell." : "Volumen alto de peticiones a rutas administrativas con muchos errores: escaneo o fuerza bruta web.",
          actors: { ips: [src], users: [] }, evidence: g, start: g[0], end: g.at(-1),
        });
      }
    }
    // Nombres parecidos (posible suplantación o error de inventario)
    const citedText = rows => {
      const ids = new Set(findings.filter(f => !f.needsValidation).flatMap(f => f.evidence));
      const n = rows.filter(r => ids.has(r.id)).length;
      return n ? `${n} aparecen en otros hallazgos` : "ninguno aparece en otros hallazgos";
    };
    const normName = s => s.toLowerCase().replace(/^.*\\/, "").replace(/[^a-z0-9]/g, "");
    const lookalike = (field, label) => {
      const vals = uniq(R.map(r => r[field]));
      const byNorm = groupBy(vals.map(v => ({ v })), o => normName(o.v));
      for (const [, list] of byNorm) if (list.length > 1) {
        const names = list.map(o => o.v);
        const counts = names.map(n => [n, R.filter(r => r[field] === n)]);
        counts.sort((a, b) => a[1].length - b[1].length);
        const [rare, rows] = counts[0];
        const cited = citedText(rows);
        add({ cat: "other", rule: `${label} con nombre parecido`, mitre: "T1036", sev: "Bajo", needsValidation: true,
          title: `${label} «${rare}» convive con «${counts.slice(1).map(c => c[0]).join("», «")}»`,
          detail: `${rows.length} eventos con «${rare}» entre ${hhmm(rows[0])} y ${hhmm(rows.at(-1))}; ${cited}.`,
          why: "Puede ser un error de normalización del SIEM o un elemento que imita a uno legítimo. A validar con el inventario del cliente; no se considera incidente.",
          actors: { ips: [], users: [] }, evidence: rows.slice(0, 5), start: rows[0], end: rows.at(-1) });
      }
      // mismas partes en distinto orden (p. ej. appsvc / svc_app)
      const tokens = vals.map(v => [v, normName(v).replace(/svc|srv/g, m => "|" + m + "|").split("|").filter(Boolean).sort().join("")]);
      const seen = new Set();
      for (const [a, ka] of tokens) for (const [b, kb] of tokens) {
        if (a >= b || ka !== kb || normName(a) === normName(b) || seen.has(a + b)) continue; seen.add(a + b);
        const ra = R.filter(r => r[field] === a), rb = R.filter(r => r[field] === b);
        const [rare, rows, other] = ra.length < rb.length ? [a, ra, b] : [b, rb, a];
        const cited = citedText(rows);
        add({ cat: "other", rule: `${label} con nombre parecido`, mitre: "T1036", sev: "Bajo", needsValidation: true,
          title: `${label} «${rare}» convive con «${other}»`,
          detail: `${rows.length} eventos con «${rare}» entre ${hhmm(rows[0])} y ${hhmm(rows.at(-1))}; ${cited}.`,
          why: "Nombre que reordena el de una cuenta de servicio existente. Puede ser legítima o creada para pasar desapercibida. A validar con el directorio del cliente; no se considera incidente.",
          actors: { ips: [], users: [] }, evidence: rows.slice(0, 5), start: rows[0], end: rows.at(-1) });
      }
    };
    lookalike("host", "Host");
    lookalike("user", "Cuenta");

    findings.forEach((f, i) => f.id = "H-" + String(i + 1).padStart(2, "0"));
    // ---- Agrupación en incidentes por actor (IP externa / cuenta implicada) ----
    const active = findings.filter(f => !f.needsValidation);
    const parent = active.map((_, i) => i);
    const find = i => parent[i] === i ? i : (parent[i] = find(parent[i]));
    const keys = f => [...(f.actors.ips || []).map(x => "ip:" + x), ...(f.actors.users || []).filter(u => u && u !== "-").map(x => "u:" + x.toLowerCase()), ...(f.actors.dsts || []).map(x => "d:" + x)];
    for (let i = 0; i < active.length; i++) for (let j = i + 1; j < active.length; j++) {
      const a = active[i], b = active[j];
      if ((a.weak && b.weak) || !keys(a).some(k => keys(b).includes(k))) continue;
      const gap = Math.max(t(a.start), t(b.start)) - Math.min(t(a.end), t(b.end));
      if (gap <= (a.weak || b.weak ? cfg.weakAttachMin : cfg.incidentGapMin) * MIN) parent[find(i)] = find(j);
    }
    // Enlaces explícitos: cuenta comprometida por un ataque y el propio ataque
    for (const c of compromised) {
      const i = active.indexOf(c.via);
      active.forEach((f, j) => { if (j !== i && (f.evidence.includes(c.row.id))) parent[find(j)] = find(i); });
    }
    // Webshell: shell de IIS y ataque web desde la misma IP
    const groups = new Map();
    active.forEach((f, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(f); });
    // Sin una señal fuerte del mismo actor, los hallazgos débiles quedan a validar y no forman incidente
    const weakGroups = [...groups.values()].filter(fs => fs.every(f => f.weak));
    for (const fs of weakGroups) for (const f of fs) f.needsValidation = true;
    const offHours = weakGroups.flat().filter(f => f.rule === "Inicio fuera de horario");
    if (offHours.length) {
      const offUsers = uniq(offHours.flatMap(f => f.actors.users));
      const sorted = [...offHours].sort((a, b) => t(a.start) - t(b.start));
      const merged = { ...sorted[0], id: "", title: `${offHours.length} inicio(s) fuera de horario de ${offUsers.length} cuenta(s)`,
        detail: `Entre ${hhmm(sorted[0].start)} y ${hhmm(sorted.at(-1).end)}, sin otras señales de las mismas cuentas.`,
        why: `Fuera de la franja ${cfg.workStart}:00–${cfg.workEnd}:00. A validar con los horarios del cliente; no se considera incidente.`,
        evidence: uniq(sorted.flatMap(f => f.evidence)).slice(0, 5), end: sorted.at(-1).end };
      for (const f of offHours) findings.splice(findings.indexOf(f), 1);
      findings.push(merged);
    }
    findings.forEach((f, i) => f.id = "H-" + String(i + 1).padStart(2, "0"));
    const incidents = [...groups.values()].filter(fs => !fs.every(f => f.weak)).map(fs => {
      fs.sort((a, b) => t(a.start) - t(b.start));
      const sev = fs.reduce((m, f) => SEV_RANK[f.sev] > SEV_RANK[m] ? f.sev : m, "Bajo");
      const ev = uniq(fs.flatMap(f => f.evidence));
      const ips = uniq(fs.flatMap(f => f.actors.ips || []));
      const users = uniq(fs.flatMap(f => f.actors.users || []).filter(u => u !== "-"));
      const hosts = uniq(ev.map(id => R.find(r => r.id === id)?.host));
      return { findings: fs, sev, evidence: ev, ips, users, hosts, cats: uniq(fs.map(f => f.cat)),
        start: fs.reduce((m, f) => t(f.start) < t(m) ? f.start : m, fs[0].start),
        end: fs.reduce((m, f) => t(f.end) > t(m) ? f.end : m, fs[0].end) };
    }).sort((a, b) => t(a.start) - t(b.start));
    incidents.forEach((inc, i) => {
      inc.id = "INC-" + String(i + 1).padStart(2, "0");
      inc.title = incidentTitle(inc);
      const top = inc.findings.filter(f => f.sev === inc.sev);
      inc.why = `${inc.sev} por: ${uniq(top.map(f => f.rule.toLowerCase())).join("; ")}. ` + IMPACT_WHY[inc.sev];
      inc.findings.forEach(f => f.incident = inc.id);
    });
    incidents.sort((a, b) => SEV_RANK[b.sev] - SEV_RANK[a.sev] || t(a.start) - t(b.start));
    const validations = findings.filter(f => f.needsValidation);
    const flagged = new Map();
    for (const f of findings) for (const id of f.evidence) { if (!flagged.has(id)) flagged.set(id, []); flagged.get(id).push(f.id); }
    const accounts = compromised.map(c => ({ user: c.user, src: c.src, evidence: c.row.id, finding: c.via.id }));
    return { findings, incidents, validations, flagged, CAT, compromised: accounts, cfg, criteria: IMPACT_WHY };
  }

  const IMPACT_WHY = {
    Crítico: "Hay acceso confirmado del atacante con daño materializado o inminente (datos fuera de la organización, ejecución remota o destrucción de copias de seguridad).",
    Alto: "Hay compromiso confirmado de cuentas o equipos, pero los registros no muestran todavía daño materializado.",
    Medio: "Actividad hostil o anómala sin evidencia de acceso logrado.",
    Bajo: "Anomalía aislada que requiere validación.",
  };
  function incidentTitle(inc) {
    const r = new Set(inc.findings.map(f => f.rule));
    const has = s => [...r].some(x => x.includes(s));
    if (has("Shell lanzada por el servidor web")) return "Compromiso del servidor web mediante webshell";
    if (has("Borrado de instantáneas")) return "Actividad preparatoria de ransomware";
    if (has("Fuerza bruta con éxito") && has("Salto")) {
      const exfil = has("Exfiltración de datos") ? " y exfiltración" : has("Conexión saliente") ? " y posible exfiltración" : "";
      return "Intrusión por fuerza bruta con movimiento lateral" + exfil;
    }
    if (has("Fuerza bruta con éxito") && has("Conexión saliente")) return "Intrusión por fuerza bruta y posible exfiltración";
    if (has("Exfiltración")) return "Exfiltración de información";
    if (has("Persistencia") || has("beacon")) return "Persistencia de malware en servidor";
    if (has("Password spraying")) return r.size > 1 ? "Password spraying con compromiso de cuenta" : "Password spraying";
    if (has("Fuerza bruta")) return "Ataque de fuerza bruta";
    return inc.findings[0].rule;
  }

  return { analyze, SEV_RANK, CRITERIA: IMPACT_WHY };
})();
if (typeof module !== "undefined") module.exports = SOCEngine;
