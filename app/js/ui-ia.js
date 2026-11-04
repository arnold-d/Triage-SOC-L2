// ===== Ajustes de IA, explicaciones y sugerencias =====
const AI_KEY = "soc-triage.ai";
state.ai = { cfg: { ...SOCAI.DEFAULTS }, status: "", detail: "", found: [], explain: new Map(), suggest: null, batch: null };

// Prioridad: lo guardado en este navegador, luego app/ai.config.local.js, luego sin IA
function aiLoadConfig() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(AI_KEY) || "null"); } catch { saved = null; }
  state.ai.cfg = { ...SOCAI.DEFAULTS, ...(window.SOC_AI_CONFIG || {}), ...(saved || {}) };
  state.ai.source = saved ? "browser" : window.SOC_AI_CONFIG ? "file" : "default";
}
const AI_SOURCE = { browser: "guardada en este navegador", file: "archivo ai.config.local.js", default: "valores por defecto (sin IA)" };
function aiResetConfig() {
  try { localStorage.removeItem(AI_KEY); } catch { /* nada guardado */ }
  aiLoadConfig(); state.ai.status = ""; state.ai.detail = ""; state.ai.found = [];
  aiChanged(false); renderAIPanel();
}
// La clave que viene de ai.config.local.js no se copia al navegador: se guarda solo si la escribió el usuario aquí
function aiSaveConfig() {
  const cfg = { ...state.ai.cfg };
  if (window.SOC_AI_CONFIG?.apiKey && cfg.apiKey === window.SOC_AI_CONFIG.apiKey) delete cfg.apiKey;
  try { localStorage.setItem(AI_KEY, JSON.stringify(cfg)); } catch { /* sin almacenamiento: vale solo para esta sesión */ }
}
const aiOn = () => state.ai.cfg.provider !== "none";
// Con doble clic (file://) la página envía Origin: null y Ollama la rechaza; ver tools/servir.js
const AI_FILE_MSG = "Para usar Ollama, abre la app con iniciar (iniciar.bat en Windows, iniciar.sh en Linux y macOS).";
const aiBlocked = () => state.ai.cfg.provider === "ollama" && location.protocol === "file:";
function aiReset() { aiCancel(); state.ai.explain = new Map(); state.ai.suggest = null; }

// ---------- Explicaciones guardadas durante la sesión del navegador ----------
function aiSessionKey() {
  const text = [state.file, state.rows.length, ...state.analysis.incidents.flatMap(i => [i.id, ...i.evidence])].join("|");
  let h = 5381; for (let i = 0; i < text.length; i++) h = (h * 33 ^ text.charCodeAt(i)) >>> 0;
  return `soc-triage.ai.session.${h.toString(36)}`;
}
function aiStore() {
  const explain = [...state.ai.explain].filter(([, e]) => e.status === "done").map(([id, e]) => ({ id, text: e.text, model: e.model }));
  const s = state.ai.suggest?.status === "done" ? { text: state.ai.suggest.text, model: state.ai.suggest.model } : null;
  try { sessionStorage.setItem(aiSessionKey(), JSON.stringify({ explain, suggest: s })); } catch { /* sin almacenamiento: se pierden al recargar */ }
}
// Las citas se validan de nuevo: el validador y el archivo cargado mandan, no lo guardado
function aiRestore() {
  let saved = null;
  try { saved = JSON.parse(sessionStorage.getItem(aiSessionKey()) || "null"); } catch { saved = null; }
  if (!saved) return;
  const byId = new Map(state.analysis.incidents.map(i => [i.id, i]));
  for (const e of saved.explain) if (byId.has(e.id)) state.ai.explain.set(e.id, { status: "done", text: e.text, model: e.model, cit: SOCAI.citations(e.text, state.rows, byId.get(e.id).evidence) });
  if (saved.suggest) state.ai.suggest = { status: "done", ...saved.suggest, cit: SOCAI.citations(saved.suggest.text, state.rows) };
}
function aiCancel() { state.ai.batch?.abort(); state.ai.batch = null; for (const e of state.ai.explain.values()) e.ctl?.abort(); state.ai.suggest?.ctl?.abort(); }

