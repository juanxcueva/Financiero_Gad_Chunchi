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

    // Inicializar estado de restauración
    restoreState.isRestoring = true;
    restoreState.status = 'restoring';
    restoreState.logs = [];
    restoreState.progress = 0;
    restoreState.error = null;
    restoreState.startTime = new Date().toISOString();
    restoreState.endTime = null;

    // Crear archivo de restauración con limpieza explícita
    const fsPromise = require('fs').promises;
    const backupContent = await fsPromise.readFile(req.file.path, 'utf8');
    
    // Agregar limpieza al principio del SQL si no existe
    const cleanupSQL = `DROP SCHEMA IF EXISTS financiero CASCADE;\n`;
    const finalSQL = backupContent.includes('DROP SCHEMA') ? backupContent : cleanupSQL + backupContent;
    
    const totalLines = finalSQL.split('\n').length;
    
    const cleanupFile = path.join(BACKUP_DIR, `restore_${Date.now()}.sql`);
    await fsPromise.writeFile(cleanupFile, finalSQL, 'utf8');

    restoreState.logs.push(`[INFO] Archivo backup: ${req.file.originalname || 'backup.sql'}`);
    restoreState.logs.push(`[INFO] Tamaño: ${(req.file.size / 1024 / 1024).toFixed(2)} MB`);
    restoreState.logs.push(`[INFO] Total de líneas: ${totalLines}`);
    restoreState.logs.push(`[INFO] Limpieza y restauración iniciadas...`);
    restoreState.logs.push('');

    // Ejecutar restore con captura de salida
    const { spawn } = require('child_process');
    
    return new Promise((resolve, reject) => {
      const psql = spawn('psql', [
        '-h', dbConfig.host,
        '-p', String(dbConfig.port),
        '-U', dbConfig.user,
        '-d', dbConfig.database,
        '-v', 'ON_ERROR_STOP=1',
        '-f', cleanupFile,
      ], {
        env: { ...process.env, PGPASSWORD: process.env.DB_PASSWORD || '' },
      });

      let lineCount = 0;
      const processOutput = (data, isError = false) => {
        const lines = data.toString().split('\n');
        lines.forEach(line => {
          if (line.trim()) {
            lineCount++;
            const prefix = isError ? '[ERROR]' : '[LOG]';
            restoreState.logs.push(`${prefix} ${line}`);
            restoreState.progress = Math.min(100, Math.floor((lineCount / Math.max(totalLines, 100)) * 100));
          }
        });
      };

      psql.stdout.on('data', (data) => processOutput(data, false));
      psql.stderr.on('data', (data) => processOutput(data, true));

      psql.on('close', async (code) => {
        restoreState.endTime = new Date().toISOString();
        
        // Limpiar archivo temporal
        await fsPromise.unlink(cleanupFile).catch(() => {});
        fs.unlink(req.file.path, () => {});

        if (code === 0) {
          restoreState.status = 'completed';
          restoreState.progress = 100;
          restoreState.logs.push('');
          restoreState.logs.push('[SUCCESS] ✓ Restauración completada exitosamente');
          restoreState.isRestoring = false;

          res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.set('Pragma', 'no-cache');
          res.set('Expires', '0');
          res.json({ 
            success: true, 
            message: 'Base de datos restaurada correctamente. Recargue la página para ver los cambios.',
            logsUrl: '/api/configuracion/restore-status'
          });
          resolve();
        } else {
          restoreState.status = 'error';
          restoreState.error = `Proceso psql finalizó con código ${code}`;
          restoreState.logs.push('');
          restoreState.logs.push(`[ERROR] ✗ Restauración falló con código ${code}`);
          restoreState.isRestoring = false;

          res.status(500).json({ 
            success: false, 
            error: `Error en restauración: ${restoreState.error}`,
            logsUrl: '/api/configuracion/restore-status'
          });
          reject(new Error(`psql exited with code ${code}`));
        }
      });

      psql.on('error', (err) => {
        restoreState.status = 'error';
        restoreState.error = err.message;
        restoreState.endTime = new Date().toISOString();
        restoreState.isRestoring = false;
        restoreState.logs.push(`[ERROR] ${err.message}`);

        res.status(500).json({ 
          success: false, 
          error: `Error ejecutando restauración: ${err.message}`,
          logsUrl: '/api/configuracion/restore-status'
        });
        reject(err);
      });
    });
  } catch (err) {
    console.error('Error restaurando backup:', err.message);
    
    restoreState.status = 'error';
    restoreState.error = err.message;
    restoreState.endTime = new Date().toISOString();
    restoreState.isRestoring = false;
    restoreState.logs.push(`[ERROR] ${err.message}`);
    
    if (req.file) {
      fs.unlink(req.file.path, () => {});
    }
    
    let errorMsg = 'Error restaurando: ' + err.message;
    if (err.message?.includes('ENOENT')) {
      errorMsg = 'Error: Archivo de respaldo no encontrado o acceso denegado';
    }
    
    res.status(500).json({ success: false, error: errorMsg });
  }
}));

module.exports = router;
