const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');
const { registrarAuditoria, registrarAuditoriaCheque } = require('../utils/auditoria');
const { validateBody } = require('../utils/validators');
const { crearOrdenSchema, editarOrdenSchema } = require('../utils/validators');
const { asyncHandler } = require('../middleware/common');

// GET /api/ordenes-pago/cuentas-bancarias
router.get('/cuentas-bancarias', authMiddleware, asyncHandler(async (req, res) => {
  const result = await pool.query(
    `SELECT id, codigo_banco, nombre_banco, cuenta_bancaria, descripcion_cuenta, descripcion_banco, siguiente_numero_cheque 
     FROM financiero.cuentas_bancarias 
     WHERE activo = true 
     ORDER BY cuenta_bancaria, codigo_banco`
  );

  const cuentasBcResult = await pool.query(
    `SELECT
       cbc.cuenta_bancaria,
       cbc.descripcion_cuenta,
       GREATEST(
         COALESCE(cbc.siguiente_numero_transfer, 1),
         COALESCE(mx.max_cheque + 1, 1)
       )::INT AS siguiente_numero_transfer
     FROM financiero.cuentas_bc_catalogo cbc
     LEFT JOIN (
       SELECT
         cuenta_banco_central,
         MAX(CAST(cheque_numero AS BIGINT)) AS max_cheque
       FROM financiero.ordenes_pago
       WHERE cheque_numero ~ '^[0-9]+$'
       GROUP BY cuenta_banco_central
     ) mx ON mx.cuenta_banco_central = cbc.cuenta_bancaria
     WHERE activo = true
     ORDER BY cbc.cuenta_bancaria`
  );

  res.json({
    success: true,
    data: result.rows,
    cuentas_bc: cuentasBcResult.rows,
  });
}));

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
            o.cheque_numero, o.cuenta_banco_central,
            cbc.descripcion_cuenta AS serie_cuenta,
            o.created_at
     FROM financiero.ordenes_pago o
     LEFT JOIN financiero.cuentas_bc_catalogo cbc
       ON cbc.cuenta_bancaria = o.cuenta_banco_central
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
  let transactionFinished = false;
  try {
    await client.query('BEGIN');

    const {
      codigo_beneficiario, nombre_beneficiario, detalle,
      valor_planilla, porcentaje_iva, valor_iva,
      otros_cargos = [],
      retenciones = [],
      cuenta_banco_central, codigo_banco, cheque_numero, codigo_inst_financiera,
      tipo_cuenta_beneficiario, cuenta_beneficiario,
    } = req.body;

    const isAdmin = req.user?.rol === 'admin';

    // ── Número de orden: auto-curar secuencia ─────────────────────────────────
    // 1) Bloquear la fila de secuencia (FOR UPDATE serializa peticiones concurrentes)
    const lockResult = await client.query(
      "SELECT valor FROM financiero.configuracion WHERE clave = 'siguiente_numero_orden' FOR UPDATE"
    );
    const storedNumOrden = parseInt(lockResult.rows[0]?.valor) || 1;

    // 2) Obtener el MAX real de la tabla (fuera de FOR UPDATE para evitar problemas de sintaxis)
    const maxOrdenResult = await client.query(
      'SELECT COALESCE(MAX(numero_orden), 0) AS max_orden FROM financiero.ordenes_pago'
    );
    const maxNumOrden = parseInt(maxOrdenResult.rows[0]?.max_orden) || 0;

    // 3) Usar el mayor entre el valor almacenado y el max real +1 (auto-curar desfase)
    const numOrden = Math.max(storedNumOrden, maxNumOrden + 1);

    // Obtener siguiente cheque por Cuenta BC (ya no depende de codigo_banco)
    const ivaConfig = await client.query("SELECT valor FROM financiero.configuracion WHERE clave = 'iva_porcentaje'");
    const cuentaBCConfig = await client.query("SELECT valor FROM financiero.configuracion WHERE clave = 'cuenta_banco_central'");
    const codBancoConfig = await client.query("SELECT valor FROM financiero.configuracion WHERE clave = 'codigo_banco'");
    const chequeEditConfig = await client.query("SELECT valor FROM financiero.configuracion WHERE clave = 'permitir_editar_cheque'");

    const selectedCuentaBC = cuenta_banco_central || cuentaBCConfig.rows[0]?.valor || null;
    const finalCodigoBanco = codigo_banco || codBancoConfig.rows[0]?.valor || null;
    const permitirEditarCheque = ['1', 'true', 'si', 'sí', 'yes'].includes(
      String(chequeEditConfig.rows[0]?.valor || '').toLowerCase()
    );

    // ── Número de cheque: auto-curar + auto-avanzar ───────────────────────────
    let numCheque = null;
    if (selectedCuentaBC) {
      const cuentaBcResult = await client.query(
        `SELECT siguiente_numero_transfer
         FROM financiero.cuentas_bc_catalogo
         WHERE cuenta_bancaria = $1 AND activo = true
         FOR UPDATE`,
        [selectedCuentaBC]
      );
      if (cuentaBcResult.rows.length > 0) {
        numCheque = parseInt(cuentaBcResult.rows[0].siguiente_numero_transfer) || 1;

        // Alinear con el último cheque realmente usado
        const maxChequeResult = await client.query(
          `SELECT COALESCE(MAX(CAST(cheque_numero AS BIGINT)), 0) AS max_cheque
           FROM financiero.ordenes_pago
           WHERE cuenta_banco_central = $1
             AND cheque_numero ~ '^[0-9]+$'`,
          [selectedCuentaBC]
        );
        const nextFromHistory = (parseInt(maxChequeResult.rows[0]?.max_cheque, 10) || 0) + 1;
        if (nextFromHistory > numCheque) {
          numCheque = nextFromHistory;
        }
      }
    }

    // Fallback global si no existe catálogo para la Cuenta BC
    if (!numCheque) {
      const numChequeResult = await client.query(
        "SELECT valor FROM financiero.configuracion WHERE clave = 'siguiente_numero_cheque' FOR UPDATE"
      );
      numCheque = parseInt(numChequeResult.rows[0]?.valor) || 1;
    }

    const requestedChequeNum = cheque_numero ? String(cheque_numero).trim() : '';
    const suggestedChequeNum = String(numCheque || '');
    const isManualChequeOverride = isAdmin && permitirEditarCheque && requestedChequeNum && requestedChequeNum !== String(numCheque);

    if (isAdmin && requestedChequeNum && requestedChequeNum !== String(numCheque) && !permitirEditarCheque) {
      await client.query('ROLLBACK');
      return res.status(403).json({
        success: false,
        error: 'La edición manual del número de cheque está desactivada en Configuración',
      });
    }

    // ── Resolver número de cheque final ──────────────────────────────────────
    let finalChequeNum;
    if (isManualChequeOverride) {
      // Admin forzó un número: si ya existe, avanzar al siguiente libre en lugar
      // de rechazar con 409, para tolerar valores obsoletos del formulario.
      const dup = await client.query(
        `SELECT id FROM financiero.ordenes_pago
         WHERE cuenta_banco_central = $1 AND cheque_numero = $2 LIMIT 1`,
        [selectedCuentaBC, requestedChequeNum]
      );
      if (dup.rows.length > 0) {
        // El número solicitado ya está en uso: auto-avanzar desde el siguiente
        // número del servidor para evitar que un valor obsoleto del formulario
        // bloquee el guardado.
        console.warn(
          `[cheque] Admin solicitó ${requestedChequeNum} pero ya existe. ` +
          `Auto-avanzando desde ${numCheque}.`
        );
        let probe = numCheque;
        for (let i = 0; i < 1000; i++) {
          const probeDup = await client.query(
            `SELECT id FROM financiero.ordenes_pago
             WHERE cuenta_banco_central = $1 AND cheque_numero = $2 LIMIT 1`,
            [selectedCuentaBC, String(probe)]
          );
          if (probeDup.rows.length === 0) break;
          probe++;
        }
        finalChequeNum = String(probe);
        numCheque = probe;
      } else {
        finalChequeNum = requestedChequeNum;
      }
    } else if (selectedCuentaBC && numCheque) {
      // Automático: avanzar hasta encontrar un número libre (auto-curar duplicados)
      let probe = numCheque;
      for (let i = 0; i < 1000; i++) {
        const dup = await client.query(
          `SELECT id FROM financiero.ordenes_pago
           WHERE cuenta_banco_central = $1 AND cheque_numero = $2 LIMIT 1`,
          [selectedCuentaBC, String(probe)]
        );
        if (dup.rows.length === 0) break;
        probe++;
      }
      finalChequeNum = String(probe);
      numCheque = probe; // actualizar para que el UPDATE de secuencia sea correcto
    } else {
      finalChequeNum = String(numCheque || '0');
    }


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
        $1, COALESCE($32, CURRENT_DATE), 'ACTIVO',
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
        selectedCuentaBC,
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
        finalCodigoBanco, finalChequeNum, liquidoPagar,
        req.user.id,
        req.body.fecha_orden || null,
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

    // Incrementar secuencia por Cuenta BC siempre que se usó el catálogo.
    // numCheque contiene el número efectivamente asignado (ya sea automático
    // o el resultado del auto-avance dentro del override manual).
    if (selectedCuentaBC) {
      await client.query(
        `UPDATE financiero.cuentas_bc_catalogo
         SET siguiente_numero_transfer = $1
         WHERE cuenta_bancaria = $2`,
        [numCheque + 1, selectedCuentaBC]
      );
    } else {
      // Fallback global solo por retrocompatibilidad
      await client.query(
        "UPDATE financiero.configuracion SET valor = $1 WHERE clave = 'siguiente_numero_cheque'",
        [String(numCheque + 1)]
      );
    }
    await client.query('COMMIT');
    transactionFinished = true;

    // Auditoría
    try {
      await registrarAuditoria({
        tabla: 'ordenes_pago',
        registro_id: ordenId,
        accion: 'CREAR',
        datos_nuevos: { numero_orden: numOrden, beneficiario: nombre_beneficiario, total: totalCargos },
        usuario_id: req.user.id,
        usuario_nombre: req.user.nombre,
        ip_address: req.ip,
      });

      if (isManualChequeOverride) {
        await registrarAuditoriaCheque({
          orden_pago_id: ordenId,
          accion: 'MANUAL_OVERRIDE_CREAR',
          codigo_banco: finalCodigoBanco,
          cheque_anterior: suggestedChequeNum,
          cheque_nuevo: finalChequeNum,
          motivo: 'Ajuste manual de emergencia al crear orden',
          usuario_id: req.user.id,
          usuario_nombre: req.user.nombre,
          ip_address: req.ip,
        });
      }
    } catch (auditErr) {
      console.error('Error registrando auditoria de creacion:', auditErr.message);
    }

    res.status(201).json({
      success: true,
      data: { id: ordenId, numero_orden: numOrden, numero_cheque: finalChequeNum },
    });
  } catch (err) {
    if (!transactionFinished) {
      await client.query('ROLLBACK');
    }
    console.error('Error creando orden:', err.message, err.detail || '', err.code || '');
    
    // Mensajes de error más específicos
    let errorMsg = 'Error interno';
    let statusCode = 500;
    if (err.code === '23505') {
      errorMsg = 'Conflicto: El cheque o número de orden ya existe';
      statusCode = 409;
    } else if (err.code === '23503') {
      errorMsg = 'Datos inválidos: Referencia a beneficiario o cuenta no existe';
      statusCode = 400;
    } else if (err.code === '22P02') {
      errorMsg = 'Datos inválidos: Formato incorrecto en números o fechas';
      statusCode = 400;
    } else if (err.message?.includes('Following_numero')) {
      errorMsg = 'Error: No se puede obtener el siguiente número de orden';
    } else if (err.message?.includes('cuentas_bc')) {
      errorMsg = 'Error: Cuenta BC no válida o no configurada';
      statusCode = 400;
    }
    
    res.status(statusCode).json({ success: false, error: errorMsg, details: process.env.NODE_ENV === 'development' ? err.message : undefined });
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
      cuenta_banco_central, codigo_banco, cheque_numero,
    } = req.body;

    const isAdmin = req.user?.rol === 'admin';
    const existingChequeNumero = existing.rows[0].cheque_numero || null;
    const chequeEditConfig = await client.query(
      "SELECT valor FROM financiero.configuracion WHERE clave = 'permitir_editar_cheque' LIMIT 1"
    );
    const permitirEditarCheque = ['1', 'true', 'si', 'sí', 'yes'].includes(
      String(chequeEditConfig.rows[0]?.valor || '').toLowerCase()
    );
    
    // Validar que si el cheque cambia y no está permitido, rechazar
    if (cheque_numero && String(cheque_numero).trim() !== String(existingChequeNumero || '').trim()) {
      if (!isAdmin) {
        await client.query('ROLLBACK');
        return res.status(403).json({
          success: false,
          error: 'Solo administradores pueden cambiar el número de cheque'
        });
      }
      if (!permitirEditarCheque) {
        await client.query('ROLLBACK');
        return res.status(403).json({
          success: false,
          error: 'Debe activar el control "Permitir editar número de cheque" para cambiar este campo'
        });
      }
    }
    
    const effectiveChequeNumero = cheque_numero || existingChequeNumero;
    const effectiveCodigoBanco = codigo_banco || existing.rows[0].codigo_banco;
    const effectiveCuentaBC = cuenta_banco_central || existing.rows[0].cuenta_banco_central;

    // Determinar si el cheque fue modificado manualmente
    const isManualChequeEdit = isAdmin &&
      permitirEditarCheque &&
      cheque_numero &&
      String(cheque_numero).trim() !== String(existingChequeNumero || '').trim();

    // Verificar cheque duplicado solo cuando se cambia el cheque o la cuenta BC
    if (isAdmin && effectiveCuentaBC && effectiveChequeNumero && effectiveChequeNumero !== '0') {
      const chequeDuplicado = await client.query(
        `SELECT id FROM financiero.ordenes_pago
         WHERE cuenta_banco_central = $1 AND cheque_numero = $2 AND id <> $3
         LIMIT 1`,
        [effectiveCuentaBC, effectiveChequeNumero, req.params.id]
      );
      if (chequeDuplicado.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          error: `El cheque ${effectiveChequeNumero} ya existe para la Cuenta BC ${effectiveCuentaBC}`,
        });
      }
    }

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
        codigo_banco = COALESCE($25, codigo_banco),
        cheque_numero = COALESCE($26, cheque_numero),
        cuenta_banco_central = COALESCE($27, cuenta_banco_central),
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
        codigo_banco || null, effectiveChequeNumero, cuenta_banco_central || null,
      ]
    );

    const { fecha_orden: fechaOrdenUpdate } = req.body;
    if (fechaOrdenUpdate) {
      await client.query(
        `UPDATE financiero.ordenes_pago SET fecha = $1, usuario_modificacion = $2, updated_at = NOW() WHERE id = $3`,
        [fechaOrdenUpdate, req.user.id, req.params.id]
      );
    }
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

    if (isManualChequeEdit) {
      await registrarAuditoriaCheque({
        orden_pago_id: parseInt(req.params.id),
        accion: 'MANUAL_OVERRIDE_EDITAR',
        codigo_banco: effectiveCodigoBanco,
        cheque_anterior: existingChequeNumero,
        cheque_nuevo: effectiveChequeNumero,
        motivo: 'Ajuste manual de emergencia en edicion',
        usuario_id: req.user.id,
        usuario_nombre: req.user.nombre,
        ip_address: req.ip,
      });
    }

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
