const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/common');

// GET /api/auditoria
router.get('/', authMiddleware, roleMiddleware('admin', 'auditor'), asyncHandler(async (req, res) => {
  const { page = 1, limit = 30, tabla = '', accion = '', usuario = '', fecha_desde = '', fecha_hasta = '' } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  let conditions = [];
  let params = [];
  let paramIdx = 1;

  if (tabla) {
    conditions.push(`a.tabla = $${paramIdx}`);
    params.push(tabla);
    paramIdx++;
  }
  if (accion) {
    conditions.push(`a.accion = $${paramIdx}`);
    params.push(accion);
    paramIdx++;
  }
  if (usuario) {
    conditions.push(`a.usuario_nombre ILIKE $${paramIdx}`);
    params.push(`%${usuario}%`);
    paramIdx++;
  }
  if (fecha_desde) {
    conditions.push(`a.created_at >= $${paramIdx}`);
    params.push(fecha_desde);
    paramIdx++;
  }
  if (fecha_hasta) {
    conditions.push(`a.created_at <= $${paramIdx}::date + interval '1 day'`);
    params.push(fecha_hasta);
    paramIdx++;
  }

  const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  const countResult = await pool.query(`SELECT COUNT(*) FROM financiero.auditoria a ${whereClause}`, params);
  const total = parseInt(countResult.rows[0].count);

  const dataParams = [...params, parseInt(limit), offset];
  const result = await pool.query(
    `SELECT a.* FROM financiero.auditoria a ${whereClause}
     ORDER BY a.created_at DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
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

module.exports = router;
