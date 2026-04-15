const express = require('express');
const router = express.Router();
const puppeteer = require('puppeteer');
const crypto = require('crypto');
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle, ImageRun } = require('docx');
const fs = require('fs');
const path = require('path');
const pool = require('../config/database');
const { authMiddleware } = require('../middleware/auth');
const { numeroALetras } = require('../utils/numero-letras');
const { asyncHandler } = require('../middleware/common');
const { logger, logDocumentMetric } = require('../utils/logger');

const LOGO_PATH = path.join(__dirname, '..', '..', '..', 'logo_gad.png');
const PDF_CACHE_TTL_MS = 10 * 60 * 1000;
const PDF_CACHE_MAX_ENTRIES = 100;
const pdfCache = new Map();
const pendingPdfTasks = new Map();

class TaskQueue {
  constructor(concurrency = 2) {
    this.concurrency = concurrency;
    this.active = 0;
    this.queue = [];
  }

  enqueue(task) {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.runNext();
    });
  }

  runNext() {
    while (this.active < this.concurrency && this.queue.length > 0) {
      const job = this.queue.shift();
      this.active += 1;
      Promise.resolve()
        .then(job.task)
        .then(job.resolve)
        .catch(job.reject)
        .finally(() => {
          this.active -= 1;
          this.runNext();
        });
    }
  }
}

