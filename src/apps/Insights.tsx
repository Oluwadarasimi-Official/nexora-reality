import React, { useEffect, useMemo, useState } from 'react';
import { ChatThread, FocusSession, Note, Project, Task } from '../types';
import { Empty, PageHead, Ring } from '../components/ui';
import { idb } from '../services/db';

interface Stats {
  tasks: Task[]; notes: Note[]; projects: Project[]; sessions: FocusSession[]; threads: ChatThread[];
}

export default function Insights() {
  const [s, setS] = useState<Stats | null>(null);

  useEffect(() => {
    Promise.all([
      idb.all<Task>('tasks'), idb.all<Note>('notes'), idb.all<Project>('projects'),
      idb.all<FocusSession>('focusSessions'), idb.all<ChatThread>('chatThreads'),
    ]).then(([tasks, notes, projects, sessions, threads]) => setS({ tasks, notes, projects, sessions, threads }))
      .catch(() => setS({ tasks: [], notes: [], projects: [], sessions: [], threads: [] }));
  }, []);

  const m = useMemo(() => {
    if (!s) return null;
    const now = Date.now();
    const day = 86_400_000;
    const weekAgo = now - 7 * day;
    const startToday = new Date(); startToday.setHours(0, 0, 0, 0);

    const doneTasks = s.tasks.filter((t) => t.done);
    const doneWeek = doneTasks.filter((t) => (t.completedAt ?? 0) >= weekAgo);
    const focusToday = s.sessions.filter((x) => x.finishedAt >= startToday.getTime()).reduce((a, x) => a + x.minutesActual, 0);
    const focusWeek = s.sessions.filter((x) => x.finishedAt >= weekAgo).reduce((a, x) => a + x.minutesActual, 0);
    const focusTotal = s.sessions.reduce((a, x) => a + x.minutesActual, 0);

    // streak: consecutive days (ending today or yesterday) with ≥1 completed session
    const days = new Set(s.sessions.filter((x) => x.completed).map((x) => new Date(x.finishedAt).toISOString().slice(0, 10)));
    let streak = 0;
    const cursor = new Date();
    if (!days.has(cursor.toISOString().slice(0, 10))) cursor.setDate(cursor.getDate() - 1);
    while (days.has(cursor.toISOString().slice(0, 10))) { streak++; cursor.setDate(cursor.getDate() - 1); }

    // activity per day, last 7 days (focus minutes)
    const bars: { label: string; min: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now - i * day);
      const key = d.toISOString().slice(0, 10);
      const min = s.sessions.filter((x) => new Date(x.finishedAt).toISOString().slice(0, 10) === key)
        .reduce((a, x) => a + x.minutesActual, 0);
      bars.push({ label: d.toLocaleDateString(undefined, { weekday: 'narrow' }), min });
    }
    const maxBar = Math.max(1, ...bars.map((b) => b.min));

    const tagCount = new Map<string, number>();
    s.notes.forEach((n) => n.tags.forEach((t) => tagCount.set(t, (tagCount.get(t) ?? 0) + 1)));
    const topTags = [...tagCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const words = s.notes.reduce((a, n) => a + n.body.split(/\s+/).filter(Boolean).length, 0);
    const projByStatus = new Map<string, number>();
    s.projects.forEach((p) => projByStatus.set(p.status, (projByStatus.get(p.status) ?? 0) + 1));
    const aiMsgs = s.threads.reduce((a, t) => a + t.messages.length, 0);
    const completionRate = s.tasks.length ? doneTasks.length / s.tasks.length : 0;

    return {
      doneTasks: doneTasks.length, doneWeek: doneWeek.length, completionRate,
      focusToday, focusWeek, focusTotal, streak, bars, maxBar,
      topTags, words, projByStatus, aiMsgs, threads: s.threads.length,
      hasAny: s.tasks.length + s.notes.length + s.projects.length + s.sessions.length > 0,
    };
  }, [s]);

  if (!s || !m) return <PageHead title="Insights" sub="Calculating from your real data…" />;

  if (!m.hasAny) {
    return (
      <div className="animate-fade-up">
        <PageHead title="Insights" sub="Genuine stats from your activity" />
        <Empty icon="◍" title="No data yet" body="Use Mission Control, Focus Mode and the Vault — your real stats will appear here. Nothing is fabricated." />
      </div>
    );
  }

  const cards: { label: string; value: string; sub: string }[] = [
    { label: 'Tasks completed', value: String(m.doneTasks), sub: `${m.doneWeek} this week` },
    { label: 'Focus today', value: `${m.focusToday}m`, sub: `${m.focusWeek}m this week` },
    { label: 'Focus streak', value: `${m.streak}d`, sub: m.streak > 0 ? 'keep it burning 🔥' : 'start one today' },
    { label: 'Notes', value: String(s.notes.length), sub: `${m.words.toLocaleString()} words written` },
    { label: 'AI messages', value: String(m.aiMsgs), sub: `${m.threads} conversations` },
    { label: 'Projects', value: String(s.projects.length), sub: [...m.projByStatus.entries()].map(([k, v]) => `${v} ${k}`).join(' · ') || '—' },
  ];

  return (
    <div className="animate-fade-up">
      <PageHead title="Insights" sub="Calculated live from your actual data" />

      <section className="nr-card flex items-center gap-5 mb-4" aria-label="Task completion">
        <Ring pct={m.completionRate} size={72} />
        <div>
          <div className="font-bold text-sm">Task completion</div>
          <p className="text-xs opacity-60">{m.doneTasks} of {s.tasks.length} missions done · {m.doneWeek} finished this week</p>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 mb-4">
        {cards.map((c) => (
          <div key={c.label} className="nr-card !p-3.5">
            <div className="text-[10px] uppercase tracking-wider opacity-50 font-bold">{c.label}</div>
            <div className="text-2xl font-extrabold mt-1" style={{ color: 'var(--accent)' }}>{c.value}</div>
            <div className="text-[11px] opacity-55 mt-0.5">{c.sub}</div>
          </div>
        ))}
      </div>

      <section className="nr-card mb-4" aria-label="Focus this week">
        <h2 className="font-bold text-sm mb-3">Focus minutes · last 7 days</h2>
        <div className="flex items-end gap-2 h-28" role="img" aria-label={`Focus minutes per day: ${m.bars.map((b) => `${b.label} ${b.min}`).join(', ')}`}>
          {m.bars.map((b, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-[10px] font-bold opacity-70">{b.min > 0 ? b.min : ''}</span>
              <div className="w-full rounded-t-lg transition-all" style={{
                height: `${Math.max(4, (b.min / m.maxBar) * 88)}px`,
                background: b.min > 0 ? 'var(--accent)' : 'var(--border)', opacity: b.min > 0 ? 1 : 0.5,
              }} />
              <span className="text-[10px] opacity-50">{b.label}</span>
            </div>
          ))}
        </div>
      </section>

      {m.topTags.length > 0 && (
        <section className="nr-card" aria-label="Top tags">
          <h2 className="font-bold text-sm mb-3">Top note tags</h2>
          <div className="flex flex-wrap gap-2">
            {m.topTags.map(([t, c]) => <span key={t} className="nr-chip">#{t} · {c}</span>)}
          </div>
        </section>
      )}
      <p className="text-[10px] opacity-40 text-center mt-4">Total deep-work time banked: {m.focusTotal} minutes. Every number here comes from your data.</p>
    </div>
  );
}
