import React, { useContext, useEffect, useMemo, useState } from 'react';
import { APPS, AppId } from '../types';
import { Field, PageHead } from '../components/ui';
import { PrefsCtx } from '../App';
import { idb } from '../services/db';

export default function Launcher({ openApp }: { openApp: (a: AppId) => void }) {
  const { prefs, setPrefs } = useContext(PrefsCtx);
  const [q, setQ] = useState('');
  const [recents, setRecents] = useState<AppId[]>([]);

  useEffect(() => {
    idb.all<{ id: string; ts: number; kind: string }>('activity').then((a) => {
      const apps = a.filter((e) => e.kind === 'app_open').sort((x, y) => y.ts - x.ts)
        .map((e) => e.id as AppId)
        .filter((v, i, arr) => APPS.some((m) => m.id === v) && arr.indexOf(v) === i)
        .slice(0, 6);
      setRecents(apps);
    }).catch(() => {});
  }, []);

  const togglePin = (id: AppId) => {
    const has = prefs.pinned.includes(id);
    setPrefs({ pinned: has ? prefs.pinned.filter((x) => x !== id) : [...prefs.pinned, id] });
  };

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return APPS;
    return APPS.filter((a) => (a.name + ' ' + a.tagline).toLowerCase().includes(needle));
  }, [q]);

  return (
    <div className="animate-fade-up">
      <PageHead title="App Library" sub={`${APPS.length} mini-apps · everything runs on-device`} />
      <div className="mb-4"><Field value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search apps…" aria-label="Search apps" /></div>

      {recents.length > 0 && !q && (
        <section className="mb-5">
          <h2 className="text-xs font-bold uppercase tracking-wider opacity-50 mb-2">Recent</h2>
          <div className="flex gap-3 overflow-x-auto nr-scroll pb-1">
            {recents.map((r) => {
              const a = APPS.find((m) => m.id === r)!;
              return (
                <button key={r} onClick={() => openApp(r)} className="nr-card !p-3 flex items-center gap-2.5 shrink-0 active:scale-95 transition">
                  <span className="text-2xl" style={{ color: a.accent }} aria-hidden>{a.icon}</span>
                  <span className="text-xs font-bold whitespace-nowrap">{a.name}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 gap-3">
        {list.map((a) => {
          const pinned = prefs.pinned.includes(a.id);
          return (
            <div key={a.id} className="nr-card !p-3 flex items-center gap-3">
              <button onClick={() => openApp(a.id)} className="flex items-center gap-3 flex-1 text-left min-w-0 active:scale-[0.98] transition">
                <span className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0"
                  style={{ background: `${a.accent}22`, color: a.accent }} aria-hidden>{a.icon}</span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold">{a.name}</span>
                  <span className="block text-xs opacity-55 truncate">{a.tagline}</span>
                </span>
              </button>
              <button onClick={() => togglePin(a.id)} aria-pressed={pinned} aria-label={pinned ? `Unpin ${a.name}` : `Pin ${a.name}`}
                className={`w-9 h-9 rounded-xl text-base transition ${pinned ? '' : 'opacity-30'}`}
                style={pinned ? { background: 'var(--accent-soft)', color: 'var(--accent)' } : undefined}>
                {pinned ? '★' : '☆'}
              </button>
            </div>
          );
        })}
      </div>
      {list.length === 0 && <p className="text-center text-sm opacity-60 py-10">No apps match “{q}”.</p>}
    </div>
  );
}
