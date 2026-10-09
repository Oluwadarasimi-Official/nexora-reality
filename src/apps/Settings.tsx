import React, { useContext, useEffect, useState } from 'react';
import { APPS, AppId } from '../types';
import { Btn, Field, GhostBtn, Label, PageHead, Toggle, useConfirm, useToast } from '../components/ui';
import { PrefsCtx } from '../App';
import { STORES, StoreName, idb } from '../services/db';
import { aiStatus, AIStatus } from '../services/ai';
import { clearDemoData } from '../services/demo';

const ACCENTS = [
  { c: '#10b981', n: 'Emerald' }, { c: '#38bdf8', n: 'Sky' }, { c: '#a78bfa', n: 'Violet' },
  { c: '#f59e0b', n: 'Amber' }, { c: '#f472b6', n: 'Rose' }, { c: '#d4af37', n: 'Gold' },
];

export default function Settings() {
  const { prefs, setPrefs } = useContext(PrefsCtx);
  const toast = useToast();
  const { ask, ui: confirmUi } = useConfirm();
  const [ai, setAi] = useState<AIStatus | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [storage, setStorage] = useState<string>('');

  const refresh = async () => {
    aiStatus().then(setAi).catch(() => {});
    const c: Record<string, number> = {};
    for (const s of STORES) { try { c[s] = await idb.count(s as StoreName); } catch { c[s] = 0; } }
    setCounts(c);
    try {
      const est = await navigator.storage.estimate();
      if (est.usage) setStorage(fmtBytes(est.usage));
    } catch { /* unsupported */ }
  };
  useEffect(() => { refresh().catch(() => {}); }, []);

  const togglePin = (id: AppId) => {
    const has = prefs.pinned.includes(id);
    setPrefs({ pinned: has ? prefs.pinned.filter((x) => x !== id) : [...prefs.pinned, id] });
  };

  const exportAll = async () => {
    const data: Record<string, unknown> = { exportedAt: new Date().toISOString(), version: 1 };
    for (const s of STORES) { try { data[s] = await idb.all(s as StoreName); } catch { data[s] = []; } }
    data.prefs = prefs;
    dl('nexora-backup.json', JSON.stringify(data, null, 2));
    toast({ kind: 'ok', title: 'Backup downloaded' });
  };

  const importAll = async (file: File) => {
    try {
      const data = JSON.parse(await file.text()) as Record<string, unknown[]>;
      let n = 0;
      for (const s of STORES) {
        const rows = data[s];
        if (Array.isArray(rows)) {
          for (const r of rows) {
            if (r && typeof (r as { id?: unknown }).id === 'string') { await idb.put(s as StoreName, r as { id: string }); n++; }
          }
        }
      }
      toast({ kind: 'ok', title: `Imported ${n} records` });
      refresh();
    } catch {
      toast({ kind: 'err', title: 'Import failed', body: 'That file is not a valid NEXORA backup.' });
    }
  };

  const wipeDemo = async () => {
    if (!(await ask('Delete all DEMO sample data? Your own data stays.'))) return;
    const out = await clearDemoData();
    const total = Object.values(out).reduce((a, b) => a + b, 0);
    toast({ kind: 'ok', title: `Removed ${total} demo records` });
    refresh();
  };

  const wipeAll = async () => {
    if (!(await ask('Delete EVERYTHING — all tasks, notes, projects, chats and files? This cannot be undone.'))) return;
    if (!(await ask('Final check: really erase all local NEXORA data?'))) return;
    for (const s of STORES) { try { await idb.clear(s as StoreName); } catch { /* noop */ } }
    toast({ kind: 'ok', title: 'All data erased' });
    refresh();
  };

  return (
    <div className="animate-fade-up">
      <PageHead title="Settings" sub="Theme, AI, privacy & data" />

      {/* profile */}
      <section className="nr-card mb-4">
        <h2 className="font-bold text-sm mb-3">Profile</h2>
        <Label>Display name</Label>
        <Field value={prefs.name} onChange={(e) => setPrefs({ name: e.target.value })} placeholder="Your name" maxLength={40} />
      </section>

      {/* appearance */}
      <section className="nr-card mb-4">
        <h2 className="font-bold text-sm mb-3">Appearance</h2>
        <Label>Theme</Label>
        <div className="flex gap-2.5 mb-4">
          {(['dark', 'light'] as const).map((t) => (
            <button key={t} onClick={() => setPrefs({ theme: t })} aria-pressed={prefs.theme === t}
              className="flex-1 rounded-xl p-3.5 border-2 capitalize font-bold text-sm transition"
              style={{ borderColor: prefs.theme === t ? 'var(--accent)' : 'var(--border)', background: 'var(--surface-solid)' }}>
              {t === 'dark' ? '🌙 Dark' : '☀️ Light'}
            </button>
          ))}
        </div>
        <Label>Accent colour</Label>
        <div className="flex gap-2.5 flex-wrap">
          {ACCENTS.map((a) => (
            <button key={a.c} onClick={() => setPrefs({ accent: a.c })} aria-label={`${a.n} accent`} title={a.n}
              className="w-10 h-10 rounded-full transition active:scale-90"
              style={{ background: a.c, boxShadow: prefs.accent === a.c ? `0 0 0 3px var(--bg), 0 0 0 5px ${a.c}` : 'none' }} />
          ))}
        </div>
      </section>

      {/* accessibility */}
      <section className="nr-card mb-4">
        <h2 className="font-bold text-sm mb-3">Accessibility</h2>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div><div className="text-sm font-semibold">Reduce motion</div><div className="text-xs opacity-55">Minimises animations</div></div>
            <Toggle label="Reduce motion" checked={prefs.reduceMotion} onChange={(v) => setPrefs({ reduceMotion: v })} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <div><div className="text-sm font-semibold">Larger text</div><div className="text-xs opacity-55">Easier to read</div></div>
            <Toggle label="Larger text" checked={prefs.largeText} onChange={(v) => setPrefs({ largeText: v })} />
          </div>
        </div>
      </section>

      {/* pinned apps */}
      <section className="nr-card mb-4">
        <h2 className="font-bold text-sm mb-1">Pinned apps</h2>
        <p className="text-xs opacity-55 mb-3">Shown on your Home dashboard.</p>
        <div className="grid grid-cols-2 gap-2">
          {APPS.map((a) => {
            const on = prefs.pinned.includes(a.id);
            return (
              <button key={a.id} onClick={() => togglePin(a.id)} aria-pressed={on}
                className="flex items-center gap-2.5 rounded-xl p-2.5 text-left transition"
                style={{ background: on ? 'var(--accent-soft)' : 'var(--surface-solid)', opacity: on ? 1 : 0.55 }}>
                <span className="text-xl" style={{ color: a.accent }} aria-hidden>{a.icon}</span>
                <span className="text-xs font-bold flex-1">{a.name}</span>
                <span aria-hidden>{on ? '★' : '☆'}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* AI status */}
      <section className="nr-card mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-sm">AI status</h2>
          <GhostBtn className="!text-xs !py-1.5" onClick={() => aiStatus().then(setAi)}>↻ Recheck</GhostBtn>
        </div>
        {!ai ? <p className="text-xs opacity-60">Checking…</p> : (
          <div className="flex flex-col gap-2 text-sm">
            <StatusRow label="Gemini" on={ai.gemini} detail={ai.gemini ? ai.geminiModel ?? '' : 'key not set'} />
            <StatusRow label="Groq" on={ai.groq} detail={ai.groq ? ai.groqModel ?? '' : 'key not set'} />
            <StatusRow label="Primary provider" on={ai.gemini || ai.groq} detail={ai.primary} />
            <p className="text-[11px] opacity-55 leading-relaxed mt-1">
              Keys live only as <b>server</b> environment variables (<code>GEMINI_API_KEY</code>, <code>GROQ_API_KEY</code>).
              The app never sees them. Failover is automatic — if one provider hits a rate limit, quota or outage, the other takes over and you'll see a small notice.
            </p>
          </div>
        )}
      </section>

      {/* privacy */}
      <section className="nr-card mb-4">
        <h2 className="font-bold text-sm mb-2">Privacy</h2>
        <ul className="text-xs opacity-70 leading-relaxed flex flex-col gap-1.5 list-disc pl-4">
          <li><b>On this device:</b> tasks, notes, projects, snippets, pages, files, focus history, chats. Stored in IndexedDB — never leaves your phone unless you export it.</li>
          <li><b>Preferences only</b> (theme, name, pins) use localStorage.</li>
          <li><b>AI chats</b> go to our serverless endpoint, which forwards them to Gemini/Groq. No keys or passwords are ever stored locally.</li>
          <li><b>Cloud sync</b> (Supabase) is optional and off by default — wire it up only if you need it.</li>
        </ul>
      </section>

      {/* storage & data */}
      <section className="nr-card mb-4">
        <h2 className="font-bold text-sm mb-3">Storage & data</h2>
        <div className="grid grid-cols-2 gap-2 mb-4">
          {STORES.map((s) => (
            <div key={s} className="rounded-xl p-2.5 text-xs" style={{ background: 'var(--surface-solid)' }}>
              <div className="font-bold capitalize">{s}</div>
              <div className="opacity-55">{counts[s] ?? '…'} records</div>
            </div>
          ))}
        </div>
        {storage && <p className="text-xs opacity-55 mb-3">Estimated device usage: {storage}</p>}
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Btn className="!text-xs flex-1" onClick={exportAll}>⤓ Export backup</Btn>
            <label className="nr-btn-ghost !text-xs flex-1 cursor-pointer text-center">
              ⤒ Import backup
              <input type="file" accept="application/json,.json" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) importAll(f); e.target.value = ''; }} />
            </label>
          </div>
          <GhostBtn className="!text-xs" onClick={wipeDemo}>🧹 Remove demo data</GhostBtn>
          <button onClick={wipeAll} className="text-xs font-bold text-red-400 py-2">Delete all local data</button>
        </div>
      </section>

      <section className="nr-card text-center">
        <div className="text-xs opacity-60">NEXORA REALITY · v1.0.0</div>
        <div className="text-[11px] opacity-40 mt-1">Crafted for David · works offline · ₦0 stack</div>
      </section>
      {confirmUi}
    </div>
  );
}

function StatusRow({ label, on, detail }: { label: string; on: boolean; detail: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={`w-2.5 h-2.5 rounded-full ${on ? 'bg-emerald-400' : 'bg-slate-500'}`} aria-hidden />
      <span className="font-semibold">{label}</span>
      <span className="text-xs opacity-55 ml-auto text-right">{detail}</span>
    </div>
  );
}

function fmtBytes(b: number) {
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}
function dl(name: string, text: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
