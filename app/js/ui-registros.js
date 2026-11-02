// ===== Resumen, filtros, tabla de registros y panel de detalle =====
// ---------- Resumen ----------
function renderKpis(){
  const R=state.rows;
  const ds=R.map(r=>r.tsDate).filter(Boolean).sort((a,b)=>a-b);
  const uniq = k => new Set(R.map(r=>r[k]).filter(Boolean)).size;
  const ext = new Set(R.filter(r=>r.ext).map(r=>r.src));
  const nonInfo = R.filter(r=>r.sev!=="Informational").length;
  const fails = R.filter(r=>/fail/i.test(r.result)).length;
  const span = ds.length ? (ds.at(-1)-ds[0]) : 0;
  const h=Math.floor(span/36e5), m=Math.round(span%36e5/6e4);
  const k=[
    ["Eventos",R.length.toLocaleString("es"),ds.length?`${fmtTs(ds[0]).slice(0,10)}`:""],
    ["Ventana",`${h} h ${m} min`,ds.length?`${fmtTs(ds[0]).slice(11,16)} → ${fmtTs(ds.at(-1)).slice(11,16)}`:""],
    ["Hosts",uniq("host"),""],
    ["Usuarios",uniq("user"),""],
    ["IP externas",ext.size,[...ext].join(" · ")],
    ["No informativos",nonInfo,`${fails} fallos de resultado`],
  ];
  $("kpis").innerHTML = k.map(([l,v,s])=>`<div class="kpi"><span class="l">${l}</span><span class="v">${v}</span><span class="s">${esc(s)}</span></div>`).join("");
}

// ---------- Filtros ----------
function countBy(k){ const m=new Map(); for(const r of state.rows){ m.set(r[k],(m.get(r[k])||0)+1);} return m; }
function fillSelect(id,k,label){
  const m=[...countBy(k)].filter(([v])=>v!=="").sort((a,b)=>b[1]-a[1]);
  $(id).innerHTML = `<option value="">Todos (${m.length})</option>` + m.map(([v,n])=>`<option value="${esc(v)}">${esc(v)} · ${n}</option>`).join("");
}
function buildFilterOptions(){
  const sc=countBy("sev");
  const sevs=[...SEV_ORDER.filter(s=>sc.has(s)), ...[...sc.keys()].filter(s=>!SEV_ORDER.includes(s))];
  $("sevChips").innerHTML = sevs.map(s=>`<button class="chip" data-sev="${esc(s)}" aria-pressed="true" style="--c:${SEV_COLOR[s]||"var(--sev-info)"}"><span class="dot"></span>${SEV_LABEL[s]||esc(s)}<span class="n">${sc.get(s)}</span></button>`).join("");
  state.f.sev = new Set(sevs);
  fillSelect("fHost","host"); fillSelect("fUser","user"); fillSelect("fEvt","evt"); fillSelect("fSrc","logsrc");
}
function resetFilters(){
  Object.assign(state.f,{q:"",host:"",user:"",evt:"",logsrc:"",ext:false,cmd:false,flag:false,ids:null,idsLabel:""});
  $("q").value=""; for(const id of ["fHost","fUser","fEvt","fSrc"]) $(id).value=""; $("fExt").checked=false; $("fCmd").checked=false; $("fFlag").checked=false;
  document.querySelectorAll("#sevChips .chip").forEach(c=>{c.setAttribute("aria-pressed","true"); state.f.sev.add(c.dataset.sev);});
  state.page=0;
}
function apply(){
  const f=state.f, q=f.q.toLowerCase().trim();
  let out = state.rows.filter(r =>
    f.sev.has(r.sev) && (!f.host||r.host===f.host) && (!f.user||r.user===f.user) &&
    (!f.evt||r.evt===f.evt) && (!f.logsrc||r.logsrc===f.logsrc) && (!f.ext||r.ext) && (!f.cmd||r.cmd) &&
    (!f.flag||state.analysis?.flagged.has(r.id)) && (!f.ids||f.ids.has(r.id)) &&
    (!q || r._hay.includes(q)));
  const {key,dir}=state.sort;
  out.sort((a,b)=>{
    if(key==="inc"){ return ((incOf(b.id)?1:0)-(incOf(a.id)?1:0))*dir || a.ts.localeCompare(b.ts); }
    if(key==="sev"){ return (SEV_ORDER.indexOf(a.sev)-SEV_ORDER.indexOf(b.sev))*dir || a.ts.localeCompare(b.ts); }
    return String(a[key]).localeCompare(String(b[key]),"es",{numeric:true})*dir;
  });
  state.filtered=out;
  const maxPage=Math.max(0,Math.ceil(out.length/state.pageSize)-1);
  if(state.page>maxPage) state.page=maxPage;
  renderTable();
}