// ---------- Panel de ajustes ----------
const AI_NAMES = { none: "Sin IA (plantillas)", ollama: "Ollama (local)", "openai-compatible": "Compatible con OpenAI", anthropic: "Anthropic" };
function aiHost() { try { return new URL(SOCAI.baseOf(state.ai.cfg)).host; } catch { return "el servicio configurado"; } }
function aiPrivacy() {
  const local = SOCAI.isLocal(state.ai.cfg);
  $("dropPrivacy").textContent = local
    ? "Archivo .xlsx con una fila por evento. Se procesa en tu navegador: los registros no salen de este equipo."
    : `Archivo .xlsx con una fila por evento. Se procesa en tu navegador; al usar la IA, las filas de evidencia se envían a ${aiHost()}.`;
  $("btnIA").textContent = aiOn() ? `IA: ${state.ai.cfg.model || AI_NAMES[state.ai.cfg.provider]}` : "Ajustes de IA";
}
function renderAIPanel() {
  const { cfg, status, detail, found } = state.ai, on = aiOn();
  const key = on && cfg.provider !== "ollama";
  $("aiPanel").innerHTML = `<div style="display:flex;justify-content:space-between;align-items:start;gap:10px">
      <div><div class="eyebrow">Configuración</div><h3>Ajustes de IA</h3></div><button class="btn" id="aiClose">Cerrar</button></div>
    <p class="dnote">La IA explica y redacta. Los incidentes y su criticidad los deciden siempre las reglas, y cada cita se comprueba contra el archivo cargado.</p>
    <div class="ai-source"><span>Configuración activa: <b>${AI_SOURCE[state.ai.source]}</b></span>${state.ai.source === "browser" ? `<button class="btn" id="aiReset">Restablecer</button>` : ""}</div>
    ${state.ai.source === "browser" ? `<p class="dnote">Restablecer borra lo guardado en este navegador y vuelve a ${window.SOC_AI_CONFIG ? "la del archivo ai.config.local.js" : "los valores por defecto"}.</p>` : ""}
    <div class="fgroup"><label for="aiProvider">Proveedor</label><select id="aiProvider">${Object.entries(AI_NAMES).map(([v, n]) => `<option value="${v}" ${v === cfg.provider ? "selected" : ""}>${n}</option>`).join("")}</select></div>
    ${on ? `<div class="fgroup"><label for="aiUrl">URL base</label><input type="search" id="aiUrl" value="${esc(cfg.baseUrl)}" placeholder="${esc(SOCAI.BASE_URL[cfg.provider] || "https://servidor/v1")}" autocomplete="off"></div>
    <div class="fgroup"><label for="aiModel">Modelo</label><input type="search" id="aiModel" list="aiModels" value="${esc(cfg.model)}" placeholder="${cfg.provider === "anthropic" ? SOCAI.ANTHROPIC_MODEL : ""}" autocomplete="off"><datalist id="aiModels">${found.map(m => `<option value="${esc(m)}">`).join("")}</datalist></div>
    ${key ? `<div class="fgroup"><label for="aiKey">Clave de API</label><input type="password" id="aiKey" value="${esc(cfg.apiKey)}" autocomplete="off"><span class="dnote">Se guarda sin cifrar en este navegador. Úsala solo en un equipo de confianza.</span></div>` : ""}
    ${aiBlocked() ? `<p class="ai-warn">${AI_FILE_MSG}</p>` : `<div><button class="btn primary" id="aiTest">Probar conexión</button></div>
    <div class="ai-status ${status}" role="status">${esc(detail)}</div>`}
    <label class="toggle"><input type="checkbox" id="aiAuto" ${cfg.autoExplain ? "checked" : ""}> Explicar los incidentes en segundo plano al cargar un archivo</label>
    <span class="dnote">Usa la GPU mientras trabajas; si vas a grabar, déjalo desactivado y genera las explicaciones antes.</span>
    ${SOCAI.isLocal(cfg) ? "" : `<p class="ai-warn">Con esta configuración, las filas de evidencia salen de este equipo y se envían a ${esc(aiHost())}.</p>`}` : `<p class="dnote">La app funciona entera sin IA, con plantillas.</p>`}`;
}
function aiOpen() { renderAIPanel(); $("aiPanel").hidden = false; $("scrim").hidden = false; }
function aiClose() { $("aiPanel").hidden = true; }
function aiChanged(save = true) {
  if (save) { aiSaveConfig(); state.ai.source = "browser"; }
  aiPrivacy();
  if (state.analysis) renderAnalysis();
  if (state.view === "dashboard") renderDashboard();
}
async function aiTest() {
  state.ai.status = "busy"; state.ai.detail = "Probando conexión…"; renderAIPanel();
  try {
    const found = await SOCAI.models(state.ai.cfg);
    state.ai.found = found; state.ai.status = "ok";
    state.ai.detail = found.length ? `Conectado. ${found.length} modelo(s) disponible(s): ${found.slice(0, 6).join(", ")}.` : "Conectado, pero el servicio no tiene modelos instalados.";
    if (!state.ai.cfg.model && found.length && state.ai.cfg.provider !== "anthropic") { state.ai.cfg.model = found[0]; aiChanged(); }
    if (state.ai.cfg.provider === "ollama" && state.ai.cfg.model) {
      state.ai.status = "busy"; state.ai.detail = `Conectado. Cargando ${state.ai.cfg.model} en memoria…`; renderAIPanel();
      const t0 = performance.now();
      await SOCAI.load(state.ai.cfg);
      state.ai.status = "ok"; state.ai.detail = `Conectado. ${state.ai.cfg.model} cargado en ${Math.round((performance.now() - t0) / 100) / 10} s.`;
    }
  } catch (e) { state.ai.status = "error"; state.ai.detail = e.message; }
  renderAIPanel();
}
function aiPanelInput(e) {
  const c = state.ai.cfg, id = e.target.id;
  if (id === "aiProvider") { c.provider = e.target.value; c.baseUrl = ""; c.model = ""; state.ai.status = ""; state.ai.detail = ""; state.ai.found = []; aiChanged(); renderAIPanel(); return; }
  if (id === "aiUrl") c.baseUrl = e.target.value.trim();
  else if (id === "aiModel") c.model = e.target.value.trim();
  else if (id === "aiKey") c.apiKey = e.target.value.trim();
  else if (id === "aiAuto") c.autoExplain = e.target.checked;
  else return;
  aiChanged();
  renderAIPanel(); // el origen pasa a "guardada en este navegador" y aparece Restablecer
}
function aiPanelClick(e) {
  if (e.target.id === "aiClose") { aiClose(); $("scrim").hidden = true; }
  if (e.target.id === "aiTest") aiTest();
  if (e.target.id === "aiReset") aiResetConfig();
}

