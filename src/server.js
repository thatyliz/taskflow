'use strict';

require('dotenv').config();
require('express-async-errors');

const express = require('express');
const helmet  = require('helmet');
const cors    = require('cors');
const compression = require('compression');
const path    = require('path');

const logger  = require('./utils/logger');
const { taskRouter, monitorRouter } = require('./routes/index');
const {
  traceIdMiddleware,
  requestLogger,
  chaosMiddleware,
  notFoundHandler,
  errorHandler,
} = require('./middleware/index');

const app  = express();
const PORT = Number(process.env.PORT) || 3000;

// ─── Segurança & Utilitários ──────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false })); // CSP desligado para simplificar UI inline
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// ─── Observabilidade ──────────────────────────────────────────────────────────
app.use(traceIdMiddleware);
app.use(requestLogger);

// ─── Chaos Engineering ────────────────────────────────────────────────────────
app.use(chaosMiddleware);

// ─── Rotas ────────────────────────────────────────────────────────────────────
app.use('/api/tasks', taskRouter);
app.use('/', monitorRouter);

// SPA fallback — serve index.html para qualquer rota não-API
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ─── Error Handling ───────────────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

// ─── Graceful Shutdown ────────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
  logger.info(`TaskFlow iniciado`, {
    port: PORT,
    env: process.env.NODE_ENV || 'development',
    version: process.env.APP_VERSION || '1.0.0',
    failureMode: process.env.FAILURE_MODE || 'nenhum',
  });
});

function shutdown(signal) {
  logger.info(`Sinal ${signal} recebido — iniciando shutdown gracioso`);
  server.close(() => {
    logger.info('Servidor HTTP encerrado');
    process.exit(0);
  });

  // Força encerramento após 10s se o servidor travar
  setTimeout(() => {
    logger.error('Timeout de shutdown — forçando encerramento');
    process.exit(1);
  }, 10_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error('UnhandledRejection', { reason: String(reason) });
});

process.on('uncaughtException', (err) => {
  logger.error('UncaughtException — encerrando', { error: err.message, stack: err.stack });
  process.exit(1);
});

module.exports = app;
