const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');
const { registrarAuditoria } = require('../utils/auditoria');
const { validateBody } = require('../utils/validators');
const { crearOrdenSchema, editarOrdenSchema } = require('../utils/validators');
const { asyncHandler } = require('../middleware/common');

// GET /api/ordenes-pago - listar con paginación y filtros
router.get('/', authMiddleware, asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, search = '', estado = '', fecha_desde = '', fecha_hasta = '' } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  let conditions = [];
  let params = [];
  let paramIdx = 1;

  if (search) {
    conditions.push(`(o.nombre_beneficiario ILIKE $${paramIdx} OR o.detalle ILIKE $${paramIdx} OR o.codigo_beneficiario ILIKE $${paramIdx} OR CAST(o.numero_orden AS TEXT) LIKE $${paramIdx})`);
    params.push(`%${search}%`);
    paramIdx++;
  }

  if (estado) {
    conditions.push(`o.situacion = $${paramIdx}`);
    params.push(estado);
    paramIdx++;
  }

  if (fecha_desde) {
    conditions.push(`o.fecha >= $${paramIdx}`);
    params.push(fecha_desde);
    paramIdx++;
  }

  if (fecha_hasta) {
    conditions.push(`o.fecha <= $${paramIdx}`);
    params.push(fecha_hasta);
    paramIdx++;
  }

  const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  const countResult = await pool.query(
    `SELECT COUNT(*) FROM financiero.ordenes_pago o ${whereClause}`,
    params
  );
  const total = parseInt(countResult.rows[0].count);

  const dataParams = [...params, parseInt(limit), offset];
  const result = await pool.query(
    `SELECT o.id, o.numero_orden, o.fecha, o.situacion,
            o.codigo_beneficiario, o.nombre_beneficiario,
            o.valor_planilla, o.valor_iva, o.total_cargos, o.total_retenciones, o.liquido_pagar,
            o.cheque_numero, o.created_at
     FROM financiero.ordenes_pago o
     ${whereClause}
     ORDER BY o.numero_orden DESC
     LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
    dataParams
  );

  res.json({
    success: true,
    data: result.rows,
    total,
    page: parseInt(page),
    totalPages: Math.ceil(total / parseInt(limit)),
  });
}));

// GET /api/ordenes-pago/siguiente-numero
router.get('/siguiente-numero', authMiddleware, asyncHandler(async (req, res) => {
  const result = await pool.query("SELECT valor FROM financiero.configuracion WHERE clave = 'siguiente_numero_orden'");
  const numOrden = parseInt(result.rows[0]?.valor) || 1;

  const resultCheque = await pool.query("SELECT valor FROM financiero.configuracion WHERE clave = 'siguiente_numero_cheque'");
  const numCheque = parseInt(resultCheque.rows[0]?.valor) || 1;

  res.json({ success: true, data: { numero_orden: numOrden, numero_cheque: numCheque } });
}));

// GET /api/ordenes-pago/estadisticas
router.get('/estadisticas', authMiddleware, asyncHandler(async (req, res) => {
  const totalResult = await pool.query('SELECT COUNT(*) as total FROM financiero.ordenes_pago');
  const activasResult = await pool.query("SELECT COUNT(*) as total FROM financiero.ordenes_pago WHERE situacion = 'ACTIVO'");
  const mesResult = await pool.query(
    `SELECT COUNT(*) as total, COALESCE(SUM(liquido_pagar), 0) as monto
     FROM financiero.ordenes_pago
     WHERE fecha >= date_trunc('month', CURRENT_DATE) AND situacion = 'ACTIVO'`
  );
  const anioResult = await pool.query(
    `SELECT COUNT(*) as total, COALESCE(SUM(liquido_pagar), 0) as monto
     FROM financiero.ordenes_pago
     WHERE fecha >= date_trunc('year', CURRENT_DATE) AND situacion = 'ACTIVO'`
  );
  const ultimasResult = await pool.query(
    `SELECT numero_orden, fecha, nombre_beneficiario, liquido_pagar, situacion
     FROM financiero.ordenes_pago ORDER BY numero_orden DESC LIMIT 5`
  );
  // Pagos mensuales del año actual
  const mensualResult = await pool.query(
    `SELECT to_char(fecha, 'YYYY-MM') as mes, COUNT(*) as cantidad, COALESCE(SUM(liquido_pagar),0) as monto
     FROM financiero.ordenes_pago
     WHERE fecha >= date_trunc('year', CURRENT_DATE) AND situacion = 'ACTIVO'
     GROUP BY to_char(fecha, 'YYYY-MM')
     ORDER BY mes`
  );

  res.json({
    success: true,
    data: {
      total_ordenes: parseInt(totalResult.rows[0].total),
      ordenes_activas: parseInt(activasResult.rows[0].total),
      mes_actual: { cantidad: parseInt(mesResult.rows[0].total), monto: parseFloat(mesResult.rows[0].monto) },
      anio_actual: { cantidad: parseInt(anioResult.rows[0].total), monto: parseFloat(anioResult.rows[0].monto) },
      ultimas_ordenes: ultimasResult.rows,
      pagos_mensuales: mensualResult.rows,
    },
  });
}));

// GET /api/ordenes-pago/:id
router.get('/:id', authMiddleware, asyncHandler(async (req, res) => {
  const result = await pool.query('SELECT * FROM financiero.ordenes_pago WHERE id = $1', [req.params.id]);
  if (result.rows.length === 0) {
    return res.status(404).json({ success: false, error: 'Orden no encontrada' });
  }

  const retenciones = await pool.query(
    'SELECT * FROM financiero.ordenes_pago_retenciones WHERE orden_pago_id = $1 ORDER BY id',
    [req.params.id]
  );

  const otrosValores = await pool.query(
    'SELECT * FROM financiero.ordenes_pago_otros_valores WHERE orden_pago_id = $1 ORDER BY id',
    [req.params.id]
  );

  const firmantes = await pool.query(
    'SELECT * FROM financiero.firmantes WHERE activo = true ORDER BY orden'
  );

  res.json({
    success: true,
    data: {
      ...result.rows[0],
      retenciones: retenciones.rows,
      otros_valores: otrosValores.rows,
      firmantes: firmantes.rows,
    },
  });
}));

// POST /api/ordenes-pago
router.post('/', authMiddleware, roleMiddleware('admin', 'financiero'), validateBody(crearOrdenSchema), asyncHandler(async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const {
      codigo_beneficiario, nombre_beneficiario, detalle,
      valor_planilla, porcentaje_iva, valor_iva,
      otros_cargos = [],
      retenciones = [],
      cuenta_banco_central, codigo_inst_financiera,
      tipo_cuenta_beneficiario, cuenta_beneficiario,
    } = req.body;

    // Obtener siguiente número
    const numResult = await client.query(
      "SELECT valor FROM financiero.configuracion WHERE clave = 'siguiente_numero_orden' FOR UPDATE"
    );
    const numOrden = parseInt(numResult.rows[0].valor);

    const numChequeResult = await client.query(
      "SELECT valor FROM financiero.configuracion WHERE clave = 'siguiente_numero_cheque' FOR UPDATE"
    );
    const numCheque = parseInt(numChequeResult.rows[0].valor);

    // Obtener config
    const ivaConfig = await client.query("SELECT valor FROM financiero.configuracion WHERE clave = 'iva_porcentaje'");
    const cuentaBCConfig = await client.query("SELECT valor FROM financiero.configuracion WHERE clave = 'cuenta_banco_central'");
    const codBancoConfig = await client.query("SELECT valor FROM financiero.configuracion WHERE clave = 'codigo_banco'");

    const pctIva = porcentaje_iva !== undefined ? parseFloat(porcentaje_iva) : parseFloat(ivaConfig.rows[0]?.valor || '15');
    const valPlanilla = parseFloat(valor_planilla) || 0;
    const valIva = valor_iva !== undefined ? parseFloat(valor_iva) : valPlanilla * pctIva / 100;

    // Calcular otros cargos
    let totalOtrosCargos = 0;
    const cargosFields = {};
    otros_cargos.forEach((c, i) => {
      const suffix = i === 0 ? '' : `_${i}`;
      cargosFields[`razon_otros_cargos${suffix}`] = c.razon || null;
      cargosFields[`valor_otros_cargos${suffix}`] = parseFloat(c.valor) || 0;
      totalOtrosCargos += parseFloat(c.valor) || 0;
    });

    const totalCargos = valPlanilla + valIva + totalOtrosCargos;

    // Calcular retenciones
    let totalRetenciones = 0;
    for (const r of retenciones) {
      totalRetenciones += parseFloat(r.valor) || 0;
    }

    const liquidoPagar = totalCargos - totalRetenciones;

    // Asegurar/crear beneficiario
    let beneficiarioId = null;
    if (codigo_beneficiario) {
      const benResult = await client.query(
        'SELECT id FROM financiero.beneficiarios WHERE ruc_cedula = $1 LIMIT 1',
        [codigo_beneficiario]
      );
      if (benResult.rows.length > 0) {
        beneficiarioId = benResult.rows[0].id;
      } else {
        const newBen = await client.query(
          `INSERT INTO financiero.beneficiarios (ruc_cedula, nombre)
           VALUES ($1, $2) RETURNING id`,
          [codigo_beneficiario, nombre_beneficiario]
        );
        beneficiarioId = newBen.rows[0].id;
      }
    }

    const insertResult = await client.query(
      `INSERT INTO financiero.ordenes_pago (
        numero_orden, fecha, situacion,
        beneficiario_id, codigo_beneficiario, nombre_beneficiario,
        cuenta_banco_central, codigo_inst_financiera,
        tipo_cuenta_beneficiario, cuenta_beneficiario,
        detalle,
        valor_planilla, valor_iva, porcentaje_iva,
        razon_otros_cargos, valor_otros_cargos,
        razon_otros_cargos_1, valor_otros_cargos_1,
        razon_otros_cargos_2, valor_otros_cargos_2,
        razon_otros_cargos_3, valor_otros_cargos_3,
        razon_otros_cargos_4, valor_otros_cargos_4,
        razon_otros_cargos_5, valor_otros_cargos_5,
        total_cargos, total_retenciones, liquido_pagar,
        codigo_banco, cheque_numero, valor_cheque,
        usuario_creacion
      ) VALUES (
        $1, CURRENT_DATE, 'ACTIVO',
        $2, $3, $4,
        $5, $6, $7, $8,
        $9,
        $10, $11, $12,
        $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24,
        $25, $26, $27,
        $28, $29, $30,
        $31
      ) RETURNING id, numero_orden`,
      [
        numOrden,
        beneficiarioId, codigo_beneficiario || null, nombre_beneficiario,
        cuenta_banco_central || cuentaBCConfig.rows[0]?.valor || null,
        codigo_inst_financiera || null,
        tipo_cuenta_beneficiario || null, cuenta_beneficiario || null,
        detalle,
        valPlanilla, valIva, pctIva,
        cargosFields['razon_otros_cargos'] || null, cargosFields['valor_otros_cargos'] || 0,
        cargosFields['razon_otros_cargos_1'] || null, cargosFields['valor_otros_cargos_1'] || 0,
        cargosFields['razon_otros_cargos_2'] || null, cargosFields['valor_otros_cargos_2'] || 0,
        cargosFields['razon_otros_cargos_3'] || null, cargosFields['valor_otros_cargos_3'] || 0,
        cargosFields['razon_otros_cargos_4'] || null, cargosFields['valor_otros_cargos_4'] || 0,
        cargosFields['razon_otros_cargos_5'] || null, cargosFields['valor_otros_cargos_5'] || 0,
        totalCargos, totalRetenciones, liquidoPagar,
        codBancoConfig.rows[0]?.valor || null, String(numCheque), liquidoPagar,
        req.user.id,
      ]
    );

    const ordenId = insertResult.rows[0].id;

    // Insertar retenciones
    for (const r of retenciones) {
      await client.query(
        `INSERT INTO financiero.ordenes_pago_retenciones (orden_pago_id, tipo, concepto, base, porcentaje, valor)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [ordenId, r.tipo || 'OTRO', r.concepto, parseFloat(r.base) || 0, parseFloat(r.porcentaje) || 0, parseFloat(r.valor) || 0]
      );
    }

    // Incrementar secuencias
    await client.query(
      "UPDATE financiero.configuracion SET valor = $1 WHERE clave = 'siguiente_numero_orden'",
      [String(numOrden + 1)]
    );
    await client.query(
      "UPDATE financiero.configuracion SET valor = $1 WHERE clave = 'siguiente_numero_cheque'",
      [String(numCheque + 1)]
    );

    await client.query('COMMIT');

    // Auditoría
    await registrarAuditoria({
      tabla: 'ordenes_pago',
      registro_id: ordenId,
      accion: 'CREAR',
      datos_nuevos: { numero_orden: numOrden, beneficiario: nombre_beneficiario, total: totalCargos },
      usuario_id: req.user.id,
      usuario_nombre: req.user.nombre,
      ip_address: req.ip,
    });

    res.status(201).json({
      success: true,
      data: { id: ordenId, numero_orden: numOrden, numero_cheque: numCheque },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error creando orden:', err);
    res.status(500).json({ success: false, error: 'Error interno' });
  } finally {
    client.release();
  }
}));

