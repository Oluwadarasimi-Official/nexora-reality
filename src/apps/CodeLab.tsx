import React, { useEffect, useMemo, useState } from 'react';
import { Snippet, uid } from '../types';
import { Area, Btn, DemoBadge, Empty, Field, GhostBtn, Label, Modal, PageHead, useConfirm, useToast } from '../components/ui';
import { idb, logActivity } from '../services/db';
import { streamChat } from '../services/ai';

const LANGS: Snippet['language'][] = ['javascript', 'typescript', 'html', 'css', 'python', 'text'];

function useHighlight(code: string, lang: string) {
  const [html, setHtml] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setHtml(null);
    import('highlight.js/lib/core').then(async (core) => {
      const hljs = core.default;
      const loaders: Record<string, () => Promise<unknown>> = {
        javascript: () => import('highlight.js/lib/languages/javascript'),
        typescript: () => import('highlight.js/lib/languages/typescript'),
        html: () => import('highlight.js/lib/languages/xml'),
        css: () => import('highlight.js/lib/languages/css'),
        python: () => import('highlight.js/lib/languages/python'),
      };
      try {
        if (lang !== 'text' && !hljs.getLanguage(lang === 'html' ? 'xml' : lang)) {
          const mod = await loaders[lang]();
          hljs.registerLanguage(lang === 'html' ? 'xml' : lang, (mod as { default: (h: unknown) => unknown }).default as never);
        }
        if (!alive) return;
        const out = lang === 'text' ? null : hljs.highlight(code, { language: lang === 'html' ? 'xml' : lang }).value;
        setHtml(out);
      } catch { if (alive) setHtml(null); }
    });
    return () => { alive = false; };
  }, [code, lang]);
  return html;
}

export default function CodeLab() {
  const toast = useToast();
  const { ask, ui: confirmUi } = useConfirm();
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [form, setForm] = useState<Snippet | 'new' | null>(null);

  const refresh = async () => {
    const s = await idb.all<Snippet>('snippets');
    setSnippets(s.sort((a, b) => b.updatedAt - a.updatedAt));
  };
  useEffect(() => { refresh().catch(() => {}); }, []);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return snippets;
    return snippets.filter((s) => (s.title + ' ' + s.code + ' ' + s.notes).toLowerCase().includes(needle));
  }, [snippets, q]);

  const remove = async (s: Snippet) => {
    if (!(await ask(`Delete snippet "${s.title}"?`))) return;
    await idb.del('snippets', s.id);
    setOpenId(null);
    toast({ kind: 'ok', title: 'Snippet deleted' });
    refresh();
  };

  const open = snippets.find((s) => s.id === openId) ?? null;

  return (
    <div className="animate-fade-up">
      <PageHead title="Code Lab" sub={`${snippets.length} snippets · sandboxed previews`}
        right={<Btn className="!px-3 !py-2 !text-xs" onClick={() => setForm('new')}>＋ New snippet</Btn>} />
      <div className="mb-4"><Field value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search snippets…" aria-label="Search snippets" /></div>

      {visible.length === 0 ? (
        <Empty icon="⌁" title="No snippets yet" body="Save reusable code with notes and explanations."
          action={<Btn className="!text-xs" onClick={() => setForm('new')}>＋ New snippet</Btn>} />
      ) : (
        <div className="grid grid-cols-1 gap-2.5">
          {visible.map((s) => (
            <button key={s.id} onClick={() => setOpenId(s.id)} className="nr-card !p-3.5 text-left active:scale-[0.99] transition">
              <div className="flex items-center justify-between gap-2">
                <div className="font-bold text-sm truncate">{s.title} {s.demo && <DemoBadge />}</div>
                <span className="nr-chip !py-0.5">{s.language}</span>
              </div>
              <pre className="text-[11px] opacity-60 truncate mt-1.5 font-mono">{s.code.split('\n')[0]}</pre>
            </button>
          ))}
        </div>
      )}

      {open && <SnippetDetail s={open} onClose={() => setOpenId(null)} onEdit={() => setForm(open)} onDelete={() => remove(open)} />}
      {form && (
        <SnippetForm initial={form === 'new' ? null : form}
          onClose={() => setForm(null)}
          onSaved={() => { setForm(null); refresh(); toast({ kind: 'ok', title: 'Snippet saved' }); }} />
      )}
      {confirmUi}
    </div>
  );
}

function CodeView({ code, lang }: { code: string; lang: string }) {
  const html = useHighlight(code, lang);
  if (html === null) return <pre className="text-xs font-mono whitespace-pre-wrap opacity-80">{code}</pre>;
  return <pre className="text-xs font-mono overflow-x-auto nr-scroll"><code className="hljs" dangerouslySetInnerHTML={{ __html: html }} /></pre>;
}

