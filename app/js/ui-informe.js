// ===== Pestaña Informe: ejecutivo y técnico, editables, con comprobación de citas =====
const REPORT_META_KEY = "soc-triage.report.meta";
state.report = { meta: { analista: "", cliente: "", fecha: "" }, edits: {}, reviewed: false, exec: null, pdfStatus: "" };

function reportLoadMeta() {
  try { Object.assign(state.report.meta, JSON.parse(localStorage.getItem(REPORT_META_KEY) || "{}")); } catch { /* sin almacenamiento */ }
  state.report.meta.fecha ||= new Date().toISOString().slice(0, 10);
}
function reportSaveMeta() { try { localStorage.setItem(REPORT_META_KEY, JSON.stringify({ analista: state.report.meta.analista, cliente: state.report.meta.cliente })); } catch { /* sin almacenamiento */ } }
// Ediciones y revisión: duran lo que la sesión del navegador, con la misma clave que las explicaciones
const reportKey = () => aiSessionKey().replace("ai.session", "report.session");
function reportStore() {
  const e = state.report.exec?.status === "done" ? { text: state.report.exec.text, model: state.report.exec.model } : null;
  try { sessionStorage.setItem(reportKey(), JSON.stringify({ edits: state.report.edits, reviewed: state.report.reviewed, exec: e })); } catch { /* sin almacenamiento */ }
}
function reportRestore() {
  state.report.edits = {}; state.report.reviewed = false; state.report.exec = null;
  let saved = null;
  try { saved = JSON.parse(sessionStorage.getItem(reportKey()) || "null"); } catch { saved = null; }
  if (!saved) return;
  state.report.edits = saved.edits || {}; state.report.reviewed = !!saved.reviewed;
  if (saved.exec) state.report.exec = reportExecEntry(saved.exec.text, saved.exec.model);
}
function reportExecEntry(text, model) {
  return { status: "done", text, model, cit: SOCAI.citations(text, state.rows), check: SOCReport.checkExecutive(text, state.rows, state.analysis) };
}