// PUT /api/ordenes-pago/:id
router.put('/:id', authMiddleware, roleMiddleware('admin', 'financiero'), validateBody(editarOrdenSchema), asyncHandler(async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Verificar que existe y no está anulada
    const existing = await client.query('SELECT * FROM financiero.ordenes_pago WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Orden no encontrada' });
    }
    if (existing.rows[0].situacion === 'ANULADO') {
      return res.status(400).json({ success: false, error: 'No se puede editar una orden anulada' });
    }

    const {
      nombre_beneficiario, codigo_beneficiario, detalle,
      valor_planilla, porcentaje_iva, valor_iva,
      otros_cargos = [],
      retenciones = [],
    } = req.body;

    const valPlanilla = parseFloat(valor_planilla) || 0;
    const pctIva = parseFloat(porcentaje_iva) || 0;
    const valIva = valor_iva !== undefined ? parseFloat(valor_iva) : valPlanilla * pctIva / 100;

    let totalOtrosCargos = 0;
    const cargosFields = {};
    otros_cargos.forEach((c, i) => {
      const suffix = i === 0 ? '' : `_${i}`;
      cargosFields[`razon_otros_cargos${suffix}`] = c.razon || null;
      cargosFields[`valor_otros_cargos${suffix}`] = parseFloat(c.valor) || 0;
      totalOtrosCargos += parseFloat(c.valor) || 0;
    });

    const totalCargos = valPlanilla + valIva + totalOtrosCargos;
    let totalRetenciones = 0;
    for (const r of retenciones) {
      totalRetenciones += parseFloat(r.valor) || 0;
    }
    const liquidoPagar = totalCargos - totalRetenciones;

    await client.query(
      `UPDATE financiero.ordenes_pago SET
        nombre_beneficiario = COALESCE($1, nombre_beneficiario),
        codigo_beneficiario = COALESCE($2, codigo_beneficiario),
        detalle = COALESCE($3, detalle),
        valor_planilla = $4, valor_iva = $5, porcentaje_iva = $6,
        razon_otros_cargos = $7, valor_otros_cargos = $8,
        razon_otros_cargos_1 = $9, valor_otros_cargos_1 = $10,
        razon_otros_cargos_2 = $11, valor_otros_cargos_2 = $12,
        razon_otros_cargos_3 = $13, valor_otros_cargos_3 = $14,
        razon_otros_cargos_4 = $15, valor_otros_cargos_4 = $16,
        razon_otros_cargos_5 = $17, valor_otros_cargos_5 = $18,
        total_cargos = $19, total_retenciones = $20, liquido_pagar = $21,
        valor_cheque = $22,
        usuario_modificacion = $23, updated_at = NOW()
      WHERE id = $24`,
      [
        nombre_beneficiario, codigo_beneficiario, detalle,
        valPlanilla, valIva, pctIva,
        cargosFields['razon_otros_cargos'] || null, cargosFields['valor_otros_cargos'] || 0,
        cargosFields['razon_otros_cargos_1'] || null, cargosFields['valor_otros_cargos_1'] || 0,
        cargosFields['razon_otros_cargos_2'] || null, cargosFields['valor_otros_cargos_2'] || 0,
        cargosFields['razon_otros_cargos_3'] || null, cargosFields['valor_otros_cargos_3'] || 0,
        cargosFields['razon_otros_cargos_4'] || null, cargosFields['valor_otros_cargos_4'] || 0,
        cargosFields['razon_otros_cargos_5'] || null, cargosFields['valor_otros_cargos_5'] || 0,
        totalCargos, totalRetenciones, liquidoPagar,
        liquidoPagar,
        req.user.id, req.params.id,
      ]
    );

    // Reemplazar retenciones
    await client.query('DELETE FROM financiero.ordenes_pago_retenciones WHERE orden_pago_id = $1', [req.params.id]);
    for (const r of retenciones) {
      await client.query(
        `INSERT INTO financiero.ordenes_pago_retenciones (orden_pago_id, tipo, concepto, base, porcentaje, valor)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [req.params.id, r.tipo || 'OTRO', r.concepto, parseFloat(r.base) || 0, parseFloat(r.porcentaje) || 0, parseFloat(r.valor) || 0]
      );
    }

    await client.query('COMMIT');

    await registrarAuditoria({
      tabla: 'ordenes_pago',
      registro_id: parseInt(req.params.id),
      accion: 'EDITAR',
      datos_anteriores: existing.rows[0],
      datos_nuevos: req.body,
      usuario_id: req.user.id,
      usuario_nombre: req.user.nombre,
      ip_address: req.ip,
    });

    res.json({ success: true, message: 'Orden actualizada' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error editando orden:', err);
    res.status(500).json({ success: false, error: 'Error interno' });
  } finally {
    client.release();
  }
}));

// PATCH /api/ordenes-pago/:id/anular
router.patch('/:id/anular', authMiddleware, roleMiddleware('admin', 'financiero'), asyncHandler(async (req, res) => {
  const { motivo } = req.body;
  if (!motivo) {
    return res.status(400).json({ success: false, error: 'Motivo de anulación requerido' });
  }

  const existing = await pool.query('SELECT * FROM financiero.ordenes_pago WHERE id = $1', [req.params.id]);
  if (existing.rows.length === 0) {
    return res.status(404).json({ success: false, error: 'Orden no encontrada' });
  }

  await pool.query(
    `UPDATE financiero.ordenes_pago SET situacion = 'ANULADO', motivo_anulacion = $1,
     usuario_modificacion = $2, updated_at = NOW() WHERE id = $3`,
    [motivo, req.user.id, req.params.id]
  );

  await registrarAuditoria({
    tabla: 'ordenes_pago',
    registro_id: parseInt(req.params.id),
    accion: 'ANULAR',
    datos_anteriores: { situacion: existing.rows[0].situacion },
    datos_nuevos: { situacion: 'ANULADO', motivo },
    usuario_id: req.user.id,
    usuario_nombre: req.user.nombre,
    ip_address: req.ip,
  });

  res.json({ success: true, message: 'Orden anulada' });
}));

module.exports = router;