function SnippetDetail({ s, onClose, onEdit, onDelete }: { s: Snippet; onClose: () => void; onEdit: () => void; onDelete: () => void }) {
  const toast = useToast();
  const [explain, setExplain] = useState('');
  const [explaining, setExplaining] = useState(false);

  const copy = async () => {
    try { await navigator.clipboard.writeText(s.code); toast({ kind: 'ok', title: 'Code copied' }); }
    catch { toast({ kind: 'err', title: 'Copy failed' }); }
  };

  const explainCode = async () => {
    setExplaining(true);
    setExplain('');
    let out = '';
    try {
      await streamChat({
        messages: [{ role: 'user', content: `Explain this ${s.language} code briefly, line by line where useful:\n\n\`\`\`${s.language}\n${s.code}\n\`\`\`` }],
        system: 'You are a concise coding tutor. Explain clearly for a student. Keep it short.',
        onEvent: (e) => {
          if (e.type === 'token') { out += e.text; setExplain(out); }
          if (e.type === 'error' && !out) toast({ kind: 'err', title: 'Explanation failed', body: e.message });
        },
      });
    } finally { setExplaining(false); }
  };

  const previewDoc = s.language === 'html'
    ? `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${s.code}</body></html>`
    : null;

  return (
    <Modal title={s.title} onClose={onClose} wide>
      <div className="flex items-center gap-2 mb-3">
        <span className="nr-chip">{s.language}</span>
        {s.demo && <DemoBadge />}
        <span className="flex-1" />
        <GhostBtn className="!text-xs !py-1.5" onClick={copy}>⧉ Copy</GhostBtn>
      </div>
      <div className="rounded-xl p-3 mb-3 overflow-x-auto nr-scroll" style={{ background: '#04080f' }}>
        <CodeView code={s.code} lang={s.language} />
      </div>
      {s.notes && <p className="text-sm opacity-70 mb-4">{s.notes}</p>}

      {previewDoc && (
        <><h3 className="text-xs font-bold uppercase tracking-wider opacity-50 mb-2">Sandboxed preview</h3>
          <div className="rounded-2xl overflow-hidden border mb-4" style={{ borderColor: 'var(--border)' }}>
            <iframe title="Snippet preview" srcDoc={previewDoc} sandbox="allow-scripts" className="w-full bg-white" style={{ height: 220 }} />
          </div></>
      )}

      <div className="nr-card !p-3 mb-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-bold uppercase tracking-wider opacity-60">✦ AI explanation</h3>
          <GhostBtn className="!text-xs !py-1.5" onClick={explainCode} disabled={explaining}>{explaining ? 'Thinking…' : 'Explain'}</GhostBtn>
        </div>
        {explain ? <div className="text-sm"><CodeView code={explain} lang="text" /></div>
          : <p className="text-xs opacity-50">Needs AI configured in Settings.</p>}
      </div>

      <div className="flex gap-2 justify-end">
        <GhostBtn className="!text-xs" onClick={onDelete}>🗑 Delete</GhostBtn>
        <Btn className="!text-xs" onClick={() => { onClose(); onEdit(); }}>✎ Edit</Btn>
      </div>
    </Modal>
  );
}

function SnippetForm({ initial, onClose, onSaved }: { initial: Snippet | null; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [language, setLanguage] = useState<Snippet['language']>(initial?.language ?? 'javascript');
  const [code, setCode] = useState(initial?.code ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [err, setErr] = useState('');

  const save = async () => {
    if (!title.trim() || !code.trim()) { setErr('Title and code are required.'); return; }
    const s: Snippet = {
      id: initial?.id ?? uid(), title: title.trim(), language, code,
      notes: notes.trim(), updatedAt: Date.now(), demo: initial?.demo,
    };
    await idb.put('snippets', s);
    await logActivity('codelab', `${initial ? 'Updated' : 'Saved'} snippet: ${s.title}`);
    onSaved();
  };

  return (
    <Modal title={initial ? 'Edit snippet' : 'New snippet'} onClose={onClose} wide>
      <div className="flex flex-col gap-4">
        <div><Label>Title</Label><Field value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Debounce helper" maxLength={80} autoFocus /></div>
        <div><Label>Language</Label>
          <div className="flex gap-2 flex-wrap">{LANGS.map((l) => (
            <button key={l} onClick={() => setLanguage(l)} aria-pressed={language === l}
              className={`nr-chip !py-1.5 !px-3 ${language === l ? '!bg-emerald-500 !text-black' : ''}`}>{l}</button>
          ))}</div></div>
        <div><Label>Code</Label><Area rows={10} value={code} onChange={(e) => setCode(e.target.value)} spellCheck={false} className="font-mono !text-[12.5px]" placeholder="// paste or write code…" /></div>
        <div><Label>Notes</Label><Area rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What is this for?" /></div>
        {err && <p className="text-xs text-red-400" role="alert">{err}</p>}
        <div className="flex gap-3 justify-end">
          <GhostBtn onClick={onClose}>Cancel</GhostBtn>
          <Btn onClick={save}>Save snippet</Btn>
        </div>
      </div>
    </Modal>
  );
}