// ---------- Tabla ----------
const COLS=[["inc","Incidente"],["id","Log_ID"],["ts","Timestamp"],["sev","Severidad"],["host","Host"],["evt","Event ID"],["user","Usuario"],["src","IP origen"],["dst","Destino"],["desc","Descripción"],["cmd","Comando / detalle"],["result","Resultado"]];
function renderTable(){
  const {key,dir}=state.sort;
  $("thead").innerHTML = COLS.map(([k,l])=>`<th data-k="${k}" ${k===key?`aria-sort="${dir>0?"ascending":"descending"}"`:""}>${l}</th>`).join("");
  const s=state.page*state.pageSize, rows=state.filtered.slice(s,s+state.pageSize);
  $("count").innerHTML = `<b>${state.filtered.length.toLocaleString("es")}</b> de ${state.rows.length.toLocaleString("es")} eventos`;
  const b=$("idsBanner"); b.hidden=!state.f.ids;
  if(state.f.ids) b.innerHTML=`Evidencias de <b>${esc(state.f.idsLabel)}</b> <button class="linkbtn" id="clearIds">Quitar</button>`;
  $("tbody").innerHTML = rows.length ? rows.map((r,i)=>`<tr data-i="${s+i}" style="--c:${SEV_COLOR[r.sev]||"transparent"}">
    <td class="nowrap">${incChips(r.id)}</td>
    <td class="mono nowrap">${esc(r.id)}</td>
    <td class="mono nowrap">${esc(r.ts)}</td>
    <td><span class="sev" style="--c:${SEV_COLOR[r.sev]||"var(--sev-info)"}"><span class="dot"></span>${SEV_LABEL[r.sev]||esc(r.sev)}</span></td>
    <td class="mono nowrap">${esc(r.host)}</td>
    <td class="mono">${esc(r.evt)}</td>
    <td class="nowrap">${esc(r.user)}</td>
    <td class="mono nowrap ${r.ext?"ip-ext":""}">${esc(r.src)}</td>
    <td class="mono">${esc(r.dst)}</td>
    <td class="desc">${esc(r.desc)}</td>
    <td class="cmd">${esc(r.cmd)}</td>
    <td class="mono">${esc(r.result)}</td></tr>`).join("")
    : `<tr><td colspan="${COLS.length}" class="empty">Ningún evento coincide con los filtros. Prueba a quitar alguno.</td></tr>`;
  const pages=Math.max(1,Math.ceil(state.filtered.length/state.pageSize));
  $("pager").innerHTML = `<span>Página ${state.page+1} de ${pages}</span>
    <button class="btn" data-p="-1" ${state.page===0?"disabled":""}>Anterior</button>
    <button class="btn" data-p="1" ${state.page>=pages-1?"disabled":""}>Siguiente</button>`;
}

// ---------- Detalle ----------
function openDetail(r){
  const d=$("drawer");
  const near = state.rows.filter(x=>x!==r && x.tsDate && r.tsDate && Math.abs(x.tsDate-r.tsDate)<=5*60e3 && ((r.user&&x.user===r.user)||(r.src&&x.src===r.src)));
  d.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:start;gap:10px">
      <div><div class="eyebrow">${esc(r.logsrc)} · Event ${esc(r.evt)}</div><h3>${esc(r.id)}</h3></div>
      <button class="btn" id="closeD">Cerrar</button></div>
    <dl class="kv">${FIELDS.map(([k,l])=>`<dt>${FIELD_LABEL[k]}</dt><dd class="${["desc","user","sev"].includes(k)?"":"mono"} ${k==="src"&&r.ext?"ip-ext":""}">${esc(k==="sev"?(SEV_LABEL[r.sev]||r.sev)+" ("+r.sev+")":r[k])||"—"}</dd>`).join("")}</dl>
    ${findingsFor(r.id).length?`<div class="ctx"><div class="eyebrow">Citado en</div>${findingsFor(r.id).map(f=>`<div style="font-size:13px"><span class="pill" style="--c:${RISK_COLOR[f.sev]}">${f.sev}</span> ${f.incident?`<a data-goinc="${f.incident}">${f.incident}</a> · `:""}${esc(f.id)} · ${esc(f.title)}</div>`).join("")}</div>`:""}
    <div class="ctx"><div class="eyebrow">Pivotar</div>
      ${r.user?`<a data-pivot="user" data-v="${esc(r.user)}">Ver todos los eventos de ${esc(r.user)}</a>`:""}
      ${r.src?`<a data-pivot="q" data-v="${esc(r.src)}">Ver todos los eventos con ${esc(r.src)}</a>`:""}
      ${r.host?`<a data-pivot="host" data-v="${esc(r.host)}">Ver todos los eventos en ${esc(r.host)}</a>`:""}
    </div>
    <div class="note">${near.length} eventos del mismo usuario o IP en ±5 minutos.</div>`;
  d.hidden=false; $("scrim").hidden=false;
}
function closeDetail(){ $("drawer").hidden=true; $("scrim").hidden=true; }
