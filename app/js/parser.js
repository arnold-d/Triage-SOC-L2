// ===== Lectura del Excel y normalización de columnas =====
// Funciona en navegador y en Node, para que las pruebas usen el mismo camino que la app.
const FIELDS = [
  ["id","Log_ID"],["ts","Timestamp"],["host","Hostname"],["evt","Event_ID"],["user","User"],
  ["src","Source_IP"],["dst","Destination"],["logsrc","Log_Source"],["desc","Event_Description"],
  ["cmd","Process_CommandLine"],["result","Result"],["sev","Severity"]
];

const norm = s => String(s??"").trim().toLowerCase().replace(/[\s_\-]+/g,"");
function isPrivateIp(ip){
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(ip||""); if(!m) return true;
  const [a,b]=[+m[1],+m[2]];
  return a===10 || a===127 || (a===172&&b>=16&&b<=31) || (a===192&&b===168) || (a===169&&b===254);
}
function toDate(v){
  if(v instanceof Date) return v;
  if(typeof v==="number"){ // serial de Excel: hora tal como se ve en la celda, sin zona horaria
    const u=new Date(Math.round((v-25569)*864e5));
    return new Date(u.getUTCFullYear(),u.getUTCMonth(),u.getUTCDate(),u.getUTCHours(),u.getUTCMinutes(),u.getUTCSeconds());
  }
  const s=String(v||"").trim(); if(!s) return null;
  const m=/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
  if(m){ // dd/mm/aaaa; solo se lee como mm/dd si el segundo campo no puede ser un mes
    const [a,b]=[+m[1],+m[2]], [dia,mes]=b>12?[b,a]:[a,b];
    if(mes>12||dia>31) return null;
    return new Date(+m[3],mes-1,dia,+(m[4]||0),+(m[5]||0),+(m[6]||0));
  }
  const d=new Date(s.replace(" ","T")); return isNaN(d)?null:d;
}
const pad=n=>String(n).padStart(2,"0");
const fmtTs=d=>d?`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`:"";

function buildRows(header, data){
  const idx = {}; const missing=[];
  const hn = header.map(norm);
  for(const [k,col] of FIELDS){ const i=hn.indexOf(norm(col)); if(i<0) missing.push(col); idx[k]=i; }
  const rows = [];
  for(const r of data){
    if(!r || r.every(c=>c===""||c==null)) continue;
    const o={};
    for(const [k] of FIELDS){ const v = idx[k]>=0 ? r[idx[k]] : ""; o[k] = v==null?"":v; }
    o.tsDate = toDate(o.ts); o.ts = o.tsDate ? fmtTs(o.tsDate) : String(o.ts);
    for(const k of ["id","host","evt","user","src","dst","logsrc","desc","cmd","result","sev"]) o[k]=String(o[k]).trim();
    if(!o.sev) o.sev="Informational";
    o.ext = !!o.src && !isPrivateIp(o.src);
    o._hay = [o.id,o.ts,o.host,o.evt,o.user,o.src,o.dst,o.logsrc,o.desc,o.cmd,o.result,o.sev].join(" ").toLowerCase();
    rows.push(o);
  }
  return {rows, missing, sinFecha: rows.filter(r=>!r.tsDate).length};
}

function readWorkbook(buf, XLSXLib){
  const wb = XLSXLib.read(buf,{type:"array"}); // fechas nativas como serial: toDate las interpreta
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const aoa = XLSXLib.utils.sheet_to_json(sheet,{header:1,defval:"",raw:true});
  return {sheetName:wb.SheetNames[0], aoa};
}
if (typeof module !== "undefined") module.exports = { FIELDS, buildRows, readWorkbook, isPrivateIp };
