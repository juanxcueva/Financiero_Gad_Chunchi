const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');
const { validateBody, actualizarConfiguracionSchema, crearFirmanteSchema, editarFirmanteSchema, crearRetencionSchema, editarRetencionSchema } = require('../utils/validators');
const { asyncHandler } = require('../middleware/common');
const { exec } = require('child_process');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const execAsync = promisify(exec);
const BACKUP_DIR = path.join(__dirname, '../../..', 'uploads', 'backups');
fs.mkdirSync(BACKUP_DIR, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, BACKUP_DIR),
    filename: (_req, file, cb) => {
      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, `${Date.now()}_${safeName}`);
    },
  }),
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (ext !== '.sql') {
      return cb(new Error('Solo se permiten archivos .sql'));
    }
    cb(null, true);
  },
});

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

    await pool.query(
      `INSERT INTO financiero.configuracion (clave, valor, descripcion, updated_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (clave)
       DO UPDATE SET valor = EXCLUDED.valor, updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
      [
        clave,
        String(valor),
        clave === 'permitir_editar_cheque'
          ? 'Permitir edición manual del número de cheque desde configuración'
          : clave,
        req.user.id,
      ]
    );
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


// GET /api/configuracion/backup
router.get('/backup', authMiddleware, roleMiddleware('admin'), asyncHandler(async (req, res) => {
  try {
    const dbConfig = {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'financiero',
      user: process.env.DB_USER || 'financiero',
    };

    const backupFile = path.join(BACKUP_DIR, `backup_${Date.now()}.sql`);
    
    const env = {
      ...process.env,
      PGPASSWORD: process.env.DB_PASSWORD || '',
    };

    const dumpCmd = `pg_dump -h ${dbConfig.host} -p ${dbConfig.port} -U ${dbConfig.user} -d ${dbConfig.database} > "${backupFile}"`;

    await execAsync(dumpCmd, { env, shell: '/bin/bash' });

    const filename = `backup_${new Date().toISOString().split('T')[0]}_${Date.now()}.sql`;
    res.download(backupFile, filename, (err) => {
      if (err) console.error('Error descargando backup:', err);
      setTimeout(() => {
        fs.unlink(backupFile, () => {});
      }, 5000);
    });
  } catch (err) {
    console.error('Error generando backup:', err);
    res.status(500).json({ success: false, error: 'Error generando backup: ' + err.message });
  }
}));

// POST /api/configuracion/restore
router.post('/restore', authMiddleware, roleMiddleware('admin'), (req, res, next) => {
  upload.single('backupFile')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ success: false, error: 'Archivo supera 500MB' });
      }
      return res.status(400).json({ success: false, error: err.message || 'Error subiendo archivo' });
    }
    next();
  });
}, asyncHandler(async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Debe seleccionar un archivo SQL' });
    }

    const dbConfig = {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'financiero',
      user: process.env.DB_USER || 'financiero',
    };

    const env = {
      ...process.env,
      PGPASSWORD: process.env.DB_PASSWORD || '',
    };

    const restoreCmd = `psql -h ${dbConfig.host} -p ${dbConfig.port} -U ${dbConfig.user} -d ${dbConfig.database} < "${req.file.path}"`;

    await execAsync(restoreCmd, { env, shell: '/bin/bash', maxBuffer: 50 * 1024 * 1024 });

    fs.unlink(req.file.path, () => {});

    res.json({ success: true, message: 'Base de datos restaurada correctamente' });
  } catch (err) {
    console.error('Error restaurando backup:', err);
    if (req.file) {
      fs.unlink(req.file.path, () => {});
    }
    res.status(500).json({ success: false, error: 'Error restaurando: ' + err.message });
  }
}));


module.exports = router;
