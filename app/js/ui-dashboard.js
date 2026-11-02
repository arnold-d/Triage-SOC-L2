// ===== Pestaña Dashboard: cifras, gráficos en SVG y enlaces a Registros y Análisis =====
const dashKeys = new Map();
const dashKey = (ids, label) => { const k = "d" + dashKeys.size; dashKeys.set(k, { ids, label }); return k; };

function barList(items, unit, cls = "") {
  const max = Math.max(1, ...items.map(i => i.n));
  return `<div class="bars ${cls}">${items.map(i => {
    const w = i.n ? Math.max(2, i.n / max * 100) : 0;
    const link = i.n ? `data-dk="${dashKey(i.ids, i.text)}"` : "disabled";
    return `<button class="bar-row" ${link} data-tip="${i.n} ${unit}" data-tip-l="${esc(i.tip || i.text)}">
      <span class="bar-l"><span class="bar-n ${i.cls || ""}">${esc(i.text)}</span>${i.sub ? `<small>${esc(i.sub)}</small>` : ""}</span>
      <svg class="bar-t" aria-hidden="true"><rect x="-4" y="2" width="${w}%" height="10" rx="4" fill="${i.color || "var(--chart)"}"/></svg>
      <b class="bar-v">${i.n}</b></button>`;
  }).join("")}</div>`;
}
const dashCard = (title, note, body) => `<section class="dcard"><div><h3>${title}</h3>${note ? `<p class="dnote">${note}</p>` : ""}</div>${body}</section>`;

