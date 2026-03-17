const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');

// GET /api/configuracion
router.get('/', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM financiero.configuracion ORDER BY id');
    const config = {};
    result.rows.forEach(r => { config[r.clave] = r.valor; });
    res.json({ success: true, data: config, raw: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// PUT /api/configuracion
router.put('/', authMiddleware, roleMiddleware('admin'), async (req, res) => {
  try {
    const entries = Object.entries(req.body);
    for (const [clave, valor] of entries) {
      await pool.query(
        `UPDATE financiero.configuracion SET valor = $1, updated_at = NOW(), updated_by = $2 WHERE clave = $3`,
        [String(valor), req.user.id, clave]
      );
    }
    res.json({ success: true, message: 'Configuración actualizada' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// GET /api/configuracion/firmantes
router.get('/firmantes', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM financiero.firmantes WHERE activo = true ORDER BY orden');
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// PUT /api/configuracion/firmantes/:id
router.put('/firmantes/:id', authMiddleware, roleMiddleware('admin'), async (req, res) => {
  try {
    const { cargo, nombre, orden } = req.body;
    await pool.query(
      'UPDATE financiero.firmantes SET cargo = COALESCE($1, cargo), nombre = COALESCE($2, nombre), orden = COALESCE($3, orden), updated_at = NOW() WHERE id = $4',
      [cargo, nombre, orden, req.params.id]
    );
    res.json({ success: true, message: 'Firmante actualizado' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// POST /api/configuracion/firmantes
router.post('/firmantes', authMiddleware, roleMiddleware('admin'), async (req, res) => {
  try {
    const { cargo, nombre, orden } = req.body;
    const result = await pool.query(
      'INSERT INTO financiero.firmantes (cargo, nombre, orden) VALUES ($1, $2, $3) RETURNING *',
      [cargo, nombre, orden || 0]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// GET /api/configuracion/retenciones-catalogo
router.get('/retenciones-catalogo', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM financiero.retenciones_catalogo WHERE activo = true ORDER BY tipo, nombre');
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// POST /api/configuracion/retenciones-catalogo
router.post('/retenciones-catalogo', authMiddleware, roleMiddleware('admin'), async (req, res) => {
  try {
    const { codigo, nombre, tipo, porcentaje } = req.body;
    const result = await pool.query(
      'INSERT INTO financiero.retenciones_catalogo (codigo, nombre, tipo, porcentaje) VALUES ($1, $2, $3, $4) RETURNING *',
      [codigo, nombre, tipo, porcentaje]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// PUT /api/configuracion/retenciones-catalogo/:id
router.put('/retenciones-catalogo/:id', authMiddleware, roleMiddleware('admin'), async (req, res) => {
  try {
    const { nombre, tipo, porcentaje, activo } = req.body;
    await pool.query(
      `UPDATE financiero.retenciones_catalogo SET
       nombre = COALESCE($1, nombre), tipo = COALESCE($2, tipo),
       porcentaje = COALESCE($3, porcentaje), activo = COALESCE($4, activo)
       WHERE id = $5`,
      [nombre, tipo, porcentaje, activo, req.params.id]
    );
    res.json({ success: true, message: 'Retención actualizada' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Error interno' });
  }
});

module.exports = router;