// ---------- Citas ----------
function citedHTML(text, cit) {
  const bad = cit.items.filter(i => i.status !== "ok");
  const paint = s => s.split(/\n{2,}/).map(p => `<p>${p}</p>`).join("");
  if (!bad.length) return paint(esc(text));
  const map = new Map(bad.map(i => [i.token, i]));
  const TITLE = { missing: () => "No existe en el archivo cargado", outside: () => "Existe, pero no es evidencia de este incidente", mismatch: i => `Cita con datos que no coinciden: ${i.detail}` };
  const re = new RegExp(bad.map(i => i.token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).sort((a, b) => b.length - a.length).join("|"), "g");
  let out = "", at = 0;
  for (const m of text.matchAll(re)) {
    out += esc(text.slice(at, m.index));
    const item = map.get(m[0]);
    out += `<mark class="cite-${item.status}" title="${esc(TITLE[item.status](item))}">${esc(m[0])}</mark>`;
    at = m.index + m[0].length;
  }
  return paint(out + esc(text.slice(at)));
}
function citeSummary(cit) {
  const partes = [`${cit.verified} cita(s) verificada(s)`, `${cit.missing} no encontrada(s)`];
  if (cit.outside) partes.push(`${cit.outside} fuera de la evidencia`);
  if (cit.mismatch) partes.push(`${cit.mismatch} con datos que no coinciden`);
  const mal = cit.missing || cit.outside || cit.mismatch || !cit.items.length;
  return `<span class="cite-sum ${mal ? "bad" : "good"}">${partes.join(" / ")}${cit.items.length ? "" : " · la respuesta no cita ningún Log_ID"}</span>`;
}

