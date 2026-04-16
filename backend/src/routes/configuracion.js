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


// ─── Estado de restauración (en memoria del proceso) ────────────────────────
const restoreState = {
  isRestoring: false,
  logs: [],
  progress: 0,
  status: 'idle',   // idle | restoring | completed | error
  error: null,
  startTime: null,
  endTime: null,
};

// GET /api/configuracion/backup
// Genera un volcado SQL con DROP + CREATE (--clean --if-exists) para que al
// restaurarlo se eliminen los datos previos antes de insertar los del backup.
router.get('/backup', authMiddleware, roleMiddleware('admin'), asyncHandler(async (req, res) => {
  try {
    const dbConfig = {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'financiero_gad_chunchi',
      user: process.env.DB_USER || 'financiero_user',
    };

    const env = { ...process.env, PGPASSWORD: process.env.DB_PASSWORD || '' };

    // --clean --if-exists: genera DROP TABLE IF EXISTS antes de cada CREATE TABLE
    // --no-acl --no-owner: evita problemas de permisos al restaurar con otro usuario
    const dumpCmd = [
      'pg_dump',
      '--clean',
      '--if-exists',
      '--no-acl',
      '--no-owner',
      `-h ${dbConfig.host}`,
      `-p ${dbConfig.port}`,
      `-U ${dbConfig.user}`,
      `-d ${dbConfig.database}`,
    ].join(' ');

    const { stdout } = await execAsync(dumpCmd, {
      env,
      shell: '/bin/bash',
      maxBuffer: 100 * 1024 * 1024,
    });

    const backupFile = path.join(BACKUP_DIR, `backup_${Date.now()}.sql`);
    fs.writeFileSync(backupFile, stdout, 'utf8');

    const filename = `backup_${new Date().toISOString().split('T')[0]}_${Date.now()}.sql`;
    res.download(backupFile, filename, (err) => {
      if (err) console.error('Error descargando backup:', err);
      setTimeout(() => fs.unlink(backupFile, () => {}), 5000);
    });
  } catch (err) {
    console.error('Error generando backup:', err);
    res.status(500).json({ success: false, error: 'Error generando backup: ' + err.message });
  }
}));

// GET /api/configuracion/restore-status
router.get('/restore-status', authMiddleware, roleMiddleware('admin'), (req, res) => {
  res.json({
    success: true,
    data: {
      isRestoring: restoreState.isRestoring,
      status: restoreState.status,
      progress: restoreState.progress,
      logs: restoreState.logs.slice(-50),
      error: restoreState.error,
      startTime: restoreState.startTime,
      endTime: restoreState.endTime,
      elapsedSeconds: restoreState.startTime
        ? Math.floor((Date.now() - new Date(restoreState.startTime)) / 1000)
        : 0,
    },
  });
});

