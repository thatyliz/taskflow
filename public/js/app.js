'use strict';

// ─── API Client ───────────────────────────────────────────────────────────────

const api = {
  async request(method, path, body) {
    const res = await fetch(`/api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(json.error || 'Erro desconhecido'), { status: res.status });
    return json.data;
  },
  list(params = {}) {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v));
    return this.request('GET', `/tasks?${q}`);
  },
  get(id)          { return this.request('GET',    `/tasks/${id}`);      },
  create(body)     { return this.request('POST',   '/tasks', body);      },
  update(id, body) { return this.request('PATCH',  `/tasks/${id}`, body);},
  delete(id)       { return this.request('DELETE', `/tasks/${id}`);      },
  stats()          { return this.request('GET',    '/tasks/stats');      },
  info()           { return fetch('/info').then(r => r.json());          },
};

// ─── Toast ────────────────────────────────────────────────────────────────────

function toast(message, type = 'default') {
  const area = document.getElementById('toastArea');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  area.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// ─── State ────────────────────────────────────────────────────────────────────

let editingId = null;

// ─── Format Helpers ───────────────────────────────────────────────────────────

const STATUS_LABELS = { pending: 'Pendente', in_progress: 'Em andamento', done: 'Concluída' };
const PRIORITY_LABELS = { low: 'Baixa', medium: 'Média', high: 'Alta' };

function formatDate(iso) {
  if (!iso) return null;
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

function isOverdue(iso) {
  if (!iso) return false;
  return new Date(iso) < new Date();
}

// ─── Render ───────────────────────────────────────────────────────────────────

function renderTask(task) {
  const card = document.createElement('div');
  card.className = `task-card${task.status === 'done' ? ' done' : ''}`;
  card.dataset.id = task.id;

  const due = task.due_date
    ? `<span class="task-due${isOverdue(task.due_date) && task.status !== 'done' ? ' overdue' : ''}">
         <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
         ${formatDate(task.due_date)}
       </span>` : '';

  const desc = task.description
    ? `<p class="task-description">${escHtml(task.description)}</p>` : '';

  card.innerHTML = `
    <button class="task-check${task.status === 'done' ? ' done' : ''}" data-toggle="${task.id}" title="Alternar conclusão">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#0e0f11" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
    </button>
    <div class="task-body">
      <div class="task-title">${escHtml(task.title)}</div>
      <div class="task-meta">
        <span class="chip chip-status-${task.status}">${STATUS_LABELS[task.status]}</span>
        <span class="chip chip-priority-${task.priority}">${PRIORITY_LABELS[task.priority]}</span>
        ${due}
      </div>
      ${desc}
    </div>
    <div class="task-actions">
      <button class="task-btn edit" data-edit="${task.id}" title="Editar">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4z"/></svg>
      </button>
      <button class="task-btn delete" data-delete="${task.id}" title="Deletar">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
      </button>
    </div>`;

  return card;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Load Tasks ───────────────────────────────────────────────────────────────

async function loadTasks() {
  const list = document.getElementById('taskList');
  const empty = document.getElementById('emptyState');
  const loading = document.getElementById('loadingState');

  loading.hidden = false;
  list.innerHTML = '';
  empty.hidden = true;

  try {
    const status   = document.getElementById('filterStatus').value;
    const priority = document.getElementById('filterPriority').value;
    const result   = await api.list({ status, priority });
    const tasks    = result.tasks || [];

    loading.hidden = true;

    if (!tasks.length) { empty.hidden = false; return; }
    tasks.forEach(t => list.appendChild(renderTask(t)));
  } catch (err) {
    loading.hidden = true;
    toast(`Erro ao carregar tarefas: ${err.message}`, 'error');
  }
}

// ─── Stats ────────────────────────────────────────────────────────────────────

async function loadStats() {
  try {
    const data = await api.stats();
    document.getElementById('statTotal').textContent   = data.total ?? 0;
    document.getElementById('statPending').textContent = data.by_status?.pending ?? 0;
    document.getElementById('statProgress').textContent= data.by_status?.in_progress ?? 0;
    document.getElementById('statDone').textContent    = data.by_status?.done ?? 0;
  } catch { /* silencioso */ }
}

// ─── Info Badge ───────────────────────────────────────────────────────────────

api.info().then(info => {
  const badge = document.getElementById('envBadge');
  if (badge) badge.textContent = info.environment || 'dev';
}).catch(() => {});

// ─── Modal ────────────────────────────────────────────────────────────────────

function openModal(task = null) {
  editingId = task?.id || null;

  document.getElementById('modalTitle').textContent  = task ? 'Editar Tarefa' : 'Nova Tarefa';
  document.getElementById('fTitle').value            = task?.title ?? '';
  document.getElementById('fDescription').value      = task?.description ?? '';
  document.getElementById('fPriority').value         = task?.priority ?? 'medium';
  document.getElementById('fStatus').value           = task?.status ?? 'pending';
  document.getElementById('fDueDate').value          = task?.due_date
    ? new Date(task.due_date).toISOString().slice(0, 16) : '';

  document.getElementById('statusFieldWrap').hidden = !task;
  document.getElementById('modalError').hidden = true;
  document.getElementById('modalBackdrop').hidden = false;
  document.getElementById('fTitle').focus();
}

function closeModal() {
  document.getElementById('modalBackdrop').hidden = true;
  editingId = null;
}

async function saveTask() {
  const title       = document.getElementById('fTitle').value.trim();
  const description = document.getElementById('fDescription').value.trim();
  const priority    = document.getElementById('fPriority').value;
  const status      = document.getElementById('fStatus').value;
  const due_date    = document.getElementById('fDueDate').value || undefined;

  const errEl = document.getElementById('modalError');
  errEl.hidden = true;

  try {
    if (editingId) {
      await api.update(editingId, { title, description, priority, status, due_date });
      toast('Tarefa atualizada!', 'success');
    } else {
      await api.create({ title, description, priority, due_date });
      toast('Tarefa criada!', 'success');
    }
    closeModal();
    await loadTasks();
    await loadStats();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.hidden = false;
  }
}

// ─── Toggle done ─────────────────────────────────────────────────────────────

async function toggleDone(id) {
  try {
    const task = await api.get(id);
    const newStatus = task.status === 'done' ? 'pending' : 'done';
    await api.update(id, { status: newStatus });
    await loadTasks();
    await loadStats();
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ─── Delete ───────────────────────────────────────────────────────────────────

async function deleteTask(id) {
  if (!confirm('Deletar esta tarefa?')) return;
  try {
    await api.delete(id);
    toast('Tarefa deletada', 'default');
    await loadTasks();
    await loadStats();
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ─── Event Delegation ─────────────────────────────────────────────────────────

document.getElementById('taskList').addEventListener('click', async (e) => {
  const toggle = e.target.closest('[data-toggle]');
  const edit   = e.target.closest('[data-edit]');
  const del    = e.target.closest('[data-delete]');

  if (toggle) return toggleDone(toggle.dataset.toggle);
  if (del)    return deleteTask(del.dataset.delete);
  if (edit) {
    try {
      const task = await api.get(edit.dataset.edit);
      openModal(task);
    } catch (err) { toast(err.message, 'error'); }
  }
});

document.getElementById('newTaskBtn').addEventListener('click', () => openModal());
document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('modalCancel').addEventListener('click', closeModal);
document.getElementById('modalSave').addEventListener('click', saveTask);
document.getElementById('modalBackdrop').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

document.getElementById('filterStatus').addEventListener('change', loadTasks);
document.getElementById('filterPriority').addEventListener('change', loadTasks);

document.getElementById('statsToggle').addEventListener('click', async () => {
  const panel = document.getElementById('statsPanel');
  panel.hidden = !panel.hidden;
  if (!panel.hidden) await loadStats();
});

// ─── Init ─────────────────────────────────────────────────────────────────────
loadTasks();
