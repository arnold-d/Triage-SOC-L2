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
  $("view-analisis").hidden = v!=="analisis"; $("view-registros").hidden = v!=="registros";
  $("tab-analisis").setAttribute("aria-selected", v==="analisis"); $("tab-registros").setAttribute("aria-selected", v==="registros");
}
function goIncident(id){ setView("analisis"); const el=document.getElementById("card-"+id); if(el){ el.scrollIntoView({behavior:"smooth",block:"start"}); } }
function showEvidence(key){
  const A=state.analysis; let ids, label;
  const inc=A.incidents.find(i=>i.id===key), f=A.findings.find(x=>x.id===key);
  if(inc){ ids=inc.evidence; label=`${inc.id} · ${inc.title}`; } else if(f){ ids=f.evidence; label=`${f.id} · ${f.title}`; } else return;
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
  </section>`;
  if(I.length) html += timelineSVG(I,R0);
  html += `<section class="sect"><h3>Incidentes</h3>${I.map(incCard).join("")}</section>`;
  if(A.validations.length) html += `<section class="valid"><div class="eyebrow" style="color:var(--risk-low)">A validar con el cliente · no son incidentes</div>
    ${A.validations.map(f=>`<div style="display:grid;gap:4px"><div class="hd"><strong>${esc(f.title)}</strong> <span class="tag mitre">${esc(f.mitre)}</span></div><div class="det" style="font-size:13px">${esc(f.detail)}</div><div class="wh" style="font-size:12.5px;color:var(--muted)">${esc(f.why)}</div><div class="evs">${evChips(f.evidence,5)}</div></div>`).join("")}</section>`;
  $("view-analisis").innerHTML = html;
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
function timelineSVG(I,R0){
  const t0=R0[0].tsDate.getTime(), t1=R0.at(-1).tsDate.getTime();
  const W=1000, L=300, Rt=16, top=26, lh=30, H=top+I.length*lh+8;
  const x=t=>L+(t-t0)/(t1-t0)*(W-L-Rt);
  const ticks=[]; const d=new Date(t0); d.setMinutes(0,0,0); d.setHours(d.getHours()+1);
  for(let tt=d.getTime(); tt<=t1; tt+=36e5) ticks.push(tt);
  const lanes=[...I].sort((a,b)=>a.start.tsDate-b.start.tsDate);
  return `<section class="tl"><h3>Cronología de incidentes</h3><div class="tlwrap"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Cronología de incidentes">
    ${ticks.map(tt=>`<line x1="${x(tt)}" x2="${x(tt)}" y1="${top-6}" y2="${H-4}" stroke="var(--line)"/><text x="${x(tt)}" y="14" text-anchor="middle" font-size="11" fill="var(--muted)" font-family="JetBrains Mono, monospace">${String(new Date(tt).getHours()).padStart(2,"0")}:00</text>`).join("")}
    ${lanes.map((i,k)=>{ const y=top+k*lh; const xs=x(i.start.tsDate.getTime()), xe=Math.max(x(i.end.tsDate.getTime()),xs+6);
      return `<g class="lane" data-goinc="${i.id}"><rect x="0" y="${y}" width="${W}" height="${lh}" fill="transparent"/>
        <text x="0" y="${y+19}" font-size="12" fill="var(--fg)"><tspan font-family="JetBrains Mono, monospace" fill="var(--muted)">${i.id}</tspan> ${esc(i.title.length>36?i.title.slice(0,35)+"…":i.title)}</text>
        <rect class="bar" x="${xs}" y="${y+8}" width="${xe-xs}" height="14" rx="3" fill="${RISK_COLOR[i.sev]}"/>
        ${i.findings.map(f=>`<circle cx="${x(f.start.tsDate.getTime())}" cy="${y+15}" r="3" fill="var(--surface)" stroke="${RISK_COLOR[i.sev]}" stroke-width="1.5"><title>${hm(f.start)} · ${esc(f.title)}</title></circle>`).join("")}
        <title>${i.id} · ${esc(i.title)} (${hm(i.start)}–${hm(i.end)})</title></g>`; }).join("")}
  </svg></div></section>`;
}
