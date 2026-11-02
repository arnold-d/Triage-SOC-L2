// ===== Carga de archivos y conexión de eventos =====
const SAMPLE = window.SOC_SAMPLE || null;

// ---------- Carga ----------
async function loadFile(file){
  showErr("");
  if(!/\.xlsx?$/i.test(file.name)){ showErr("El archivo debe ser .xlsx. Exporta los logs del SIEM a Excel e inténtalo de nuevo."); return; }
  try{
    const buf = await file.arrayBuffer();
    const {sheetName, aoa} = readWorkbook(buf, XLSX);
    if(aoa.length<2){ showErr("La primera hoja está vacía. Revisa que el export tenga encabezados y filas."); return; }
    ingest(file.name, sheetName, aoa[0], aoa.slice(1));
  }catch(err){ showErr("No se pudo leer el archivo ("+err.message+"). Comprueba que no esté protegido con contraseña."); }
}
function ingest(name, sheetName, header, data){
  const {rows, missing, sinFecha} = buildRows(header, data);
  if(!rows.length){ showErr("No se encontraron eventos en la hoja."); return; }
  state.rows = rows; state.file = name;
  $("fname").textContent = name;
  $("fmeta").textContent = `Hoja «${sheetName}» · ${rows.length.toLocaleString("es")} eventos · ${header.length} columnas`;
  const w=$("warnings");
  const avisos = [];
  if(missing.length) avisos.push("Columnas no encontradas: "+missing.join(", ")+". El análisis de esos campos quedará vacío.");
  if(sinFecha) avisos.push(`${sinFecha} fila(s) con fecha ilegible: se ven en Registros, pero no se analizan.`);
  w.hidden = !avisos.length;
  w.textContent = avisos.join(" ");
  state.analysis = SOCEngine.analyze(rows); state.tlFit = false;
  resetFilters(); buildFilterOptions(); renderKpis(); apply(); renderAnalysis();
  $("tab-analisis").disabled = false; $("tab-dashboard").disabled = false;
  $("loader").hidden = true; $("loaded").hidden = false;
  setView(state.analysis.incidents.length ? "analisis" : "registros");
}

// ---------- Eventos ----------
$("file").addEventListener("change",e=>{ const f=e.target.files[0]; if(f) loadFile(f); e.target.value=""; });
const drop=$("drop");
["dragenter","dragover"].forEach(t=>drop.addEventListener(t,e=>{e.preventDefault();drop.classList.add("over");}));
["dragleave","drop"].forEach(t=>drop.addEventListener(t,e=>{e.preventDefault();drop.classList.remove("over");}));
drop.addEventListener("drop",e=>{ const f=e.dataTransfer.files[0]; if(f) loadFile(f); });
if(SAMPLE){ $("loadSample").hidden=false; $("loadSample").textContent=`Abrir el export del cliente (${SAMPLE.rows.length} eventos)`; }
$("loadSample").addEventListener("click",()=>{ if(SAMPLE) ingest(SAMPLE.name,SAMPLE.sheet,SAMPLE.cols,SAMPLE.rows); });
$("reload").addEventListener("click",()=>{ $("loaded").hidden=true; $("loader").hidden=false; });
$("q").addEventListener("input",e=>{state.f.q=e.target.value;state.page=0;apply();});
for(const [id,k] of [["fHost","host"],["fUser","user"],["fEvt","evt"],["fSrc","logsrc"]]) $(id).addEventListener("change",e=>{state.f[k]=e.target.value;state.page=0;apply();});
$("fExt").addEventListener("change",e=>{state.f.ext=e.target.checked;state.page=0;apply();});
$("fCmd").addEventListener("change",e=>{state.f.cmd=e.target.checked;state.page=0;apply();});
$("fFlag").addEventListener("change",e=>{state.f.flag=e.target.checked;state.page=0;apply();});
$("idsBanner").addEventListener("click",e=>{ if(e.target.id==="clearIds"){ state.f.ids=null; state.page=0; apply(); }});
$("tab-registros").addEventListener("click",()=>setView("registros"));
$("tab-analisis").addEventListener("click",()=>setView("analisis"));
$("tab-dashboard").addEventListener("click",()=>setView("dashboard"));
const dash=$("view-dashboard");
dash.addEventListener("click",dashClick);
for(const t of ["pointermove","focusin"]) dash.addEventListener(t,dashTip);
for(const t of ["pointerleave","focusout"]) dash.addEventListener(t,()=>{$("dtip").hidden=true;});
new ResizeObserver(()=>{ const h=$("dash-hist"); if(h&&state.view==="dashboard"&&+h.dataset.w!==h.clientWidth) renderHistogram(); }).observe(dash);
$("tbody").addEventListener("click",e=>{ const c=e.target.closest("[data-goinc]"); if(c){ e.stopPropagation(); goIncident(c.dataset.goinc); }},true);
$("kpis").addEventListener("click",e=>{
  if(e.target.id!=="kpiExtMas") return;
  resetFilters(); state.f.ext=true; $("fExt").checked=true; state.sort={key:"ts",dir:1};
  setView("registros"); apply(); window.scrollTo({top:$("view-registros").offsetTop-70,behavior:"smooth"});
});
$("view-analisis").addEventListener("click",e=>{
  if(e.target.closest("[data-tlfit]")){ state.tlFit=!state.tlFit; renderAnalysis(); return; }
  const ev=e.target.closest("[data-ev]"); if(ev){ const r=state.rows.find(x=>x.id===ev.dataset.ev); if(r) openDetail(r); return; }
  const sh=e.target.closest("[data-show]"); if(sh){ showEvidence(sh.dataset.show); return; }
  const ln=e.target.closest("[data-goinc]"); if(ln){ goIncident(ln.dataset.goinc); }
});
$("clearF").addEventListener("click",()=>{resetFilters();apply();});
$("sevChips").addEventListener("click",e=>{
  const c=e.target.closest(".chip"); if(!c) return;
  const on=c.getAttribute("aria-pressed")==="true"; c.setAttribute("aria-pressed",String(!on));
  on?state.f.sev.delete(c.dataset.sev):state.f.sev.add(c.dataset.sev); state.page=0; apply();
});
$("thead").addEventListener("click",e=>{
  const th=e.target.closest("th"); if(!th) return; const k=th.dataset.k;
  state.sort = state.sort.key===k ? {key:k,dir:-state.sort.dir} : {key:k,dir:k==="sev"?1:1}; apply();
});
$("pager").addEventListener("click",e=>{ const b=e.target.closest("[data-p]"); if(!b) return; state.page+=+b.dataset.p; renderTable(); });
$("tbody").addEventListener("click",e=>{ const tr=e.target.closest("tr[data-i]"); if(tr) openDetail(state.filtered[+tr.dataset.i]); });
$("scrim").addEventListener("click",closeDetail);
document.addEventListener("keydown",e=>{ if(e.key==="Escape") closeDetail(); });
$("drawer").addEventListener("click",e=>{
  if(e.target.id==="closeD") return closeDetail();
  const gi=e.target.closest("[data-goinc]"); if(gi){ closeDetail(); goIncident(gi.dataset.goinc); return; }
  const a=e.target.closest("[data-pivot]"); if(!a) return;
  resetFilters();
  const p=a.dataset.pivot, v=a.dataset.v;
  if(p==="q"){ state.f.q=v; $("q").value=v; }
  else { const map={user:"fUser",host:"fHost"}; state.f[p]=v; $(map[p]).value=v; }
  closeDetail(); apply();
});
