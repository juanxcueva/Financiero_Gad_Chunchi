const express = require('express');
const router = express.Router();
const puppeteer = require('puppeteer');
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle, ImageRun } = require('docx');
const fs = require('fs');
const path = require('path');
const pool = require('../config/database');
const { authMiddleware } = require('../middleware/auth');
const { numeroALetras } = require('../utils/numero-letras');

const LOGO_PATH = path.join(__dirname, '..', '..', '..', 'logo_gad.png');

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

function buildHtml(orden, retenciones, firmantes, config, logoBase64) {
  const retencionesRows = retenciones.map(r =>
    `<tr><td style="text-align:left;padding:2px 8px;">${r.concepto}</td>
     <td style="text-align:right;padding:2px 8px;">${formatMoney(r.porcentaje)}%</td>
     <td style="text-align:right;padding:2px 8px;">${formatMoney(r.valor)}</td></tr>`
  ).join('');

  const firmantesCells = firmantes.map(f =>
    `<td style="text-align:center;padding-top:40px;vertical-align:bottom;">
       <div style="border-top:1px solid #000;padding-top:4px;">
         <strong>${f.cargo}</strong><br/>${f.nombre}
       </div>
     </td>`
  ).join('');

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
  .header img { width: 60px; margin-bottom: 5px; }
  .header h1 { font-size: 16px; margin: 2px 0; letter-spacing: 1px; }
  .header h2 { font-size: 13px; margin: 2px 0; font-weight: normal; }
  .header .num { font-size: 22px; font-weight: bold; color: #c00; }
  .info-row { display: flex; justify-content: space-between; margin: 3px 0; }
  .info-row span { font-size: 11px; }
  .detail-box { border: 1px solid #ccc; padding: 10px; margin: 10px 0; min-height: 120px; text-align: justify; font-size: 10.5px; }
  table.valores { border-collapse: collapse; margin: 8px 0; font-size: 11px; }
  table.valores td { padding: 3px 10px; }
  table.valores .label { font-weight: bold; text-align: right; }
  table.valores .val { text-align: right; min-width: 80px; }
  .ret-table { border-collapse: collapse; font-size: 10.5px; }
  .ret-table td { padding: 2px 6px; }
  .summary { margin: 15px 0; padding: 10px; background: #f9f9f9; border: 1px solid #ddd; }
  .summary .total-line { display: flex; justify-content: space-between; padding: 3px 0; font-size: 12px; }
  .summary .total-line.big { font-size: 14px; font-weight: bold; border-top: 2px solid #000; padding-top: 8px; margin-top: 5px; }
  .letras { font-size: 12px; font-weight: bold; margin: 5px 0; }
  .cheque-info { font-size: 10px; margin: 5px 0; color: #555; }
  .firmas { width: 100%; margin-top: 30px; border-collapse: collapse; }
  .firmas td { width: 25%; text-align: center; padding: 5px; border: none; }
  .firma-box { padding-top: 50px; vertical-align: bottom; }
  .firma-linea { border-top: 1px solid #000; padding-top: 4px; margin-bottom: 20px; min-height: 15px; }
  .firma-nombre { font-size: 11px; }
  .firma-cargo { font-weight: bold; font-size: 11px; margin-bottom: 2px; }
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
    Banco: ${config.banco_nombre || ''} &nbsp;&nbsp; ${orden.codigo_banco || ''}
  </div>

  <table class="firmas">
    <tr>
      <td>
        <div class="firma-box">
          <div class="firma-linea"></div>
          <div class="firma-cargo">C.I. Interesado</div>
          <div class="firma-nombre">${orden.nombre_beneficiario}</div>
        </div>
      </td>
      ${firmantes.slice(0, 3).map(f => `<td>
        <div class="firma-box">
          <div class="firma-linea"></div>
          <div class="firma-cargo">${f.cargo}</div>
          <div class="firma-nombre">${f.nombre}</div>
        </div>
      </td>`).join('')}
    </tr>
    ${firmantes.length > 3 ? `<tr>
      ${firmantes.slice(3, 7).map(f => `<td>
        <div class="firma-box">
          <div class="firma-linea"></div>
          <div class="firma-cargo">${f.cargo}</div>
          <div class="firma-nombre">${f.nombre}</div>
        </div>
      </td>`).join('')}
    </tr>` : ''}
    ${firmantes.length > 7 ? `<tr>
      ${firmantes.slice(7, 11).map(f => `<td>
        <div class="firma-box">
          <div class="firma-linea"></div>
          <div class="firma-cargo">${f.cargo}</div>
          <div class="firma-nombre">${f.nombre}</div>
        </div>
      </td>`).join('')}
    </tr>` : ''}
  </table>
</body>
</html>`;
}

// GET /api/documentos/:id/pdf
router.get('/:id/pdf', authMiddleware, async (req, res) => {
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

    let logoBase64 = null;
    if (fs.existsSync(LOGO_PATH)) {
      logoBase64 = fs.readFileSync(LOGO_PATH).toString('base64');
    }

    const html = buildHtml(orden, retResult.rows, firmResult.rows, config, logoBase64);

    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' },
    });

    await browser.close();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=comprobante_${orden.numero_orden}.pdf`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('Error generando PDF:', err);
    res.status(500).json({ success: false, error: 'Error generando PDF' });
  }
});

// GET /api/documentos/:id/word
router.get('/:id/word', authMiddleware, async (req, res) => {
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
        children: [new ImageRun({ data: logoBuffer, transformation: { width: 60, height: 60 }, type: 'png' })],
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
    children.push(new Paragraph({ children: [
      new TextRun({ text: 'Cargos: ', bold: true, size: 22 }),
      new TextRun({ text: formatMoney(orden.total_cargos), size: 22 }),
      new TextRun({ text: '    Retenciones: ', bold: true, size: 22 }),
      new TextRun({ text: formatMoney(orden.total_retenciones), size: 22 }),
    ] }));
    children.push(new Paragraph({ children: [] }));
    children.push(new Paragraph({ children: [
      new TextRun({ text: `Líquido a Pagarse:  $${formatMoney(orden.liquido_pagar)}`, bold: true, size: 26 }),
    ] }));
    children.push(new Paragraph({ children: [
      new TextRun({ text: numeroALetras(parseFloat(orden.liquido_pagar) || 0), bold: true, size: 22 }),
    ] }));
    children.push(new Paragraph({ children: [] }));

    // Cheque info
    children.push(new Paragraph({ children: [
      new TextRun({ text: `Cheque Nº ${orden.cheque_numero || ''}  Banco: ${config.banco_nombre || ''}  ${orden.codigo_banco || ''}`, size: 18, color: '666666' }),
    ] }));

    // Signatures - Primera fila
    children.push(new Paragraph({ children: [] }));
    children.push(new Paragraph({ children: [] }));
    children.push(new Paragraph({ children: [] }));

    const sigRow1 = [
      new TableCell({
        borders: noBorders,
        children: [
          new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '________________________', size: 18 })] }),
          new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'C.I. Interesado', bold: true, size: 18 })] }),
          new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: orden.nombre_beneficiario, size: 18 })] }),
        ],
      }),
    ];

    // Agregar primeros 3 firmantes a primera fila
    for (const f of firmResult.rows.slice(0, 3)) {
      sigRow1.push(new TableCell({
        borders: noBorders,
        children: [
          new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '________________________', size: 18 })] }),
          new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: f.cargo, bold: true, size: 18 })] }),
          new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: f.nombre, size: 18 })] }),
        ],
      }));
    }

    children.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [new TableRow({ children: sigRow1 })],
    }));

    // Segunda fila si hay más de 3 firmantes
    if (firmResult.rows.length > 3) {
      const sigRow2 = [];
      for (const f of firmResult.rows.slice(3, 7)) {
        sigRow2.push(new TableCell({
          borders: noBorders,
          children: [
            new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '________________________', size: 18 })] }),
            new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: f.cargo, bold: true, size: 18 })] }),
            new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: f.nombre, size: 18 })] }),
          ],
        }));
      }
      children.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [new TableRow({ children: sigRow2 })],
      }));
    }

    // Tercera fila si hay más de 7 firmantes
    if (firmResult.rows.length > 7) {
      const sigRow3 = [];
      for (const f of firmResult.rows.slice(7, 11)) {
        sigRow3.push(new TableCell({
          borders: noBorders,
          children: [
            new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '________________________', size: 18 })] }),
            new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: f.cargo, bold: true, size: 18 })] }),
            new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: f.nombre, size: 18 })] }),
          ],
        }));
      }
      children.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [new TableRow({ children: sigRow3 })],
      }));
    }

    const doc = new Document({
      sections: [{ children }],
    });

    const buffer = await Packer.toBuffer(doc);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename=comprobante_${orden.numero_orden}.docx`);
    res.send(buffer);
  } catch (err) {
    console.error('Error generando Word:', err);
    res.status(500).json({ success: false, error: 'Error generando documento Word' });
  }
});

module.exports = router;
