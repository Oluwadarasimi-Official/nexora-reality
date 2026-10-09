import React, { useEffect, useMemo, useRef, useState } from 'react';
import { APPS, AppId, AppMeta } from '../types';
import { NexoraWordmark } from './Logo';
import { Field } from './ui';
import { idb } from '../services/db';

export type View = AppId | 'home' | 'launcher';

interface ShellProps {
  view: View;
  go: (v: View) => void;
  online: boolean;
  aiOnline: boolean;
  children: React.ReactNode;
  onOpenApp: (a: AppId) => void;
}

/** Global shell: top bar, command palette (⌘K), bottom nav, offline banner. */
export function Shell({ view, go, online, aiOnline, children, onOpenApp }: ShellProps) {
  const [palette, setPalette] = useState(false);
  const [q, setQ] = useState('');
  const [recents, setRecents] = useState<AppId[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    idb.all<{ id: string; ts: number; kind: string }>('activity').then((a) => {
      const apps = a
        .filter((e) => e.kind === 'app_open')
        .sort((x, y) => y.ts - x.ts)
        .map((e) => e.id as AppId)
        .filter((v, i, arr) => APPS.some((m) => m.id === v) && arr.indexOf(v) === i)
        .slice(0, 4);
      setRecents(apps);
    }).catch(() => {});
  }, [view]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette(true); }
      if (e.key === 'Escape') setPalette(false);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  useEffect(() => {
    if (palette) setTimeout(() => inputRef.current?.focus(), 60);
    else setQ('');
  }, [palette]);

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list: { meta: AppMeta; hint: string }[] = APPS.map((m) => ({ meta: m, hint: m.tagline }));
    if (!needle) {
      const rec = recents.map((r) => ({ meta: APPS.find((m) => m.id === r)!, hint: 'Recent' }));
      return [...rec, ...list.filter((l) => !recents.includes(l.meta.id))];
    }
    return list.filter((l) => (l.meta.name + ' ' + l.hint).toLowerCase().includes(needle));
  }, [q, recents]);

  const tabs: { v: View; label: string; icon: string }[] = [
    { v: 'home', label: 'Home', icon: '⌂' },
    { v: 'launcher', label: 'Apps', icon: '▦' },
    { v: 'commander', label: 'AI', icon: '✦' },
    { v: 'missions', label: 'Tasks', icon: '◎' },
    { v: 'settings', label: 'More', icon: '⚙' },
  ];

  return (
    <div className="h-full flex flex-col nr-bg">
      {/* top bar */}
      <header className="shrink-0 px-4 pt-4 pb-2 flex items-center justify-between gap-3">
        <button onClick={() => go('home')} aria-label="Go home"><NexoraWordmark compact /></button>
        <div className="flex items-center gap-2">
          <span className="nr-chip" title={online ? 'Online' : 'Offline — local mode'}>
            <span className={`w-1.5 h-1.5 rounded-full ${online ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse-soft'}`} />
            {online ? 'Online' : 'Offline'}
          </span>
          <span className="nr-chip" title={aiOnline ? 'AI providers reachable' : 'AI unavailable'}>
            <span className={`w-1.5 h-1.5 rounded-full ${aiOnline ? 'bg-emerald-400' : 'bg-slate-500'}`} />
            AI {aiOnline ? 'ready' : 'off'}
          </span>
          <button onClick={() => setPalette(true)} aria-label="Open command bar"
            className="nr-btn-ghost !px-3 !py-2 text-sm">⌘K</button>
        </div>
      </header>

      {!online && (
        <div className="mx-4 mb-1 rounded-xl px-3 py-2 text-xs font-semibold bg-amber-500/15 border border-amber-500/30 text-amber-200" role="alert">
          You're offline — everything local keeps working. AI needs a connection.
        </div>
      )}

      {/* main */}
      <main className="flex-1 overflow-y-auto nr-scroll px-4 pb-28 pt-1" id="nr-main">
        {children}
      </main>

      {/* bottom nav */}
      <nav className="fixed bottom-0 inset-x-0 z-[80] nr-safe-bottom" aria-label="Primary">
        <div className="mx-3 mb-3 nr-glass rounded-2xl flex justify-around px-1 py-1.5">
          {tabs.map((t) => {
            const active = view === t.v || (t.v !== 'home' && t.v !== 'launcher' && view === t.v);
            return (
              <button key={t.v} onClick={() => go(t.v)} aria-current={active ? 'page' : undefined}
                className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl min-w-[56px] transition active:scale-95"
                style={active ? { background: 'var(--accent-soft)' } : undefined}>
                <span className="text-xl leading-none" style={active ? { color: 'var(--accent)' } : undefined} aria-hidden>{t.icon}</span>
                <span className={`text-[10px] font-semibold ${active ? '' : 'opacity-50'}`}>{t.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* command palette */}
      {palette && (
        <div className="fixed inset-0 z-[95]" role="dialog" aria-modal="true" aria-label="Command bar">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setPalette(false)} />
          <div className="relative mx-3 mt-20 nr-glass rounded-2xl overflow-hidden animate-fade-up">
            <div className="p-3 border-b" style={{ borderColor: 'var(--border)' }}>
              <Field ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="Type a command or search apps…" aria-label="Search commands and apps" />
            </div>
            <div className="max-h-72 overflow-y-auto nr-scroll p-2">
              {results.length === 0 && <div className="p-4 text-sm opacity-60 text-center">No matches.</div>}
              {results.map(({ meta, hint }) => (
                <button key={meta.id + hint} onClick={() => { setPalette(false); onOpenApp(meta.id); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 text-left transition">
                  <span className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0"
                    style={{ background: `${meta.accent}22`, color: meta.accent }} aria-hidden>{meta.icon}</span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold truncate">{meta.name}</span>
                    <span className="block text-xs opacity-55 truncate">{hint}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
