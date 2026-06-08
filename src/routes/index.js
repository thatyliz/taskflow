'use strict';

const { Router } = require('express');
const taskController = require('../controllers/taskController');
const { testConnection } = require('../config/database');
const { register } = require('../utils/metrics');
const logger = require('../utils/logger');

// ─── Tarefas ──────────────────────────────────────────────────────────────────

const taskRouter = Router();

taskRouter.get('/',        taskController.listTasks);   // GET    /api/tasks
taskRouter.get('/stats',   taskController.getStats);    // GET    /api/tasks/stats
taskRouter.get('/:id',     taskController.getTask);     // GET    /api/tasks/:id
taskRouter.post('/',       taskController.createTask);  // POST   /api/tasks
taskRouter.patch('/:id',   taskController.updateTask);  // PATCH  /api/tasks/:id
taskRouter.delete('/:id',  taskController.deleteTask);  // DELETE /api/tasks/:id

// ─── Monitoramento ────────────────────────────────────────────────────────────

const monitorRouter = Router();

/**
 * GET /health
 * Verifica conectividade com o banco.
 * Usado pelo Docker HEALTHCHECK e pelo Kubernetes liveness probe.
 */
monitorRouter.get('/health', async (req, res) => {
  try {
    const dbTime = await testConnection();
    logger.debug('Health check OK', { dbTime });
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      db: { status: 'connected', serverTime: dbTime },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error('Health check FALHOU', { error: err.message });
    res.status(503).json({
      status: 'degraded',
      error: err.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /ready
 * Readiness probe — indica se a aplicação está pronta para receber tráfego.
 * Diferente do /health: pode retornar 503 durante inicialização ou draining.
 */
monitorRouter.get('/ready', async (req, res) => {
  try {
    await testConnection();
    res.json({ status: 'ready' });
  } catch {
    res.status(503).json({ status: 'not_ready', reason: 'database_unavailable' });
  }
});

/**
 * GET /metrics
 * Expõe métricas no formato Prometheus text/plain.
 * Scrape por: Prometheus, Grafana Agent, OpenTelemetry Collector.
 */
monitorRouter.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

/**
 * GET /info
 * Informações da aplicação — versão, ambiente, uptime.
 */
monitorRouter.get('/info', (req, res) => {
  res.json({
    name: 'taskflow',
    version: process.env.APP_VERSION || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    uptime: process.uptime(),
    nodeVersion: process.version,
    pid: process.pid,
    failureMode: process.env.FAILURE_MODE || 'none',
  });
});

module.exports = { taskRouter, monitorRouter };
