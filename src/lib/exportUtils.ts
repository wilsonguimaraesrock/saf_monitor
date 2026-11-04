import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface ExportRowData {
  sectorSlug: string;
  sectorName: string;
  abertos: number;
  resolvidos: number;
  resolutionRate: number | null;
  aguardandoNos: number;
  aguardandoFranquia: number;
  slaRate: number | null;
  safTmaSec: number | null;
  waConversations: number;
  waCsatAvg: number | null;
  waCsatCount: number;
  waTmaSec: number | null;
  waResolutionsCount: number;
}

export interface ExportTotalsData {
  abertos: number;
  resolvidos: number;
  resolutionRate: number | null;
  aguardandoNos: number;
  aguardandoFranquia: number;
  slaRate: number | null;
  safTmaSec: number | null;
  waConversations: number;
  waCsatAvg: number | null;
  waCsatCount: number;
  waTmaSec: number | null;
  waResolutionsCount: number;
}

export interface ExportReportPayload {
  periodLabel: string;
  selectedSectorSlug: string; // 'all' or specific slug
  selectedSectorName: string;
  generatedAt: string;
  totals: ExportTotalsData;
  rows: ExportRowData[];
}

export function fmtDurationExport(sec: number | null): string {
  if (!sec || sec <= 0) return '—';
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}min`;
  if (sec < 86400) return `${(sec / 3600).toFixed(1)}h`;
  return `${(sec / 86400).toFixed(1)}d`;
}

function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

/**
 * Gera e dispara o download do CSV formatado com BOM UTF-8 e delimitador ';'.
 */
export function exportDashboardCsv(payload: ExportReportPayload, customFilename?: string): void {
  const lines: string[] = [];

  // Cabeçalho de metadados
  lines.push('ROCKFELLER — RELATORIO DO DASHBOARD HISTORICO');
  lines.push(`Periodo:;${payload.periodLabel}`);
  lines.push(`Filtro / Departamento:;${payload.selectedSectorName}`);
  lines.push(`Emitido em:;${payload.generatedAt}`);
  lines.push('');

  // Resumo de KPIs Globais
  lines.push('RESUMO DOS INDICADORES');
  lines.push('Metrica;Valor');
  lines.push(`SAFs Abertos;${payload.totals.abertos}`);
  lines.push(`SAFs Resolvidos;${payload.totals.resolvidos}`);
  lines.push(`% Resolvidos;${payload.totals.resolutionRate !== null ? `${payload.totals.resolutionRate}%` : '—'}`);
  lines.push(`Aguardando Nos;${payload.totals.aguardandoNos}`);
  lines.push(`Aguardando Franquia;${payload.totals.aguardandoFranquia}`);
  lines.push(`SLA no Prazo;${payload.totals.slaRate !== null ? `${payload.totals.slaRate}%` : '—'}`);
  lines.push(`Tempo Medio SAFs;${fmtDurationExport(payload.totals.safTmaSec)}`);
  lines.push(`WhatsApp Conversas;${payload.totals.waConversations}`);
  lines.push(
    `WhatsApp CSAT;${
      payload.totals.waCsatAvg !== null
        ? `${payload.totals.waCsatAvg} (${payload.totals.waCsatCount} avaliacoes)`
        : '—'
    }`
  );
  lines.push(
    `WhatsApp Tempo Medio;${fmtDurationExport(payload.totals.waTmaSec)} (${payload.totals.waResolutionsCount} resolvidas)`
  );
  lines.push('');

  // Tabela por setor
  lines.push('DETALHAMENTO POR SETOR');
  lines.push([
    'Setor',
    'SAFs Abertos',
    'SAFs Resolvidos',
    'SAFs % Resolvidos',
    'SAFs Aguard. Nos',
    'SAFs Aguard. Franquia',
    'SAFs SLA (%)',
    'SAFs Tempo Medio',
    'WhatsApp Conversas',
    'WhatsApp CSAT Medio',
    'WhatsApp Avaliacoes CSAT',
    'WhatsApp Tempo Medio',
    'WhatsApp Resolvidas',
  ].join(';'));

  for (const r of payload.rows) {
    lines.push([
      `"${r.sectorName}"`,
      r.abertos,
      r.resolvidos,
      r.resolutionRate !== null ? `${r.resolutionRate}%` : '—',
      r.aguardandoNos,
      r.aguardandoFranquia,
      r.slaRate !== null ? `${r.slaRate}%` : '—',
      fmtDurationExport(r.safTmaSec),
      r.waConversations,
      r.waCsatAvg !== null ? r.waCsatAvg : '—',
      r.waCsatCount,
      fmtDurationExport(r.waTmaSec),
      r.waResolutionsCount,
    ].join(';'));
  }

  // Linha de total se houver mais de 1 setor exibido
  if (payload.rows.length > 1) {
    lines.push([
      '"TOTAL"',
      payload.totals.abertos,
      payload.totals.resolvidos,
      payload.totals.resolutionRate !== null ? `${payload.totals.resolutionRate}%` : '—',
      payload.totals.aguardandoNos,
      payload.totals.aguardandoFranquia,
      payload.totals.slaRate !== null ? `${payload.totals.slaRate}%` : '—',
      fmtDurationExport(payload.totals.safTmaSec),
      payload.totals.waConversations,
      payload.totals.waCsatAvg !== null ? payload.totals.waCsatAvg : '—',
      payload.totals.waCsatCount,
      fmtDurationExport(payload.totals.waTmaSec),
      payload.totals.waResolutionsCount,
    ].join(';'));
  }

  lines.push('');
  lines.push('Notas:');
  lines.push('"Resolvidos = SAFs abertos e resolvidos dentro do periodo."');
  lines.push('"Tempo medio SAFs = abertura ate resolucao em horario util (segunda a sexta, horario comercial)."');
  lines.push('"WhatsApp = conversas, CSAT e tempo medio provenientes do relatorio do Chatwoot."');

  // Adiciona BOM UTF-8 (\uFEFF) para abrir no Excel em português sem caracteres corrompidos
  const csvContent = '\uFEFF' + lines.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');

  const filename =
    customFilename ||
    `relatorio-dashboard-${slugify(payload.periodLabel)}-${slugify(payload.selectedSectorName)}.csv`;

  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Gera e dispara o download do relatório em PDF (Landscape A4) executivo com design Rockfeller.
 */
export function exportDashboardPdf(payload: ExportReportPayload, customFilename?: string): void {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4', // 297 x 210 mm
  });

  const pageWidth = 297;
  const pageHeight = 210;
  const marginX = 12;

  // 1. Barra superior em Laranja Rockfeller
  doc.setFillColor(234, 88, 12); // #EA580C
  doc.rect(0, 0, pageWidth, 5.5, 'F');

  // 2. Cabeçalho Principal
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(234, 88, 12);
  doc.text('ROCKFELLER', marginX, 15);

  doc.setFontSize(12);
  doc.setTextColor(30, 41, 59); // slate-800
  doc.text('DASHBOARD HISTÓRICO — RELATÓRIO EXECUTIVO', marginX, 21);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139); // slate-500
  doc.text('Monitoramento de Atendimento: SAFs · SLA · CSAT · WhatsApp', marginX, 26);

  // Box de Metadados no canto superior direito
  const metaX = pageWidth - marginX - 90;
  const metaY = 9.5;
  const metaW = 90;
  const metaH = 18;

  doc.setFillColor(248, 250, 252); // slate-50
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.roundedRect(metaX, metaY, metaW, metaH, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text('Período:', metaX + 3, metaY + 5);
  doc.setFont('helvetica', 'normal');
  doc.text(payload.periodLabel, metaX + 22, metaY + 5);

  doc.setFont('helvetica', 'bold');
  doc.text('Filtro / Setor:', metaX + 3, metaY + 10);
  doc.setFont('helvetica', 'normal');
  doc.text(payload.selectedSectorName, metaX + 22, metaY + 10);

  doc.setFont('helvetica', 'bold');
  doc.text('Emitido em:', metaX + 3, metaY + 15);
  doc.setFont('helvetica', 'normal');
  doc.text(payload.generatedAt, metaX + 22, metaY + 15);

  // 3. KPI Cards no topo (8 indicadores em 1 linha)
  const kpis = [
    {
      label: 'SAFS ABERTOS',
      val: String(payload.totals.abertos),
      sub: 'abertos no período',
      color: [100, 116, 139], // slate
      valColor: [30, 41, 59],
    },
    {
      label: 'RESOLVIDOS',
      val: String(payload.totals.resolvidos),
      sub: 'resolvidos no período',
      color: [16, 185, 129], // emerald
      valColor: [5, 150, 105],
    },
    {
      label: '% RESOLVIDOS',
      val: payload.totals.resolutionRate !== null ? `${payload.totals.resolutionRate}%` : '—',
      sub: 'do que abriu no período',
      color: [59, 130, 246], // blue
      valColor: [37, 99, 235],
    },
    {
      label: 'AGUARD. NÓS',
      val: String(payload.totals.aguardandoNos),
      sub: 'pendente conosco',
      color: [245, 158, 11], // amber
      valColor: [217, 119, 6],
    },
    {
      label: 'AGUARD. FRANQUIA',
      val: String(payload.totals.aguardandoFranquia),
      sub: 'pendente franquia',
      color: [249, 115, 22], // orange
      valColor: [234, 88, 12],
    },
    {
      label: 'SLA NO PRAZO',
      val: payload.totals.slaRate !== null ? `${payload.totals.slaRate}%` : '—',
      sub: 'resolvidos no prazo',
      color: [139, 92, 246], // violet
      valColor: [124, 58, 237],
    },
    {
      label: 'CSAT WHATSAPP',
      val: payload.totals.waCsatAvg !== null ? String(payload.totals.waCsatAvg) : '—',
      sub: payload.totals.waCsatCount > 0 ? `${payload.totals.waCsatCount} avaliações` : 'sem avaliações',
      color: [16, 185, 129], // emerald
      valColor: [5, 150, 105],
    },
    {
      label: 'TMA WHATSAPP',
      val: fmtDurationExport(payload.totals.waTmaSec),
      sub: payload.totals.waResolutionsCount > 0 ? `${payload.totals.waResolutionsCount} resolvidas` : 'sem resoluções',
      color: [59, 130, 246], // blue
      valColor: [37, 99, 235],
    },
  ];

  const kpiY = 31;
  const kpiCount = kpis.length;
  const totalAvailableWidth = pageWidth - (2 * marginX);
  const kpiGap = 2.5;
  const kpiW = (totalAvailableWidth - (kpiCount - 1) * kpiGap) / kpiCount;
  const kpiH = 17.5;

  kpis.forEach((kpi, idx) => {
    const x = marginX + idx * (kpiW + kpiGap);

    // Fundo do card
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x, kpiY, kpiW, kpiH, 1.5, 1.5, 'FD');

    // Barra de cor superior do card
    doc.setFillColor(kpi.color[0], kpi.color[1], kpi.color[2]);
    doc.rect(x, kpiY, kpiW, 1.2, 'F');

    // Label
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.5);
    doc.setTextColor(100, 116, 139);
    doc.text(kpi.label, x + 2, kpiY + 4.5);

    // Valor principal
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(kpi.valColor[0], kpi.valColor[1], kpi.valColor[2]);
    doc.text(kpi.val, x + 2, kpiY + 10.5);

    // Subtítulo
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5);
    doc.setTextColor(148, 163, 184);
    doc.text(kpi.sub, x + 2, kpiY + 15);
  });

  // 4. Tabela com autoTable
  const tableY = kpiY + kpiH + 5;

  const tableHead = [
    [
      { content: 'SETOR', rowSpan: 2, styles: { valign: 'middle', halign: 'left', fillColor: [248, 250, 252], textColor: [71, 85, 105] } },
      { content: 'SAFs', colSpan: 7, styles: { halign: 'center', fillColor: [241, 245, 249], textColor: [71, 85, 105], fontStyle: 'bold' } },
      { content: 'WHATSAPP', colSpan: 3, styles: { halign: 'center', fillColor: [236, 253, 245], textColor: [21, 128, 61], fontStyle: 'bold' } },
    ],
    [
      { content: 'Abertos', styles: { halign: 'center' } },
      { content: 'Resolvidos', styles: { halign: 'center' } },
      { content: '% Resolv.', styles: { halign: 'center' } },
      { content: 'Aguard. Nós', styles: { halign: 'center' } },
      { content: 'Aguard. Franq.', styles: { halign: 'center' } },
      { content: 'SLA', styles: { halign: 'center' } },
      { content: 'Tempo Médio', styles: { halign: 'center' } },
      { content: 'Conversas', styles: { halign: 'center', fillColor: [240, 253, 244] } },
      { content: 'CSAT', styles: { halign: 'center', fillColor: [240, 253, 244] } },
      { content: 'Tempo Médio', styles: { halign: 'center', fillColor: [240, 253, 244] } },
    ],
  ];

  const tableBody = payload.rows.map((r) => [
    r.sectorName,
    r.abertos > 0 ? String(r.abertos) : '—',
    r.resolvidos > 0 ? String(r.resolvidos) : '—',
    r.resolutionRate !== null ? `${r.resolutionRate}%` : '—',
    r.aguardandoNos > 0 ? String(r.aguardandoNos) : '0',
    r.aguardandoFranquia > 0 ? String(r.aguardandoFranquia) : '0',
    r.slaRate !== null ? `${r.slaRate}%` : '—',
    fmtDurationExport(r.safTmaSec),
    r.waConversations > 0 ? String(r.waConversations) : '—',
    r.waCsatAvg !== null ? `${r.waCsatAvg}${r.waCsatCount > 0 ? ` (${r.waCsatCount})` : ''}` : '—',
    fmtDurationExport(r.waTmaSec) + (r.waResolutionsCount > 0 ? ` (${r.waResolutionsCount})` : ''),
  ]);

  const showTotalRow = payload.rows.length > 1;
  const tableFoot = showTotalRow
    ? [
        [
          'TOTAL',
          String(payload.totals.abertos),
          String(payload.totals.resolvidos),
          payload.totals.resolutionRate !== null ? `${payload.totals.resolutionRate}%` : '—',
          String(payload.totals.aguardandoNos),
          String(payload.totals.aguardandoFranquia),
          payload.totals.slaRate !== null ? `${payload.totals.slaRate}%` : '—',
          fmtDurationExport(payload.totals.safTmaSec),
          String(payload.totals.waConversations),
          payload.totals.waCsatAvg !== null
            ? `${payload.totals.waCsatAvg} (${payload.totals.waCsatCount})`
            : '—',
          fmtDurationExport(payload.totals.waTmaSec) +
            (payload.totals.waResolutionsCount > 0 ? ` (${payload.totals.waResolutionsCount})` : ''),
        ],
      ]
    : undefined;

  autoTable(doc, {
    startY: tableY,
    margin: { left: marginX, right: marginX, bottom: 15 },
    head: tableHead as unknown as any,
    body: tableBody,
    foot: tableFoot,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: 2.4,
      textColor: [30, 41, 59],
      lineColor: [226, 232, 240],
      lineWidth: 0.15,
      valign: 'middle',
    },
    headStyles: {
      fontStyle: 'bold',
      fontSize: 7.5,
      textColor: [51, 65, 85],
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { fontStyle: 'bold', halign: 'left', cellWidth: 38 },
      1: { halign: 'center', cellWidth: 22 },
      2: { halign: 'center', cellWidth: 22, textColor: [5, 150, 105], fontStyle: 'bold' },
      3: { halign: 'center', cellWidth: 20 },
      4: { halign: 'center', cellWidth: 22, textColor: [217, 119, 6] },
      5: { halign: 'center', cellWidth: 22, textColor: [234, 88, 12] },
      6: { halign: 'center', cellWidth: 20, fontStyle: 'bold' },
      7: { halign: 'center', cellWidth: 26 },
      8: { halign: 'center', cellWidth: 24, fillColor: [240, 253, 244] },
      9: { halign: 'center', cellWidth: 28, fillColor: [240, 253, 244] },
      10: { halign: 'center', cellWidth: 29, fillColor: [240, 253, 244] },
    },
    footStyles: {
      fontStyle: 'bold',
      fontSize: 8.5,
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
    },
    alternateRowStyles: {
      fillColor: [253, 254, 255],
    },
    didDrawPage: (data) => {
      // Rodapé da página
      const pageStr = `Página ${data.pageNumber} de ${doc.getNumberOfPages()}`;
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);

      // Linha separadora do rodapé
      doc.setDrawColor(226, 232, 240);
      doc.line(marginX, pageHeight - 10, pageWidth - marginX, pageHeight - 10);

      // Texto de metodologia à esquerda
      doc.text(
        'Resolvidos = SAFs abertos e resolvidos no período · Tempo médio SAFs = horário comercial útil · WhatsApp = Chatwoot',
        marginX,
        pageHeight - 6
      );

      // Assinatura e página à direita
      doc.text(
        `Rockfeller Franquias · ${pageStr}`,
        pageWidth - marginX - 45,
        pageHeight - 6
      );
    },
  });

  const filename =
    customFilename ||
    `relatorio-dashboard-${slugify(payload.periodLabel)}-${slugify(payload.selectedSectorName)}.pdf`;

  doc.save(filename);
}
