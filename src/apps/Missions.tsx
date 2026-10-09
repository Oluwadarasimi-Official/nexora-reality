import React, { useEffect, useMemo, useState } from 'react';
import { Project, Task, todayISO, uid } from '../types';
import { Area, Btn, DemoBadge, Empty, Field, GhostBtn, Label, Modal, PageHead, Segmented, useConfirm, useToast } from '../components/ui';
import { idb, logActivity } from '../services/db';

type Filter = 'today' | 'all' | 'done';

const PRI = { high: { label: 'High', color: '#f87171' }, medium: { label: 'Med', color: '#fbbf24' }, low: { label: 'Low', color: '#34d399' } };

export default function Missions() {
  const toast = useToast();
  const { ask, ui: confirmUi } = useConfirm();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [filter, setFilter] = useState<Filter>('today');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Task | null>(null);
  const [showForm, setShowForm] = useState(false);

  const refresh = async () => {
    const [t, p] = await Promise.all([idb.all<Task>('tasks'), idb.all<Project>('projects')]);
    setTasks(t.sort((a, b) => b.createdAt - a.createdAt));
    setProjects(p);
  };
  useEffect(() => { refresh().catch(() => {}); }, []);

  const visible = useMemo(() => {
    const today = todayISO();
    let list = tasks;
    if (filter === 'today') list = list.filter((t) => !t.done && (!t.due || t.due <= today));
    if (filter === 'done') list = list.filter((t) => t.done);
    if (filter === 'all') list = list.filter((t) => !t.done);
    const needle = q.trim().toLowerCase();
    if (needle) list = list.filter((t) => (t.title + ' ' + (t.notes ?? '')).toLowerCase().includes(needle));
    return [...list].sort((a, b) => {
      if (!!a.done !== !!b.done) return a.done ? 1 : -1;
      return (a.due ?? '9999').localeCompare(b.due ?? '9999');
    });
  }, [tasks, filter, q]);

  const toggle = async (t: Task) => {
    const next = { ...t, done: !t.done, completedAt: !t.done ? Date.now() : undefined };
    await idb.put('tasks', next);
    await logActivity('task', `${next.done ? 'Completed' : 'Reopened'} task: ${t.title}`);
    refresh();
  };

  const remove = async (t: Task) => {
    if (!(await ask(`Delete "${t.title}"?`))) return;
    await idb.del('tasks', t.id);
    toast({ kind: 'ok', title: 'Task deleted' });
    refresh();
  };

  const progress = tasks.length ? tasks.filter((t) => t.done).length / tasks.length : 0;

  return (
    <div className="animate-fade-up">
      <PageHead title="Mission Control" sub={`${tasks.filter((t) => !t.done).length} open · ${Math.round(progress * 100)}% complete`}
        right={<Btn className="!px-3 !py-2 !text-xs" onClick={() => { setEditing(null); setShowForm(true); }}>＋ New task</Btn>} />

      <div className="flex gap-2 mb-3">
        <div className="flex-1"><Field value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tasks…" aria-label="Search tasks" /></div>
      </div>
      <div className="mb-4">
        <Segmented<Filter> value={filter} onChange={setFilter}
          options={[{ value: 'today', label: 'Today' }, { value: 'all', label: 'Open' }, { value: 'done', label: 'Done' }]} />
      </div>

      {visible.length === 0 ? (
        <Empty icon="◎" title={filter === 'done' ? 'Nothing completed yet' : 'All clear, Commander'}
          body={filter === 'done' ? 'Completed missions will land here.' : 'No missions match. Add one to get moving.'}
          action={<Btn className="!text-xs" onClick={() => { setEditing(null); setShowForm(true); }}>＋ New task</Btn>} />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {visible.map((t) => {
            const proj = projects.find((p) => p.id === t.projectId);
            const overdue = !t.done && t.due && t.due < todayISO();
            return (
              <li key={t.id} className="nr-card !p-3 flex items-start gap-3">
                <button onClick={() => toggle(t)} aria-label={t.done ? `Reopen ${t.title}` : `Complete ${t.title}`}
                  className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${t.done ? 'text-black' : ''}`}
                  style={t.done ? { background: 'var(--accent)', borderColor: 'var(--accent)' } : { borderColor: 'var(--border)' }}>
                  {t.done ? '✓' : ''}
                </button>
                <button className="flex-1 text-left min-w-0" onClick={() => { setEditing(t); setShowForm(true); }}>
                  <div className={`text-sm font-semibold ${t.done ? 'line-through opacity-50' : ''}`}>{t.title}</div>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    <span className="nr-chip !py-0.5" style={{ color: PRI[t.priority].color }}>{PRI[t.priority].label}</span>
                    {t.due && <span className={`nr-chip !py-0.5 ${overdue ? '!text-red-300' : ''}`}>{overdue ? `Overdue · ${t.due}` : t.due}</span>}
                    {t.recurring && <span className="nr-chip !py-0.5">↻ {t.recurring}</span>}
                    {proj && <span className="nr-chip !py-0.5">{proj.name}</span>}
                    {t.demo && <DemoBadge />}
                  </div>
                </button>
                <button onClick={() => remove(t)} aria-label={`Delete ${t.title}`} className="opacity-40 hover:opacity-100 px-1">🗑</button>
              </li>
            );
          })}
        </ul>
      )}

      {showForm && (
        <TaskForm initial={editing} projects={projects}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSaved={() => { setShowForm(false); setEditing(null); refresh(); toast({ kind: 'ok', title: editing ? 'Task updated' : 'Mission added' }); }} />
      )}
      {confirmUi}
    </div>
  );
}

function TaskForm({ initial, projects, onClose, onSaved }: {
  initial: Task | null; projects: Project[]; onClose: () => void; onSaved: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [priority, setPriority] = useState<Task['priority']>(initial?.priority ?? 'medium');
  const [due, setDue] = useState(initial?.due ?? '');
  const [recurring, setRecurring] = useState(initial?.recurring ?? '' as '' | Task['recurring']);
  const [projectId, setProjectId] = useState(initial?.projectId ?? '');
  const [err, setErr] = useState('');

  const save = async () => {
    if (!title.trim()) { setErr('Give the mission a title.'); return; }
    const t: Task = {
      id: initial?.id ?? uid(),
      title: title.trim(), notes: notes.trim() || undefined,
      done: initial?.done ?? false, priority,
      due: due || undefined,
      recurring: (recurring || undefined) as Task['recurring'],
      projectId: projectId || undefined,
      createdAt: initial?.createdAt ?? Date.now(),
      completedAt: initial?.completedAt,
      demo: initial?.demo,
    };
    await idb.put('tasks', t);
    await logActivity('task', `${initial ? 'Updated' : 'Created'} task: ${t.title}`);
    onSaved();
  };

  return (
    <Modal title={initial ? 'Edit mission' : 'New mission'} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div><Label>Title</Label><Field value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs doing?" maxLength={120} autoFocus /></div>
        <div><Label>Notes</Label><Area rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Details (optional)" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Priority</Label>
            <select className="nr-input" value={priority} onChange={(e) => setPriority(e.target.value as Task['priority'])} aria-label="Priority">
              <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
            </select></div>
          <div><Label>Due date</Label><Field type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due date" /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Repeats</Label>
            <select className="nr-input" value={recurring} onChange={(e) => setRecurring(e.target.value as Task['recurring'] | '')} aria-label="Repeats">
              <option value="">Never</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option>
            </select></div>
          <div><Label>Project</Label>
            <select className="nr-input" value={projectId} onChange={(e) => setProjectId(e.target.value)} aria-label="Project">
              <option value="">None</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select></div>
        </div>
        {err && <p className="text-xs text-red-400" role="alert">{err}</p>}
        <div className="flex gap-3 justify-end">
          <GhostBtn onClick={onClose}>Cancel</GhostBtn>
          <Btn onClick={save}>Save mission</Btn>
        </div>
      </div>
    </Modal>
  );
}
