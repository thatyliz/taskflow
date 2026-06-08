'use strict';

const service = require('../services/taskService');
const logger = require('../utils/logger');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ok(res, data, statusCode = 200) {
  return res.status(statusCode).json({ success: true, data });
}

function fail(res, message, statusCode = 500) {
  return res.status(statusCode).json({ success: false, error: message });
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function listTasks(req, res) {
  const { status, priority, limit = 50, offset = 0 } = req.query;
  const result = await service.listTasks({
    status,
    priority,
    limit: Number(limit),
    offset: Number(offset),
  });
  return ok(res, result);
}

async function getTask(req, res) {
  const task = await service.getTask(req.params.id);
  return ok(res, task);
}

async function createTask(req, res) {
  const task = await service.createTask(req.body, req.traceId);
  logger.info('POST /tasks → tarefa criada', { id: task.id, traceId: req.traceId });
  return ok(res, task, 201);
}

async function updateTask(req, res) {
  const task = await service.updateTask(req.params.id, req.body, req.traceId);
  return ok(res, task);
}

async function deleteTask(req, res) {
  const result = await service.deleteTask(req.params.id, req.traceId);
  return ok(res, result);
}

async function getStats(req, res) {
  const stats = await service.getStats();
  return ok(res, stats);
}

module.exports = { listTasks, getTask, createTask, updateTask, deleteTask, getStats };