// ---------- Explicación de incidentes ----------
function aiBlock(id) {
  if (!aiOn() || aiBlocked()) return "";
  const e = state.ai.explain.get(id);
  if (!e) return `<button class="linkbtn" data-ai-explain="${id}">Explicar con IA</button>`;
  if (e.status === "queued") return `<span class="dnote">En cola: la IA atiende una petición cada vez.</span> <button class="linkbtn" data-ai-stop="${id}">Cancelar</button>`;
  if (e.status === "loading") return `<div class="ai-text live"><div class="ai-head"><span class="tag">IA · generando</span><span class="dnote">${e.partial ? "Escribiendo…" : "Leyendo la evidencia…"}</span><button class="linkbtn" data-ai-stop="${id}">Cancelar</button></div><p class="ai-live">${esc(e.partial || "")}</p></div>`;
  if (e.status === "error") return `<div class="ai-err">${esc(e.message)} Se mantienen los hallazgos de las reglas. <button class="linkbtn" data-ai-explain="${id}">Reintentar</button></div>`;
  return `<div class="ai-text"><div class="ai-head"><span class="tag">IA · ${esc(e.model)}</span>${citeSummary(e.cit)}<button class="linkbtn" data-ai-explain="${id}">Regenerar</button></div>${citedHTML(e.text, e.cit)}</div>`;
}
// Mientras llega el texto solo se actualiza el párrafo, sin rehacer la tarjeta ni el dashboard
function aiLive(id, text) {
  const el = document.querySelector(`#ai-${id} .ai-live`);
  if (!el) return aiPaint(id);
  el.textContent = text;
  const hint = document.querySelector(`#ai-${id} .ai-head .dnote`); if (hint) hint.textContent = "Escribiendo…";
}
function aiPaint(id) {
  const el = $("ai-" + id); if (el) el.innerHTML = aiBlock(id);
  aiToolbarPaint();
  if (state.view === "dashboard") renderDashboard();
  if (state.view === "informe" && !["loading", "queued"].includes(state.ai.explain.get(id)?.status)) renderInforme();
}
async function aiExplain(id, signal) {
  const inc = state.analysis.incidents.find(i => i.id === id); if (!inc) return;
  const ctl = new AbortController(), cfg = state.ai.cfg;
  signal?.addEventListener("abort", () => ctl.abort());
  const entry = { status: "queued", ctl };
  state.ai.explain.set(id, entry); aiPaint(id);
  try {
    const text = await SOCAI.chat(cfg, SOCAI.explainMessages(inc, state.rows), { signal: ctl.signal,
      onStart: () => { entry.status = "loading"; aiPaint(id); },
      onToken: t => { entry.partial = t; aiLive(id, t); } });
    state.ai.explain.set(id, { status: "done", text, model: cfg.model || cfg.provider, cit: SOCAI.citations(text, state.rows, inc.evidence) });
  } catch (e) {
    if (e.code === "cancelled") state.ai.explain.delete(id);
    else state.ai.explain.set(id, { status: "error", message: e.message });
  }
  aiStore(); aiPaint(id);
}
async function aiExplainAll() {
  const ctl = new AbortController(); state.ai.batch = ctl; aiToolbarPaint();
  for (const inc of state.analysis.incidents) {
    if (ctl.signal.aborted) break;
    if (state.ai.explain.get(inc.id)?.status !== "done") await aiExplain(inc.id, ctl.signal);
  }
  if (state.ai.batch === ctl) state.ai.batch = null;
  aiToolbarPaint();
}
function aiTotals() {
  const done = [...state.ai.explain.values()].filter(e => e.status === "done");
  return { done: done.length, verified: done.reduce((s, e) => s + e.cit.verified, 0), bad: done.reduce((s, e) => s + e.cit.missing + e.cit.outside + e.cit.mismatch, 0) };
}
function aiToolbarPaint() {
  const el = $("aiToolbar"); if (!el) return;
  if (!aiOn()) { el.innerHTML = `<span class="dnote">IA desactivada: se usan las plantillas de las reglas.</span> <button class="linkbtn" data-ai-open>Ajustes de IA</button>`; return; }
  if (aiBlocked()) { el.innerHTML = `<p class="ai-warn">${AI_FILE_MSG}</p>`; return; }
  const T = aiTotals(), total = state.analysis.incidents.length, busy = !!state.ai.batch;
  el.innerHTML = `${total ? (busy ? `<button class="btn" data-ai-stopall>Cancelar</button>` : `<button class="btn" data-ai-all>Explicar ${total > 1 ? `los ${total} incidentes` : "el incidente"} con IA</button>`) : ""}
    <button class="btn" data-ai-suggest ${["loading", "queued"].includes(state.ai.suggest?.status) ? "disabled" : ""}>Sugerencias del analista IA</button>
    ${T.done ? `<span class="dnote">${T.done} de ${total} explicados · ${T.verified} citas verificadas / ${T.bad} no válidas</span>` : ""}`;
}

