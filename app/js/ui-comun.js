// ===== Estado y utilidades compartidas por las pestañas =====
const FIELD_LABEL={id:"Log ID",ts:"Fecha y hora",host:"Host",evt:"Event ID",user:"Usuario",src:"IP origen",dst:"Destino",logsrc:"Fuente",desc:"Descripción",cmd:"Comando / detalle",result:"Resultado",sev:"Severidad"};
const SEV_ORDER = ["High","Medium","Warning","Informational"];
const SEV_LABEL = {High:"Alta",Medium:"Media",Warning:"Advertencia",Informational:"Informativa"};
const SEV_COLOR = {High:"var(--sev-high)",Medium:"var(--sev-med)",Warning:"var(--sev-warn)",Informational:"var(--sev-info)"};

const state = {rows:[], file:"", filtered:[], page:0, pageSize:50, sort:{key:"ts",dir:1},
  f:{q:"",sev:new Set(),host:"",user:"",evt:"",logsrc:"",ext:false,cmd:false,flag:false,ids:null,idsLabel:""},
  analysis:null, view:"registros"};
const RISK_COLOR={Crítico:"var(--risk-crit)",Alto:"var(--risk-high)",Medio:"var(--risk-med)",Bajo:"var(--risk-low)"};

const $ = id => document.getElementById(id);
function showErr(msg){ const e=$("loadErr"); e.textContent=msg; e.hidden=!msg; }
function esc(s){return String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}