const documentQueue = new TaskQueue(2);

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return `FECHA: ${dias[d.getUTCDay()]}, ${d.getUTCDate()} de ${meses[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
}

function formatMoney(val) {
  return parseFloat(val || 0).toFixed(2);
}

function buildBalancedRows(items, maxPerRow = 4) {
  if (!items || items.length === 0) return [];

  const totalRows = Math.ceil(items.length / maxPerRow);
  const baseSize = Math.floor(items.length / totalRows);
  const extra = items.length % totalRows;

  const rows = [];
  let idx = 0;
  for (let r = 0; r < totalRows; r++) {
    const size = baseSize + (r < extra ? 1 : 0);
    rows.push(items.slice(idx, idx + size));
    idx += size;
  }

  return rows;
}

function getPreferredSignatureColumns(totalFirmantes) {
  if (!totalFirmantes || totalFirmantes <= 0) return 1;
  if (totalFirmantes <= 4) return totalFirmantes;
  if (totalFirmantes % 4 === 0) return 4;
  if (totalFirmantes % 3 === 0) return 3;

  // Evita filas finales con una sola firma cuando no divide exacto en 4.
  return totalFirmantes % 4 === 1 ? 3 : 4;
}

function padRowToColumns(row, columns) {
  const missing = Math.max(0, columns - row.length);
  const left = Math.floor(missing / 2);
  const right = missing - left;
  return {
    left,
    right,
  };
}

function buildPdfVersionKey(orden, retenciones, firmantes, config, logoFingerprint) {
  const hash = crypto.createHash('sha1');
  hash.update(JSON.stringify({ orden, retenciones, firmantes, config, logoFingerprint }));
  return hash.digest('hex');
}

function getCachedPdf(cacheKey) {
  const entry = pdfCache.get(cacheKey);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    pdfCache.delete(cacheKey);
    return null;
  }
  return entry.buffer;
}

function setCachedPdf(cacheKey, buffer) {
  if (pdfCache.size >= PDF_CACHE_MAX_ENTRIES) {
    const firstKey = pdfCache.keys().next().value;
    if (firstKey) pdfCache.delete(firstKey);
  }
  pdfCache.set(cacheKey, { buffer, expiresAt: Date.now() + PDF_CACHE_TTL_MS });
}

async function renderPdfBuffer(html) {
  const launchOptions = {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
    ],
  };

  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  const browser = await puppeteer.launch(launchOptions);
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    return await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' },
    });
  } finally {
    await browser.close();
  }
}

function buildHtml(orden, retenciones, firmantes, config, logoBase64) {
  const allFirmantes = [
    { cargo: 'C.I. Interesado', nombre: orden.nombre_beneficiario || '' },
    ...firmantes,
  ];

  const retencionesRows = retenciones.map(r =>
    `<tr><td style="text-align:left;padding:3px 8px;vertical-align:top;">${r.concepto}</td>
     <td style="text-align:right;padding:3px 8px;vertical-align:top;white-space:nowrap;">${formatMoney(r.porcentaje)}%</td>
     <td style="text-align:right;padding:3px 8px;vertical-align:top;white-space:nowrap;">${formatMoney(r.valor)}</td></tr>`
  ).join('');

  const preferredCols = getPreferredSignatureColumns(allFirmantes.length);
  const firmantesRows = buildBalancedRows(allFirmantes, preferredCols);
  const maxFirmantesCols = Math.max(1, ...firmantesRows.map(r => r.length));

  const buildFirmaCellHtml = (cargo, nombre) => `
    <td style="text-align:center;padding:5px;border:none;width:${(100 / maxFirmantesCols).toFixed(2)}%;">
      <div class="firma-box">
        <div style="height:50px;"></div>
        <div class="firma-linea"></div>
        <div class="firma-cargo">${cargo}</div>
        <div class="firma-nombre">${nombre}</div>
      </div>
    </td>`;

  const firmantesRowsHtml = firmantesRows.map((row) => {
    const { left, right } = padRowToColumns(row, maxFirmantesCols);
    const leftEmpty = Array.from({ length: left }, () => '<td style="border:none;"></td>').join('');
    const rightEmpty = Array.from({ length: right }, () => '<td style="border:none;"></td>').join('');
    const content = row.map((f) => buildFirmaCellHtml(f.cargo, f.nombre)).join('');
    return `<tr>${leftEmpty}${content}${rightEmpty}</tr>`;
  }).join('');

  // Otros cargos
  let otrosCargosHtml = '';
  const cargos = [
    { r: orden.razon_otros_cargos, v: orden.valor_otros_cargos },
    { r: orden.razon_otros_cargos_1, v: orden.valor_otros_cargos_1 },
    { r: orden.razon_otros_cargos_2, v: orden.valor_otros_cargos_2 },
    { r: orden.razon_otros_cargos_3, v: orden.valor_otros_cargos_3 },
    { r: orden.razon_otros_cargos_4, v: orden.valor_otros_cargos_4 },
    { r: orden.razon_otros_cargos_5, v: orden.valor_otros_cargos_5 },
  ];
  for (const c of cargos) {
    if (c.r && parseFloat(c.v) > 0) {
      otrosCargosHtml += `<tr><td style="padding:1px 8px;">${c.r}</td><td style="text-align:right;padding:1px 8px;">${formatMoney(c.v)}</td></tr>`;
    }
  }

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>
  @page { size: A4; margin: 20mm 15mm; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11px; color: #000; line-height: 1.4; }
  .header { text-align: center; margin-bottom: 10px; }
  .header img { width: 100px; margin-bottom: 8px; }
  .header h1 { font-size: 16px; margin: 2px 0; letter-spacing: 1px; }
  .header h2 { font-size: 13px; margin: 2px 0; font-weight: normal; }
  .header .num { font-size: 22px; font-weight: bold; color: #c00; }
  .info-row { display: flex; justify-content: space-between; margin: 3px 0; }
  .info-row span { font-size: 11px; }
  .detail-box { border: 1px solid #ccc; padding: 10px; margin: 10px 0 8px; min-height: 90px; text-align: justify; font-size: 10.5px; }
  table.valores { border-collapse: collapse; margin: 8px 0; font-size: 11px; }
  table.valores td { padding: 3px 10px; }
  table.valores .label { font-weight: bold; text-align: right; }
  table.valores .val { text-align: right; min-width: 80px; }
  .ret-table { border-collapse: collapse; font-size: 10.5px; }
  .ret-table td { padding: 2px 6px; }
  .summary { margin: 12px 0; padding: 10px 12px; background: #f9f9f9; border: 1px solid #ddd; }
  .summary .total-line { display: flex; justify-content: space-between; padding: 3px 0; font-size: 12px; }
  .summary .total-line.big { font-size: 14px; font-weight: bold; border-top: 2px solid #000; padding-top: 8px; margin-top: 5px; }
  .letras { font-size: 12px; font-weight: bold; margin: 6px 0 4px; }
  .cheque-info { font-size: 10px; margin: 5px 0 6px; color: #555; }
  .firmas-wrapper { margin-top: 18px; }
  .firmas { width: 100%; border-collapse: collapse; page-break-inside: auto; break-inside: auto; }
  .firmas tr { page-break-inside: avoid; break-inside: avoid-page; }
  .firmas td { text-align: center; padding: 5px; border: none; }
  .firma-box { padding-top: 28px; vertical-align: bottom; page-break-inside: avoid; break-inside: avoid; min-height: 110px; }
  .firma-linea { border-top: 1px solid #000; padding-top: 2px; margin-bottom: 8px; min-height: 0px; }
  .firma-nombre { font-size: 11px; }
  .firma-cargo { font-weight: bold; font-size: 11px; margin-bottom: 2px; }
  .firmas-grid { margin-top: 8px; }
  .firmas-compact { width: 100%; border-collapse: separate; border-spacing: 10px 8px; }
  .firmas-compact td { width: 25%; vertical-align: top; }
  .firma-card { border-top: 1px solid #000; padding-top: 6px; min-height: 64px; }
</style>
</head>
<body>
  <div class="header">
    ${logoBase64 ? `<img src="data:image/png;base64,${logoBase64}" alt="Logo"/>` : ''}
    <h1>${config.institucion_nombre || 'GAD MUNICIPAL DE CHUNCHI'}</h1>
    <h2>Comprobante de Pago No. <span class="num">${orden.numero_orden}</span></h2>
  </div>

  <div class="info-row">
    <span>${formatDate(orden.fecha)}</span>
  </div>
  <div class="info-row">
    <span><strong>BENEFICIARIO:</strong> ${orden.nombre_beneficiario}</span>
    <span>${orden.codigo_beneficiario || ''}</span>
  </div>

  <div class="detail-box">
    ${(orden.detalle || '').replace(/\r?\n/g, '<br/>')}
  </div>

  <div style="display:flex;gap:40px;">
    <div>
      <table class="valores">
        <tr><td class="label">Valor</td><td class="val">${formatMoney(orden.valor_planilla)}</td></tr>
        <tr><td class="label">IVA</td><td class="val">${formatMoney(orden.valor_iva)}</td></tr>
        ${otrosCargosHtml}
      </table>
    </div>
    <div>
      ${retenciones.length > 0 ? `
      <table class="ret-table">
        <tr><td colspan="3" style="font-weight:bold;">Retenciones:</td></tr>
        ${retencionesRows}
      </table>` : ''}
    </div>
  </div>

  <div class="summary">
    <div class="total-line"><span>Cargos</span><span>${formatMoney(orden.total_cargos)}</span></div>
    <div class="total-line"><span>Retenciones</span><span>${formatMoney(orden.total_retenciones)}</span></div>
    <div class="total-line big"><span>Líquido a Pagarse</span><span>$${formatMoney(orden.liquido_pagar)}</span></div>
  </div>

  <div class="letras">${numeroALetras(parseFloat(orden.liquido_pagar) || 0)}</div>

  <div class="cheque-info">
    Cheque Nº ${orden.cheque_numero || ''} &nbsp;&nbsp;
    Cuenta BC: ${orden.cuenta_banco_central || '—'}
  </div>

  <div class="firmas-wrapper">
    <table class="firmas-compact">
      ${firmantesRowsHtml}
    </table>
  </div>
</body>
</html>`;
}

