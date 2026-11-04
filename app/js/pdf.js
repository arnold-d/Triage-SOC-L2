// ===== Informes en PDF con pdfmake (vendor/), sin diálogo de impresión =====
// Se construyen a partir del mismo informe que se ve y se edita en pantalla. Funciona en navegador y en Node.
const SOCPdf = (() => {
  const COLOR = { navy: "#13203a", accent: "#e8742c", muted: "#5b6478", line: "#d9dce5", fill: "#f3f4f7", risk: { Crítico: "#a3121c", Alto: "#d4561b", Medio: "#8a7300", Bajo: "#5a6b8c" } };
  // Roboto no tiene estos caracteres: sin sustituirlos, el PDF mostraría un hueco
  const SUSTITUTOS = { "→": "->", "←": "<-", "✓": "", "⚠": "!", " ": " " };
  const safe = s => String(s ?? "").replace(/[→←✓⚠ ]/g, c => SUSTITUTOS[c]);
  const PARTS = { executive: "Informe ejecutivo", technical: "Informe técnico" };

  function fileName(kind, fecha) { return `Informe_${kind === "executive" ? "Ejecutivo" : "Tecnico"}_${fecha || new Date().toISOString().slice(0, 10)}.pdf`; }

  function cover(meta, kind, source) {
    const rev = meta.reviewed && meta.analista;
    const fila = (k, v) => [{ text: k, color: COLOR.muted }, { text: safe(v) || "—" }];
    return [
      { text: "CONFIDENCIAL", color: COLOR.accent, bold: true, fontSize: 9, characterSpacing: 1.5 },
      { text: "Informe de incidentes de seguridad", style: "title", margin: [0, 6, 0, 2] },
      { text: PARTS[kind], fontSize: 14, color: COLOR.muted, margin: [0, 0, 0, 14] },
      { table: { widths: [150, "*"], body: [fila("Cliente", meta.cliente), fila("Fecha", meta.fecha), fila("Analista", meta.analista), fila("Revisado por el analista", rev ? `Sí, ${meta.analista}` : "No"), fila("Fuente", source)] }, layout: "noBorders", margin: [0, 0, 0, 10] },
      { canvas: [{ type: "line", x1: 0, y1: 0, x2: 495, y2: 0, lineWidth: 2, lineColor: COLOR.accent }], margin: [0, 0, 0, 14] },
    ];
  }
  // Ancho de columna: las de texto largo reparten el sitio, las cortas se ajustan a su contenido
  function widths(t) {
    return t.head.map((h, c) => {
      const max = Math.max(String(h).length, ...t.rows.map(r => String(r[c]).length));
      return max > 40 ? "*" : "auto";
    });
  }
  function block(b, edits, meta) {
    const text = edits[b.kind === "ai" && b.id.startsWith("exec-ai") ? "exec-ai" : b.id];
    if (b.kind === "h") return { text: safe(b.text), style: "h3" };
    if (b.kind === "p") return { text: safe(text ?? b.text), margin: [0, 0, 0, 6] };
    if (b.kind === "list") {
      const items = text != null ? text.split("\n").filter(x => x.trim()) : b.items;
      return [...(b.label ? [{ text: b.label.toUpperCase(), style: "label" }] : []), { ul: items.map(safe), margin: [0, 0, 0, 6] }];
    }
    if (b.kind === "table") {
      const small = b.head.length > 4;
      return { table: { headerRows: 1, dontBreakRows: true, widths: widths(b), body: [b.head.map(h => ({ text: safe(h), style: "th" })), ...b.rows.map(r => r.map(c => ({ text: safe(c), fontSize: small ? 7.5 : 9 })))] },
        layout: { hLineWidth: (i, node) => i === 0 || i === 1 || i === node.table.body.length ? 0.8 : 0.3, vLineWidth: () => 0, hLineColor: () => COLOR.line, fillColor: r => r === 0 ? COLOR.fill : null, paddingTop: () => 3, paddingBottom: () => 3 },
        margin: [0, 2, 0, 8] };
    }
    if (b.kind === "ai") {
      const t = text ?? b.text;
      // El resumen ejecutivo no cita Log_ID: se comprueban sus cifras, no sus citas
      const cit = b.check ? "" : b.cit ? `${b.cit.verified} citas verificadas, ${b.cit.missing} no encontradas${b.cit.mismatch ? `, ${b.cit.mismatch} con datos que no coinciden` : ""}` : "";
      const chk = !b.check ? "" : b.check.ok ? "cifras comprobadas con el motor" : "cifras no comprobadas en los datos del motor";
      const label = ["TEXTO DE IA", b.model, text != null ? "editado por el analista" : null, meta.reviewed && meta.analista ? `revisado por ${meta.analista}` : "pendiente de revisión", cit, chk].filter(Boolean).join(" · ");
      return { table: { widths: ["*"], body: [[{ stack: [{ text: safe(label), style: "label", color: COLOR.accent }, { text: safe(t) }] }]] },
        layout: { hLineWidth: () => 0, vLineWidth: i => i === 0 ? 2 : 0, vLineColor: () => COLOR.accent, paddingLeft: () => 8 }, margin: [0, 2, 0, 8] };
    }
    return null;
  }
  function docDefinition(report, kind, { edits = {}, meta = report.meta, source = "" } = {}) {
    const sections = report[kind];
    const content = [...cover(meta, kind, source)];
    sections.forEach((s, i) => {
      content.push({ text: safe(s.title), style: "h2", ...(kind === "technical" && i > 0 ? { pageBreak: "before" } : {}) });
      for (const b of s.blocks) { const x = block(b, edits, meta); if (x) content.push(x); }
    });
    return {
      pageSize: "A4", pageMargins: [50, 56, 50, 50],
      info: { title: `${PARTS[kind]} · ${meta.cliente || "Informe de incidentes"}`, author: meta.analista || "", subject: "Triage SOC L2" },
      header: (page, pages) => page === 1 ? null : { text: safe(`Confidencial · ${PARTS[kind]} · ${meta.cliente || ""}`), fontSize: 8, color: COLOR.muted, margin: [50, 24, 50, 0] },
      footer: (page, pages) => ({ text: `${page} / ${pages}`, alignment: "right", fontSize: 8, color: COLOR.muted, margin: [50, 16, 50, 0] }),
      content,
      defaultStyle: { font: "Roboto", fontSize: 10, lineHeight: 1.25, color: "#141b2b" },
      styles: {
        title: { fontSize: 22, bold: true, color: COLOR.navy },
        h2: { fontSize: 14, bold: true, color: COLOR.navy, margin: [0, 10, 0, 6] },
        h3: { fontSize: 11, bold: true, margin: [0, 8, 0, 4] },
        th: { bold: true, fontSize: 8, color: COLOR.muted },
        label: { fontSize: 7.5, bold: true, color: COLOR.muted, margin: [0, 2, 0, 2] },
      },
    };
  }
  // Texto que irá al PDF, para comprobar los caracteres en las pruebas
  function allText(doc) {
    const out = [];
    const walk = n => { if (n == null) return; if (typeof n === "string") out.push(n); else if (Array.isArray(n)) n.forEach(walk); else if (typeof n === "object") { walk(n.text); walk(n.stack); walk(n.ul); walk(n.table?.body); } };
    walk(doc.content);
    return out.join("\n");
  }
  return { docDefinition, fileName, allText, safe };
})();
if (typeof module !== "undefined") module.exports = SOCPdf;
