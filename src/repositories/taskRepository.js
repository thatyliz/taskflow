'use strict';

const { query } = require('../config/database');
const { dbQueryDuration } = require('../utils/metrics');

const TABLE = 'tasks';

/**
 * Repositório de tarefas — única camada que fala com o banco.
 * Todos os métodos registram duração no Prometheus para futura
 * integração com OpenTelemetry via span bridging.
 */

async function findAll({ status, priority, limit = 50, offset = 0 } = {}) {
  const end = dbQueryDuration.startTimer({ operation: 'select', table: TABLE });

  const conditions = [];
  const params = [];

  if (status) {
    params.push(status);
    conditions.push(`status = $${params.length}`);
  }
  if (priority) {
    params.push(priority);
    conditions.push(`priority = $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit, offset);

  const sql = `
    SELECT id, title, description, status, priority, due_date, created_at, updated_at
    FROM ${TABLE}
    ${where}
    ORDER BY created_at DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `;

  const result = await query(sql, params, { operation: 'select', table: TABLE });
  end();
  return result.rows;
}

async function count({ status, priority } = {}) {
  const end = dbQueryDuration.startTimer({ operation: 'count', table: TABLE });

  const conditions = [];
  const params = [];

  if (status) {
    params.push(status);
    conditions.push(`status = $${params.length}`);
  }
  if (priority) {
    params.push(priority);
    conditions.push(`priority = $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `SELECT COUNT(*) AS total FROM ${TABLE} ${where}`;

  const result = await query(sql, params, { operation: 'count', table: TABLE });
  end();
  return Number(result.rows[0].total);
}

async function findById(id) {
  const end = dbQueryDuration.startTimer({ operation: 'select_one', table: TABLE });
  const result = await query(
    `SELECT * FROM ${TABLE} WHERE id = $1`,
    [id],
    { operation: 'select_one', table: TABLE }
  );
  end();
  return result.rows[0] || null;
}

async function create({ title, description, priority, due_date }) {
  const end = dbQueryDuration.startTimer({ operation: 'insert', table: TABLE });
  const result = await query(
    `INSERT INTO ${TABLE} (title, description, priority, due_date)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [title, description || null, priority || 'medium', due_date || null],
    { operation: 'insert', table: TABLE }
  );
  end();
  return result.rows[0];
}

async function update(id, { title, description, status, priority, due_date }) {
  const end = dbQueryDuration.startTimer({ operation: 'update', table: TABLE });

  const fields = [];
  const params = [];

  if (title !== undefined) { params.push(title); fields.push(`title = $${params.length}`); }
  if (description !== undefined) { params.push(description); fields.push(`description = $${params.length}`); }
  if (status !== undefined) { params.push(status); fields.push(`status = $${params.length}`); }
  if (priority !== undefined) { params.push(priority); fields.push(`priority = $${params.length}`); }
  if (due_date !== undefined) { params.push(due_date); fields.push(`due_date = $${params.length}`); }

  if (!fields.length) return null;

  params.push(id);
  const sql = `UPDATE ${TABLE} SET ${fields.join(', ')} WHERE id = $${params.length} RETURNING *`;
  const result = await query(sql, params, { operation: 'update', table: TABLE });
  end();
  return result.rows[0] || null;
}

async function remove(id) {
  const end = dbQueryDuration.startTimer({ operation: 'delete', table: TABLE });
  const result = await query(
    `DELETE FROM ${TABLE} WHERE id = $1 RETURNING id`,
    [id],
    { operation: 'delete', table: TABLE }
  );
  end();
  return result.rowCount > 0;
}

async function stats() {
  const end = dbQueryDuration.startTimer({ operation: 'stats', table: TABLE });
  const result = await query(
    `SELECT
       status,
       priority,
       COUNT(*) AS total
     FROM ${TABLE}
     GROUP BY status, priority
     ORDER BY status, priority`,
    [],
    { operation: 'stats', table: TABLE }
  );
  end();
  return result.rows;
}

module.exports = { findAll, count, findById, create, update, remove, stats };
