'use strict';

const { Pool } = require('pg');
const logger = require('../utils/logger');
const { dbErrorsTotal, dbPoolSize } = require('../utils/metrics');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'taskflow',
  user: process.env.DB_USER || 'taskuser',
  password: process.env.DB_PASSWORD || 'taskpass',
  min: Number(process.env.DB_POOL_MIN) || 2,
  max: Number(process.env.DB_POOL_MAX) || 10,
  connectionTimeoutMillis: Number(process.env.DB_CONNECT_TIMEOUT_MS) || 5000,
  idleTimeoutMillis: 30_000,
});

pool.on('connect', () => {
  logger.debug('Nova conexão adicionada ao pool');
  dbPoolSize.set({ state: 'total' }, pool.totalCount);
});

pool.on('remove', () => {
  dbPoolSize.set({ state: 'total' }, pool.totalCount);
  dbPoolSize.set({ state: 'idle' }, pool.idleCount);
});

pool.on('error', (err) => {
  logger.error('Erro inesperado no pool de conexões', { error: err.message });
  dbErrorsTotal.inc({ operation: 'pool' });
});

/**
 * Executa uma query no banco com rastreio de duração e erros.
 * @param {string} text  - SQL
 * @param {Array}  params - parâmetros parametrizados
 * @param {object} meta  - metadados para log (operation, table)
 */
async function query(text, params = [], meta = {}) {
  const { operation = 'query', table = 'unknown' } = meta;
  const start = Date.now();

  // Atualiza gauge de pool antes de cada query
  dbPoolSize.set({ state: 'idle' }, pool.idleCount);
  dbPoolSize.set({ state: 'waiting' }, pool.waitingCount);

  try {
    const result = await pool.query(text, params);
    const durationMs = Date.now() - start;

    logger.debug('Query executada', {
      operation,
      table,
      durationMs,
      rowCount: result.rowCount,
    });

    return result;
  } catch (err) {
    dbErrorsTotal.inc({ operation });
    logger.error('Erro ao executar query', {
      operation,
      table,
      error: err.message,
      sql: text,
    });
    throw err;
  }
}

async function testConnection() {
  const result = await query('SELECT NOW() AS now', [], { operation: 'health', table: 'system' });
  return result.rows[0].now;
}

module.exports = { pool, query, testConnection };
