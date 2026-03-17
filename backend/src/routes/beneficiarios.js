const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authMiddleware } = require('../middleware/auth');

// GET /api/beneficiarios?search=...
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { search = '', page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereClause = '';
    let params = [];
    let paramIdx = 1;

    if (search) {
      whereClause = `WHERE nombre ILIKE $${paramIdx} OR ruc_cedula ILIKE $${paramIdx}`;
      params.push(`%${search}%`);
      paramIdx++;
    }

    const countResult = await pool.query(`SELECT COUNT(*) FROM financiero.beneficiarios ${whereClause}`, params);
    const total = parseInt(countResult.rows[0].count);

    const dataParams = [...params, parseInt(limit), offset];
    const result = await pool.query(
      `SELECT * FROM financiero.beneficiarios ${whereClause} ORDER BY nombre LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      dataParams
    );

    res.json({ success: true, data: result.rows, total, page: parseInt(page), totalPages: Math.ceil(total / parseInt(limit)) });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// GET /api/beneficiarios/buscar?q=...  (autocompletado rápido)
router.get('/buscar', authMiddleware, async (req, res) => {
  try {
    const { q = '' } = req.query;
    if (q.length < 2) {
      return res.json({ success: true, data: [] });
    }

    const result = await pool.query(
      `SELECT id, ruc_cedula, nombre
       FROM financiero.beneficiarios
       WHERE nombre ILIKE $1 OR ruc_cedula ILIKE $1
       ORDER BY nombre LIMIT 10`,
      [`%${q}%`]
    );

    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// POST /api/beneficiarios
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { ruc_cedula, nombre } = req.body;
    if (!ruc_cedula || !nombre) {
      return res.status(400).json({ success: false, error: 'Identificación (cédula/RUC/pasaporte) y nombres/apellidos son requeridos' });
    }

    const result = await pool.query(
      `INSERT INTO financiero.beneficiarios (ruc_cedula, nombre)
       VALUES ($1, $2) RETURNING *`,
      [ruc_cedula, nombre]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// PUT /api/beneficiarios/:id
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { ruc_cedula, nombre } = req.body;
    if (!ruc_cedula || !nombre) {
      return res.status(400).json({ success: false, error: 'Identificación (cédula/RUC/pasaporte) y nombres/apellidos son requeridos' });
    }

    await pool.query(
      `UPDATE financiero.beneficiarios SET
       ruc_cedula = $1,
       nombre = $2,
       updated_at = NOW()
       WHERE id = $3`,
      [ruc_cedula, nombre, req.params.id]
    );
    res.json({ success: true, message: 'Beneficiario actualizado' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Error interno' });
  }
});

module.exports = router;
