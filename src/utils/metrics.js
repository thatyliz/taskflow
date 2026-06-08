'use strict';

const client = require('prom-client');

// Registra métricas padrão do processo (CPU, memória, GC, etc.)
const register = new client.Registry();
client.collectDefaultMetrics({ register, prefix: 'taskflow_' });

// ─── Métricas HTTP ────────────────────────────────────────────────────────────

const httpRequestDuration = new client.Histogram({
  name: 'taskflow_http_request_duration_seconds',
  help: 'Duração das requisições HTTP em segundos',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register],
});

const httpRequestTotal = new client.Counter({
  name: 'taskflow_http_requests_total',
  help: 'Total de requisições HTTP recebidas',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

const httpErrorsTotal = new client.Counter({
  name: 'taskflow_http_errors_total',
  help: 'Total de erros HTTP (4xx e 5xx)',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

// ─── Métricas de Negócio ──────────────────────────────────────────────────────

const tasksCreatedTotal = new client.Counter({
  name: 'taskflow_tasks_created_total',
  help: 'Total de tarefas criadas',
  labelNames: ['priority'],
  registers: [register],
});

const tasksCompletedTotal = new client.Counter({
  name: 'taskflow_tasks_completed_total',
  help: 'Total de tarefas concluídas',
  labelNames: ['priority'],
  registers: [register],
});

const tasksDeletedTotal = new client.Counter({
  name: 'taskflow_tasks_deleted_total',
  help: 'Total de tarefas deletadas',
  registers: [register],
});

const activeTasksGauge = new client.Gauge({
  name: 'taskflow_active_tasks',
  help: 'Número atual de tarefas não concluídas',
  registers: [register],
});

const tasksByPriorityGauge = new client.Gauge({
  name: 'taskflow_tasks_by_priority',
  help: 'Número de tarefas agrupadas por prioridade',
  labelNames: ['priority'],
  registers: [register],
});

// ─── Métricas de Banco de Dados ───────────────────────────────────────────────

const dbQueryDuration = new client.Histogram({
  name: 'taskflow_db_query_duration_seconds',
  help: 'Duração das queries no banco de dados',
  labelNames: ['operation', 'table'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
  registers: [register],
});

const dbErrorsTotal = new client.Counter({
  name: 'taskflow_db_errors_total',
  help: 'Total de erros no banco de dados',
  labelNames: ['operation'],
  registers: [register],
});

const dbPoolSize = new client.Gauge({
  name: 'taskflow_db_pool_size',
  help: 'Tamanho atual do pool de conexões do banco',
  labelNames: ['state'],
  registers: [register],
});

// ─── Métricas de Falhas Simuladas ─────────────────────────────────────────────

const simulatedFailuresTotal = new client.Counter({
  name: 'taskflow_simulated_failures_total',
  help: 'Total de falhas injetadas intencionalmente (chaos)',
  labelNames: ['type'],
  registers: [register],
});

module.exports = {
  register,
  httpRequestDuration,
  httpRequestTotal,
  httpErrorsTotal,
  tasksCreatedTotal,
  tasksCompletedTotal,
  tasksDeletedTotal,
  activeTasksGauge,
  tasksByPriorityGauge,
  dbQueryDuration,
  dbErrorsTotal,
  dbPoolSize,
  simulatedFailuresTotal,
};
