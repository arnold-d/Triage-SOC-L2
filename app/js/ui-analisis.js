// ===== Pestaña Análisis: veredicto, cronología y tarjetas de incidente =====
// ---------- Análisis ----------
const CAT_ORDER=["brute","logon","priv","exec","lateral","other"];
function incOf(id){ const fs=state.analysis?.flagged.get(id); if(!fs) return null; const f=state.analysis.findings.find(x=>x.id===fs[0]); return f; }
function findingsFor(id){ const ids=state.analysis?.flagged.get(id)||[]; return state.analysis? state.analysis.findings.filter(f=>ids.includes(f.id)) : []; }
function incChips(id){
  const fs=findingsFor(id); if(!fs.length) return "";
  const incs=[...new Set(fs.map(f=>f.incident||"VAL"))];
  return incs.map(i=>{ const f=fs.find(x=>(x.incident||"VAL")===i); const inc=state.analysis.incidents.find(x=>x.id===i);
    return i==="VAL" ? `<span class="tag">A validar</span>` : `<span class="inc-chip" data-goinc="${i}" style="--c:${RISK_COLOR[inc.sev]}">${i}</span>`; }).join(" ");
}
function setView(v){
  state.view=v;
  for(const n of ["analisis","registros","dashboard","informe"]){ $("view-"+n).hidden = v!==n; $("tab-"+n).setAttribute("aria-selected", v===n); }
  if(v==="dashboard") renderDashboard();
  if(v==="informe") renderInforme();
}
function goIncident(id){ setView("analisis"); const el=document.getElementById("card-"+id); if(el){ el.scrollIntoView({behavior:"smooth",block:"start"}); } }
function showEvidence(key){
  const A=state.analysis; let ids, label;
  const inc=A.incidents.find(i=>i.id===key), f=A.findings.find(x=>x.id===key);
  if(inc){ ids=inc.evidence; label=`${inc.id} · ${inc.title}`; } else if(f){ ids=f.evidence; label=`${f.id} · ${f.title}`; } else return;
  showIds(ids,label);
}
function showIds(ids,label){
  resetFilters(); state.f.ids=new Set(ids); state.f.idsLabel=label; state.sort={key:"ts",dir:1};
  setView("registros"); apply(); window.scrollTo({top:$("view-registros").offsetTop-70,behavior:"smooth"});
}
const hm = r => r.ts.slice(11,16);
function evChips(ids,max=10){
  const shown=ids.slice(0,max).map(id=>`<button class="evid" data-ev="${esc(id)}">${esc(id)}</button>`).join("");
  return shown + (ids.length>max?`<span class="tag">+${ids.length-max} más</span>`:"");
}
function renderAnalysis(){
  const A=state.analysis, I=A.incidents;
  const bySev = s => I.filter(i=>i.sev===s).length;
  const catCount = c => A.findings.filter(f=>f.cat===c && !f.needsValidation).length;
  const sevs=["Crítico","Alto","Medio","Bajo"].filter(bySev);
  const headline = I.length===0 ? "No se identificaron incidentes"
    : I.length===1 ? "Se identificó 1 incidente" : `Se identificaron ${I.length} incidentes independientes`;
  const R0=state.rows.filter(r=>r.tsDate).sort((a,b)=>a.tsDate-b.tsDate);
  const totalEv = new Set(I.flatMap(i=>i.evidence)).size;
  let html = `<section class="verdict">
    <div class="eyebrow">Veredicto del análisis</div>
    <h2>${headline}</h2>
    <div class="sevbar">${sevs.map(s=>`<span class="pill" style="--c:${RISK_COLOR[s]}">${bySev(s)} ${s}${bySev(s)>1?"s":""}</span>`).join("")}
      ${A.validations.length?`<span class="pill out" style="--c:var(--risk-low)">${A.validations.length} anomalía${A.validations.length>1?"s":""} a validar</span>`:""}</div>
    <p>${A.findings.length-A.validations.length} hallazgos respaldados por ${totalEv} de ${state.rows.length} eventos. Cada hallazgo procede de una regla aplicada a los registros y cita sus Log_ID; los incidentes agrupan hallazgos que comparten cuenta o IP atacante en una ventana de tiempo.</p>
    <div class="cats">${CAT_ORDER.map(c=>`<div class="cat ${catCount(c)?"":"zero"}"><b>${catCount(c)}</b><span>${A.CAT[c]}</span></div>`).join("")}</div>
    <div class="ai-bar" id="aiToolbar"></div>
  </section>`;
  if(I.length) html += timelineSVG(I,R0);
  html += `<section class="sect"><h3>Incidentes</h3>${I.map(incCard).join("")}</section>`;
  if(A.validations.length) html += `<section class="valid"><div class="eyebrow" style="color:var(--risk-low)">A validar con el cliente · no son incidentes</div>
    ${A.validations.map(f=>`<div style="display:grid;gap:4px"><div class="hd"><strong>${esc(f.title)}</strong> <span class="tag mitre">${esc(f.mitre)}</span></div><div class="det" style="font-size:13px">${esc(f.detail)}</div><div class="wh" style="font-size:12.5px;color:var(--muted)">${esc(f.why)}</div><div class="evs">${evChips(f.evidence,5)}</div></div>`).join("")}</section>`;
  html += `<section class="valid" id="aiSuggest" ${state.ai.suggest?"":"hidden"}>${aiSuggestBlock()}</section>`;
  $("view-analisis").innerHTML = html;
  aiToolbarPaint();
}
function incCard(i){
  const c=RISK_COLOR[i.sev];
  return `<article class="inc" id="card-${i.id}" style="--c:${c}">
    <header>
      <div class="row1"><span class="pill" style="--c:${c}">${i.sev}</span><span class="iid">${i.id}</span><h4>${esc(i.title)}</h4></div>
      <div class="meta"><span>Ventana <b>${hm(i.start)}–${hm(i.end)}</b></span>
        ${i.users.length?`<span>Cuentas <b>${i.users.map(esc).join(", ")}</b></span>`:""}
        ${i.ips.length?`<span>IP origen <b>${i.ips.map(esc).join(", ")}</b></span>`:""}
        <span>Equipos <b>${i.hosts.map(esc).join(", ")}</b></span>
        <span>Evidencias <b>${i.evidence.length}</b> <button class="linkbtn" data-show="${i.id}">ver en registros</button></span></div>
      <div class="why"><b>Criticidad ${i.sev}.</b> ${esc(i.why.replace(/^\S+ por: /,"Motivo: "))}</div>
      <div class="ai-box" id="ai-${i.id}">${aiBlock(i.id)}</div>
    </header>
    <ol class="findings">${i.findings.map(f=>`<li class="finding">
      <span class="tm">${hm(f.start)}${hm(f.end)!==hm(f.start)?"–"+hm(f.end):""}</span>
      <div class="body">
        <div class="hd"><span class="pill" style="--c:${RISK_COLOR[f.sev]}">${f.sev}</span><strong>${esc(f.title)}</strong><span class="tag">${state.analysis.CAT[f.cat]}</span><span class="tag mitre">${esc(f.mitre)}</span></div>
        <div class="det">${esc(f.detail)}</div>
        <div class="wh">${esc(f.why)}</div>
        <div class="evs">${evChips(f.evidence)} ${f.evidence.length>1?`<button class="linkbtn" data-show="${f.id}">ver ${f.evidence.length} en registros</button>`:""}</div>
      </div></li>`).join("")}</ol>
  </article>`;
}
// Marcas del eje: el intervalo redondo más corto que deja como máximo maxTicks etiquetas
const TICK_MIN=[1,5,10,15,30,60,120,180,240,360,720,1440,2880,10080];
function timeTicks(t0,t1,maxTicks=8){
  const dia=new Date(t0); dia.setHours(0,0,0,0);
  const marcas=paso=>{ const out=[]; for(let tt=dia.getTime()+Math.ceil((t0-dia.getTime())/paso)*paso; tt<=t1; tt+=paso) out.push(tt); return out; };
  for(const m of TICK_MIN){ const out=marcas(m*6e4); if(out.length<=maxTicks) return out; }
  return marcas(TICK_MIN.at(-1)*6e4);
}
function timelineRange(I,R0){
  const a=R0[0].tsDate.getTime(), b=R0.at(-1).tsDate.getTime();
  if(!state.tlFit) return [a, Math.max(b,a+6e4)];
  const ini=Math.min(...I.map(i=>i.start.tsDate.getTime())), fin=Math.max(...I.map(i=>i.end.tsDate.getTime()));
  const margen=Math.max(5*6e4,(fin-ini)*.05);
  return [Math.max(a,ini-margen), Math.max(Math.min(b,fin+margen),ini+6e4)];
}
function timelineSVG(I,R0){
  const [t0,t1]=timelineRange(I,R0);
  const W=1000, L=300, Rt=16, top=26, lh=30, H=top+I.length*lh+8;
  const x=t=>L+(t-t0)/(t1-t0)*(W-L-Rt);
  const ticks=timeTicks(t0,t1);
  const lanes=[...I].sort((a,b)=>a.start.tsDate-b.start.tsDate);
  return `<section class="tl"><div class="tlhead"><h3>Cronología de incidentes</h3><button class="btn" data-tlfit>${state.tlFit?"Ver todo el periodo":"Ajustar a incidentes"}</button></div><div class="tlwrap"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Cronología de incidentes">
    ${ticks.map(tt=>`<line x1="${x(tt)}" x2="${x(tt)}" y1="${top-6}" y2="${H-4}" stroke="var(--line)"/><text x="${x(tt)}" y="14" text-anchor="middle" font-size="11" fill="var(--muted)" font-family="JetBrains Mono, monospace">${pad(new Date(tt).getHours())}:${pad(new Date(tt).getMinutes())}</text>`).join("")}
    ${lanes.map((i,k)=>{ const y=top+k*lh; const xs=x(i.start.tsDate.getTime()), xe=Math.max(x(i.end.tsDate.getTime()),xs+6);
      return `<g class="lane" data-goinc="${i.id}"><rect x="0" y="${y}" width="${W}" height="${lh}" fill="transparent"/>
        <text x="0" y="${y+19}" font-size="12" fill="var(--fg)"><tspan font-family="JetBrains Mono, monospace" fill="var(--muted)">${i.id}</tspan> ${esc(i.title.length>36?i.title.slice(0,35)+"…":i.title)}</text>
        <rect class="bar" x="${xs}" y="${y+8}" width="${xe-xs}" height="14" rx="3" fill="${RISK_COLOR[i.sev]}"/>
        ${i.findings.map(f=>`<circle cx="${x(f.start.tsDate.getTime())}" cy="${y+15}" r="3" fill="var(--surface)" stroke="${RISK_COLOR[i.sev]}" stroke-width="1.5"><title>${hm(f.start)} · ${esc(f.title)}</title></circle>`).join("")}
        <title>${i.id} · ${esc(i.title)} (${hm(i.start)}–${hm(i.end)})</title></g>`; }).join("")}
  </svg></div></section>`;
}
