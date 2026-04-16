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

    // Limpiar primero: DROP SCHEMA financiero CASCADE (esto elimina todos los datos)
    const dropCmd = `psql -h ${dbConfig.host} -p ${dbConfig.port} -U ${dbConfig.user} -d ${dbConfig.database} -v ON_ERROR_STOP=1 -c "DROP SCHEMA IF EXISTS financiero CASCADE"`;
    await execAsync(dropCmd, { env, shell: '/bin/bash', maxBuffer: 50 * 1024 * 1024 });

    // Ejecutar restore
    const restoreCmd = `psql -h ${dbConfig.host} -p ${dbConfig.port} -U ${dbConfig.user} -d ${dbConfig.database} -v ON_ERROR_STOP=1 < "${req.file.path}"`;

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
