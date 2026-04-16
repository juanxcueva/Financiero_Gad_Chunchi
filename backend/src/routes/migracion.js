const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { spawn } = require('child_process');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');

const router = express.Router();

const ROOT_DIR = path.join(__dirname, '..', '..', '..');
const UPLOAD_DIR = path.join(ROOT_DIR, 'uploads', 'access');
const IMPORT_SCRIPT = path.join(ROOT_DIR, 'database', 'migracion_completa.sh');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_EXTENSIONS = new Set(['.mdb', '.accdb']);
const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, `${Date.now()}_${safeName}`);
    },
  }),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return cb(new Error('Solo se permiten archivos .mdb o .accdb'));
    }
    cb(null, true);
  },
});

const migrationState = {
  current: null,
  last: null,
};

function nowIso() {
  return new Date().toISOString();
}

function trimLog(log, maxLength = 12000) {
  if (!log) return '';
  if (log.length <= maxLength) return log;
  return log.slice(log.length - maxLength);
}

function ensureProgress(job) {
  if (!job.progress) {
    job.progress = {
      stage: 'iniciando',
      percent: 0,
      totalRows: null,
      insertedRows: 0,
      errors: 0,
    };
  }
}

function updateProgressFromLine(job, line) {
  ensureProgress(job);

  const progressMatch = line.match(/PROGRESS\s+total=(\d+)\s+inserted=(\d+)\s+stage=([a-z_]+)/i);
  if (progressMatch) {
    const totalRows = parseInt(progressMatch[1], 10) || 0;
    const insertedRows = parseInt(progressMatch[2], 10) || 0;
    const stage = progressMatch[3] || 'migrando';
    job.progress.totalRows = totalRows;
    job.progress.insertedRows = insertedRows;
    job.progress.stage = stage;
    job.progress.percent = totalRows > 0
      ? Math.max(0, Math.min(100, Math.round((insertedRows / totalRows) * 100)))
      : (stage === 'completed' ? 100 : job.progress.percent);
    return;
  }

  const totalMatch = line.match(/Registros en CSV:\s*(\d+)/i);
  if (totalMatch) {
    job.progress.totalRows = parseInt(totalMatch[1], 10) || 0;
    job.progress.stage = 'leyendo_csv';
    if (job.progress.percent < 5) job.progress.percent = 5;
  }

  const insertedMatch = line.match(/Progreso:\s*(\d+)\s*registros insertados/i);
  if (insertedMatch) {
    const insertedRows = parseInt(insertedMatch[1], 10) || 0;
    job.progress.insertedRows = insertedRows;
    job.progress.stage = 'migrando';
    if (job.progress.totalRows && job.progress.totalRows > 0) {
      job.progress.percent = Math.max(0, Math.min(100, Math.round((insertedRows / job.progress.totalRows) * 100)));
    }
  }

  const errorsMatch = line.match(/Errores:\s*(\d+)/i);
  if (errorsMatch) {
    job.progress.errors = parseInt(errorsMatch[1], 10) || 0;
  }

  if (/Migración completada/i.test(line)) {
    job.progress.stage = 'completed';
    job.progress.percent = 100;
  }
}

function ingestChunk(job, chunk) {
  ensureProgress(job);
  const text = chunk.toString();
  job.output = trimLog(`${job.output}${text}`);
  job._lineBuffer = `${job._lineBuffer || ''}${text}`;

  const lines = job._lineBuffer.split(/\r?\n/);
  job._lineBuffer = lines.pop() || '';
  for (const line of lines) {
    updateProgressFromLine(job, line.trim());
  }
}

router.get('/access/status', authMiddleware, roleMiddleware('admin'), (req, res) => {
  res.json({
    success: true,
    data: {
      current: migrationState.current,
      last: migrationState.last,
    },
  });
});

router.post('/access/upload', authMiddleware, roleMiddleware('admin'), (req, res, next) => {
  upload.single('accessFile')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ success: false, error: 'Archivo supera 500MB' });
      }
      return res.status(400).json({ success: false, error: err.message || 'Error subiendo archivo' });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Debe seleccionar un archivo Access' });
    }

    if (migrationState.current && (migrationState.current.status === 'queued' || migrationState.current.status === 'running')) {
      fs.unlink(req.file.path, () => {});
      return res.status(409).json({ success: false, error: 'Ya existe una migración en curso' });
    }

    const jobId = `job_${Date.now()}`;
    const job = {
      id: jobId,
      fileName: req.file.originalname,
      filePath: req.file.path,
      fileSize: req.file.size,
      status: 'queued',
      startedAt: nowIso(),
      finishedAt: null,
      exitCode: null,
      error: null,
      output: '',
      _lineBuffer: '',
      progress: {
        stage: 'queued',
        percent: 0,
        totalRows: null,
        insertedRows: 0,
        errors: 0,
      },
    };

    migrationState.current = job;

    const child = spawn('bash', [IMPORT_SCRIPT, req.file.path], {
      cwd: ROOT_DIR,
      env: process.env,
    });

    job.status = 'running';
    job.progress.stage = 'running';
    job.progress.percent = 3;

    child.stdout.on('data', (chunk) => {
      ingestChunk(job, chunk);
    });

    child.stderr.on('data', (chunk) => {
      ingestChunk(job, chunk);
    });

    child.on('error', (error) => {
      job.status = 'error';
      job.error = error.message;
      job.progress.stage = 'error';
      job.finishedAt = nowIso();
      migrationState.last = { ...job, _lineBuffer: undefined };
      migrationState.current = null;
    });

    child.on('close', (code) => {
      job.exitCode = code;
      job.status = code === 0 ? 'completed' : 'error';
      if (code !== 0 && !job.error) {
        job.error = `Proceso finalizó con código ${code}`;
      }
      job.progress.stage = code === 0 ? 'completed' : 'error';
      if (code === 0) {
        job.progress.percent = 100;
      }
      job.finishedAt = nowIso();
      migrationState.last = { ...job, _lineBuffer: undefined };
      migrationState.current = null;
    });

    res.status(202).json({
      success: true,
      message: 'Archivo recibido, migración iniciada en segundo plano',
      data: {
        jobId,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        status: job.status,
      },
    });
  });
});

module.exports = router;
