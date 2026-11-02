// ===== Cifras del Dashboard =====
// Solo agrega lo que devuelve el motor, sin decidir nada nuevo. Funciona en navegador y en Node.
const SOCDashboard = (() => {
  const SEVS = ["Crítico", "Alto", "Medio", "Bajo"];
  const CATS = ["brute", "logon", "priv", "exec", "lateral", "other"];
  const BIN_MIN = [1, 2, 5, 10, 15, 30, 60, 120, 180, 360, 720, 1440, 2880, 10080];
  const isPrivate = typeof isPrivateIp === "function" ? isPrivateIp : require("./parser.js").isPrivateIp;
  const uniq = a => [...new Set(a.filter(Boolean))];

  // IP pública de un destino "ip" o "ip:puerto"; null si es un nombre de host o una IP privada
  function externalDst(dst) {
    const m = /^(\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?$/.exec(dst || "");
    return m && !isPrivate(m[1]) ? m[1] : null;
  }
  function ranking(rows, keysOf, max) {
    const m = new Map();
    for (const r of rows) for (const k of keysOf(r)) { if (!m.has(k)) m.set(k, []); m.get(k).push(r.id); }
    return [...m].map(([key, ids]) => ({ key, n: ids.length, ids })).sort((a, b) => b.n - a.n || String(a.key).localeCompare(String(b.key))).slice(0, max);
  }
  function histogram(dated, events, maxBins) {
    if (!dated.length) return { binMin: 0, bins: [], t0: 0, t1: 0 };
    const times = dated.map(r => r.tsDate.getTime()), t0 = Math.min(...times), t1 = Math.max(...times);
    const binMin = BIN_MIN.find(m => (t1 - t0) / (m * 6e4) < maxBins) || BIN_MIN.at(-1);
    const size = binMin * 6e4, day = new Date(t0); day.setHours(0, 0, 0, 0);
    const first = day.getTime() + Math.floor((t0 - day.getTime()) / size) * size;
    const count = Math.floor((t1 - first) / size) + 1;
    const bins = Array.from({ length: count }, (_, i) => ({ t0: first + i * size, t1: first + (i + 1) * size, normal: 0, flagged: 0, ids: [] }));
    for (const r of dated) {
      const b = bins[Math.floor((r.tsDate.getTime() - first) / size)];
      b.ids.push(r.id);
      if (events.has(r.id)) b.flagged++; else b.normal++;
    }
    return { binMin, bins, t0: first, t1: first + count * size };
  }

  function build(rows, analysis, { maxBins = 48, top = 6 } = {}) {
    const active = analysis.findings.filter(f => !f.needsValidation);
    const incidents = analysis.incidents;
    const events = new Set(incidents.flatMap(i => i.evidence));
    const involved = rows.filter(r => events.has(r.id));
    const ids = fs => uniq(fs.flatMap(f => f.evidence));
    const originIps = uniq(involved.filter(r => r.ext).map(r => r.src));
    const destIps = uniq(involved.map(r => externalDst(r.dst))).filter(ip => !originIps.includes(ip));
    const techniques = new Map();
    for (const f of active) for (const id of f.mitre.split(/\s*\/\s*/)) {
      if (!techniques.has(id)) techniques.set(id, []);
      techniques.get(id).push(f);
    }
    return {
      kpis: {
        incidents: incidents.length, findings: active.length, events: events.size, total: rows.length,
        accounts: uniq(analysis.compromised.map(c => c.user)).length,
        externalIps: originIps.length + destIps.length, originIps: originIps.length, destIps: destIps.length,
      },
      sev: SEVS.map(key => { const inc = incidents.filter(i => i.sev === key); return { key, n: inc.length, ids: uniq(inc.flatMap(i => i.evidence)) }; }),
      cats: CATS.map(key => { const fs = active.filter(f => f.cat === key); return { key, label: analysis.CAT[key], n: fs.length, ids: ids(fs) }; }),
      hist: histogram(rows.filter(r => r.tsDate), events, maxBins),
      hosts: ranking(involved, r => r.host ? [r.host] : [], top),
      users: ranking(involved, r => r.user && r.user !== "-" ? [r.user] : [], top),
      ips: ranking(involved, r => uniq([r.ext ? r.src : null, externalDst(r.dst)]), top),
      mitre: [...techniques].map(([id, fs]) => ({ key: id, n: fs.length, rules: uniq(fs.map(f => f.rule)), ids: ids(fs) })).sort((a, b) => b.n - a.n || a.key.localeCompare(b.key)),
    };
  }
  return { build, SEVS, CATS };
})();
if (typeof module !== "undefined") module.exports = SOCDashboard;