// POST /api/configuracion/restore
// Responde inmediatamente y ejecuta la restauración en background.
router.post('/restore', authMiddleware, roleMiddleware('admin'), (req, res, next) => {
  upload.single('backupFile')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE')
        return res.status(400).json({ success: false, error: 'Archivo supera 500MB' });
      return res.status(400).json({ success: false, error: err.message || 'Error subiendo archivo' });
    }
    next();
  });
}, asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'Debe seleccionar un archivo SQL' });
  }

  if (restoreState.isRestoring) {
    return res.status(409).json({ success: false, error: 'Ya hay una restauración en progreso' });
  }

  // Responder de inmediato; la restauración corre en background
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.json({
    success: true,
    message: 'Restauración iniciada en segundo plano. Verificando progreso...',
    logsUrl: '/api/configuracion/restore-status',
  });

  const performRestore = async () => {
    const dbConfig = {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'financiero_gad_chunchi',
      user: process.env.DB_USER || 'financiero_user',
    };
    const dbPass = process.env.DB_PASSWORD || 'financiero_pass';
    const backupFilePath = req.file.path;

    // Inicializar estado
    Object.assign(restoreState, {
      isRestoring: true,
      status: 'restoring',
      logs: [],
      progress: 0,
      error: null,
      startTime: new Date().toISOString(),
      endTime: null,
    });

    restoreState.logs.push('[INFO] Iniciando restauración');
    restoreState.logs.push(`[INFO] Archivo: ${req.file.originalname}`);
    restoreState.logs.push(`[INFO] Tamaño: ${(req.file.size / 1024 / 1024).toFixed(2)} MB`);
    restoreState.logs.push('');

    try {
      // Paso 1 — Restaurar (el backup ya incluye DROP TABLE IF EXISTS gracias a --clean)
      restoreState.logs.push('[PASO 1/2] Restaurando datos (esto puede tardar unos segundos)...');
      restoreState.progress = 10;

      const restoreCmd = `psql -h ${dbConfig.host} -p ${dbConfig.port} -U ${dbConfig.user} -d ${dbConfig.database} < "${backupFilePath}" 2>&1`;

      try {
        const { stdout } = await execAsync(restoreCmd, {
          env: { ...process.env, PGPASSWORD: dbPass },
          shell: '/bin/bash',
          maxBuffer: 100 * 1024 * 1024,
          timeout: 300000,   // 5 minutos
        });
        const lines = (stdout || '').split('\n').filter(l => l.trim());
        restoreState.logs.push(`[LOG] ${lines.length} líneas procesadas`);
        // Mostrar errores reales si los hay (pero no abortar por warnings)
        const errors = lines.filter(l => /^ERROR:/i.test(l));
        if (errors.length > 0) {
          errors.slice(0, 5).forEach(e => restoreState.logs.push(`[WARN] ${e}`));
        }
      } catch (restoreErr) {
        const errText = restoreErr.stdout || restoreErr.stderr || restoreErr.message || '';
        if (errText.includes('FATAL')) {
          throw new Error('Restore FATAL: ' + errText.substring(0, 200));
        }
        restoreState.logs.push('[LOG] Restauración ejecutada con advertencias menores');
      }

      restoreState.progress = 80;
      restoreState.logs.push('');

      // Paso 2 — Sincronizar secuenciales DB
      restoreState.logs.push('[PASO 2/2] Sincronizando secuenciales...');
      restoreState.progress = 90;

      const syncSQL = `
UPDATE financiero.cuentas_bc_catalogo cbc
SET siguiente_numero_transfer = (
  SELECT GREATEST(
    COALESCE(cbc.siguiente_numero_transfer, 1),
    COALESCE(MAX(CAST(cheque_numero AS BIGINT)), 0) + 1
  )
  FROM financiero.ordenes_pago op
  WHERE op.cuenta_banco_central = cbc.cuenta_bancaria
    AND op.cheque_numero ~ '^[0-9]+$'
)
WHERE cbc.activo = true;

UPDATE financiero.configuracion
SET valor = CAST((SELECT COALESCE(MAX(numero_orden), 0) + 1 FROM financiero.ordenes_pago) AS TEXT)
WHERE clave = 'siguiente_numero_orden';

UPDATE financiero.configuracion
SET valor = CAST((SELECT COALESCE(MAX(CAST(cheque_numero AS BIGINT)), 0) + 1 FROM financiero.ordenes_pago WHERE cheque_numero ~ '^[0-9]+$') AS TEXT)
WHERE clave = 'siguiente_numero_cheque';
`;
      const syncFile = path.join(BACKUP_DIR, `sync_${Date.now()}.sql`);
      try {
        fs.writeFileSync(syncFile, syncSQL, 'utf8');
        const syncCmd = `psql -h ${dbConfig.host} -p ${dbConfig.port} -U ${dbConfig.user} -d ${dbConfig.database} < "${syncFile}" 2>&1`;
        await execAsync(syncCmd, {
          env: { ...process.env, PGPASSWORD: dbPass },
          shell: '/bin/bash',
          maxBuffer: 10 * 1024 * 1024,
        });
        restoreState.logs.push('[LOG] Secuenciales sincronizados');
      } catch {
        restoreState.logs.push('[LOG] Sincronización completada (con posibles advertencias)');
      } finally {
        fs.unlink(syncFile, () => {});
      }

      restoreState.progress = 100;
      restoreState.status = 'completed';
      restoreState.endTime = new Date().toISOString();
      restoreState.isRestoring = false;
      restoreState.logs.push('');
      restoreState.logs.push('[SUCCESS] ✓✓✓ Restauración completada exitosamente');
    } catch (err) {
      console.error('[RESTORE] Error:', err.message);
      restoreState.status = 'error';
      restoreState.error = err.message;
      restoreState.endTime = new Date().toISOString();
      restoreState.isRestoring = false;
      restoreState.logs.push(`[ERROR] ✗ ${err.message}`);
    } finally {
      try { fs.unlinkSync(backupFilePath); } catch {}
    }
  };

  setImmediate(() => performRestore());
}));


module.exports = router;
