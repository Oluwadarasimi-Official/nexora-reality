import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { FocusSession, uid } from '../types';
import { Btn, DemoBadge, Empty, Field, GhostBtn, Label, PageHead, Ring, timeAgo, useToast } from '../components/ui';
import { PrefsCtx } from '../App';
import { idb, logActivity, pushNotification } from '../services/db';

const PRESETS = [15, 25, 45, 60];

export default function Focus() {
  const { prefs, setPrefs } = useContext(PrefsCtx);
  const toast = useToast();
  const [sessions, setSessions] = useState<FocusSession[]>([]);
  const [label, setLabel] = useState('');
  const [minutes, setMinutes] = useState(25);
  const [remaining, setRemaining] = useState<number | null>(null); // seconds
  const [paused, setPaused] = useState(false);
  const [zen, setZen] = useState(false);
  const startedAt = useRef(0);
  const endAt = useRef(0);

  const refresh = async () => {
    const s = await idb.all<FocusSession>('focusSessions');
    setSessions(s.sort((a, b) => b.finishedAt - a.finishedAt));
  };
  useEffect(() => { refresh().catch(() => {}); }, []);

  const todayMin = useMemo(() => {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    return sessions.filter((s) => s.finishedAt >= start.getTime()).reduce((a, s) => a + s.minutesActual, 0);
  }, [sessions]);
  const weekMin = useMemo(() => {
    const week = Date.now() - 7 * 86_400_000;
    return sessions.filter((s) => s.finishedAt >= week).reduce((a, s) => a + s.minutesActual, 0);
  }, [sessions]);

  useEffect(() => {
    if (remaining === null || paused) return;
    const iv = setInterval(() => {
      const left = Math.max(0, Math.round((endAt.current - Date.now()) / 1000));
      setRemaining(left);
      if (left <= 0) { clearInterval(iv); finish(true); }
    }, 500);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining === null, paused]);

  const start = () => {
    startedAt.current = Date.now();
    endAt.current = Date.now() + minutes * 60_000;
    setRemaining(minutes * 60);
    setPaused(false);
  };

  const finish = async (completed: boolean) => {
    const actual = Math.round((Date.now() - startedAt.current) / 60_000);
    const s: FocusSession = {
      id: uid(), label: label.trim() || 'Focus session',
      minutesPlanned: minutes, minutesActual: Math.max(1, Math.min(actual, minutes)),
      finishedAt: Date.now(), completed,
    };
    await idb.put('focusSessions', s);
    await logActivity('focus', `${completed ? 'Completed' : 'Ended'} focus: ${s.label} (${s.minutesActual}m)`);
    if (completed) {
      await pushNotification('Focus session complete ✓', `${s.minutesActual} minutes of deep work on "${s.label}".`, 'focus');
      toast({ kind: 'ok', title: 'Session complete ✓', body: `${s.minutesActual} minutes banked.` });
    }
    setRemaining(null); setZen(false);
    refresh();
  };

  const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  const pct = remaining === null ? 0 : 1 - remaining / (minutes * 60);

  return (
    <div className="animate-fade-up">
      <PageHead title="Focus Mode" sub={`${todayMin}m today · ${weekMin}m this week`} />

      {remaining === null ? (
        <>
          <section className="nr-card mb-4">
            <div className="flex items-center gap-4 mb-4">
              <Ring pct={Math.min(1, todayMin / Math.max(1, prefs.dailyGoal))} size={64} />
              <div>
                <div className="font-bold text-sm">Daily goal</div>
                <div className="text-xs opacity-60">{todayMin} / {prefs.dailyGoal} minutes</div>
                <button className="text-xs mt-1 font-semibold" style={{ color: 'var(--accent)' }}
                  onClick={() => {
                    const v = prompt('Daily focus goal (minutes):', String(prefs.dailyGoal));
                    const n = v ? parseInt(v, 10) : NaN;
                    if (Number.isFinite(n) && n >= 5 && n <= 720) { setPrefs({ dailyGoal: n }); toast({ kind: 'ok', title: 'Goal updated' }); }
                  }}>Change goal</button>
              </div>
            </div>
            <Label>Session label</Label>
            <Field value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Exam revision" maxLength={60} className="mb-3" />
            <Label>Duration</Label>
            <div className="flex gap-2 flex-wrap mb-5">
              {PRESETS.map((p) => (
                <button key={p} onClick={() => setMinutes(p)} aria-pressed={minutes === p}
                  className={`nr-chip !py-2 !px-4 !text-sm ${minutes === p ? '!bg-emerald-500 !text-black' : ''}`}>{p}m</button>
              ))}
            </div>
            <Btn className="w-full !py-3.5" onClick={start}>◉ Start {minutes}-minute session</Btn>
          </section>

          <h2 className="text-xs font-bold uppercase tracking-wider opacity-50 mb-2">Session history</h2>
          {sessions.length === 0 ? (
            <Empty icon="◉" title="No sessions yet" body="Start a focus session to build your deep-work history." />
          ) : (
            <ul className="flex flex-col gap-2">
              {sessions.slice(0, 15).map((s) => (
                <li key={s.id} className="nr-card !p-3 flex items-center gap-3">
                  <span className={`w-8 h-8 rounded-xl flex items-center justify-center ${s.completed ? 'text-black' : 'opacity-40'}`}
                    style={{ background: s.completed ? 'var(--accent)' : 'var(--border)' }} aria-hidden>{s.completed ? '✓' : '■'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">{s.label} {s.demo && <DemoBadge />}</div>
                    <div className="text-xs opacity-55">{s.minutesActual}m · {timeAgo(s.finishedAt)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <section className={`nr-card text-center py-10 ${zen ? 'fixed inset-0 z-[85] rounded-none flex flex-col justify-center' : ''}`}>
          <p className="text-xs opacity-60 mb-1">{label || 'Focus session'}</p>
          <div className="text-6xl font-extrabold tabular-nums my-4" style={{ color: 'var(--accent)' }} aria-label="Time remaining">
            {mmss(remaining)}
          </div>
          <div className="w-full h-2 rounded-full overflow-hidden mb-6" style={{ background: 'var(--border)' }} role="progressbar" aria-valuenow={Math.round(pct * 100)} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full transition-all" style={{ width: `${pct * 100}%`, background: 'var(--accent)' }} />
          </div>
          <div className="flex gap-2 justify-center flex-wrap">
            <GhostBtn onClick={() => setPaused((v) => !v)}>{paused ? '▶ Resume' : '⏸ Pause'}</GhostBtn>
            <GhostBtn onClick={() => setZen((v) => !v)}>{zen ? '⤢ Exit zen' : '◉ Zen mode'}</GhostBtn>
            <Btn onClick={() => finish(false)}>■ End</Btn>
          </div>
          {zen && <p className="text-xs opacity-50 mt-6">Distraction-free. Nothing else exists right now.</p>}
        </section>
      )}
    </div>
  );
}