// GET /api/documentos/:id/pdf
router.get('/:id/pdf', authMiddleware, asyncHandler(async (req, res) => {
  const startTime = Date.now();
  try {
    const ordenResult = await pool.query('SELECT * FROM financiero.ordenes_pago WHERE id = $1', [req.params.id]);
    if (ordenResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Orden no encontrada' });
    }
    const orden = ordenResult.rows[0];

    const [retResult, firmResult, configResult] = await Promise.all([
      pool.query('SELECT * FROM financiero.ordenes_pago_retenciones WHERE orden_pago_id = $1 ORDER BY id', [req.params.id]),
      pool.query('SELECT * FROM financiero.firmantes WHERE activo = true ORDER BY orden'),
      pool.query('SELECT clave, valor FROM financiero.configuracion'),
    ]);

    const config = {};
    configResult.rows.forEach(r => { config[r.clave] = r.valor; });

    let logoBase64 = null;
    let logoFingerprint = 0;
    if (fs.existsSync(LOGO_PATH)) {
      logoFingerprint = fs.statSync(LOGO_PATH).mtimeMs;
      logoBase64 = fs.readFileSync(LOGO_PATH).toString('base64');
    }

    const versionKey = buildPdfVersionKey(orden, retResult.rows, firmResult.rows, config, logoFingerprint);
    const cacheKey = `${req.params.id}:${versionKey}`;
    const cachedPdf = getCachedPdf(cacheKey);
    if (cachedPdf) {
      logDocumentMetric('cache_hit', {
        orden_id: req.params.id,
        numero_orden: orden.numero_orden,
        size_bytes: cachedPdf.length,
      });
      res.setHeader('X-PDF-Cache', 'HIT');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename=comprobante_${orden.numero_orden}.pdf`);
      return res.send(cachedPdf);
    }

    logDocumentMetric('cache_miss', {
      orden_id: req.params.id,
      numero_orden: orden.numero_orden,
      queue_depth: documentQueue.queue.length,
      pending_tasks: pendingPdfTasks.size,
    });

    let pendingTask = pendingPdfTasks.get(cacheKey);
    if (!pendingTask) {
      pendingTask = documentQueue.enqueue(async () => {
        const html = buildHtml(orden, retResult.rows, firmResult.rows, config, logoBase64);
        const pdfBuffer = await renderPdfBuffer(html);
        setCachedPdf(cacheKey, pdfBuffer);
        return pdfBuffer;
      }).finally(() => {
        pendingPdfTasks.delete(cacheKey);
      });

      pendingPdfTasks.set(cacheKey, pendingTask);
    }

    const pdfBuffer = await pendingTask;
    const generationTime = Date.now() - startTime;

    logDocumentMetric('pdf_generated', {
      orden_id: req.params.id,
      numero_orden: orden.numero_orden,
      time_ms: generationTime,
      size_bytes: pdfBuffer.length,
      queue_depth: documentQueue.queue.length,
      pending_tasks: pendingPdfTasks.size,
    });

    res.setHeader('X-PDF-Cache', 'MISS');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=comprobante_${orden.numero_orden}.pdf`);
    res.send(pdfBuffer);
  } catch (err) {
    logDocumentMetric('pdf_error', {
      error: err.message,
      orden_id: req.params.id,
      time_ms: Date.now() - startTime,
    });
    logger.error({ err, orden_id: req.params.id }, 'Error generando PDF');
    res.status(500).json({ success: false, error: 'Error generando PDF' });
  }
}));

