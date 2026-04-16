const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/common');

// GET /api/cuentas-bc — listar todas las cuentas BC (con número real de cheque calculado)
router.get('/', authMiddleware, asyncHandler(async (req, res) => {
  const result = await pool.query(`
    SELECT
      cbc.id,
      cbc.cuenta_bancaria,
      cbc.descripcion_cuenta,
      cbc.activo,
      cbc.created_at,
      cbc.updated_at,
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
    ORDER BY cbc.cuenta_bancaria
  `);
  res.json({ success: true, data: result.rows });
}));

// POST /api/cuentas-bc — crear nueva cuenta BC
router.post('/', authMiddleware, roleMiddleware('admin'), asyncHandler(async (req, res) => {
  const { cuenta_bancaria, descripcion_cuenta, siguiente_numero_transfer } = req.body;

  if (!cuenta_bancaria || !descripcion_cuenta) {
    return res.status(400).json({ success: false, error: 'Cuenta bancaria y descripción son obligatorios' });
  }

  // Verificar que no exista ya
  const exists = await pool.query(
    'SELECT id FROM financiero.cuentas_bc_catalogo WHERE cuenta_bancaria = $1',
    [String(cuenta_bancaria).trim()]
  );
  if (exists.rows.length > 0) {
    return res.status(409).json({ success: false, error: `La cuenta ${cuenta_bancaria} ya existe en el catálogo` });
  }

  const result = await pool.query(
    `INSERT INTO financiero.cuentas_bc_catalogo
       (cuenta_bancaria, descripcion_cuenta, siguiente_numero_transfer, activo)
     VALUES ($1, $2, $3, true)
     RETURNING *`,
    [
      String(cuenta_bancaria).trim(),
      String(descripcion_cuenta).trim(),
      parseInt(siguiente_numero_transfer) || 1,
    ]
  );

  res.status(201).json({ success: true, data: result.rows[0] });
}));

// PUT /api/cuentas-bc/:id — actualizar cuenta BC
router.put('/:id', authMiddleware, roleMiddleware('admin'), asyncHandler(async (req, res) => {
  const { descripcion_cuenta, siguiente_numero_transfer, activo } = req.body;

  const existing = await pool.query(
    'SELECT id FROM financiero.cuentas_bc_catalogo WHERE id = $1',
    [req.params.id]
  );
  if (existing.rows.length === 0) {
    return res.status(404).json({ success: false, error: 'Cuenta BC no encontrada' });
  }

  await pool.query(
    `UPDATE financiero.cuentas_bc_catalogo SET
       descripcion_cuenta     = COALESCE($1, descripcion_cuenta),
       siguiente_numero_transfer = COALESCE($2, siguiente_numero_transfer),
       activo                 = COALESCE($3, activo),
       updated_at             = NOW()
     WHERE id = $4`,
    [
      descripcion_cuenta !== undefined ? String(descripcion_cuenta).trim() : null,
      siguiente_numero_transfer !== undefined ? parseInt(siguiente_numero_transfer) : null,
      activo !== undefined ? Boolean(activo) : null,
      req.params.id,
    ]
  );

  const updated = await pool.query(
    'SELECT * FROM financiero.cuentas_bc_catalogo WHERE id = $1',
    [req.params.id]
  );
  res.json({ success: true, data: updated.rows[0] });
}));

// DELETE /api/cuentas-bc/:id — borrado lógico (activo = false)
router.delete('/:id', authMiddleware, roleMiddleware('admin'), asyncHandler(async (req, res) => {
  const result = await pool.query(
    'UPDATE financiero.cuentas_bc_catalogo SET activo = false, updated_at = NOW() WHERE id = $1 RETURNING id',
    [req.params.id]
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ success: false, error: 'Cuenta BC no encontrada' });
  }
  res.json({ success: true, message: 'Cuenta BC desactivada' });
}));

module.exports = router;
