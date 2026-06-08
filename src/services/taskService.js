'use strict';

const repo = require('../repositories/taskRepository');
const logger = require('../utils/logger');
const {
  tasksCreatedTotal,
  tasksCompletedTotal,
  tasksDeletedTotal,
  activeTasksGauge,
  tasksByPriorityGauge,
} = require('../utils/metrics');

// ─── Atualiza os gauges de negócio no Prometheus ──────────────────────────────
async function refreshBusinessGauges() {
  try {
    const rows = await repo.stats();

    let activeTasks = 0;
    const priorityMap = { low: 0, medium: 0, high: 0 };

    for (const row of rows) {
      const total = Number(row.total);
      if (row.status !== 'done') {
        activeTasks += total;
        if (priorityMap[row.priority] !== undefined) {
          priorityMap[row.priority] += total;
        }
      }
    }

    activeTasksGauge.set(activeTasks);
    Object.entries(priorityMap).forEach(([priority, val]) => {
      tasksByPriorityGauge.set({ priority }, val);
    });
  } catch (err) {
    logger.warn('Não foi possível atualizar gauges de negócio', { error: err.message });
  }
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

async function listTasks(filters) {
  logger.info('Listando tarefas', { filters });
  const [rows, total] = await Promise.all([
    repo.findAll(filters),
    repo.count(filters),
  ]);
  return { tasks: rows, total, limit: filters.limit || 50, offset: filters.offset || 0 };
}

async function getTask(id) {
  logger.info('Buscando tarefa', { id });
  const task = await repo.findById(id);
  if (!task) {
    const err = new Error(`Tarefa ${id} não encontrada`);
    err.statusCode = 404;
    throw err;
  }
  return task;
}

async function createTask(data, traceId) {
  logger.info('Criando nova tarefa', { title: data.title, priority: data.priority, traceId });

  validateTaskData(data);

  const task = await repo.create(data);

  tasksCreatedTotal.inc({ priority: task.priority });
  logger.info('Tarefa criada com sucesso', { id: task.id, priority: task.priority, traceId });

  await refreshBusinessGauges();
  return task;
}

async function updateTask(id, data, traceId) {
  logger.info('Atualizando tarefa', { id, fields: Object.keys(data), traceId });

  const existing = await repo.findById(id);
  if (!existing) {
    const err = new Error(`Tarefa ${id} não encontrada`);
    err.statusCode = 404;
    throw err;
  }

  if (data.status) validateStatus(data.status);
  if (data.priority) validatePriority(data.priority);

  const updated = await repo.update(id, data);

  // Contabiliza conclusões de tarefa
  if (data.status === 'done' && existing.status !== 'done') {
    tasksCompletedTotal.inc({ priority: updated.priority });
    logger.info('Tarefa marcada como concluída', { id, traceId });
  }

  await refreshBusinessGauges();
  return updated;
}

async function deleteTask(id, traceId) {
  logger.info('Deletando tarefa', { id, traceId });

  const existing = await repo.findById(id);
  if (!existing) {
    const err = new Error(`Tarefa ${id} não encontrada`);
    err.statusCode = 404;
    throw err;
  }

  await repo.remove(id);

  tasksDeletedTotal.inc();
  logger.info('Tarefa deletada', { id, traceId });

  await refreshBusinessGauges();
  return { deleted: true, id };
}

async function getStats() {
  const rows = await repo.stats();
  const summary = { total: 0, by_status: {}, by_priority: {} };

  for (const row of rows) {
    const n = Number(row.total);
    summary.total += n;
    summary.by_status[row.status] = (summary.by_status[row.status] || 0) + n;
    summary.by_priority[row.priority] = (summary.by_priority[row.priority] || 0) + n;
  }

  return summary;
}

// ─── Validações ───────────────────────────────────────────────────────────────

function validateTaskData({ title }) {
  if (!title || typeof title !== 'string' || title.trim().length < 3) {
    const err = new Error('O campo "title" é obrigatório e deve ter pelo menos 3 caracteres');
    err.statusCode = 400;
    throw err;
  }
}

function validateStatus(status) {
  const valid = ['pending', 'in_progress', 'done'];
  if (!valid.includes(status)) {
    const err = new Error(`Status inválido. Valores aceitos: ${valid.join(', ')}`);
    err.statusCode = 400;
    throw err;
  }
}

function validatePriority(priority) {
  const valid = ['low', 'medium', 'high'];
  if (!valid.includes(priority)) {
    const err = new Error(`Prioridade inválida. Valores aceitos: ${valid.join(', ')}`);
    err.statusCode = 400;
    throw err;
  }
}

module.exports = { listTasks, getTask, createTask, updateTask, deleteTask, getStats };
