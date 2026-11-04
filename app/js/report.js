// ===== Informes ejecutivo y técnico =====
// Todo sale del resultado del motor: cifras, tablas, evidencias, MITRE y criticidad. Los planes de acción,
// el impacto y las decisiones son plantillas por tipo de incidente, rellenadas con sus actores reales.
// La IA solo aporta textos que se marcan como tales: el resumen ejecutivo y las explicaciones ya generadas.
// Funciona en navegador y en Node.
const SOCReport = (() => {
  const SEVS = ["Crítico", "Alto", "Medio", "Bajo"];
  const uniq = a => [...new Set(a.filter(Boolean))];
  const hm = r => r.ts.slice(11, 16);
  const list = (a, max = 4) => !a.length ? "" : a.length <= max ? (a.length > 1 ? a.slice(0, -1).join(", ") + " y " + a.at(-1) : a[0]) : `${a.slice(0, max).join(", ")} y ${a.length - max} más`;
  const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
  const excerpt = (s, n = 110) => s.length > n ? s.slice(0, n - 1) + "…" : s;
  const IP_RE = /\b\d{1,3}(?:\.\d{1,3}){3}\b/;

  // ---------- Tipos de incidente ----------
  const rulesOf = inc => new Set(inc.findings.map(f => f.rule));
  const has = (inc, s) => [...rulesOf(inc)].some(r => r.includes(s));
  function kindOf(inc) {
    if (has(inc, "Shell lanzada por el servidor web")) return "webshell";
    if (has(inc, "Borrado de instantáneas")) return "ransomware";
    if (has(inc, "Fuerza bruta con éxito") && (has(inc, "Salto") || has(inc, "Conexión saliente"))) return "intrusion";
    if (has(inc, "Exfiltración de datos")) return "exfil";
    if (has(inc, "Persistencia") || has(inc, "beacon")) return "persistence";
    if (has(inc, "Password spraying")) return "spray";
    if (has(inc, "Fuerza bruta")) return "brute";
    if (has(inc, "Inicio desde IP externa")) return "external";
    return "other";
  }
  // Actores del incidente, tal como los ve el motor
  function actors(inc, rowsById) {
    const dsts = uniq(inc.findings.flatMap(f => f.actors.dsts || []));
    const extIps = uniq([...inc.ips, ...dsts.map(d => d.split(":")[0]).filter(d => IP_RE.test(d))]);
    const compromised = uniq(inc.findings.filter(f => /Inicio desde IP externa|Fuerza bruta con éxito|Privilegios especiales/.test(f.rule)).flatMap(f => f.actors.users));
    const files = uniq(inc.evidence.map(id => rowsById.get(id)).filter(r => r && /\.(exe|ps1|dll)\b/i.test(r.cmd) && /ProgramData|AppData|Temp/i.test(r.cmd)).map(r => (/([A-Z]:\\[^\s;]+\.(?:exe|ps1|dll))/i.exec(r.cmd) || [])[1]));
    return { users: inc.users.filter(u => !/APPPOOL/i.test(u)), hosts: inc.hosts, ips: extIps, dsts, compromised, files,
      service: inc.users.find(u => /APPPOOL/i.test(u)) };
  }
  const KINDS = {
    webshell: {
      llano: a => `un atacante desde Internet subió un programa al servidor web ${list(a.hosts)} que le permite ejecutar órdenes en él`,
      impacto: "El atacante puede ejecutar órdenes en el servidor web: leer datos, modificar el sitio y usarlo como puerta de entrada al resto de la red.",
      decision: "Aislar el servidor web afectado y revisar su contenido antes de volver a publicarlo.",
      plan: a => ({
        investigar: [`Localizar y conservar el archivo de la webshell en ${list(a.hosts)} y los registros del servidor web.`, `Revisar todo lo ejecutado por ${a.service || "la cuenta del servicio web"} y si hubo conexiones hacia otros equipos.`, `Buscar en el resto de servidores peticiones desde ${list(a.ips) || "las IP atacantes"}.`],
        contener: [`Bloquear ${list(a.ips) || "las IP atacantes"} en el perímetro.`, `Retirar de la red o poner en mantenimiento ${list(a.hosts)}.`],
        remediar: ["Eliminar la webshell y corregir la vía de subida de archivos.", "Restaurar el sitio desde una copia limpia, aplicar parches y revisar los permisos del servicio web."],
      }),
    },
    ransomware: {
      llano: a => `la cuenta ${list(a.users)} leyó ficheros de forma masiva y borró las copias de seguridad del sistema, pasos típicos antes de cifrar los datos para pedir un rescate`,
      impacto: "Riesgo inminente de cifrado de datos y de no poder recuperarlos, porque se eliminaron las copias de seguridad locales del sistema.",
      decision: "Aislar de inmediato los equipos implicados y comprobar que existen copias de seguridad fuera de línea.",
      plan: a => ({
        investigar: [`Determinar cómo se usó la cuenta ${list(a.users)} y desde cuándo.`, `Inventariar los ficheros leídos y comprobar si alguno se ha cifrado o modificado en ${list(a.hosts)}.`, "Buscar el mismo comportamiento en otros equipos."],
        contener: [`Aislar de la red ${list(a.hosts)}.`, `Deshabilitar o cambiar la contraseña de ${list(a.users)}.`],
        remediar: ["Restaurar desde copias de seguridad fuera de línea verificadas.", "Restringir el uso de herramientas de borrado de copias y revisar los privilegios de las cuentas de servicio."],
      }),
    },
    intrusion: {
      llano: a => `un atacante adivinó la contraseña de ${list(a.compromised.length ? a.compromised : a.users)}, entró en ${list(a.hosts.slice(0, 1))} y se movió a otros equipos${a.dsts.length ? ", con una conexión hacia el exterior que podría ser una salida de datos" : ""}`,
      impacto: "Un atacante con una cuenta válida y privilegiada dentro de la red puede acceder a información sensible, moverse entre equipos y sacar datos.",
      decision: "Cambiar las contraseñas de las cuentas afectadas y exigir un segundo factor en los accesos remotos.", decisionKey: "credenciales",
      plan: a => ({
        investigar: [`Reconstruir toda la actividad de ${list(a.users)} desde el primer acceso.`, `Revisar ${list(a.hosts)} en busca de herramientas o archivos dejados por el atacante.`, a.dsts.length ? `Determinar si se enviaron datos a ${list(a.dsts)} y cuáles.` : "Comprobar si hubo salida de datos."],
        contener: [`Bloquear ${list(a.ips) || "las IP atacantes"} en el perímetro.`, `Deshabilitar o cambiar la contraseña de ${list(a.users)} y cerrar sus sesiones abiertas.`, `Aislar ${list(a.hosts)} mientras se analizan.`],
        remediar: ["Exigir un segundo factor (MFA) en el escritorio remoto y limitar su exposición a Internet.", "Aplicar bloqueo de cuentas tras intentos fallidos y revisar los privilegios administrativos."],
      }),
    },
    exfil: {
      llano: a => `la cuenta ${list(a.users)} comprimió documentos y los envió fuera de la organización${a.dsts.length ? `, a ${list(a.dsts)}` : ""}`,
      impacto: "Salida de información de la organización hacia un destino externo: posible pérdida de datos confidenciales y obligaciones legales de notificación.",
      decision: "Determinar qué información salió y valorar con el área legal si hay que notificarlo.",
      plan: a => ({
        investigar: [`Identificar los ficheros comprimidos y enviados por ${list(a.users)}.`, `Determinar a quién pertenece ${list(a.dsts) || "el destino externo"} y si hubo más envíos.`, `Valorar si ${list(a.users)} actuó por su cuenta o con la cuenta comprometida.`],
        contener: [`Bloquear ${list(a.dsts.map(d => d.split(":")[0])) || "el destino externo"} en el proxy y el cortafuegos.`, `Suspender el acceso de ${list(a.users)} mientras se investiga.`],
        remediar: ["Limitar las subidas a servicios externos no autorizados y vigilar los volúmenes de salida.", "Revisar los permisos sobre los recursos compartidos sensibles."],
      }),
    },
    persistence: {
      llano: a => `se instaló en ${list(a.hosts)} un programa que se ejecuta solo y de forma periódica${a.files.length ? ` (${list(a.files)})` : ""}, propio de un código malicioso que quiere seguir activo`,
      impacto: "El equipo queda bajo el control remoto de un código malicioso que se mantiene activo aunque se reinicie.",
      decision: "Analizar y limpiar el servidor afectado antes de seguir usándolo.",
      plan: a => ({
        investigar: [`Analizar ${list(a.files) || "los binarios y scripts implicados"} y a qué destinos se conectan.`, `Determinar cómo obtuvo ${list(a.users)} acceso para instalar la tarea o el servicio.`],
        contener: [`Aislar ${list(a.hosts)} de la red.`, `Deshabilitar la tarea programada o el servicio creado y cambiar la contraseña de ${list(a.users)}.`],
        remediar: [`Eliminar la persistencia y reinstalar ${list(a.hosts)} si no se puede garantizar su limpieza.`, "Vigilar la creación de servicios y tareas desde rutas escribibles por usuarios."],
      }),
    },
    spray: {
      llano: a => a.compromised.length ? `desde ${list(a.ips)} se probaron contraseñas contra muchas cuentas y se consiguió entrar con ${list(a.compromised)}` : `desde ${list(a.ips)} se probaron contraseñas contra muchas cuentas, sin que conste un acceso logrado`,
      impacto: "Una cuenta en manos de un atacante le da acceso a todo lo que esa persona puede ver y hacer.",
      decision: "Cambiar las contraseñas de las cuentas afectadas y exigir un segundo factor en los accesos remotos.", decisionKey: "credenciales",
      plan: a => ({
        investigar: [`Revisar todo lo hecho con ${list(a.compromised.length ? a.compromised : a.users) || "las cuentas atacadas"} tras el acceso.`, `Comprobar si ${list(a.ips)} atacó también otros servicios.`],
        contener: [`Bloquear ${list(a.ips)} en el perímetro.`, a.compromised.length ? `Cambiar la contraseña de ${list(a.compromised)} y cerrar sus sesiones.` : "Cambiar las contraseñas de las cuentas atacadas."],
        remediar: ["Exigir un segundo factor (MFA) y bloquear cuentas tras varios intentos fallidos.", "No exponer a Internet servicios de autenticación interna."],
      }),
    },
    brute: {
      llano: a => `se intentó adivinar la contraseña de ${list(a.users)}${a.ips.length ? ` desde ${list(a.ips)}` : ""}`,
      impacto: "Si el ataque tiene éxito, el atacante obtiene una cuenta válida.",
      decision: "Revisar la política de bloqueo de cuentas tras intentos fallidos.", decisionKey: "credenciales",
      plan: a => ({
        investigar: [`Confirmar si hubo acceso con ${list(a.users)} tras los intentos.`],
        contener: [`Bloquear ${list(a.ips) || "el origen"} y cambiar la contraseña de ${list(a.users)}.`],
        remediar: ["Aplicar bloqueo tras intentos fallidos y un segundo factor."],
      }),
    },
    external: {
      llano: a => `${list(a.users)} inició sesión desde Internet${a.ips.length ? ` (${list(a.ips)})` : ""}`,
      impacto: "Un acceso desde fuera de la red puede ser legítimo o indicar una cuenta comprometida.",
      decision: "Confirmar con la persona si el acceso desde fuera fue suyo.",
      plan: a => ({
        investigar: [`Confirmar con el titular de ${list(a.users)} si el acceso fue legítimo.`],
        contener: [`Si no lo fue, cambiar su contraseña y bloquear ${list(a.ips) || "el origen"}.`],
        remediar: ["Limitar los accesos desde Internet a canales controlados (VPN con segundo factor)."],
      }),
    },
    other: {
      llano: () => "se observó actividad anómala que requiere análisis",
      impacto: "Impacto por determinar.",
      decision: "Analizar la actividad con el responsable de los equipos implicados.",
      plan: a => ({ investigar: [`Revisar la actividad de ${list([...a.users, ...a.hosts]) || "los actores implicados"}.`], contener: ["Aplicar las medidas que resulten del análisis."], remediar: ["Corregir la causa identificada."] }),
    },
  };
  const RECOMENDACIONES = [
    { when: k => k.has("intrusion") || k.has("spray") || k.has("brute"), text: "Segundo factor (MFA) en todos los accesos remotos y bloqueo de cuentas tras intentos fallidos." },
    { when: (k, c) => c.has("exec"), text: "Registro de PowerShell (Script Block Logging) y restricción de scripts ofuscados y herramientas administrativas." },
    { when: (k, c) => c.has("lateral"), text: "Segmentar la red y limitar los inicios de sesión de red entre servidores." },
    { when: k => k.has("exfil") || k.has("intrusion"), text: "Control de la salida de datos: proxy con inspección, alertas por volumen y lista de destinos permitidos." },
    { when: k => k.has("ransomware"), text: "Copias de seguridad fuera de línea, probadas con regularidad." },
    { when: k => k.has("persistence"), text: "Vigilancia de servicios y tareas programadas nuevos, en especial desde rutas escribibles por usuarios." },
    { when: k => k.has("webshell"), text: "Revisar las aplicaciones web expuestas: subida de archivos, permisos del servicio y un cortafuegos de aplicación." },
    { when: () => true, text: "Mantener la normalización del SIEM: nombres de equipos y cuentas coherentes evitan confusiones como las anomalías a validar." },
  ];

  // ---------- Construcción ----------
  // Cada bloque: { id, kind: "p"|"list"|"table"|"ai", source: "motor"|"plantilla"|"ia", text|items|head+rows }
  function build(rows, analysis, { meta = {}, explanations = new Map(), executiveAI = null } = {}) {
    const A = analysis, R = rows.filter(r => r.tsDate).sort((a, b) => a.tsDate - b.tsDate);
    const rowsById = new Map(rows.map(r => [r.id, r]));
    const incidents = [...A.incidents];
    const active = A.findings.filter(f => !f.needsValidation);
    const events = new Set(incidents.flatMap(i => i.evidence));
    const bySev = s => incidents.filter(i => i.sev === s);
    const sevText = SEVS.filter(s => bySev(s).length).map(s => `${bySev(s).length} ${s.toLowerCase()}${bySev(s).length > 1 ? "s" : ""}`);
    const top = incidents[0]?.sev || null;
    const info = incidents.map(i => ({ inc: i, kind: kindOf(i), a: actors(i, rowsById) }));
    const compromised = uniq(A.compromised.map(c => c.user));
    const hostsAff = uniq(incidents.flatMap(i => i.hosts));
    const day = R.length ? R[0].ts.slice(0, 10) : "";
    const lastDay = R.length ? R.at(-1).ts.slice(0, 10) : "";
    const span = R.length ? (day === lastDay ? `El ${day}, entre las ${hm(R[0])} y las ${hm(R.at(-1))}` : `Entre el ${R[0].ts.slice(0, 16)} y el ${R.at(-1).ts.slice(0, 16)}`) : "En el periodo analizado";
    let n = 0;
    const id = () => "b" + (++n);
    const p = (text, source = "plantilla") => ({ id: id(), kind: "p", text, source });
    const ul = (items, source = "plantilla") => ({ id: id(), kind: "list", items, source });
    const table = (head, body, source = "motor") => ({ id: id(), kind: "table", head, rows: body, source });

    // Resumen, en frases simples y con cifras del motor
    const queFrases = [
      `${span}, el análisis de ${rows.length.toLocaleString("es")} eventos del SIEM identificó ${incidents.length ? `${plural(incidents.length, "incidente de seguridad", "incidentes de seguridad independientes")}: ${list(sevText)}` : "ningún incidente de seguridad"}.`,
      ...info.filter(x => x.inc.sev === "Crítico").slice(0, 3).map(x => `En ${x.inc.id}, ${KINDS[x.kind].llano(x.a)}.`),
      compromised.length || hostsAff.length ? `Hay ${plural(compromised.length, "cuenta comprometida", "cuentas comprometidas")} y ${plural(hostsAff.length, "equipo implicado", "equipos implicados")}.` : null,
      A.validations.length ? `Además, ${plural(A.validations.length, "anomalía requiere", "anomalías requieren")} validación con el cliente; no se consideran incidentes.` : null,
    ].filter(Boolean);
    const resumen = [p(queFrases.join(" "), "plantilla")];
    if (executiveAI?.text) resumen.push({ id: "exec-ai", kind: "ai", source: "ia", text: executiveAI.text, model: executiveAI.model, check: executiveAI.check, cit: executiveAI.cit });

    const riesgo = top ? `Riesgo global: ${top}. ${analysis.criteria[top] || ""} Se toma la criticidad del incidente más grave.` : "Riesgo global: sin incidentes. Las reglas no identificaron actividad hostil confirmada.";
    const decisiones = [...new Map(info.map(x => [KINDS[x.kind].decisionKey || x.kind, KINDS[x.kind].decision])).values()].slice(0, 5);

    const executive = [
      { id: "e1", title: "Qué pasó", blocks: resumen },
      { id: "e2", title: "Nivel de riesgo", blocks: [p(riesgo)] },
      { id: "e3", title: "Impacto para el negocio", blocks: [ul(uniq(info.map(x => KINDS[x.kind].impacto)))] },
      { id: "e4", title: "Incidentes", blocks: [table(["Incidente", "Qué pasó", "Criticidad", "Cuándo"], info.map(x => [x.inc.id, KINDS[x.kind].llano(x.a).replace(/^./, c => c.toUpperCase()) + ".", x.inc.sev, `${hm(x.inc.start)}–${hm(x.inc.end)}`]))] },
      { id: "e5", title: "Decisiones prioritarias", blocks: [ul(decisiones.length ? decisiones : ["Mantener la monitorización habitual."])] },
    ];

    const hallazgos = active.map(f => [f.id, f.incident || "—", f.rule, A.CAT[f.cat], f.sev, `${hm(f.start)}${hm(f.end) !== hm(f.start) ? "–" + hm(f.end) : ""}`, f.mitre]);
    const explicacion = info.flatMap(({ inc }) => {
      const e = explanations.get(inc.id);
      return [
        { id: `h-${inc.id}`, kind: "h", text: `${inc.id} · ${inc.title} (${inc.sev})` },
        ...(e?.text ? [{ id: `ai-${inc.id}`, kind: "ai", source: "ia", text: e.text, model: e.model, cit: e.cit }] : []),
        table(["Hallazgo", "Explicación", "MITRE"], inc.findings.map(f => [`${f.id} · ${f.title}`, `${f.detail} ${f.why}`, f.mitre])),
      ];
    });
    const MAX_EV = 12;
    const evidencias = info.flatMap(({ inc }) => {
      const ev = inc.evidence.map(i => rowsById.get(i)).filter(Boolean).sort((a, b) => a.tsDate - b.tsDate);
      const shown = ev.length > MAX_EV ? [...ev.slice(0, MAX_EV - 2), ...ev.slice(-2)] : ev;
      return [
        { id: `hev-${inc.id}`, kind: "h", text: `${inc.id}: ${plural(ev.length, "evento", "eventos")}${ev.length > shown.length ? `, se muestran ${shown.length} (los primeros y los últimos)` : ""}` },
        table(["Log_ID", "Hora", "Equipo", "Evento", "Cuenta", "Origen → destino", "Detalle"], shown.map(r => [r.id, r.ts.slice(11), r.host, r.evt, r.user, [r.src, r.dst].filter(Boolean).join(" → "), excerpt([r.desc, r.cmd].filter(Boolean).join(" · "))])),
      ];
    });
    const criterios = table(["Nivel", "Criterio", "Incidentes"], SEVS.map(s => [s, analysis.criteria[s], bySev(s).map(i => i.id).join(", ") || "—"]), "motor");
    const justificacion = info.map(({ inc }) => [inc.id, inc.sev, inc.why]);
    const planes = info.flatMap(({ inc, kind, a }) => {
      const pl = KINDS[kind].plan(a);
      return [{ id: `hp-${inc.id}`, kind: "h", text: `${inc.id} · ${inc.title}` },
        ...["investigar", "contener", "remediar"].map(k => ({ ...ul(pl[k]), label: k[0].toUpperCase() + k.slice(1) }))];
    });
    const kinds = new Set(info.map(x => x.kind)), cats = new Set(active.map(f => f.cat));
    const cfg = analysis.cfg || {};
    const metodo = [
      p(`Motor de reglas determinista sobre ${rows.length.toLocaleString("es")} eventos. Cada hallazgo procede de una regla y cita sus Log_ID; los incidentes agrupan hallazgos que comparten cuenta, IP externa o destino dentro de una ventana de ${cfg.incidentGapMin ?? "—"} minutos. Las señales débiles (inicios fuera de horario, lecturas masivas, recursos sensibles, persistencia en rutas normales) solo se suman a una señal fuerte del mismo actor a ${cfg.weakAttachMin ?? "—"} minutos o menos; solas quedan a validar.`, "motor"),
      table(["Regla", "Umbral"], [
        ["Fuerza bruta y password spraying", `${cfg.bruteMin} fallos en ${cfg.bruteWindowMin} min desde una IP; spraying si afecta a ${cfg.sprayUsers} cuentas o más`],
        ["Fallos repetidos seguidos de éxito", `${cfg.pairFailMin} fallos desde IP externa o ${cfg.pairFailMinInternal} desde IP interna en ${cfg.pairWindowMin} min`],
        ["Privilegios tras un acceso indebido", `evento 4672 en los ${cfg.privAfterMin} min siguientes`],
        ["Acceso masivo a ficheros", `${cfg.massAccessMin} lecturas en ${cfg.massAccessWindowMin} min`],
        ["Exfiltración", `${Math.round((cfg.exfilBytes || 0) / 1e6)} MB o más hacia un destino en ${cfg.exfilWindowMin} min`],
        ["Ejecución periódica (beacon)", `${cfg.beaconMin} ejecuciones con una variación de ${cfg.beaconJitterSec} s como máximo`],
        ["Ataque a aplicación web", `${cfg.webErrMin} peticiones en ${cfg.webWindowMin} min desde una IP`],
        ["Horario laboral", `de ${cfg.workStart}:00 a ${cfg.workEnd}:00`],
      ]),
      p("Uso de la IA: solo explica y redacta; nunca decide qué es un incidente ni su criticidad. Cada texto de IA va marcado y se comprueba: que los Log_ID citados existan y sean evidencia del incidente, que la cuenta, el equipo o la IP de cada frase coincidan con la fila citada y, en el resumen ejecutivo, que sus cifras estén en los datos del motor. El validador no detecta interpretaciones falsas con citas válidas: los textos de IA deben revisarse.", "plantilla"),
      ...(A.validations.length ? [{ id: id(), kind: "h", text: "Anomalías a validar con el cliente (no son incidentes)" }, table(["Hallazgo", "Detalle", "Evidencias"], A.validations.map(v => [v.title, v.detail, v.evidence.join(", ")]))] : []),
    ];
    const technical = [
      { id: "t1", title: "1. Resumen ejecutivo", blocks: [p(queFrases.join(" ")), ...(executiveAI?.text ? [{ id: "exec-ai-t", kind: "ai", source: "ia", text: executiveAI.text, model: executiveAI.model, check: executiveAI.check, cit: executiveAI.cit }] : []), p(riesgo)] },
      { id: "t2", title: "2. Hallazgos identificados", blocks: [p(`${plural(active.length, "hallazgo", "hallazgos")} en ${plural(incidents.length, "incidente", "incidentes")}, respaldados por ${events.size} de ${rows.length} eventos.`, "motor"), table(["ID", "Incidente", "Regla", "Categoría", "Criticidad", "Hora", "MITRE"], hallazgos)] },
      { id: "t3", title: "3. Explicación técnica de cada hallazgo", blocks: explicacion },
      { id: "t4", title: "4. Evidencias en los logs", blocks: evidencias },
      { id: "t5", title: "5. Criticidad y justificación", blocks: [criterios, table(["Incidente", "Criticidad", "Justificación"], justificacion)] },
      { id: "t6", title: "6. Posible impacto", blocks: [table(["Incidente", "Impacto"], info.map(x => [x.inc.id, KINDS[x.kind].impacto]), "plantilla")] },
      { id: "t7", title: "7. Plan de acción", blocks: planes },
      { id: "t8", title: "8. Recomendaciones generales", blocks: [ul(RECOMENDACIONES.filter(r => r.when(kinds, cats)).map(r => r.text))] },
      { id: "t9", title: "Anexo: metodología y anomalías a validar", blocks: metodo },
    ];
    return { meta, executive, technical, kinds: info.map(x => ({ id: x.inc.id, kind: x.kind })) };
  }

  // ---------- Resumen ejecutivo con IA: hechos del motor, sin filas de log ----------
  function executiveFacts(rows, analysis) {
    const R = rows.filter(r => r.tsDate).sort((a, b) => a.tsDate - b.tsDate), rowsById = new Map(rows.map(r => [r.id, r]));
    const lines = analysis.incidents.map(i => { const k = kindOf(i); return `- ${i.id} (${i.sev}, ${hm(i.start)}–${hm(i.end)}): ${KINDS[k].llano(actors(i, rowsById))}.`; });
    return [`Eventos analizados: ${rows.length}.`, R.length ? `Periodo: ${R[0].ts.slice(0, 16)} a ${R.at(-1).ts.slice(0, 16)}.` : "",
      `Incidentes: ${analysis.incidents.length}. Por criticidad: ${SEVS.map(s => `${s} ${analysis.incidents.filter(i => i.sev === s).length}`).join(", ")}.`,
      `Cuentas comprometidas: ${uniq(analysis.compromised.map(c => c.user)).length}. Equipos implicados: ${uniq(analysis.incidents.flatMap(i => i.hosts)).length}.`,
      `Anomalías a validar: ${analysis.validations.length}.`, "Incidentes:", ...lines].filter(Boolean).join("\n");
  }
  function executiveMessages(rows, analysis) {
    return [{ role: "system", content: `Eres analista SOC y escribes para la dirección de una empresa, en español ejecutivo: claro, sin jerga técnica ni siglas.
Reglas obligatorias:
- Usa solo los hechos que recibes. No añadas cifras, causas ni consecuencias que no consten.
- Menciona los incidentes por su identificador (por ejemplo INC-01) cuando hables de ellos.
- No cambies la criticidad de ningún incidente.
- No incluyas recomendaciones: van en otra sección.
- Responde en un solo párrafo de 3 a 5 frases, sin títulos ni Markdown.` },
    { role: "user", content: `Redacta el resumen ejecutivo del informe con estos hechos:\n\n${executiveFacts(rows, analysis)}` }];
  }
  // Las cifras y los identificadores del texto deben estar en los hechos dados
  function checkExecutive(text, rows, analysis) {
    const facts = executiveFacts(rows, analysis);
    const known = new Set((facts.match(/\d+/g) || []));
    const incIds = new Set(analysis.incidents.map(i => i.id));
    const sinHoras = String(text).replace(/\b\d{1,2}:\d{2}\b/g, " ").replace(/\b\d{4}-\d{2}-\d{2}\b/g, " ");
    const cifras = uniq((sinHoras.replace(/\bINC-\d+\b/g, " ").match(/\b\d+(?:[.,]\d+)?\b/g) || []).filter(x => !known.has(x.replace(/[.,]/g, ""))));
    const ids = uniq((String(text).match(/\bINC-\d+\b/g) || []).filter(x => !incIds.has(x)));
    return { cifras, ids, ok: !cifras.length && !ids.length };
  }

  // Texto plano del informe, para buscar Log_ID y para las pruebas
  function toText(report, edits = {}) {
    const block = b => edits[b.id] ?? (b.kind === "table" ? [b.head.join(" | "), ...b.rows.map(r => r.join(" | "))].join("\n") : b.kind === "list" ? b.items.join("\n") : b.text);
    return [...report.executive, ...report.technical].map(s => [s.title, ...s.blocks.map(block)].join("\n")).join("\n\n");
  }
  return { build, kindOf, executiveMessages, executiveFacts, checkExecutive, toText, KINDS };
})();
if (typeof module !== "undefined") module.exports = SOCReport;
