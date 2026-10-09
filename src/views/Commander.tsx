import React, { useContext, useEffect, useRef, useState } from 'react';
import { ChatMessage, ChatThread, Project, Task, todayISO, uid } from '../types';
import { Btn, Empty, Field, GhostBtn, Markdown, Modal, PageHead, useConfirm, useToast } from '../components/ui';
import { PrefsCtx } from '../App';
import { idb, logActivity } from '../services/db';
import { aiStatus, buildSystemPrompt, streamChat, AIStatus, StreamEvent } from '../services/ai';
import { NexoraLogo } from '../components/Logo';

export default function Commander() {
  const { prefs } = useContext(PrefsCtx);
  const toast = useToast();
  const { ask, ui: confirmUi } = useConfirm();
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<AIStatus | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [showThreads, setShowThreads] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const refreshThreads = async () => {
    const t = await idb.all<ChatThread>('chatThreads');
    t.sort((a, b) => b.updatedAt - a.updatedAt);
    setThreads(t);
    if (!activeId && t.length > 0) setActiveId(t[0].id);
  };
  useEffect(() => { refreshThreads().catch(() => {}); }, []);
  useEffect(() => { aiStatus().then(setStatus).catch(() => {}); }, []);

  const active = threads.find((t) => t.id === activeId) ?? null;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [active?.messages.length, busy]);

  const newThread = async () => {
    const th: ChatThread = { id: uid(), title: 'New conversation', messages: [], createdAt: Date.now(), updatedAt: Date.now() };
    await idb.put('chatThreads', th);
    setThreads((p) => [th, ...p]);
    setActiveId(th.id);
    setShowThreads(false);
  };

  const deleteThread = async (id: string) => {
    if (!(await ask('Delete this conversation? This cannot be undone.'))) return;
    await idb.del('chatThreads', id);
    setThreads((p) => p.filter((t) => t.id !== id));
    if (activeId === id) setActiveId((p) => { const rest = threads.filter((t) => t.id !== id); return rest[0]?.id ?? null; });
    toast({ kind: 'ok', title: 'Conversation deleted' });
  };

  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || busy) return;
    setInput('');
    let th = active;
    if (!th) {
      th = { id: uid(), title: content.slice(0, 42), messages: [], createdAt: Date.now(), updatedAt: Date.now() };
      await idb.put('chatThreads', th);
      setThreads((p) => [th!, ...p]);
      setActiveId(th.id);
    }
    const userMsg: ChatMessage = { id: uid(), role: 'user', content, ts: Date.now() };
    const asstMsg: ChatMessage = { id: uid(), role: 'assistant', content: '', ts: Date.now() };
    const base = [...th.messages, userMsg];
    const optimistic: ChatThread = {
      ...th,
      messages: [...base, asstMsg],
      title: th.messages.length === 0 ? content.slice(0, 42) : th.title,
      updatedAt: Date.now(),
    };
    setThreads((p) => p.map((t) => (t.id === th!.id ? optimistic : t)));
    setBusy(true);
    setStatusMsg(null);
    abortRef.current = new AbortController();

    // Build contextual system prompt from real local data
    const [tasks, projects, sessions] = await Promise.all([
      idb.all<Task>('tasks'), idb.all<Project>('projects'),
      idb.all<{ finishedAt: number; minutesActual: number }>('focusSessions'),
    ]);
    const today = todayISO();
    const due = tasks.filter((t) => !t.done && t.due && t.due <= today).length;
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const focusMin = sessions.filter((s) => s.finishedAt >= start.getTime()).reduce((s, x) => s + x.minutesActual, 0);
    const system = buildSystemPrompt({
      name: prefs.name,
      tasksDue: due,
      activeProjects: projects.filter((p) => p.status === 'active').map((p) => p.name),
      focusTodayMin: focusMin,
    });

    let full = '';
    let usedProvider = '';
    const live: ChatMessage[] = [...optimistic.messages];
    const pushMsg = (m: ChatMessage) => {
      const i = live.findIndex((x) => x.id === m.id);
      if (i >= 0) live[i] = m;
      setThreads((p) => p.map((t) => t.id === th!.id
        ? { ...t, messages: t.messages.map((x) => (x.id === m.id ? m : x)), updatedAt: Date.now() }
        : t));
    };
    const handleEvent = (e: StreamEvent) => {
      if (e.type === 'token') { full += e.text; pushMsg({ ...asstMsg, content: full, provider: usedProvider || undefined }); }
      else if (e.type === 'status') { usedProvider = e.provider; setStatusMsg(`Connected · ${e.provider}`); }
      else if (e.type === 'switched') {
        usedProvider = e.to;
        setStatusMsg(`Switched to ${e.to} — ${e.reason}`);
        toast({ kind: 'info', title: `AI switched to ${e.to}`, body: 'Automatic failover kicked in. Your chat continues.' });
      } else if (e.type === 'done') {
        usedProvider = e.provider;
        pushMsg({ ...asstMsg, content: full || '—', provider: e.provider });
      } else if (e.type === 'error') {
        pushMsg({ ...asstMsg, content: full || e.message, provider: usedProvider || undefined, error: true });
        setStatusMsg(null);
        if (!full) toast({ kind: 'err', title: 'AI request failed', body: e.message });
      }
    };

    try {
      await streamChat({
        messages: base.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        system,
        signal: abortRef.current.signal,
        onEvent: handleEvent,
      });
      await logActivity('ai', `Asked AI Commander (${usedProvider || 'unknown provider'})`);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        pushMsg({ ...asstMsg, content: 'Connection interrupted. Please check your network and try again.', error: true });
      }
    } finally {
      setBusy(false);
      const toSave: ChatThread = { ...optimistic, messages: live, updatedAt: Date.now() };
      await idb.put('chatThreads', toSave).catch(() => {});
      setThreads((p) => p.map((t) => (t.id === th!.id ? toSave : t)));
    }
  };

  const retry = (m: ChatMessage) => {
    // remove failed assistant msg + resend last user msg
    if (!active) return;
    const idx = active.messages.findIndex((x) => x.id === m.id);
    const userMsg = [...active.messages.slice(0, idx)].reverse().find((x) => x.role === 'user');
    if (!userMsg) return;
    const trimmed = { ...active, messages: active.messages.slice(0, idx) };
    setThreads((p) => p.map((t) => (t.id === trimmed.id ? trimmed : t)));
    idb.put('chatThreads', trimmed).then(() => send(userMsg.content));
  };

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast({ kind: 'ok', title: 'Copied to clipboard' }); }
    catch { toast({ kind: 'err', title: 'Copy failed' }); }
  };

  const configured = status && (status.gemini || status.groq);

  return (
    <div className="animate-fade-up flex flex-col h-full">
      <PageHead title="AI Commander" sub={statusMsg ?? (configured ? `Gemini ${status?.gemini ? '●' : '○'} · Groq ${status?.groq ? '●' : '○'}` : 'Checking AI status…')}
        right={
          <>
            <GhostBtn className="!px-3 !py-2 !text-xs" onClick={() => setShowThreads(true)}>☰ Chats</GhostBtn>
            <Btn className="!px-3 !py-2 !text-xs" onClick={newThread}>＋ New</Btn>
          </>
        } />

      {!status ? null : !configured ? (
        <div className="nr-card mb-4">
          <div className="flex items-center gap-3 mb-2"><NexoraLogo size={32} animate={false} />
            <h2 className="font-bold text-sm">AI isn't connected yet</h2></div>
          <p className="text-xs opacity-70 mb-3 leading-relaxed">
            The Commander needs <code>GEMINI_API_KEY</code> and/or <code>GROQ_API_KEY</code> as <b>server</b> environment
            variables on your deployment (Vercel → Project → Settings → Environment Variables). Keys never go in the app code.
            Until then, every other mini-app works fully offline.
          </p>
          <p className="text-xs opacity-50">Failover is automatic: Gemini answers first, Groq takes over on rate limits, quota or outages — you never switch manually.</p>
        </div>
      ) : null}

      {/* messages */}
      <div className="flex-1 overflow-y-auto nr-scroll flex flex-col gap-3 pb-3 min-h-[40vh]" aria-live="polite">
        {!active || active.messages.length === 0 ? (
          <Empty icon="✦" title="Ask anything" body="Coding help, study plans, writing, brainstorming — the Commander remembers this conversation."
            action={
              <div className="flex flex-wrap gap-2 justify-center mt-2">
                {['Plan my study week', 'Explain async/await simply', 'Draft a project idea', 'Summarise my day'].map((s) => (
                  <button key={s} onClick={() => send(s)} className="nr-chip !py-1.5 !px-3">{s}</button>
                ))}
              </div>
            } />
        ) : (
          active.messages.map((m) => (
            <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 ${m.role === 'user' ? 'text-black' : 'nr-glass'} ${m.error ? '!border-red-500/50' : ''}`}
                style={m.role === 'user' ? { background: 'var(--accent)' } : undefined}>
                {m.role === 'assistant' ? (
                  m.content ? <Markdown text={m.content} /> : <span className="nr-skeleton inline-block w-24 h-4" />
                ) : (
                  <p className="text-sm whitespace-pre-wrap">{m.content}</p>
                )}
                <div className="flex items-center gap-2 mt-1.5">
                  {m.provider && <span className="text-[10px] opacity-50">via {m.provider}</span>}
                  {m.role === 'assistant' && m.content && !busy && (
                    <>
                      <button onClick={() => copy(m.content)} className="text-[10px] opacity-50 hover:opacity-100">Copy</button>
                      {m.error && <button onClick={() => retry(m)} className="text-[10px] font-bold" style={{ color: 'var(--accent)' }}>Retry</button>}
                    </>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* input */}
      <div className="shrink-0 pt-2">
        {busy && (
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs opacity-60 animate-pulse-soft">Commander is thinking…</span>
            <button onClick={() => abortRef.current?.abort()} className="text-xs font-bold text-red-400">■ Stop</button>
          </div>
        )}
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <Field value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask the Commander…" aria-label="Message the AI" disabled={busy} />
          <Btn type="submit" disabled={busy || !input.trim()} className="!px-4" aria-label="Send">➤</Btn>
        </form>
        <p className="text-[10px] opacity-40 text-center mt-2">AI can make mistakes. Important actions always need your approval.</p>
      </div>

      {/* thread drawer */}
      {showThreads && (
        <Modal title="Conversations" onClose={() => setShowThreads(false)}>
          <div className="flex flex-col gap-2">
            {threads.length === 0 && <p className="text-sm opacity-60 text-center py-6">No conversations yet.</p>}
            {threads.map((t) => (
              <div key={t.id} className="flex items-center gap-2 rounded-xl p-2.5" style={{ background: t.id === activeId ? 'var(--accent-soft)' : 'var(--surface-solid)' }}>
                <button className="flex-1 text-left min-w-0" onClick={() => { setActiveId(t.id); setShowThreads(false); }}>
                  <div className="text-sm font-semibold truncate">{t.title}</div>
                  <div className="text-[11px] opacity-50">{t.messages.length} messages</div>
                </button>
                <button onClick={() => deleteThread(t.id)} aria-label="Delete conversation" className="opacity-50 hover:opacity-100 px-2">🗑</button>
              </div>
            ))}
          </div>
        </Modal>
      )}
      {confirmUi}
    </div>
  );
}
