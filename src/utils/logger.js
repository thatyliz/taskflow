'use strict';

const { createLogger, format, transports } = require('winston');

const { combine, timestamp, errors, json, colorize, printf } = format;

const isDev = process.env.NODE_ENV !== 'production';

const devFormat = combine(
  colorize(),
  timestamp({ format: 'HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ level, message, timestamp: ts, traceId, ...meta }) => {
    const trace = traceId ? ` [trace:${traceId}]` : '';
    const extras = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${ts} ${level}${trace}: ${message}${extras}`;
  })
);

const prodFormat = combine(
  timestamp(),
  errors({ stack: true }),
  json()
);

const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: isDev ? devFormat : prodFormat,
  defaultMeta: {
    service: 'taskflow',
    version: process.env.APP_VERSION || '1.0.0',
  },
  transports: [new transports.Console()],
});

/**
 * Retorna um child logger enriquecido com traceId e contexto adicional.
 * Usar em cada request para correlacionar logs.
 */
logger.child = (meta = {}) => logger.child(meta);

module.exports = logger;
