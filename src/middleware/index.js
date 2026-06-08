'use strict';

const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const {
  httpRequestDuration,
  httpRequestTotal,
  httpErrorsTotal,
  simulatedFailuresTotal,
} = require('../utils/metrics');

// ─── TraceId ──────────────────────────────────────────────────────────────────
// Injeta um ID de rastreio em cada request — compatível com o que
// o OpenTelemetry vai usar futuramente via W3C TraceContext.

function traceIdMiddleware(req, res, next) {
  req.traceId = req.headers['x-trace-id'] || uuidv4();
  res.setHeader('x-trace-id', req.traceId);
  next();
}

// ─── Request Logger + Métricas HTTP ──────────────────────────────────────────

function requestLogger(req, res, next) {
  const start = Date.now();

  res.on('finish', () => {
    const durationSec = (Date.now() - start) / 1000;
    const route = req.route?.path || req.path;
    const labels = {
      method: req.method,
      route,
      status_code: String(res.statusCode),
    };

    httpRequestDuration.observe(labels, durationSec);
    httpRequestTotal.inc(labels);

    if (res.statusCode >= 400) {
      httpErrorsTotal.inc(labels);
    }

    const logLevel = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    logger[logLevel](`${req.method} ${req.originalUrl} → ${res.statusCode}`, {
      traceId: req.traceId,
      durationMs: Math.round(durationSec * 1000),
      statusCode: res.statusCode,
      userAgent: req.headers['user-agent'],
    });
  });

  next();
}

// ─── Simulação de Falhas (Chaos Engineering) ─────────────────────────────────
// Ativa via variável de ambiente FAILURE_MODE.
// Projetado para ser ligado/desligado sem redeploy — útil para demos e SRE drills.

const FAILURE_MODE = process.env.FAILURE_MODE;
const FAILURE_RATE = parseFloat(process.env.FAILURE_RATE || '0.5');

function chaosMiddleware(req, res, next) {
  // Nunca injeta falha nos endpoints de monitoramento
  const isMonitoring = ['/health', '/ready', '/metrics'].includes(req.path);
  if (!FAILURE_MODE || isMonitoring) return next();

  if (Math.random() > FAILURE_RATE) return next();

  simulatedFailuresTotal.inc({ type: FAILURE_MODE });

  switch (FAILURE_MODE) {
    case 'latency': {
      const delay = Math.floor(Math.random() * 3000) + 500; // 500ms – 3500ms
      logger.warn('[CHAOS] Latência artificial injetada', { delayMs: delay, traceId: req.traceId });
      return setTimeout(() => next(), delay);
    }

    case 'db_error': {
      logger.warn('[CHAOS] Erro de banco simulado', { traceId: req.traceId });
      return next(Object.assign(new Error('Conexão com o banco de dados recusada (simulado)'), { statusCode: 503 }));
    }

    case 'panic': {
      logger.error('[CHAOS] Crash simulado — a aplicação será encerrada', { traceId: req.traceId });
      setTimeout(() => process.exit(1), 200);
      return next(Object.assign(new Error('Falha crítica da aplicação (simulada)'), { statusCode: 500 }));
    }

    case 'timeout': {
      logger.warn('[CHAOS] Timeout simulado — request não será respondida', { traceId: req.traceId });
      // Não chama next() → a request fica pendurada até o cliente dar timeout
      return;
    }

    default:
      return next();
  }
}

// ─── Not Found ────────────────────────────────────────────────────────────────

function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: `Rota não encontrada: ${req.method} ${req.path}`,
  });
}

// ─── Error Handler ────────────────────────────────────────────────────────────

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || 500;
  const message = statusCode < 500 ? err.message : 'Erro interno do servidor';

  if (statusCode >= 500) {
    logger.error('Erro não tratado', {
      traceId: req.traceId,
      error: err.message,
      stack: err.stack,
    });
  }

  res.status(statusCode).json({ success: false, error: message, traceId: req.traceId });
}

module.exports = {
  traceIdMiddleware,
  requestLogger,
  chaosMiddleware,
  notFoundHandler,
  errorHandler,
};
