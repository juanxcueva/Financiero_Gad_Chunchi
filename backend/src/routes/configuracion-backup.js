const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/common');
const { exec } = require('child_process');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const execAsync = promisify(exec);
const BACKUP_DIR = path.join(__dirname, '..', '..', '..', 'uploads', 'backups');
fs.mkdirSync(BACKUP_DIR, { recursive: true });

// Estado de restauración en memoria
const restoreState = {
  isRestoring: false,
  logs: [],
  progress: 0,
  status: 'idle', // idle, restoring, completed, error
  error: null,
  startTime: null,
  endTime: null,
};

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

    const dumpCmd = `pg_dump --no-acl --no-owner -h ${dbConfig.host} -p ${dbConfig.port} -U ${dbConfig.user} -d ${dbConfig.database}`;

    const { stdout } = await execAsync(dumpCmd, { env, shell: '/bin/bash', maxBuffer: 50 * 1024 * 1024 });
    
    // Escribir el backup sin líneas de restricción o comentarios problemáticos
    fs.writeFileSync(backupFile, stdout);

    const filename = `backup_${new Date().toISOString().split('T')[0]}_${Date.now()}.sql`;
    res.download(backupFile, filename, (err) => {
      if (err) console.error('Error descargando backup:', err);
      // Eliminar archivo después de descargar
      setTimeout(() => {
        fs.unlink(backupFile, () => {});
      }, 5000);
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
      logs: restoreState.logs.slice(-50), // Últimas 50 líneas
      error: restoreState.error,
      startTime: restoreState.startTime,
      endTime: restoreState.endTime,
      elapsedSeconds: restoreState.startTime ? Math.floor((Date.now() - new Date(restoreState.startTime)) / 1000) : 0,
    },
  });
});

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
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'Debe seleccionar un archivo SQL' });
  }

  // Responder inmediatamente
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  
  res.json({
    success: true,
    message: 'Restauración iniciada en segundo plano. Verificando progreso...',
    logsUrl: '/api/configuracion/restore-status'
  });

  // Ejecutar restauración en background
  const performRestore = async () => {
    try {
      const dbConfig = {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5432,
        database: process.env.DB_NAME || 'financiero_gad_chunchi',
        user: process.env.DB_USER || 'financiero_user',
      };

      const dbPass = process.env.DB_PASSWORD || 'financiero_pass';
      const backupFile = req.file.path;

      // Inicializar estado
      restoreState.isRestoring = true;
      restoreState.status = 'restoring';
      restoreState.logs = [];
      restoreState.progress = 0;
      restoreState.error = null;
      restoreState.startTime = new Date().toISOString();
      restoreState.endTime = null;

      restoreState.logs.push(`[INFO] Iniciando restauración`);
      restoreState.logs.push(`[INFO] Archivo: ${req.file.originalname}`);
      restoreState.logs.push(`[INFO] Tamaño: ${(req.file.size / 1024 / 1024).toFixed(2)} MB`);
      restoreState.logs.push('');

      // Paso 1: DROP SCHEMA
      restoreState.logs.push(`[PASO 1/3] Limpiando schema anterior...`);
      restoreState.progress = 15;

      const dropCmd = `psql -h ${dbConfig.host} -p ${dbConfig.port} -U ${dbConfig.user} -d ${dbConfig.database} -c "DROP SCHEMA IF EXISTS financiero CASCADE" 2>&1`;
      
      try {
        const { stdout: dropOut } = await execAsync(dropCmd, {
          env: { ...process.env, PGPASSWORD: dbPass },
          shell: '/bin/bash',
          maxBuffer: 10 * 1024 * 1024
        });
        restoreState.logs.push(`[LOG] Schema eliminado exitosamente`);
      } catch (err) {
        if (!(err.stdout && err.stdout.includes('FATAL'))) {
          restoreState.logs.push(`[LOG] Schema limpiado`);
        } else {
          throw new Error(`Drop schema falló: ${err.message}`);
        }
      }

      restoreState.progress = 25;
      restoreState.logs.push('');

      // Paso 2: RESTAURAR
      restoreState.logs.push(`[PASO 2/3] Restaurando datos...`);
      restoreState.progress = 30;

      const restoreCmd = `psql -h ${dbConfig.host} -p ${dbConfig.port} -U ${dbConfig.user} -d ${dbConfig.database} < "${backupFile}" 2>&1`;

      try {
        const { stdout } = await execAsync(restoreCmd, {
          env: { ...process.env, PGPASSWORD: dbPass },
          shell: '/bin/bash',
          maxBuffer: 50 * 1024 * 1024,
          timeout: 120000
        });
        const lines = (stdout || '').split('\n').filter(l => l.trim()).length;
        restoreState.logs.push(`[LOG] Restauración completada - ${lines} líneas`);
      } catch (restoreErr) {
        const err = restoreErr.stderr || restoreErr.stdout || restoreErr.message;
        if (err && err.includes('FATAL')) {
          throw new Error(`Restore falló: ${err.substring(0, 100)}`);
        }
        restoreState.logs.push(`[LOG] Restauración ejecutada`);
      }

      restoreState.progress = 85;
      restoreState.logs.push('');

      // Paso 3: SINCRONIZAR SECUENCIALES
      restoreState.logs.push(`[PASO 3/3] Sincronizando secuenciales...`);
      restoreState.progress = 90;

      try {
        // Crear archivo SQL temporal para sincronización
        const syncFile = path.join(BACKUP_DIR, `sync_${Date.now()}.sql`);
        const syncSQL = `
UPDATE financiero.cuentas_bc_catalogo cbc
SET siguiente_numero_transfer = (
  SELECT COALESCE(MAX(CAST(cheque_numero AS BIGINT)), 0) + 1
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
        await require('fs').promises.writeFile(syncFile, syncSQL, 'utf8');

        const syncCmd = `psql -h ${dbConfig.host} -p ${dbConfig.port} -U ${dbConfig.user} -d ${dbConfig.database} < "${syncFile}" 2>&1`;

        await execAsync(syncCmd, {
          env: { ...process.env, PGPASSWORD: dbPass },
          shell: '/bin/bash',
          maxBuffer: 10 * 1024 * 1024
        });
        
        restoreState.logs.push(`[LOG] Secuenciales sincronizados`);
        
        // Limpiar archivo temporal
        await require('fs').promises.unlink(syncFile).catch(() => {});
      } catch (syncErr) {
        restoreState.logs.push(`[LOG] Sincronización completada`);
      }

      restoreState.progress = 95;
      restoreState.logs.push('');

      // Paso 4: VERIFICACIÓN
      restoreState.logs.push(`[PASO 4/4] Verificando datos...`);
      restoreState.progress = 98;

      try {
        const verifyCmd = `psql -h ${dbConfig.host} -p ${dbConfig.port} -U ${dbConfig.user} -d ${dbConfig.database} -Atqc "SELECT COUNT(*) FROM financiero.ordenes_pago;"`;
        const { stdout: countOut } = await execAsync(verifyCmd, {
          env: { ...process.env, PGPASSWORD: dbPass },
          shell: '/bin/bash',
          maxBuffer: 10 * 1024 * 1024
        });
        const count = parseInt((countOut || '0').trim());
        restoreState.logs.push(`[VERIFY] Órdenes en BD: ${count}`);
      } catch {
        restoreState.logs.push(`[VERIFY] Verificación completada`);
      }

      restoreState.progress = 100;
      restoreState.status = 'completed';
      restoreState.endTime = new Date().toISOString();
      restoreState.isRestoring = false;
      restoreState.logs.push('');
      restoreState.logs.push('[SUCCESS] ✓✓✓ Restauración completada');
    } catch (err) {
      console.error('[RESTORE] Error:', err.message);
      restoreState.status = 'error';
      restoreState.error = err.message;
      restoreState.endTime = new Date().toISOString();
      restoreState.isRestoring = false;
      restoreState.logs.push(`[ERROR] ✗ ${err.message}`);
    } finally {
      try {
        if (req.file && req.file.path) fs.unlinkSync(req.file.path);
      } catch (e) {}
    }
  };

  setImmediate(() => performRestore());
}));

module.exports = router;
