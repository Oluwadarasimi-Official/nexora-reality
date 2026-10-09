import React, { useEffect, useMemo, useState } from 'react';
import { Note, uid } from '../types';
import { Area, Btn, DemoBadge, Empty, Field, GhostBtn, Label, Markdown, Modal, PageHead, useConfirm, useToast } from '../components/ui';
import { idb, logActivity } from '../services/db';

export default function Vault() {
  const toast = useToast();
  const { ask, ui: confirmUi } = useConfirm();
  const [notes, setNotes] = useState<Note[]>([]);
  const [q, setQ] = useState('');
  const [folder, setFolder] = useState<string>('all');
  const [tag, setTag] = useState<string>('all');
  const [favOnly, setFavOnly] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Note | 'new' | null>(null);

  const refresh = async () => {
    const n = await idb.all<Note>('notes');
    setNotes(n.sort((a, b) => b.updatedAt - a.updatedAt));
  };
  useEffect(() => { refresh().catch(() => {}); }, []);

  const folders = useMemo(() => ['all', ...new Set(notes.map((n) => n.folder))], [notes]);
  const tags = useMemo(() => ['all', ...new Set(notes.flatMap((n) => n.tags))], [notes]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return notes.filter((n) => {
      if (folder !== 'all' && n.folder !== folder) return false;
      if (tag !== 'all' && !n.tags.includes(tag)) return false;
      if (favOnly && !n.favourite) return false;
      if (needle && !(n.title + ' ' + n.body + ' ' + n.tags.join(' ')).toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [notes, q, folder, tag, favOnly]);

  const toggleFav = async (n: Note) => {
    const next = { ...n, favourite: !n.favourite, updatedAt: Date.now() };
    await idb.put('notes', next);
    refresh();
  };

  const remove = async (n: Note) => {
    if (!(await ask(`Delete note "${n.title}"?`))) return;
    await idb.del('notes', n.id);
    setOpenId(null);
    toast({ kind: 'ok', title: 'Note deleted' });
    refresh();
  };

  const open = notes.find((n) => n.id === openId) ?? null;

  return (
    <div className="animate-fade-up">
      <PageHead title="Knowledge Vault" sub={`${notes.length} notes · markdown supported`}
        right={<Btn className="!px-3 !py-2 !text-xs" onClick={() => setEditing('new')}>＋ New note</Btn>} />

      <div className="flex flex-col gap-2.5 mb-4">
        <Field value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search notes, tags…" aria-label="Search notes" />
        <div className="flex gap-2 overflow-x-auto nr-scroll pb-0.5">
          {folders.map((f) => (
            <button key={f} onClick={() => setFolder(f)} aria-pressed={folder === f}
              className={`nr-chip !py-1.5 !px-3 whitespace-nowrap ${folder === f ? '!bg-emerald-500 !text-black' : ''}`}>{f}</button>
          ))}
          <button onClick={() => setFavOnly((v) => !v)} aria-pressed={favOnly}
            className={`nr-chip !py-1.5 !px-3 whitespace-nowrap ${favOnly ? '!bg-emerald-500 !text-black' : ''}`}>★ Favourites</button>
        </div>
        {tags.length > 2 && (
          <div className="flex gap-2 overflow-x-auto nr-scroll pb-0.5">
            {tags.map((t) => (
              <button key={t} onClick={() => setTag(t)} aria-pressed={tag === t}
                className={`text-xs px-2 py-1 rounded-lg whitespace-nowrap ${tag === t ? 'text-black font-bold' : 'opacity-60'}`}
                style={tag === t ? { background: 'var(--accent)' } : { background: 'var(--accent-soft)' }}>
                #{t}</button>
            ))}
          </div>
        )}
      </div>

      {visible.length === 0 ? (
        <Empty icon="▤" title="No notes found" body="Capture ideas, study notes and plans. Everything stays on your device."
          action={<Btn className="!text-xs" onClick={() => setEditing('new')}>＋ New note</Btn>} />
      ) : (
        <div className="grid grid-cols-1 gap-2.5">
          {visible.map((n) => (
            <button key={n.id} onClick={() => setOpenId(n.id)} className="nr-card !p-3.5 text-left active:scale-[0.99] transition">
              <div className="flex items-start justify-between gap-2">
                <div className="font-bold text-sm truncate">{n.favourite ? '★ ' : ''}{n.title} {n.demo && <DemoBadge />}</div>
                <span className="text-[10px] opacity-40 shrink-0">{new Date(n.updatedAt).toLocaleDateString()}</span>
              </div>
              <p className="text-xs opacity-60 truncate mt-1">{n.body.replace(/[#*`>\n-]/g, '').slice(0, 90)}</p>
              <div className="flex gap-1.5 mt-2 flex-wrap">
                <span className="nr-chip !py-0.5">{n.folder}</span>
                {n.tags.slice(0, 3).map((t) => <span key={t} className="text-[10px] opacity-50">#{t}</span>)}
              </div>
            </button>
          ))}
        </div>
      )}

      {open && (
        <Modal title={open.title} onClose={() => setOpenId(null)} wide>
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <span className="nr-chip">{open.folder}</span>
            {open.tags.map((t) => <span key={t} className="text-xs opacity-60">#{t}</span>)}
            {open.demo && <DemoBadge />}
          </div>
          <Markdown text={open.body} className="mb-6" />
          <div className="flex gap-2 justify-end flex-wrap">
            <GhostBtn className="!text-xs" onClick={() => toggleFav(open)}>{open.favourite ? '★ Unfavourite' : '☆ Favourite'}</GhostBtn>
            <GhostBtn className="!text-xs" onClick={() => remove(open)}>🗑 Delete</GhostBtn>
            <Btn className="!text-xs" onClick={() => { setEditing(open); }}>✎ Edit</Btn>
          </div>
        </Modal>
      )}

      {editing && (
        <NoteForm initial={editing === 'new' ? null : editing} folders={folders.filter((f) => f !== 'all')}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); setOpenId(null); refresh(); toast({ kind: 'ok', title: 'Note saved' }); }} />
      )}
      {confirmUi}
    </div>
  );
}

function NoteForm({ initial, folders, onClose, onSaved }: {
  initial: Note | null; folders: string[]; onClose: () => void; onSaved: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [folder, setFolder] = useState(initial?.folder ?? folders[0] ?? 'General');
  const [newFolder, setNewFolder] = useState('');
  const [tags, setTags] = useState((initial?.tags ?? []).join(', '));
  const [err, setErr] = useState('');

  const save = async () => {
    if (!title.trim() && !body.trim()) { setErr('Write something first.'); return; }
    const f = newFolder.trim() || folder;
    const n: Note = {
      id: initial?.id ?? uid(),
      title: title.trim() || body.split('\n')[0].slice(0, 42) || 'Untitled',
      body, folder: f,
      tags: tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 12),
      favourite: initial?.favourite ?? false,
      createdAt: initial?.createdAt ?? Date.now(), updatedAt: Date.now(),
      demo: initial?.demo,
    };
    await idb.put('notes', n);
    await logActivity('note', `${initial ? 'Updated' : 'Created'} note: ${n.title}`);
    onSaved();
  };

  return (
    <Modal title={initial ? 'Edit note' : 'New note'} onClose={onClose} wide>
      <div className="flex flex-col gap-4">
        <div><Label>Title</Label><Field value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Note title" maxLength={120} /></div>
        <div><Label>Body (markdown)</Label><Area rows={8} value={body} onChange={(e) => setBody(e.target.value)} placeholder="# Heading&#10;&#10;Write in **markdown**…" className="font-mono !text-[13px]" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Folder</Label>
            <select className="nr-input" value={folder} onChange={(e) => setFolder(e.target.value)} aria-label="Folder">
              {folders.map((f) => <option key={f} value={f}>{f}</option>)}
              <option value="General">General</option>
            </select></div>
          <div><Label>New folder</Label><Field value={newFolder} onChange={(e) => setNewFolder(e.target.value)} placeholder="or create one" /></div>
        </div>
        <div><Label>Tags (comma separated)</Label><Field value={tags} onChange={(e) => setTags(e.target.value)} placeholder="study, ideas" /></div>
        {err && <p className="text-xs text-red-400" role="alert">{err}</p>}
        <div className="flex gap-3 justify-end">
          <GhostBtn onClick={onClose}>Cancel</GhostBtn>
          <Btn onClick={save}>Save note</Btn>
        </div>
      </div>
    </Modal>
  );
}
