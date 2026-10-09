import React, { useContext, useEffect, useMemo, useState } from 'react';
import { APPS, AppId, Note, Project, Task, todayISO, uid } from '../types';
import type { View } from '../components/Shell';
import { Btn, DemoBadge, Empty, GhostBtn, Modal, Ring, timeAgo, Field, useToast } from '../components/ui';
import { PrefsCtx } from '../App';
import { idb, logActivity } from '../services/db';

type WidgetId = 'missions' | 'pinned' | 'focus' | 'projects' | 'notes' | 'activity' | 'notifications';

const WIDGET_META: { id: WidgetId; name: string }[] = [
  { id: 'missions', name: "Today's missions" },
  { id: 'pinned', name: 'Pinned apps' },
  { id: 'focus', name: 'Focus today' },
  { id: 'projects', name: 'Recent projects' },
  { id: 'notes', name: 'Quick notes' },
  { id: 'notifications', name: 'Notifications' },
  { id: 'activity', name: 'Activity history' },
];

function greeting(name: string): string {
  const h = new Date().getHours();
  const base = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  return name ? `${base}, ${name}` : `${base}`;
}

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(iv);
  }, []);
  return now;
}

export default function Home({ go, openApp }: { go: (v: View) => void; openApp: (a: AppId) => void }) {
  const { prefs, setPrefs } = useContext(PrefsCtx);
  const toast = useToast();
  const now = useClock();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [activity, setActivity] = useState<{ id: string; text: string; ts: number }[]>([]);
  const [notifs, setNotifs] = useState<{ id: string; title: string; body: string; ts: number; read: boolean }[]>([]);
  const [focusMin, setFocusMin] = useState(0);
  const [editing, setEditing] = useState(false);
  const [quickNote, setQuickNote] = useState('');
  const [showAllWidgets, setShowAllWidgets] = useState(false);

  const refresh = async () => {
    const [t, p, n, a, nf, fs] = await Promise.all([
      idb.all<Task>('tasks'), idb.all<Project>('projects'), idb.all<Note>('notes'),
      idb.all<{ id: string; text: string; ts: number }>('activity'),
      idb.all<{ id: string; title: string; body: string; ts: number; read: boolean }>('notifications'),
      idb.all<{ id: string; minutesActual: number; finishedAt: number }>('focusSessions'),
    ]);
    setTasks(t); setProjects(p.sort((x, y) => y.createdAt - x.createdAt));
    setNotes(n.sort((x, y) => y.updatedAt - x.updatedAt));
    setActivity(a.sort((x, y) => y.ts - x.ts).slice(0, 12));
    setNotifs(nf.sort((x, y) => y.ts - x.ts).slice(0, 6));
    const start = new Date(); start.setHours(0, 0, 0, 0);
    setFocusMin(fs.filter((s) => s.finishedAt >= start.getTime()).reduce((s, x) => s + x.minutesActual, 0));
  };
  useEffect(() => { refresh().catch(() => {}); }, []);

  const dueTasks = useMemo(() => {
    const today = todayISO();
    return tasks.filter((t) => !t.done && t.due && t.due <= today).sort((a, b) => (a.due! < b.due! ? -1 : 1));
  }, [tasks]);
  const doneToday = tasks.filter((t) => t.done && t.completedAt && new Date(t.completedAt).toISOString().slice(0, 10) === todayISO()).length;

  const toggleTask = async (t: Task) => {
    const next = { ...t, done: !t.done, completedAt: !t.done ? Date.now() : undefined };
    await idb.put('tasks', next);
    setTasks((p) => p.map((x) => (x.id === t.id ? next : x)));
    await logActivity('task', `${next.done ? 'Completed' : 'Reopened'} task: ${t.title}`);
    toast({ kind: 'ok', title: next.done ? 'Mission complete ✓' : 'Mission reopened' });
  };

  const saveQuickNote = async () => {
    const body = quickNote.trim();
    if (!body) return;
    await idb.put('notes', {
      id: uid(), title: body.split('\n')[0].slice(0, 42) || 'Quick note', body,
      folder: 'Quick', tags: [], favourite: false, updatedAt: Date.now(), createdAt: Date.now(),
    });
    setQuickNote('');
    await logActivity('note', 'Captured a quick note');
    toast({ kind: 'ok', title: 'Note saved' });
    refresh();
  };

  const markAllRead = async () => {
    await Promise.all(notifs.map((n) => idb.put('notifications', { ...n, read: true })));
    refresh();
  };

  const moveWidget = (id: WidgetId, dir: -1 | 1) => {
    const w = [...prefs.widgets];
    const i = w.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= w.length) return;
    [w[i], w[j]] = [w[j], w[i]];
    setPrefs({ widgets: w });
  };
  const toggleWidget = (id: WidgetId) => {
    const has = prefs.widgets.includes(id);
    setPrefs({ widgets: has ? prefs.widgets.filter((x) => x !== id) : [...prefs.widgets, id] });
  };

  const pinnedApps = APPS.filter((a) => prefs.pinned.includes(a.id));
  const focusPct = Math.min(1, focusMin / Math.max(1, prefs.dailyGoal));

  const widgets: Record<WidgetId, React.ReactNode> = {
    missions: (
      <section className="nr-card" aria-label="Today's missions">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-sm">Today's missions</h2>
          <button className="text-xs font-semibold opacity-70" style={{ color: 'var(--accent)' }} onClick={() => openApp('missions')}>Open →</button>
        </div>
        {dueTasks.length === 0 ? (
          <p className="text-xs opacity-60">Nothing due today. {doneToday > 0 ? `${doneToday} completed today — nice.` : 'Enjoy the clear sky. ✦'}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {dueTasks.slice(0, 5).map((t) => (
              <li key={t.id}>
                <button onClick={() => toggleTask(t)} className="w-full flex items-center gap-3 text-left rounded-xl p-2 hover:bg-white/5 transition">
                  <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center text-[10px] shrink-0 ${t.done ? 'text-black' : ''}`}
                    style={t.done ? { background: 'var(--accent)', borderColor: 'var(--accent)' } : { borderColor: 'var(--border)' }}>
                    {t.done ? '✓' : ''}
                  </span>
                  <span className={`text-sm flex-1 ${t.done ? 'line-through opacity-50' : ''}`}>{t.title}</span>
                  {t.demo && <DemoBadge />}
                  {t.due! < todayISO() && <span className="nr-chip !text-red-300">overdue</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    ),
    pinned: (
      <section className="nr-card" aria-label="Pinned apps">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-sm">Pinned apps</h2>
          <button className="text-xs font-semibold opacity-70" style={{ color: 'var(--accent)' }} onClick={() => go('launcher')}>All apps →</button>
        </div>
        <div className="grid grid-cols-4 gap-3">
          {pinnedApps.map((a) => (
            <button key={a.id} onClick={() => openApp(a.id)} className="flex flex-col items-center gap-1.5 active:scale-95 transition">
              <span className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl"
                style={{ background: `${a.accent}22`, color: a.accent }} aria-hidden>{a.icon}</span>
              <span className="text-[10px] font-semibold opacity-80 text-center leading-tight">{a.name}</span>
            </button>
          ))}
        </div>
      </section>
    ),
    focus: (
      <section className="nr-card flex items-center gap-4" aria-label="Focus today">
        <Ring pct={focusPct} />
        <div className="flex-1">
          <h2 className="font-bold text-sm">Focus today</h2>
          <p className="text-xs opacity-60">{focusMin} of {prefs.dailyGoal} min</p>
        </div>
        <Btn className="!px-3 !py-2 !text-xs" onClick={() => openApp('focus')}>Start</Btn>
      </section>
    ),
    projects: (
      <section className="nr-card" aria-label="Recent projects">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-sm">Recent projects</h2>
          <button className="text-xs font-semibold opacity-70" style={{ color: 'var(--accent)' }} onClick={() => openApp('forge')}>Open →</button>
        </div>
        {projects.length === 0 ? (
          <Empty icon="⬢" title="No projects yet" body="Forge your first project to track milestones." />
        ) : (
          <div className="flex flex-col gap-2">
            {projects.slice(0, 3).map((p) => {
              const done = p.milestones.filter((m) => m.done).length;
              return (
                <button key={p.id} onClick={() => openApp('forge')} className="flex items-center gap-3 text-left rounded-xl p-2 hover:bg-white/5 transition">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ background: p.color }} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold truncate">{p.name} {p.demo && <DemoBadge />}</span>
                    <span className="block text-xs opacity-55">{done}/{p.milestones.length} milestones · {p.status}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>
    ),
    notes: (
      <section className="nr-card" aria-label="Quick notes">
        <h2 className="font-bold text-sm mb-3">Quick notes</h2>
        <div className="flex gap-2 mb-3">
          <Field value={quickNote} onChange={(e) => setQuickNote(e.target.value)} placeholder="Jot something down…" aria-label="Quick note" />
          <Btn className="!px-3" onClick={saveQuickNote} aria-label="Save note">＋</Btn>
        </div>
        {notes.slice(0, 3).map((n) => (
          <button key={n.id} onClick={() => openApp('vault')} className="w-full text-left rounded-xl p-2 hover:bg-white/5 transition">
            <div className="text-sm font-semibold truncate">{n.title} {n.demo && <DemoBadge />}</div>
            <div className="text-xs opacity-55 truncate">{n.body.slice(0, 60)}</div>
          </button>
        ))}
      </section>
    ),
    notifications: (
      <section className="nr-card" aria-label="Notifications">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-sm">Notifications {notifs.some((n) => !n.read) && <span className="nr-chip ml-1">{notifs.filter((n) => !n.read).length} new</span>}</h2>
          {notifs.some((n) => !n.read) && <button className="text-xs opacity-60" onClick={markAllRead}>Mark all read</button>}
        </div>
        {notifs.length === 0 ? <p className="text-xs opacity-60">All quiet.</p> : (
          <div className="flex flex-col gap-2">
            {notifs.slice(0, 4).map((n) => (
              <div key={n.id} className={`rounded-xl p-2.5 text-left ${n.read ? 'opacity-60' : ''}`} style={{ background: 'var(--accent-soft)' }}>
                <div className="text-sm font-semibold">{n.title}</div>
                <div className="text-xs opacity-70">{n.body}</div>
                <div className="text-[10px] opacity-40 mt-1">{timeAgo(n.ts)}</div>
              </div>
            ))}
          </div>
        )}
      </section>
    ),
    activity: (
      <section className="nr-card" aria-label="Activity history">
        <h2 className="font-bold text-sm mb-3">Activity</h2>
        {activity.length === 0 ? <p className="text-xs opacity-60">Your recent actions will appear here.</p> : (
          <ul className="flex flex-col gap-2">
            {activity.slice(0, 6).map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 text-xs">
                <span className="opacity-80 truncate">{a.text}</span>
                <span className="opacity-40 shrink-0">{timeAgo(a.ts)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    ),
  };

  return (
    <div className="flex flex-col gap-4 animate-fade-up">
      {/* greeting + clock */}
      <section className="pt-1">
        <p className="text-xs opacity-60 font-semibold tracking-wide">{now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        <h1 className="text-2xl font-extrabold tracking-tight">{greeting(prefs.name)}</h1>
        <p className="text-4xl font-extrabold tabular-nums mt-1" style={{ color: 'var(--accent)' }} aria-label="Current time">
          {now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
        </p>
      </section>

      {/* quick actions */}
      <section className="grid grid-cols-4 gap-2" aria-label="Quick actions">
        {[
          { label: 'Ask AI', icon: '✦', fn: () => openApp('commander') },
          { label: 'Task', icon: '＋', fn: () => openApp('missions') },
          { label: 'Note', icon: '✎', fn: () => openApp('vault') },
          { label: 'Focus', icon: '◉', fn: () => openApp('focus') },
        ].map((q) => (
          <button key={q.label} onClick={q.fn} className="nr-card !p-3 flex flex-col items-center gap-1 active:scale-95 transition">
            <span className="text-xl" aria-hidden>{q.icon}</span>
            <span className="text-[10px] font-semibold opacity-80">{q.label}</span>
          </button>
        ))}
      </section>

      {editing ? (
        <section className="nr-card" aria-label="Customise dashboard">
          <h2 className="font-bold text-sm mb-3">Customise dashboard</h2>
          <div className="flex flex-col gap-2 mb-4">
            {WIDGET_META.map((w) => {
              const on = prefs.widgets.includes(w.id);
              return (
                <div key={w.id} className="flex items-center gap-2 rounded-xl p-2" style={{ background: 'var(--accent-soft)' }}>
                  <button onClick={() => toggleWidget(w.id)} aria-pressed={on}
                    className={`w-6 h-6 rounded-lg text-xs font-bold ${on ? 'text-black' : 'opacity-40'}`}
                    style={{ background: on ? 'var(--accent)' : 'var(--border)' }}>{on ? '✓' : ''}</button>
                  <span className="text-sm flex-1">{w.name}</span>
                  <button onClick={() => moveWidget(w.id, -1)} aria-label={`Move ${w.name} up`} className="opacity-60 px-1">▲</button>
                  <button onClick={() => moveWidget(w.id, 1)} aria-label={`Move ${w.name} down`} className="opacity-60 px-1">▼</button>
                </div>
              );
            })}
          </div>
          <Btn className="w-full" onClick={() => setEditing(false)}>Done</Btn>
        </section>
      ) : (
        <>
          {(showAllWidgets ? prefs.widgets : prefs.widgets.slice(0, 6)).map((id) => (
            <React.Fragment key={id}>{widgets[id as WidgetId]}</React.Fragment>
          ))}
          <div className="flex gap-2 justify-center">
            {prefs.widgets.length > 6 && (
              <GhostBtn className="!text-xs !py-2" onClick={() => setShowAllWidgets((v) => !v)}>
                {showAllWidgets ? 'Show less' : `Show ${prefs.widgets.length - 6} more`}
              </GhostBtn>
            )}
            <GhostBtn className="!text-xs !py-2" onClick={() => setEditing(true)}>⚙ Customise</GhostBtn>
          </div>
        </>
      )}
    </div>
  );
}
