const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const { logger } = require('../utils/logger');

function isAdminRequest(req) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return false;

  const token = auth.slice(7);
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return decoded && decoded.rol === 'admin';
  } catch {
    return false;
  }
}

// Rate limit para login (5 intentos por IP en 15 minutos)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Demasiados intentos de login, intente más tarde',
  standardHeaders: false,
  skip: (req) => {
    // Log de attempts
    logger.warn(`Login attempt from ${req.ip}`);
    return false;
  },
});

// Rate limit general para API (100 requests por IP en 15 minutos)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.API_RATE_LIMIT_MAX || '600', 10),
  standardHeaders: false,
  skip: (req) => process.env.NODE_ENV === 'development' || isAdminRequest(req),
});

// Rate limit para generación de documentos (evita saturación de Puppeteer)
// 10 requests por IP en 1 minuto
const documentLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: parseInt(process.env.DOCUMENT_RATE_LIMIT_MAX || '60', 10),
  message: 'Demasiadas solicitudes de generación de documentos',
  standardHeaders: false,
  skip: (req) => process.env.NODE_ENV === 'development' || isAdminRequest(req),
});

// Middleware de error manejador global (NO derriba el servidor)
function globalErrorHandler(err, req, res, next) {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Error desconocido';

  logger.error({
    statusCode,
    message,
    stack: err.stack,
    method: req.method,
    path: req.path,
    ip: req.ip,
  });

  // Nunca expongas detalles de error en producción
  const errorResponse = {
    success: false,
    error: process.env.NODE_ENV === 'production' 
      ? 'Error interno del servidor' 
      : message,
  };

  // Si ya respondió, no responder de nuevo
  if (res.headersSent) {
    return next(err);
  }

  res.status(statusCode).json(errorResponse);
}

// Middleware de timeout para operaciones largas (evita que se cuelgue)
function operationTimeout(ms = 30000) {
  return (req, res, next) => {
    // Uploads grandes se procesan en background; no cortar durante transferencia.
    if ((req.originalUrl || '').startsWith('/api/migracion/access/upload')) {
      return next();
    }

    const timeout = setTimeout(() => {
      if (!res.headersSent) {
        logger.warn(`Request timeout: ${req.method} ${req.path} after ${ms}ms`);
        res.status(408).json({
          success: false,
          error: 'Operación excedió tiempo máximo',
        });
      }
    }, ms);

    // Limpiar timeout cuando responda
    res.on('finish', () => clearTimeout(timeout));
    res.on('close', () => clearTimeout(timeout));

    next();
  };
}

// Middleware para capturar requests sin manejo de ruta
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = {
  loginLimiter,
  apiLimiter,
  documentLimiter,
  globalErrorHandler,
  operationTimeout,
  asyncHandler,
};
