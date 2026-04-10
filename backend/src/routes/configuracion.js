const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');
const { validateBody, actualizarConfiguracionSchema, crearFirmanteSchema, editarFirmanteSchema, crearRetencionSchema, editarRetencionSchema } = require('../utils/validators');
const { asyncHandler } = require('../middleware/common');

// GET /api/configuracion
router.get('/', authMiddleware, asyncHandler(async (req, res) => {
  const result = await pool.query('SELECT * FROM financiero.configuracion ORDER BY id');
  const config = {};
  result.rows.forEach(r => { config[r.clave] = r.valor; });
  // Compatibilidad con frontend antiguo
  if (!config.institucion && config.institucion_nombre) {
    config.institucion = config.institucion_nombre;
  }
  res.json({ success: true, data: config, raw: result.rows });
}));

// PUT /api/configuracion
router.put('/', authMiddleware, roleMiddleware('admin'), asyncHandler(async (req, res) => {
  // Soporta 2 formatos:
  // 1) { clave: 'iva_porcentaje', valor: '15' }
  // 2) { iva_porcentaje: '15', otra_clave: 'valor' }
  if (typeof req.body !== 'object' || req.body === null) {
    return res.status(400).json({ success: false, error: 'Body inválido para configuración' });
  }

  let entries;
  if ('clave' in req.body && 'valor' in req.body) {
    entries = [[req.body.clave, req.body.valor]];
  } else {
    entries = Object.entries(req.body);
  }

  for (const [claveRaw, valor] of entries) {
    let clave = String(claveRaw);
    if (clave === 'institucion') {
      clave = 'institucion_nombre';
    }

    const updateResult = await pool.query(
      `UPDATE financiero.configuracion
       SET valor = $1, updated_at = NOW(), updated_by = $2
       WHERE clave = $3
       RETURNING id`,
      [String(valor), req.user.id, clave]
    );

    if (updateResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: `Clave de configuración no encontrada: ${clave}` });
    }
  }
  res.json({ success: true, message: 'Configuración actualizada' });
}));

// GET /api/configuracion/firmantes
router.get('/firmantes', authMiddleware, asyncHandler(async (req, res) => {
  const result = await pool.query('SELECT * FROM financiero.firmantes WHERE activo = true ORDER BY orden');
  res.json({ success: true, data: result.rows });
}));

// PUT /api/configuracion/firmantes/:id
router.put('/firmantes/:id', authMiddleware, roleMiddleware('admin'), validateBody(editarFirmanteSchema), asyncHandler(async (req, res) => {
  const { cargo, nombre, orden } = req.body;
  await pool.query(
    'UPDATE financiero.firmantes SET cargo = COALESCE($1, cargo), nombre = COALESCE($2, nombre), orden = COALESCE($3, orden), updated_at = NOW() WHERE id = $4',
    [cargo, nombre, orden, req.params.id]
  );
  res.json({ success: true, message: 'Firmante actualizado' });
}));

// POST /api/configuracion/firmantes
router.post('/firmantes', authMiddleware, roleMiddleware('admin'), validateBody(crearFirmanteSchema), asyncHandler(async (req, res) => {
  const { cargo, nombre, orden } = req.body;
  const result = await pool.query(
    'INSERT INTO financiero.firmantes (cargo, nombre, orden) VALUES ($1, $2, $3) RETURNING *',
    [cargo, nombre, orden || 0]
  );
  res.status(201).json({ success: true, data: result.rows[0] });
}));

// DELETE /api/configuracion/firmantes/:id (borrado lógico)
router.delete('/firmantes/:id', authMiddleware, roleMiddleware('admin'), asyncHandler(async (req, res) => {
  const result = await pool.query(
    'UPDATE financiero.firmantes SET activo = false, updated_at = NOW() WHERE id = $1 RETURNING id',
    [req.params.id]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ success: false, error: 'Firmante no encontrado' });
  }

  res.json({ success: true, message: 'Firmante eliminado' });
}));

// GET /api/configuracion/retenciones-catalogo
router.get('/retenciones-catalogo', authMiddleware, asyncHandler(async (req, res) => {
  const result = await pool.query('SELECT * FROM financiero.retenciones_catalogo WHERE activo = true ORDER BY tipo, nombre');
  res.json({ success: true, data: result.rows });
}));

// POST /api/configuracion/retenciones-catalogo
router.post('/retenciones-catalogo', authMiddleware, roleMiddleware('admin'), validateBody(crearRetencionSchema), asyncHandler(async (req, res) => {
  const { codigo, nombre, tipo, porcentaje } = req.body;
  const result = await pool.query(
    'INSERT INTO financiero.retenciones_catalogo (codigo, nombre, tipo, porcentaje) VALUES ($1, $2, $3, $4) RETURNING *',
    [codigo, nombre, tipo, porcentaje]
  );
  res.status(201).json({ success: true, data: result.rows[0] });
}));

// PUT /api/configuracion/retenciones-catalogo/:id
router.put('/retenciones-catalogo/:id', authMiddleware, roleMiddleware('admin'), validateBody(editarRetencionSchema), asyncHandler(async (req, res) => {
  const { nombre, tipo, porcentaje, activo } = req.body;
  await pool.query(
    `UPDATE financiero.retenciones_catalogo SET
     nombre = COALESCE($1, nombre), tipo = COALESCE($2, tipo),
     porcentaje = COALESCE($3, porcentaje), activo = COALESCE($4, activo)
     WHERE id = $5`,
    [nombre, tipo, porcentaje, activo, req.params.id]
  );
  res.json({ success: true, message: 'Retención actualizada' });
}));

// DELETE /api/configuracion/retenciones-catalogo/:id (borrado lógico)
router.delete('/retenciones-catalogo/:id', authMiddleware, roleMiddleware('admin'), asyncHandler(async (req, res) => {
  const result = await pool.query(
    'UPDATE financiero.retenciones_catalogo SET activo = false WHERE id = $1 RETURNING id',
    [req.params.id]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ success: false, error: 'Retención no encontrada' });
  }

  res.json({ success: true, message: 'Retención eliminada' });
}));

module.exports = router;
