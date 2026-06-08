#!/usr/bin/env node
'use strict';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  TaskFlow — Script de Simulação de Falhas
 *  Executar separado: npm run simulate:failures
 *
 *  Esse script bate nos endpoints da API com diferentes cenários de falha
 *  para validar comportamento de resiliência, alertas e dashboards.
 * ─────────────────────────────────────────────────────────────────────────────
 */

require('dotenv').config();

const BASE_URL = process.env.APP_URL || 'http://localhost:3000';
const DELAY    = (ms) => new Promise((r) => setTimeout(r, ms));

const colors = {
  reset:  '\x1b[0m',
  red:    '\x1b[31m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  blue:   '\x1b[34m',
  cyan:   '\x1b[36m',
  bold:   '\x1b[1m',
};

function log(color, label, msg) {
  console.log(`${colors[color]}${colors.bold}[${label}]${colors.reset} ${msg}`);
}

async function fetchJson(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  try {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, body };
  } catch (err) {
    return { status: 0, error: err.message };
  }
}

// ─── Cenários ─────────────────────────────────────────────────────────────────

async function scenario_highVolume() {
  log('blue', 'CENÁRIO', 'Alto volume de requests — 50 criações rápidas');
  const results = await Promise.allSettled(
    Array.from({ length: 50 }, (_, i) =>
      fetchJson('/api/tasks', {
        method: 'POST',
        body: JSON.stringify({
          title: `Tarefa de carga #${i + 1}`,
          priority: ['low', 'medium', 'high'][i % 3],
        }),
      })
    )
  );
  const ok = results.filter((r) => r.status === 'fulfilled' && r.value.status === 201).length;
  log('green', 'RESULTADO', `${ok}/50 tarefas criadas com sucesso`);
}

async function scenario_invalidPayloads() {
  log('blue', 'CENÁRIO', 'Payloads inválidos — validação de entradas');
  const cases = [
    { body: {},                    expect: 400, label: 'body vazio'          },
    { body: { title: 'ab' },       expect: 400, label: 'título muito curto'  },
    { body: { title: 'ok', status: 'nope' }, expect: 400, label: 'status inválido' },
    { body: { title: 'ok', priority: 'mega' }, expect: 400, label: 'prioridade inválida' },
  ];

  for (const tc of cases) {
    const { status } = await fetchJson('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(tc.body),
    });
    const icon = status === tc.expect ? '✓' : '✗';
    log(status === tc.expect ? 'green' : 'red', icon, `${tc.label} → HTTP ${status} (esperado ${tc.expect})`);
  }
}

async function scenario_notFound() {
  log('blue', 'CENÁRIO', 'Recursos inexistentes — IDs fantasmas');
  const fakeId = '00000000-0000-0000-0000-000000000000';
  const ops = [
    fetchJson(`/api/tasks/${fakeId}`),
    fetchJson(`/api/tasks/${fakeId}`, { method: 'PATCH', body: JSON.stringify({ title: 'ghost' }) }),
    fetchJson(`/api/tasks/${fakeId}`, { method: 'DELETE' }),
  ];
  const results = await Promise.all(ops);
  results.forEach(({ status }) => {
    const icon = status === 404 ? '✓' : '✗';
    log(status === 404 ? 'green' : 'red', icon, `HTTP ${status} (esperado 404)`);
  });
}

async function scenario_rapidUpdates() {
  log('blue', 'CENÁRIO', 'Race condition — atualização rápida sequencial');

  const created = await fetchJson('/api/tasks', {
    method: 'POST',
    body: JSON.stringify({ title: 'Tarefa para race condition test', priority: 'high' }),
  });

  if (created.status !== 201) {
    log('red', 'SKIP', 'Falha ao criar tarefa de teste');
    return;
  }

  const id = created.body.data.id;
  const statuses = ['pending', 'in_progress', 'done', 'pending', 'in_progress'];

  for (const status of statuses) {
    const r = await fetchJson(`/api/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    log(r.status === 200 ? 'green' : 'red', r.status === 200 ? '✓' : '✗', `PATCH status=${status} → ${r.status}`);
    await DELAY(50);
  }

  // Limpa
  await fetchJson(`/api/tasks/${id}`, { method: 'DELETE' });
}

async function scenario_healthCheck() {
  log('blue', 'CENÁRIO', 'Endpoints de monitoramento');
  const endpoints = ['/health', '/ready', '/info', '/metrics'];

  for (const ep of endpoints) {
    const { status } = await fetchJson(ep);
    log(status < 400 ? 'green' : 'red', status < 400 ? '✓' : '✗', `GET ${ep} → ${status}`);
  }
}

// ─── Runner principal ─────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${colors.bold}${colors.cyan}════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}   TaskFlow — Simulação de Falhas & Carga   ${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}════════════════════════════════════════════${colors.reset}`);
  console.log(`  Alvo: ${BASE_URL}\n`);

  const scenarios = [
    { fn: scenario_healthCheck,    name: '1. Health checks'          },
    { fn: scenario_invalidPayloads,name: '2. Payloads inválidos'     },
    { fn: scenario_notFound,       name: '3. Recursos inexistentes'  },
    { fn: scenario_highVolume,     name: '4. Alto volume (50 reqs)'  },
    { fn: scenario_rapidUpdates,   name: '5. Atualizações rápidas'   },
  ];

  for (const { fn, name } of scenarios) {
    console.log(`\n${colors.yellow}▶ ${name}${colors.reset}`);
    await fn().catch((err) => log('red', 'ERRO', err.message));
    await DELAY(300);
  }

  console.log(`\n${colors.green}${colors.bold}Simulação concluída!${colors.reset}`);
  console.log(`Confira os logs da aplicação e o endpoint /metrics para ver os contadores.\n`);
}

main();
