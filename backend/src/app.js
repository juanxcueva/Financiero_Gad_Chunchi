require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const { logger, httpLogger } = require('./utils/logger');
const { globalErrorHandler, operationTimeout, loginLimiter, apiLimiter, documentLimiter } = require('./middleware/common');

const app = express();

// Middlewares de seguridad y observabilidad
app.use(httpLogger);
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(operationTimeout(30000)); // Timeout global de 30 segundos
app.use(apiLimiter);

// Servir logo desde carpeta específica (no todo el repo)
app.use('/static', express.static(path.join(__dirname, '..', '..'), {
  maxAge: '1d',
  etag: false,
  dotfiles: 'deny', // No servir archivos ocultos
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'public, max-age=86400');
  },
}));

// Routes
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth', require('./routes/auth'));
app.use('/api/ordenes-pago', require('./routes/ordenes-pago'));
app.use('/api/beneficiarios', require('./routes/beneficiarios'));
app.use('/api/configuracion', require('./routes/configuracion'));
app.use('/api/auditoria', require('./routes/auditoria'));
app.use('/api/documentos', documentLimiter, require('./routes/documentos'));
app.use('/api/migracion', require('./routes/migracion'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Servir frontend en producción
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '..', '..', 'frontend', 'dist')));
  app.use((req, res) => {
    res.sendFile(path.join(__dirname, '..', '..', 'frontend', 'dist', 'index.html'));
  });
}

// 404 - No dejar sin respuesta
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Ruta no encontrada' });
});

// Error handler global (DEBE ser el último)
app.use(globalErrorHandler);

const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => {
  logger.info(`
🏛️  Sistema Financiero GAD Chunchi
   Servidor: http://localhost:${PORT}
   API:      http://localhost:${PORT}/api/health
   Entorno:  ${process.env.NODE_ENV || 'development'}
  `);
});

// Manejo de errores no capturados (evita que derribe todo)
process.on('uncaughtException', (err) => {
  logger.error({ err }, 'uncaughtException');
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error({ reason, promise }, 'unhandledRejection');
});
