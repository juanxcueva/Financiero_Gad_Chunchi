const pino = require('pino');
const pinoHttp = require('pino-http');

// Logger principal
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
    },
  },
});

// Logger HTTP (integración Express)
const httpLogger = pinoHttp({
  logger,
  // Solo log requests en debug
  autoLogging: process.env.LOG_LEVEL === 'debug',
});

// Funciones helpers para métricas de documentos
function logDocumentMetric(metric, data) {
  logger.info({
    type: 'document_metric',
    metric,
    ...data,
    timestamp: new Date().toISOString(),
  });
}

module.exports = {
  logger,
  httpLogger,
  logDocumentMetric,
};
