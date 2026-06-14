'use strict';

// ── API ───────────────────────────────────────────────────────────────────────
const api = {
  async req(method, path, body) {
    const res = await fetch(`/api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `Erro ${res.status}`);
    return json.data;
  },
  list(p = {}) {
    const q = new URLSearchParams(Object.entries(p).filter(([,v]) => v));
    return this.req('GET', `/tasks?${q}`);
  },
  get(id)          { return this.req('GET',    `/tasks/${id}`); },
  create(b)        { return this.req('POST',   '/tasks', b); },
  update(id, b)    { return this.req('PATCH',  `/tasks/${id}`, b); },
  delete(id)       { return this.req('DELETE', `/tasks/${id}`); },
  stats()          { return this.req('GET',    '/tasks/stats'); },
};

// ── Toast ─────────────────────────────────────────────────────────────────────
function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.getElementById('toastArea').appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ── Modal ─────────────────────────────────────────────────────────────────────
const backdrop = document.getElementById('modalBackdrop');
let editingId  = null;

function modalOpen(task) {
  editingId = task ? task.id : null;
  document.getElementById('modalTitle').textContent    = task ? 'Editar Tarefa' : 'Nova Tarefa';
  document.getElementById('fTitle').value              = task ? task.title : '';
  document.getElementById('fDescription').value        = task ? (task.description || '') : '';
  document.getElementById('fPriority').value           = task ? task.priority : 'medium';
  document.getElementById('fStatus').value             = task ? task.status : 'pending';
  document.getElementById('fDueDate').value            = task && task.due_date
    ? new Date(task.due_date).toISOString().slice(0, 16) : '';
  document.getElementById('statusWrap').style.display  = task ? 'block' : 'none';
  document.getElementById('modalError').style.display  = 'none';
  document.getElementById('modalError').textContent    = '';
  backdrop.classList.add('open');
  document.getElementById('fTitle').focus();
}

function modalClose() {
  backdrop.classList.remove('open');
  editingId = null;
}

// Fecha clicando fora do modal
backdrop.addEventListener('click', function(e) {
  if (e.target === this) modalClose();
});

// Fecha com Escape
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') modalClose();
});

document.getElementById('btnModalClose').addEventListener('click', modalClose);
document.getElementById('btnModalCancel').addEventListener('click', modalClose);

// ── Salvar ────────────────────────────────────────────────────────────────────
document.getElementById('btnModalSave').addEventListener('click', async function() {
  const title       = document.getElementById('fTitle').value.trim();
  const description = document.getElementById('fDescription').value.trim();
  const priority    = document.getElementById('fPriority').value;
  const status      = document.getElementById('fStatus').value;
  const due_date    = document.getElementById('fDueDate').value || undefined;
  const errEl       = document.getElementById('modalError');

  errEl.style.display = 'none';

  if (!title || title.length < 3) {
    errEl.textContent   = 'Título deve ter pelo menos 3 caracteres.';
    errEl.style.display = 'block';
    return;
  }

  this.disabled    = true;
  this.textContent = 'Salvando…';

  try {
    if (editingId) {
      await api.update(editingId, { title, description, priority, status, due_date });
      toast('Tarefa atualizada!', 'success');
    } else {
      await api.create({ title, description, priority, due_date });
      toast('Tarefa criada!', 'success');
    }
    modalClose();
    loadTasks();
  } catch (err) {
    errEl.textContent   = err.message;
    errEl.style.display = 'block';
  } finally {
    this.disabled    = false;
    this.textContent = 'Salvar';
  }
});

// ── Render ────────────────────────────────────────────────────────────────────
const SL = { pending: 'Pendente', in_progress: 'Em andamento', done: 'Concluída' };
const PL = { low: 'Baixa', medium: 'Média', high: 'Alta' };

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function renderTask(t) {
  const el = document.createElement('div');
  el.className = `task-card${t.status === 'done' ? ' done' : ''}`;
  el.innerHTML = `
    <button class="task-check${t.status==='done'?' done':''}" data-toggle="${t.id}">
      ${t.status==='done' ? '✓' : ''}
    </button>
    <div class="task-body">
      <div class="task-title">${escHtml(t.title)}</div>
      <div class="task-meta">
        <span class="chip chip-status-${t.status}">${SL[t.status]}</span>
        <span class="chip chip-priority-${t.priority}">${PL[t.priority]}</span>
      </div>
      ${t.description ? `<p style="font-size:.8125rem;color:#8b8fa8;margin-top:.35rem">${escHtml(t.description)}</p>` : ''}
    </div>
    <div class="task-actions">
      <button class="task-btn edit" data-edit="${t.id}" title="Editar">✎</button>
      <button class="task-btn delete" data-delete="${t.id}" title="Deletar">✕</button>
    </div>`;
  return el;
}

// ── Load Tasks ────────────────────────────────────────────────────────────────
async function loadTasks() {
  const list    = document.getElementById('taskList');
  const empty   = document.getElementById('emptyState');
  const loading = document.getElementById('loadingState');

  loading.style.display = 'flex';
  list.innerHTML        = '';
  empty.style.display   = 'none';

  try {
    const status   = document.getElementById('filterStatus').value;
    const priority = document.getElementById('filterPriority').value;
    const result   = await api.list({ status, priority });
    const tasks    = result.tasks || [];

    loading.style.display = 'none';
    if (!tasks.length) { empty.style.display = 'block'; return; }
    tasks.forEach(t => list.appendChild(renderTask(t)));
  } catch (err) {
    loading.style.display = 'none';
    toast('Erro ao carregar: ' + err.message, 'error');
  }
}

// ── Eventos da lista ──────────────────────────────────────────────────────────
document.getElementById('taskList').addEventListener('click', async function(e) {
  const toggle = e.target.closest('[data-toggle]');
  const edit   = e.target.closest('[data-edit]');
  const del    = e.target.closest('[data-delete]');

  if (toggle) {
    try {
      const t = await api.get(toggle.dataset.toggle);
      await api.update(t.id, { status: t.status === 'done' ? 'pending' : 'done' });
      loadTasks();
    } catch (err) { toast(err.message, 'error'); }
  }

  if (edit) {
    try {
      const t = await api.get(edit.dataset.edit);
      modalOpen(t);
    } catch (err) { toast(err.message, 'error'); }
  }

  if (del) {
    if (!confirm('Deletar esta tarefa?')) return;
    try {
      await api.delete(del.dataset.delete);
      toast('Tarefa deletada');
      loadTasks();
    } catch (err) { toast(err.message, 'error'); }
  }
});

document.getElementById('newTaskBtn').addEventListener('click', () => modalOpen(null));
document.getElementById('filterStatus').addEventListener('change', loadTasks);
document.getElementById('filterPriority').addEventListener('change', loadTasks);

// Busca info do ambiente
fetch('/info').then(r => r.json()).then(info => {
  document.getElementById('envBadge').textContent = info.environment || 'dev';
}).catch(() => {});

// ── Init ──────────────────────────────────────────────────────────────────────
loadTasks();