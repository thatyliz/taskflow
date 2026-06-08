'use strict';

require('dotenv').config();
const { query, pool } = require('./database');
const logger = require('../utils/logger');

const MIGRATIONS = [
  {
    version: 1,
    description: 'Cria tabela de tarefas e índices',
    sql: `
      CREATE TABLE IF NOT EXISTS tasks (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title       VARCHAR(255)  NOT NULL,
        description TEXT,
        status      VARCHAR(20)   NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'in_progress', 'done')),
        priority    VARCHAR(10)   NOT NULL DEFAULT 'medium'
                      CHECK (priority IN ('low', 'medium', 'high')),
        due_date    TIMESTAMPTZ,
        created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_tasks_status   ON tasks (status);
      CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks (priority);
      CREATE INDEX IF NOT EXISTS idx_tasks_created  ON tasks (created_at DESC);

      CREATE OR REPLACE FUNCTION update_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trg_tasks_updated_at ON tasks;
      CREATE TRIGGER trg_tasks_updated_at
        BEFORE UPDATE ON tasks
        FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    `,
  },
  {
    version: 2,
    description: 'Cria tabela de controle de migrations',
    sql: `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version     INTEGER PRIMARY KEY,
        description TEXT,
        applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `,
  },
];

async function runMigrations() {
  logger.info('Iniciando migrations do banco de dados…');

  // Garante que a tabela de controle existe
  await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     INTEGER PRIMARY KEY,
      description TEXT,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `, [], { operation: 'migrate', table: 'schema_migrations' });

  const applied = await query(
    'SELECT version FROM schema_migrations ORDER BY version',
    [],
    { operation: 'migrate', table: 'schema_migrations' }
  );
  const appliedVersions = new Set(applied.rows.map((r) => r.version));

  for (const migration of MIGRATIONS) {
    if (appliedVersions.has(migration.version)) {
      logger.debug(`Migration v${migration.version} já aplicada — pulando`);
      continue;
    }

    logger.info(`Aplicando migration v${migration.version}: ${migration.description}`);
    await query(migration.sql, [], { operation: 'migrate', table: 'schema_migrations' });
    await query(
      'INSERT INTO schema_migrations (version, description) VALUES ($1, $2)',
      [migration.version, migration.description],
      { operation: 'migrate', table: 'schema_migrations' }
    );
    logger.info(`Migration v${migration.version} aplicada com sucesso`);
  }

  logger.info('Todas as migrations concluídas');
  await pool.end();
}

runMigrations().catch((err) => {
  logger.error('Falha nas migrations', { error: err.message });
  process.exit(1);
});