// ---------- Construcción ----------
// Con las ediciones aplicadas; las citas y cifras de los textos de IA se comprueban sobre el texto editado
function reportData() {
  const ev = id => state.analysis.incidents.find(i => i.id === id)?.evidence;
  const explanations = new Map([...state.ai.explain].filter(([, e]) => e.status === "done").map(([id, e]) => {
    const text = state.report.edits[`ai-${id}`] ?? e.text;
    return [id, { text, model: e.model, cit: SOCAI.citations(text, state.rows, ev(id)) }];
  }));
  const ex = state.report.exec?.status === "done" ? state.report.exec : null;
  const exText = ex && (state.report.edits["exec-ai"] ?? ex.text);
  return SOCReport.build(state.rows, state.analysis, { meta: state.report.meta, explanations,
    executiveAI: ex && { text: exText, model: ex.model, check: SOCReport.checkExecutive(exText, state.rows, state.analysis), cit: SOCAI.citations(exText, state.rows) } });
}
async function reportPdf(kind) {
  const meta = { ...state.report.meta, reviewed: state.report.reviewed };
  const name = SOCPdf.fileName(kind, meta.fecha);
  const say = t => { state.report.pdfStatus = t; const el = $("rpPdfStatus"); if (el) el.textContent = t; };
  say(`Generando ${name}…`);
  try {
    const doc = SOCPdf.docDefinition(reportData(), kind, { edits: state.report.edits, meta, source: `${state.file} · ${state.rows.length} eventos` });
    await pdfMake.createPdf(doc).download(name);
    say(`Descargado: ${name}`);
  } catch (e) { say(`No se pudo generar el PDF: ${e.message}`); }
}
const SRC_LABEL = { motor: "Datos del motor", plantilla: "Plantilla", ia: "Texto de IA" };
function reportBlock(b) {
  const edited = b.id in state.report.edits;
  const mark = edited ? `<span class="rp-tag">editado por el analista</span>` : "";
  if (b.kind === "h") return `<h4 class="rp-h">${esc(b.text)}</h4>`;
  if (b.kind === "table") return `<div class="rp-table scroll"><table><thead><tr>${b.head.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${b.rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  if (b.kind === "list") {
    const items = edited ? state.report.edits[b.id].split("\n").filter(x => x.trim()) : b.items;
    return `${b.label ? `<div class="rp-label">${esc(b.label)}</div>` : ""}<ul class="rp-edit" contenteditable="true" data-block="${b.id}">${items.map(i => `<li>${esc(i)}</li>`).join("")}</ul>${mark}`;
  }
  if (b.kind === "ai") return reportAIBlock(b);
  return `<p class="rp-edit" contenteditable="true" data-block="${b.id}">${esc(edited ? state.report.edits[b.id] : b.text)}</p>${mark}`;
}
function reportAIBlock(b) {
  const key = b.id.startsWith("exec-ai") ? "exec-ai" : b.id;
  const text = state.report.edits[key] ?? b.text;
  const evidence = key.startsWith("ai-INC") ? state.analysis.incidents.find(i => `ai-${i.id}` === key)?.evidence : null;
  const cit = SOCAI.citations(text, state.rows, evidence);
  const chk = key === "exec-ai" ? SOCReport.checkExecutive(text, state.rows, state.analysis) : null;
  const cifras = chk && !chk.ok ? `<span class="cite-sum bad">${[chk.cifras.length && `cifras que no están en los datos del motor: ${chk.cifras.join(", ")}`, chk.ids.length && `incidentes inexistentes: ${chk.ids.join(", ")}`].filter(Boolean).join(" · ")}</span>` : "";
  return `<div class="rp-ai"><div class="ai-head"><span class="tag">Texto de IA · ${esc(b.model || "")} · revisar</span>${cit.items.length ? citeSummary(cit) : ""}${cifras}${key in state.report.edits ? `<span class="rp-tag">editado por el analista</span>` : ""}</div>
    <div class="rp-edit" contenteditable="true" data-block="${key}">${citedHTML(text, cit)}</div></div>`;
}
function reportCheckHTML(report) {
  const text = SOCReport.toText(report, state.report.edits);
  const cit = SOCAI.citations(text, state.rows);
  const logs = cit.items.filter(i => i.kind === "log"), bad = logs.filter(i => i.status === "missing");
  return bad.length
    ? `<div class="rp-check bad">⚠ Comprobación de citas: ${bad.length} de ${logs.length} Log_ID del informe no existen en el archivo cargado: ${esc(bad.slice(0, 8).map(i => i.token).join(", "))}${bad.length > 8 ? "…" : ""}</div>`
    : `<div class="rp-check good">✓ Comprobación de citas: los ${logs.length} Log_ID del informe existen en el archivo cargado.</div>`;
}
function reportExecControls() {
  if (!aiOn()) return `<span class="dnote">Sin IA, el resumen ejecutivo es la plantilla del motor.</span>`;
  if (aiBlocked()) return `<span class="ai-warn">${AI_FILE_MSG}</span>`;
  const e = state.report.exec;
  if (e?.status === "queued") return `<span class="dnote">Resumen con IA en cola: la IA atiende una petición cada vez.</span>`;
  if (e?.status === "loading") return `<span class="dnote">${e.partial ? "Redactando el resumen ejecutivo…" : "Preparando el resumen ejecutivo…"}</span> <button class="linkbtn" data-rp-stop>Cancelar</button><p class="ai-live">${esc(e.partial || "")}</p>`;
  const err = e?.status === "error" ? `<span class="ai-err">${esc(e.message)} Se mantiene la plantilla.</span> ` : "";
  const n = [...state.ai.explain.values()].filter(x => x.status === "done").length;
  return `${err}<button class="btn" data-rp-exec>${e?.status === "done" ? "Redactar de nuevo el resumen con IA" : "Redactar el resumen ejecutivo con IA"}</button>
    <span class="dnote">El informe técnico usa las explicaciones ya generadas: ${n} de ${state.analysis.incidents.length}.</span>`;
}
function renderInforme() {
  const view = $("view-informe"); if (!view || !state.analysis) return;
  const R = reportData(), m = state.report.meta, rev = state.report.reviewed && m.analista.trim();
  // Mientras la IA trabaja, el PDF saldría sin el texto que se está generando
  const busy = SOCAI.busy(), canPdf = rev && !busy;
  const pdfNote = !rev ? "Para descargar, escribe tu nombre y marca «Revisado por el analista»." : busy ? "La IA está generando texto; los PDF se podrán descargar cuando termine." : state.report.pdfStatus;
  const section = s => `<section class="rp-sec"><h3>${esc(s.title)}</h3>${s.blocks.map(reportBlock).join("")}</section>`;
  view.innerHTML = `
    <section class="dcard rp-tools">
      <div class="rp-fields">
        <div class="fgroup"><label for="rpAnalista">Analista</label><input type="search" id="rpAnalista" value="${esc(m.analista)}" autocomplete="off"></div>
        <div class="fgroup"><label for="rpCliente">Cliente</label><input type="search" id="rpCliente" value="${esc(m.cliente)}" autocomplete="off"></div>
        <div class="fgroup"><label for="rpFecha">Fecha del informe</label><input type="date" id="rpFecha" value="${esc(m.fecha)}"></div>
      </div>
      <div class="ai-bar" id="rpExec">${reportExecControls()}</div>
      <label class="toggle"><input type="checkbox" id="rpReviewed" ${state.report.reviewed ? "checked" : ""} ${m.analista.trim() ? "" : "disabled"}> Revisado por el analista${m.analista.trim() ? "" : " (escribe tu nombre para poder marcarlo)"}</label>
      <div class="ai-bar">
        <button class="btn primary" data-rp-pdf="executive" ${canPdf ? "" : "disabled"}>Descargar ${SOCPdf.fileName("executive", m.fecha)}</button>
        <button class="btn primary" data-rp-pdf="technical" ${canPdf ? "" : "disabled"}>Descargar ${SOCPdf.fileName("technical", m.fecha)}</button>
        <span class="dnote" id="rpPdfStatus" role="status">${esc(pdfNote)}</span>
      </div>
      <p class="dnote">Las cifras y tablas salen del motor y no se editan. Puedes corregir el texto haciendo clic en él; los textos de IA están marcados y se vuelven a comprobar al editarlos.</p>
      <div id="rpCheck">${reportCheckHTML(R)}</div>
    </section>
    <article class="report" id="report">
      <header class="rp-cover">
        <div class="eyebrow">Confidencial</div>
        <h2>Informe de incidentes de seguridad</h2>
        <dl class="kv">
          <dt>Cliente</dt><dd>${esc(m.cliente) || "—"}</dd>
          <dt>Fecha</dt><dd>${esc(m.fecha)}</dd>
          <dt>Analista</dt><dd>${esc(m.analista) || "—"}</dd>
          <dt>Revisado por el analista</dt><dd>${rev ? `Sí, ${esc(m.analista)}` : "No"}</dd>
          <dt>Fuente</dt><dd>${esc(state.file)} · ${state.rows.length.toLocaleString("es")} eventos</dd>
        </dl>
      </header>
      <div class="rp-part"><div class="eyebrow">Parte 1</div><h2>Informe ejecutivo</h2></div>
      ${R.executive.map(section).join("")}
      <div class="rp-part"><div class="eyebrow">Parte 2</div><h2>Informe técnico</h2></div>
      ${R.technical.map(section).join("")}
    </article>`;
}

// ---------- Acciones ----------
async function reportExec() {
  const ctl = new AbortController(), cfg = state.ai.cfg;
  const entry = state.report.exec = { status: "queued", ctl };
  const paint = () => { const el = $("rpExec"); if (el) el.innerHTML = reportExecControls(); };
  if (state.view === "informe") renderInforme(); else paint();
  try {
    const text = await SOCAI.chat(cfg, SOCReport.executiveMessages(state.rows, state.analysis), { signal: ctl.signal, maxTokens: 400,
      onStart: () => { entry.status = "loading"; paint(); },
      onToken: t => { entry.partial = t; const el = document.querySelector("#rpExec .ai-live"); if (el) el.textContent = t; else paint(); } });
    delete state.report.edits["exec-ai"];
    state.report.exec = reportExecEntry(text, cfg.model || cfg.provider);
  } catch (e) {
    state.report.exec = e.code === "cancelled" ? null : { status: "error", message: e.message };
  }
  reportStore();
  if (state.view === "informe") renderInforme();
}
let reportTimer = null;
function reportInput(e) {
  const t = e.target;
  if (t.id === "rpAnalista" || t.id === "rpCliente" || t.id === "rpFecha") {
    state.report.meta[{ rpAnalista: "analista", rpCliente: "cliente", rpFecha: "fecha" }[t.id]] = t.value;
    if (t.id === "rpAnalista" && !t.value.trim()) state.report.reviewed = false;
    reportSaveMeta(); reportStore();
    clearTimeout(reportTimer); reportTimer = setTimeout(() => { const f = document.activeElement?.id; renderInforme(); if (f) { const el = $(f); el?.focus(); el?.setSelectionRange?.(el.value.length, el.value.length); } }, 400);
    return;
  }
  const blk = t.closest?.("[data-block]");
  if (!blk) return;
  const text = blk.tagName === "UL" ? [...blk.querySelectorAll("li")].map(li => li.innerText.trim()).filter(Boolean).join("\n") : blk.innerText.trim();
  state.report.edits[blk.dataset.block] = text;
  reportStore();
  // Solo se vuelve a comprobar; el bloque se redibuja al salir de él, para no mover el cursor
  clearTimeout(reportTimer); reportTimer = setTimeout(() => { const el = $("rpCheck"); if (el) el.innerHTML = reportCheckHTML(reportData()); }, 300);
}
function reportBlur(e) { if (e.target.closest?.("[data-block]")) renderInforme(); }
function reportChange(e) {
  if (e.target.id === "rpReviewed") { state.report.reviewed = e.target.checked && !!state.report.meta.analista.trim(); reportStore(); renderInforme(); }
}
function reportClick(e) {
  if (e.target.closest("[data-rp-exec]")) reportExec();
  if (e.target.closest("[data-rp-stop]")) state.report.exec?.ctl?.abort();
  const pdf = e.target.closest("[data-rp-pdf]"); if (pdf && !pdf.disabled) reportPdf(pdf.dataset.rpPdf);
}