// ---------- Sugerencias sobre lo no marcado ----------
function aiSuggestBlock() {
  const s = state.ai.suggest;
  if (!aiOn() || !s) return "";
  const head = `<div class="eyebrow" style="color:var(--risk-low)">Sugerencia de la IA, no verificada por reglas</div>`;
  if (s.status === "queued") return `${head}<span class="dnote">En cola: la IA atiende una petición cada vez.</span>`;
  if (s.status === "loading") return `${head}<div class="ai-text live"><span class="dnote">${s.partial ? "Escribiendo…" : "Revisando los eventos no marcados…"}</span><p class="ai-live">${esc(s.partial || "")}</p></div>`;
  if (s.status === "error") return `${head}<div class="ai-err">${esc(s.message)}</div>`;
  return `${head}<div class="ai-text"><div class="ai-head"><span class="tag">IA · ${esc(s.model)}</span>${citeSummary(s.cit)}</div>${citedHTML(s.text, s.cit)}</div>`;
}
async function aiSuggest() {
  const ctl = new AbortController(), cfg = state.ai.cfg;
  const entry = state.ai.suggest = { status: "queued", ctl };
  const paint = () => { const el = $("aiSuggest"); if (el) { el.innerHTML = aiSuggestBlock(); el.hidden = !state.ai.suggest; } aiToolbarPaint(); };
  paint();
  try {
    const text = await SOCAI.chat(cfg, SOCAI.suggestMessages(state.rows, state.analysis), { signal: ctl.signal,
      onStart: () => { entry.status = "loading"; paint(); },
      onToken: t => { entry.partial = t; const el = document.querySelector("#aiSuggest .ai-live"); if (el) el.textContent = t; else paint(); } });
    state.ai.suggest = { status: "done", text, model: cfg.model || cfg.provider, cit: SOCAI.citations(text, state.rows) };
  } catch (e) {
    state.ai.suggest = e.code === "cancelled" ? null : { status: "error", message: e.message };
  }
  aiStore(); paint();
  if (state.view === "informe") renderInforme();
}
function aiClick(e) {
  const t = e.target.closest("[data-ai-explain],[data-ai-stop],[data-ai-all],[data-ai-stopall],[data-ai-suggest],[data-ai-open]"); if (!t) return;
  const d = t.dataset;
  if ("aiOpen" in d) aiOpen();
  else if ("aiAll" in d) aiExplainAll();
  else if ("aiStopall" in d) { state.ai.batch?.abort(); state.ai.batch = null; aiToolbarPaint(); }
  else if ("aiSuggest" in d) aiSuggest();
  else if (d.aiExplain) aiExplain(d.aiExplain);
  else if (d.aiStop) state.ai.explain.get(d.aiStop)?.ctl?.abort();
}