// GET /api/documentos/:id/word
router.get('/:id/word', authMiddleware, asyncHandler(async (req, res) => {
  try {
    const ordenResult = await pool.query('SELECT * FROM financiero.ordenes_pago WHERE id = $1', [req.params.id]);
    if (ordenResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Orden no encontrada' });
    }
    const orden = ordenResult.rows[0];

    const retResult = await pool.query('SELECT * FROM financiero.ordenes_pago_retenciones WHERE orden_pago_id = $1 ORDER BY id', [req.params.id]);
    const firmResult = await pool.query('SELECT * FROM financiero.firmantes WHERE activo = true ORDER BY orden');
    const configResult = await pool.query('SELECT clave, valor FROM financiero.configuracion');
    const config = {};
    configResult.rows.forEach(r => { config[r.clave] = r.valor; });

    // Build Word document
    const children = [];

    // Header
    const headerChildren = [
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: config.institucion_nombre || 'GAD MUNICIPAL DE CHUNCHI', bold: true, size: 28, font: 'Helvetica' })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `Comprobante de Pago No. ${orden.numero_orden}`, size: 22, font: 'Helvetica' })] }),
      new Paragraph({ children: [] }),
    ];

    // Logo
    if (fs.existsSync(LOGO_PATH)) {
      const logoBuffer = fs.readFileSync(LOGO_PATH);
      headerChildren.unshift(new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new ImageRun({ data: logoBuffer, transformation: { width: 100, height: 100 }, type: 'png' })],
      }));
    }

    children.push(...headerChildren);

    // Date and beneficiary
    const d = new Date(orden.fecha);
    const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    children.push(new Paragraph({ children: [new TextRun({ text: `FECHA: ${d.getUTCDate()} de ${meses[d.getUTCMonth()]} de ${d.getUTCFullYear()}`, size: 20 })] }));
    children.push(new Paragraph({ children: [
      new TextRun({ text: 'BENEFICIARIO: ', bold: true, size: 20 }),
      new TextRun({ text: `${orden.nombre_beneficiario}    ${orden.codigo_beneficiario || ''}`, size: 20 }),
    ] }));
    children.push(new Paragraph({ children: [] }));

    // Detail
    children.push(new Paragraph({ children: [new TextRun({ text: orden.detalle || '', size: 19 })] }));
    children.push(new Paragraph({ children: [] }));

    // Values table
    const noBorder = { style: BorderStyle.NONE, size: 0 };
    const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

    const valRows = [
      ['Valor', formatMoney(orden.valor_planilla)],
      ['IVA', formatMoney(orden.valor_iva)],
    ];

    const valTable = new Table({
      width: { size: 40, type: WidthType.PERCENTAGE },
      rows: valRows.map(([label, val]) => new TableRow({
        children: [
          new TableCell({ borders: noBorders, width: { size: 50, type: WidthType.PERCENTAGE }, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: label, bold: true, size: 20 })] })] }),
          new TableCell({ borders: noBorders, width: { size: 50, type: WidthType.PERCENTAGE }, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: val, size: 20 })] })] }),
        ]
      })),
    });
    children.push(valTable);

    // Retenciones
    if (retResult.rows.length > 0) {
      children.push(new Paragraph({ children: [] }));
      children.push(new Paragraph({ children: [new TextRun({ text: 'Retenciones:', bold: true, size: 20 })] }));
      for (const r of retResult.rows) {
        children.push(new Paragraph({ children: [new TextRun({ text: `  ${r.concepto}  ${formatMoney(r.porcentaje)}%    ${formatMoney(r.valor)}`, size: 19 })] }));
      }
    }

    children.push(new Paragraph({ children: [] }));

    // Summary
    const summaryTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            new TableCell({ borders: noBorders, children: [new Paragraph({ children: [new TextRun({ text: 'Cargos', bold: true, size: 20 })] })] }),
            new TableCell({ borders: noBorders, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: formatMoney(orden.total_cargos), size: 20 })] })] }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({ borders: noBorders, children: [new Paragraph({ children: [new TextRun({ text: 'Retenciones', bold: true, size: 20 })] })] }),
            new TableCell({ borders: noBorders, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: formatMoney(orden.total_retenciones), size: 20 })] })] }),
          ],
        }),
      ],
    });

    const liquidSummary = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              borders: {
                top: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
                bottom: noBorder,
                left: noBorder,
                right: noBorder,
              },
              children: [new Paragraph({ children: [new TextRun({ text: 'Líquido a Pagarse', bold: true, size: 24 })] })],
            }),
            new TableCell({
              borders: {
                top: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
                bottom: noBorder,
                left: noBorder,
                right: noBorder,
              },
              children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `$${formatMoney(orden.liquido_pagar)}`, bold: true, size: 24 })] })],
            }),
          ],
        }),
      ],
    });

    children.push(summaryTable);
    children.push(new Paragraph({ children: [] }));
    children.push(liquidSummary);
    children.push(new Paragraph({ children: [
      new TextRun({ text: numeroALetras(parseFloat(orden.liquido_pagar) || 0), bold: true, size: 22 }),
    ] }));
    children.push(new Paragraph({ spacing: { after: 120 }, children: [] }));

    // Cheque info
    children.push(new Paragraph({ children: [
      new TextRun({ text: `Cheque Nº ${orden.cheque_numero || ''}  —  Cuenta BC: ${orden.cuenta_banco_central || '—'}`, size: 18, color: '666666' }),
    ] }));

    // Signatures
    const allFirmantesWord = [
      { cargo: 'C.I. Interesado', nombre: orden.nombre_beneficiario || '' },
      ...firmResult.rows,
    ];
    const preferredWordCols = getPreferredSignatureColumns(allFirmantesWord.length);
    const wordRows = buildBalancedRows(allFirmantesWord, preferredWordCols);
    const maxCols = Math.max(1, ...wordRows.map(r => r.length));

    const buildWordSignatureCell = (cargo, nombre) => new TableCell({
      borders: noBorders,
      width: { size: Math.floor(100 / maxCols), type: WidthType.PERCENTAGE },
      children: [
        new Paragraph({ spacing: { before: 280, after: 0 }, children: [new TextRun({ text: '', size: 1 })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 40 }, children: [new TextRun({ text: '________________________', size: 18 })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 20 }, children: [new TextRun({ text: cargo, bold: true, size: 18 })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 20 }, children: [new TextRun({ text: nombre, size: 18 })] }),
      ],
    });

    const wordTableRows = [];
    for (const row of wordRows) {
      const { left, right } = padRowToColumns(row, maxCols);
      const cells = [];
      for (let i = 0; i < left; i++) {
        cells.push(new TableCell({ borders: noBorders, children: [new Paragraph({ children: [] })] }));
      }
      for (const f of row) {
        cells.push(buildWordSignatureCell(f.cargo, f.nombre));
      }
      for (let i = 0; i < right; i++) {
        cells.push(new TableCell({ borders: noBorders, children: [new Paragraph({ children: [] })] }));
      }

      wordTableRows.push(new TableRow({ children: cells }));
    }

    children.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: wordTableRows,
    }));

    const doc = new Document({
      sections: [{ children }],
    });

    const buffer = await documentQueue.enqueue(() => Packer.toBuffer(doc));

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename=comprobante_${orden.numero_orden}.docx`);
    res.send(buffer);
  } catch (err) {
    console.error('Error generando Word:', err);
    res.status(500).json({ success: false, error: 'Error generando documento Word' });
  }
}));

module.exports = router;