function incidentSentence(i) {
  const quien = [i.users.join(", "), i.ips.length ? `desde ${i.ips.join(", ")}` : ""].filter(Boolean).join(" ");
  return `Entre ${hm(i.start)} y ${hm(i.end)}${quien ? `, ${quien}` : ""}. Equipos: ${i.hosts.join(", ")}. ${i.findings.length} hallazgo(s) y ${i.evidence.length} evento(s) de evidencia.`;
}
// La explicación de la IA sustituye a la plantilla cuando existe
function incidentSummary(i) {
  const e = state.ai.explain.get(i.id);
  return e?.status === "done" ? `${citedHTML(e.text, e.cit)}${citeSummary(e.cit)}` : esc(incidentSentence(i));
}
function roundedTop(x, y, w, h) {
  const r = Math.min(4, w / 2, h);
  return `M${x} ${y + h}V${y + r}Q${x} ${y} ${x + r} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${y + h}Z`;
}
function niceStep(max) {
  const raw = Math.max(1, max) / 4, mag = 10 ** Math.floor(Math.log10(raw));
  const s = [1, 2, 5, 10].find(n => n * mag >= raw) * mag;
  return Math.max(1, s);
}
// Coloca cada franja en la primera fila donde quepan la barra y su etiqueta
function placeLanes(incidents, x, W) {
  const LABEL = 50, ends = [];
  return [...incidents].sort((a, b) => a.start.tsDate - b.start.tsDate).map(inc => {
    const xs = x(inc.start.tsDate.getTime()), xe = Math.max(x(inc.end.tsDate.getTime()), xs + 6);
    const labelLeft = xe + LABEL + 4 > W;
    const from = labelLeft ? xs - LABEL : xs, to = labelLeft ? xe : xe + LABEL;
    let lane = ends.findIndex(e => e + 8 <= from);
    if (lane < 0) { lane = ends.length; ends.push(0); }
    ends[lane] = to;
    return { inc, xs, xe, lane, labelLeft };
  });
}
function histogramSVG(H, incidents, W) {
  const L = 38, R = 8, T = 10, PH = 170, plotW = W - L - R, n = H.bins.length;
  const x = t => L + (t - H.t0) / (H.t1 - H.t0) * plotW;
  const band = plotW / n, barW = Math.max(2, Math.min(24, band - 2));
  const max = Math.max(1, ...H.bins.map(b => b.normal + b.flagged)), step = niceStep(max), top = Math.ceil(max / step) * step;
  const y = v => T + PH - v / top * PH;
  const dia = H.t1 - H.t0 > 864e5, fmt = t => fmtTs(new Date(t)).slice(dia ? 5 : 11, 16);
  const grid = []; for (let v = 0; v <= top; v += step) grid.push(v);
  const lanes = placeLanes(incidents, x, W), laneTop = T + PH + 30, totalH = laneTop + (Math.max(1, ...lanes.map(l => l.lane + 1))) * 20 + 4;
  const bars = H.bins.map((b, i) => {
    const bx = L + i * band + (band - barW) / 2, tot = b.normal + b.flagged;
    if (!tot) return "";
    const hF = b.flagged ? Math.max(2, PH * b.flagged / top) : 0, hN = b.normal ? Math.max(2, PH * b.normal / top) : 0;
    const gap = b.flagged && b.normal ? 2 : 0, yF = T + PH - hF, yN = yF - gap - hN;
    const flag = !b.flagged ? "" : b.normal ? `<rect x="${bx}" y="${yF}" width="${barW}" height="${hF}" fill="var(--chart)"/>` : `<path d="${roundedTop(bx, yF, barW, hF)}" fill="var(--chart)"/>`;
    const norm = b.normal ? `<path d="${roundedTop(bx, yN, barW, hN)}" fill="var(--chart-base)"/>` : "";
    return flag + norm;
  }).join("");
  const hits = H.bins.map((b, i) => {
    const tot = b.normal + b.flagged; if (!tot) return "";
    const r = `${fmt(b.t0)}–${fmt(b.t1)}`;
    return `<rect class="hit" x="${L + i * band}" y="${T}" width="${band}" height="${PH}" fill="transparent" data-dk="${dashKey(b.ids, `Eventos de ${r}`)}" data-tip="${b.flagged} de ${tot} eventos con incidente" data-tip-l="${r}" ${b.flagged ? 'tabindex="0"' : ""}/>`;
  }).join("");
  const ticks = timeTicks(H.t0, H.t1, Math.max(3, Math.min(8, Math.floor(plotW / 80))));
  return `<svg width="${W}" height="${totalH}" role="img" aria-label="Eventos en el tiempo, con los eventos de incidente diferenciados y la franja de cada incidente">
    ${grid.map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" class="axis">${v}</text>`).join("")}
    ${bars}
    ${ticks.map(tt => `<text x="${Math.max(L + 14, Math.min(x(tt), W - R - 16))}" y="${T + PH + 16}" text-anchor="middle" class="axis">${pad(new Date(tt).getHours())}:${pad(new Date(tt).getMinutes())}</text>`).join("")}
    ${hits}
    ${lanes.map(({ inc, xs, xe, lane, labelLeft }) => { const ly = laneTop + lane * 20;
      return `<g class="lane" data-goinc="${inc.id}" tabindex="0" data-tip="${esc(inc.sev)} · ${inc.id}" data-tip-l="${esc(inc.title)} (${hm(inc.start)}–${hm(inc.end)})">
        <rect x="${labelLeft ? xs - 50 : xs}" y="${ly}" width="${xe - xs + 50}" height="18" fill="transparent"/>
        <rect x="${xs}" y="${ly + 5}" width="${xe - xs}" height="8" rx="4" fill="${RISK_COLOR[inc.sev]}"/>
        <text x="${labelLeft ? xs - 5 : xe + 5}" y="${ly + 13}" text-anchor="${labelLeft ? "end" : "start"}" class="axis">${inc.id}</text></g>`; }).join("")}
  </svg>`;
}
function histogramTable(H) {
  const dia = H.t1 - H.t0 > 864e5, fmt = t => fmtTs(new Date(t)).slice(dia ? 5 : 11, 16);
  return `<details class="dtable"><summary>Ver estos datos en tabla</summary><div class="scroll"><table><thead><tr><th>Intervalo</th><th>Normales</th><th>Con incidente</th></tr></thead><tbody>
    ${H.bins.filter(b => b.normal + b.flagged).map(b => `<tr><td class="mono">${fmt(b.t0)}–${fmt(b.t1)}</td><td class="mono">${b.normal}</td><td class="mono">${b.flagged}</td></tr>`).join("")}</tbody></table></div></details>`;
}

function renderHistogram() {
  const host = $("dash-hist"); if (!host || !state.dash) return;
  const W = host.clientWidth; if (!W) return;
  host.dataset.w = W;
  host.innerHTML = state.dash.hist.bins.length ? histogramSVG(state.dash.hist, state.analysis.incidents, W) : `<p class="dnote">Sin eventos con fecha legible.</p>`;
}
function renderDashboard() {
  const A = state.analysis; if (!A) return;
  dashKeys.clear();
  const D = state.dash = SOCDashboard.build(state.rows, A), K = D.kpis;
  const sevText = D.sev.filter(s => s.n).map(s => `${s.n} ${s.key}${s.n > 1 ? "s" : ""}`).join(" · ") || "ninguno";
  const tiles = [
    ["Incidentes", K.incidents, sevText],
    ["Hallazgos", K.findings, `${A.validations.length} más a validar`],
    ["Eventos implicados", K.events, `de ${K.total.toLocaleString("es")} (${K.total ? (K.events / K.total * 100).toLocaleString("es", { maximumFractionDigits: 1 }) : 0} %)`],
    ["Cuentas comprometidas", K.accounts, "con acceso logrado"],
    ["IP externas implicadas", K.externalIps, `${K.originIps} origen · ${K.destIps} destino`],
  ];
  const riesgo = D.sev.map(s => ({ text: s.key, n: s.n, ids: s.ids, color: RISK_COLOR[s.key] }));
  const cats = D.cats.map(c => ({ text: c.label, n: c.n, ids: c.ids }));
  const top = (list, cls) => list.map(i => ({ text: i.key, n: i.n, ids: i.ids, cls }));
  const mitre = D.mitre.map(m => ({ text: m.key, sub: m.rules.join(" · "), tip: `${m.key}: ${m.rules.join(", ")}`, n: m.n, ids: m.ids, cls: "mono" }));
  const vacio = `<p class="dnote">Sin datos en este archivo.</p>`;
  $("view-dashboard").innerHTML = `
    <div class="kpis dkpis">${tiles.map(([l, v, s]) => `<div class="kpi"><span class="l">${l}</span><span class="v">${v}</span><span class="s">${esc(s)}</span></div>`).join("")}</div>
    <section class="dcard"><h3>Qué encontramos</h3>
      ${A.incidents.length ? `<ul class="finds">${A.incidents.map(i => `<li><button class="find" data-goinc="${i.id}"><span class="pill" style="--c:${RISK_COLOR[i.sev]}">${i.sev}</span><span><b>${i.id} · ${esc(i.title)}</b><br>${incidentSummary(i)}</span></button></li>`).join("")}</ul>` : `<p class="dnote">No se identificaron incidentes en este archivo.</p>`}
    </section>
    <div class="dgrid2">
      ${dashCard("Incidentes por criticidad", "Clic en una barra para ver sus evidencias en Registros.", barList(riesgo, "incidente(s)"))}
      ${dashCard("Hallazgos por categoría", "Las 6 categorías del reto, sin las anomalías a validar.", barList(cats, "hallazgo(s)"))}
    </div>
    ${dashCard("Actividad en el tiempo", `Eventos por intervalo de ${D.hist.binMin >= 60 ? D.hist.binMin / 60 + " h" : D.hist.binMin + " min"}. Debajo, la franja de cada incidente.`,
      `<div class="dlegend"><span><i style="background:var(--chart)"></i>Con incidente</span><span><i style="background:var(--chart-base)"></i>Normales</span></div><div id="dash-hist"></div>${histogramTable(D.hist)}`)}
    <div class="dgrid3">
      ${dashCard("Top de hosts", "Eventos de incidente por equipo.", D.hosts.length ? barList(top(D.hosts, "mono"), "evento(s)") : vacio)}
      ${dashCard("Top de cuentas", "Eventos de incidente por cuenta.", D.users.length ? barList(top(D.users), "evento(s)") : vacio)}
      ${dashCard("Top de IP externas", "Eventos de incidente con esa IP como origen o destino.", D.ips.length ? barList(top(D.ips, "mono"), "evento(s)") : vacio)}
    </div>
    ${dashCard("Técnicas MITRE observadas", "Hallazgos que citan cada técnica.", D.mitre.length ? barList(mitre, "hallazgo(s)", "bars-2") : vacio)}`;
  renderHistogram();
}

// ---------- Tooltip y clics ----------
function dashTip(e) {
  const t = $("dtip"), el = e.target.closest?.("[data-tip]");
  if (!el) { t.hidden = true; return; }
  t.replaceChildren();
  const v = document.createElement("b"); v.textContent = el.dataset.tip;
  const l = document.createElement("span"); l.textContent = el.dataset.tipL;
  t.append(v, l); t.hidden = false;
  const box = el.getBoundingClientRect(), px = e.clientX ?? box.left + box.width / 2, py = e.clientY ?? box.top;
  t.style.left = Math.max(8, Math.min(px + 14, innerWidth - t.offsetWidth - 8)) + "px";
  t.style.top = Math.max(8, Math.min(py + 14, innerHeight - t.offsetHeight - 8)) + "px";
}
function dashClick(e) {
  const inc = e.target.closest("[data-goinc]"); if (inc) { $("dtip").hidden = true; goIncident(inc.dataset.goinc); return; }
  const k = e.target.closest("[data-dk]"); if (!k) return;
  const d = dashKeys.get(k.dataset.dk); if (!d) return;
  $("dtip").hidden = true; showIds(d.ids, d.label);
}
