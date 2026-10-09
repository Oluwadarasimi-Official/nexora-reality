import React, { useEffect, useMemo, useState } from 'react';
import { Milestone, Project, Task, uid } from '../types';
import { Area, Btn, DemoBadge, Empty, Field, GhostBtn, Label, Modal, PageHead, Ring, useConfirm, useToast } from '../components/ui';
import { idb, logActivity } from '../services/db';

const STATUS: { v: Project['status']; label: string; color: string }[] = [
  { v: 'idea', label: 'Idea', color: '#a78bfa' },
  { v: 'active', label: 'Active', color: '#10b981' },
  { v: 'paused', label: 'Paused', color: '#fbbf24' },
  { v: 'done', label: 'Done', color: '#34d399' },
];
const COLORS = ['#10b981', '#38bdf8', '#a78bfa', '#f472b6', '#f59e0b', '#d4af37'];

export default function Forge() {
  const toast = useToast();
  const { ask, ui: confirmUi } = useConfirm();
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [statusF, setStatusF] = useState<'all' | Project['status']>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [form, setForm] = useState<Project | 'new' | null>(null);

  const refresh = async () => {
    const [p, t] = await Promise.all([idb.all<Project>('projects'), idb.all<Task>('tasks')]);
    setProjects(p.sort((a, b) => b.createdAt - a.createdAt));
    setTasks(t);
  };
  useEffect(() => { refresh().catch(() => {}); }, []);

  const visible = useMemo(() => statusF === 'all' ? projects : projects.filter((p) => p.status === statusF), [projects, statusF]);
  const open = projects.find((p) => p.id === openId) ?? null;

  const remove = async (p: Project) => {
    if (!(await ask(`Delete project "${p.name}" and its milestones? Tasks stay.`))) return;
    await idb.del('projects', p.id);
    setOpenId(null);
    toast({ kind: 'ok', title: 'Project deleted' });
    refresh();
  };

  const pct = (p: Project) => p.milestones.length ? p.milestones.filter((m) => m.done).length / p.milestones.length : 0;

  return (
    <div className="animate-fade-up">
      <PageHead title="Project Forge" sub={`${projects.length} projects`}
        right={<Btn className="!px-3 !py-2 !text-xs" onClick={() => setForm('new')}>＋ New project</Btn>} />

      <div className="flex gap-2 overflow-x-auto nr-scroll mb-4 pb-0.5">
        {(['all', ...STATUS.map((s) => s.v)] as const).map((s) => (
          <button key={s} onClick={() => setStatusF(s)} aria-pressed={statusF === s}
            className={`nr-chip !py-1.5 !px-3 whitespace-nowrap capitalize ${statusF === s ? '!bg-emerald-500 !text-black' : ''}`}>
            {s === 'all' ? 'All' : STATUS.find((x) => x.v === s)!.label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <Empty icon="⬢" title="No projects here" body="Forge a project to track milestones, tasks and AI context in one place."
          action={<Btn className="!text-xs" onClick={() => setForm('new')}>＋ New project</Btn>} />
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {visible.map((p) => {
            const linked = tasks.filter((t) => t.projectId === p.id && !t.done).length;
            const st = STATUS.find((s) => s.v === p.status)!;
            return (
              <button key={p.id} onClick={() => setOpenId(p.id)} className="nr-card !p-4 text-left active:scale-[0.99] transition">
                <div className="flex items-center gap-3">
                  <span className="w-10 h-10 rounded-2xl flex items-center justify-center text-lg font-bold text-black shrink-0" style={{ background: p.color }} aria-hidden>⬢</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm truncate">{p.name} {p.demo && <DemoBadge />}</div>
                    <div className="text-xs opacity-55 truncate">{p.description || 'No description'}</div>
                  </div>
                  <Ring pct={pct(p)} size={48} />
                </div>
                <div className="flex items-center gap-1.5 mt-3">
                  <span className="nr-chip !py-0.5" style={{ color: st.color }}>{st.label}</span>
                  <span className="nr-chip !py-0.5">{p.milestones.filter((m) => m.done).length}/{p.milestones.length} milestones</span>
                  {linked > 0 && <span className="nr-chip !py-0.5">{linked} open tasks</span>}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {open && (
        <ProjectDetail p={open} tasks={tasks.filter((t) => t.projectId === open.id)}
          onClose={() => setOpenId(null)} onChange={refresh}
          onEdit={() => setForm(open)} onDelete={() => remove(open)} />
      )}
      {form && (
        <ProjectForm initial={form === 'new' ? null : form}
          onClose={() => setForm(null)}
          onSaved={() => { setForm(null); refresh(); toast({ kind: 'ok', title: 'Project saved' }); }} />
      )}
      {confirmUi}
    </div>
  );
}

function ProjectDetail({ p, tasks, onClose, onChange, onEdit, onDelete }: {
  p: Project; tasks: Task[]; onClose: () => void; onChange: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const toast = useToast();
  const [msTitle, setMsTitle] = useState('');
  const [msDue, setMsDue] = useState('');
  const [ctx, setCtx] = useState(p.context ?? '');
  const [ctxOpen, setCtxOpen] = useState(false);

  const saveMilestones = async (ms: Milestone[]) => {
    await idb.put('projects', { ...p, milestones: ms });
    onChange();
  };
  const toggleMs = (m: Milestone) => saveMilestones(p.milestones.map((x) => x.id === m.id ? { ...m, done: !m.done } : x));
  const delMs = (m: Milestone) => saveMilestones(p.milestones.filter((x) => x.id !== m.id));
  const addMs = () => {
    if (!msTitle.trim()) return;
    saveMilestones([...p.milestones, { id: uid(), title: msTitle.trim(), done: false, due: msDue || undefined }]);
    setMsTitle(''); setMsDue('');
    toast({ kind: 'ok', title: 'Milestone added' });
  };
  const setStatus = async (status: Project['status']) => {
    await idb.put('projects', { ...p, status });
    await logActivity('project', `Project "${p.name}" → ${status}`);
    onChange();
  };
  const saveCtx = async () => {
    await idb.put('projects', { ...p, context: ctx.trim() || undefined });
    setCtxOpen(false);
    toast({ kind: 'ok', title: 'AI context saved' });
    onChange();
  };

  return (
    <Modal title={p.name} onClose={onClose} wide>
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {STATUS.map((s) => (
          <button key={s.v} onClick={() => setStatus(s.v)} aria-pressed={p.status === s.v}
            className={`nr-chip !py-1 !px-2.5 ${p.status === s.v ? '!bg-emerald-500 !text-black' : ''}`}>{s.label}</button>
        ))}
        {p.demo && <DemoBadge />}
      </div>
      {p.description && <p className="text-sm opacity-70 mb-4">{p.description}</p>}

      <h3 className="text-xs font-bold uppercase tracking-wider opacity-50 mb-2">Milestones</h3>
      <div className="flex flex-col gap-2 mb-3">
        {p.milestones.length === 0 && <p className="text-xs opacity-50">No milestones yet — add the first below.</p>}
        {p.milestones.map((m) => (
          <div key={m.id} className="flex items-center gap-2.5 rounded-xl p-2" style={{ background: 'var(--surface-solid)' }}>
            <button onClick={() => toggleMs(m)} aria-label={m.done ? `Reopen ${m.title}` : `Complete ${m.title}`}
              className={`w-5 h-5 rounded-full border-2 text-[10px] font-bold ${m.done ? 'text-black' : ''}`}
              style={m.done ? { background: 'var(--accent)', borderColor: 'var(--accent)' } : { borderColor: 'var(--border)' }}>
              {m.done ? '✓' : ''}</button>
            <span className={`text-sm flex-1 ${m.done ? 'line-through opacity-50' : ''}`}>{m.title}</span>
            {m.due && <span className="text-[10px] opacity-50">{m.due}</span>}
            <button onClick={() => delMs(m)} aria-label={`Delete ${m.title}`} className="opacity-40 px-1">✕</button>
          </div>
        ))}
      </div>
      <div className="flex gap-2 mb-5">
        <Field value={msTitle} onChange={(e) => setMsTitle(e.target.value)} placeholder="New milestone…" aria-label="New milestone" />
        <Field type="date" value={msDue} onChange={(e) => setMsDue(e.target.value)} aria-label="Milestone due date" className="!w-36" />
        <Btn className="!px-3" onClick={addMs} aria-label="Add milestone">＋</Btn>
      </div>

      {tasks.length > 0 && (
        <><h3 className="text-xs font-bold uppercase tracking-wider opacity-50 mb-2">Linked tasks</h3>
          <ul className="flex flex-col gap-1.5 mb-5">
            {tasks.map((t) => (
              <li key={t.id} className="text-sm flex items-center gap-2">
                <span aria-hidden>{t.done ? '✓' : '○'}</span>
                <span className={t.done ? 'line-through opacity-50' : ''}>{t.title}</span>
              </li>
            ))}
          </ul></>
      )}

      <h3 className="text-xs font-bold uppercase tracking-wider opacity-50 mb-2">AI context</h3>
      {!ctxOpen ? (
        <button onClick={() => setCtxOpen(true)} className="w-full text-left rounded-xl p-3 text-xs opacity-70 mb-5" style={{ background: 'var(--surface-solid)' }}>
          {p.context || 'Tap to add project-specific context the AI Commander will use…'}
        </button>
      ) : (
        <div className="mb-5">
          <Area rows={3} value={ctx} onChange={(e) => setCtx(e.target.value)} placeholder="Stack, goals, constraints…" />
          <div className="flex gap-2 justify-end mt-2">
            <GhostBtn className="!text-xs" onClick={() => setCtxOpen(false)}>Cancel</GhostBtn>
            <Btn className="!text-xs" onClick={saveCtx}>Save context</Btn>
          </div>
        </div>
      )}

      <div className="flex gap-2 justify-end">
        <GhostBtn className="!text-xs" onClick={onDelete}>🗑 Delete</GhostBtn>
        <Btn className="!text-xs" onClick={() => { onClose(); onEdit(); }}>✎ Edit project</Btn>
      </div>
    </Modal>
  );
}

function ProjectForm({ initial, onClose, onSaved }: { initial: Project | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [status, setStatus] = useState<Project['status']>(initial?.status ?? 'idea');
  const [color, setColor] = useState(initial?.color ?? COLORS[0]);
  const [err, setErr] = useState('');

  const save = async () => {
    if (!name.trim()) { setErr('Name your project.'); return; }
    const p: Project = {
      id: initial?.id ?? uid(), name: name.trim(), description: description.trim(),
      status, color, context: initial?.context,
      milestones: initial?.milestones ?? [],
      createdAt: initial?.createdAt ?? Date.now(), demo: initial?.demo,
    };
    await idb.put('projects', p);
    await logActivity('project', `${initial ? 'Updated' : 'Created'} project: ${p.name}`);
    onSaved();
  };

  return (
    <Modal title={initial ? 'Edit project' : 'New project'} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div><Label>Name</Label><Field value={name} onChange={(e) => setName(e.target.value)} placeholder="Project name" maxLength={80} autoFocus /></div>
        <div><Label>Description</Label><Area rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this about?" /></div>
        <div><Label>Status</Label>
          <div className="flex gap-2 flex-wrap">{STATUS.map((s) => (
            <button key={s.v} onClick={() => setStatus(s.v)} aria-pressed={status === s.v}
              className={`nr-chip !py-1.5 !px-3 ${status === s.v ? '!bg-emerald-500 !text-black' : ''}`}>{s.label}</button>
          ))}</div></div>
        <div><Label>Colour</Label>
          <div className="flex gap-2.5">{COLORS.map((c) => (
            <button key={c} onClick={() => setColor(c)} aria-label={`Colour ${c}`}
              className="w-9 h-9 rounded-full transition active:scale-90"
              style={{ background: c, boxShadow: color === c ? `0 0 0 3px var(--bg), 0 0 0 5px ${c}` : 'none' }} />
          ))}</div></div>
        {err && <p className="text-xs text-red-400" role="alert">{err}</p>}
        <div className="flex gap-3 justify-end">
          <GhostBtn onClick={onClose}>Cancel</GhostBtn>
          <Btn onClick={save}>Save project</Btn>
        </div>
      </div>
    </Modal>
  );
}
