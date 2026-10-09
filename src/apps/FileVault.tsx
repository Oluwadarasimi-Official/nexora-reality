import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Note, Task, VaultFile, uid } from '../types';
import { Area, Btn, Empty, Field, GhostBtn, Label, Modal, PageHead, timeAgo, useConfirm, useToast } from '../components/ui';
import { idb, logActivity } from '../services/db';

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB per file
const TEXT_EXT = ['txt', 'md', 'json', 'html', 'css', 'js', 'csv', 'log'];
const IMG_EXT = ['png', 'jpg', 'jpeg', 'webp', 'gif'];

function extOf(name: string) {
  return name.split('.').pop()?.toLowerCase() ?? '';
}
function fmtSize(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
}

export default function FileVault() {
  const toast = useToast();
  const { ask, ui: confirmUi } = useConfirm();
  const [files, setFiles] = useState<VaultFile[]>([]);
  const [q, setQ] = useState('');
  const [preview, setPreview] = useState<VaultFile | null>(null);
  const [showNew, setShowNew] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    const f = await idb.all<VaultFile>('vaultFiles');
    setFiles(f.sort((a, b) => b.updatedAt - a.updatedAt));
  };
  useEffect(() => { refresh().catch(() => {}); }, []);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return files;
    return files.filter((f) => f.name.toLowerCase().includes(needle));
  }, [files, q]);

  const totalBytes = files.reduce((a, f) => a + f.size, 0);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (!list?.length) return;
    for (const file of Array.from(list)) {
      const ext = extOf(file.name);
      const isText = TEXT_EXT.includes(ext);
      const isImg = IMG_EXT.includes(ext);
      if (!isText && !isImg) {
        toast({ kind: 'err', title: `Can't store .${ext} files`, body: 'Allowed: text, code, markdown, JSON, CSV and images.' });
        continue;
      }
      if (file.size > MAX_BYTES) {
        toast({ kind: 'err', title: `${file.name} is too large`, body: `Limit is 2 MB (this file is ${fmtSize(file.size)}).` });
        continue;
      }
      try {
        const content = isImg
          ? await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(file); })
          : await file.text();
        const vf: VaultFile = {
          id: uid(), name: file.name,
          kind: isImg ? 'text' : ext === 'md' ? 'markdown' : ext === 'json' ? 'json' : 'text',
          content, size: file.size, updatedAt: Date.now(),
        };
        (vf as VaultFile & { dataUrl?: string }).dataUrl = isImg ? content : undefined;
        await idb.put('vaultFiles', vf);
        await logActivity('files', `Uploaded: ${file.name}`);
      } catch {
        toast({ kind: 'err', title: `Failed to read ${file.name}` });
      }
    }
    if (inputRef.current) inputRef.current.value = '';
    toast({ kind: 'ok', title: 'Upload complete' });
    refresh();
  };

  const remove = async (f: VaultFile) => {
    if (!(await ask(`Delete "${f.name}" permanently?`))) return;
    await idb.del('vaultFiles', f.id);
    setPreview(null);
    toast({ kind: 'ok', title: 'File deleted' });
    refresh();
  };

  const download = (f: VaultFile) => {
    const withUrl = f as VaultFile & { dataUrl?: string };
    const blob = withUrl.dataUrl
      ? dataUrlToBlob(withUrl.dataUrl)
      : new Blob([f.content], { type: f.kind === 'json' ? 'application/json' : 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = f.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };

  const exportNotes = async () => {
    const notes = await idb.all<Note>('notes');
    dl(`nexora-notes-${Date.now()}.json`, JSON.stringify(notes, null, 2), 'application/json');
    toast({ kind: 'ok', title: `Exported ${notes.length} notes` });
  };
  const exportTasks = async () => {
    const tasks = await idb.all<Task>('tasks');
    const rows = [['title', 'done', 'priority', 'due', 'projectId'],
      ...tasks.map((t) => [t.title, String(t.done), t.priority, t.due ?? '', t.projectId ?? ''])];
    dl(`nexora-tasks-${Date.now()}.csv`, rows.map((r) => r.map(csvCell).join(',')).join('\n'), 'text/csv');
    toast({ kind: 'ok', title: `Exported ${tasks.length} tasks` });
  };

  const isImg = (f: VaultFile) => !!(f as VaultFile & { dataUrl?: string }).dataUrl;

  return (
    <div className="animate-fade-up">
      <PageHead title="File Vault" sub={`${files.length} files · ${fmtSize(totalBytes)} used · 2 MB max each`}
        right={
          <>
            <GhostBtn className="!px-3 !py-2 !text-xs" onClick={() => setShowNew(true)}>✎ New text</GhostBtn>
            <Btn className="!px-3 !py-2 !text-xs" onClick={() => inputRef.current?.click()}>⤒ Upload</Btn>
          </>
        } />
      <input ref={inputRef} type="file" multiple className="hidden" aria-label="Upload files"
        accept={[...TEXT_EXT, ...IMG_EXT].map((e) => '.' + e).join(',')} onChange={onPick} />
      <div className="mb-4"><Field value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search files…" aria-label="Search files" /></div>

      <div className="grid grid-cols-2 gap-2.5 mb-5">
        <button onClick={exportNotes} className="nr-card !p-3 text-left active:scale-[0.98] transition">
          <div className="text-sm font-bold">⤓ Notes JSON</div><div className="text-[11px] opacity-55">Export all notes</div>
        </button>
        <button onClick={exportTasks} className="nr-card !p-3 text-left active:scale-[0.98] transition">
          <div className="text-sm font-bold">⤓ Tasks CSV</div><div className="text-[11px] opacity-55">Export all tasks</div>
        </button>
      </div>

      {visible.length === 0 ? (
        <Empty icon="▦" title="Vault is empty" body="Upload text files, code, markdown or images (max 2 MB each). Everything stays on your device."
          action={<Btn className="!text-xs" onClick={() => inputRef.current?.click()}>⤒ Upload a file</Btn>} />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {visible.map((f) => (
            <li key={f.id} className="nr-card !p-3 flex items-center gap-3">
              <span className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0" style={{ background: 'var(--accent-soft)' }} aria-hidden>
                {isImg(f) ? '🖼' : f.kind === 'json' ? '{ }' : f.kind === 'markdown' ? 'M↓' : '📄'}
              </span>
              <button className="flex-1 text-left min-w-0" onClick={() => setPreview(f)}>
                <div className="text-sm font-semibold truncate">{f.name}</div>
                <div className="text-xs opacity-55">{fmtSize(f.size)} · {timeAgo(f.updatedAt)}</div>
              </button>
              <button onClick={() => download(f)} aria-label={`Download ${f.name}`} className="opacity-60 px-1.5">⤓</button>
              <button onClick={() => remove(f)} aria-label={`Delete ${f.name}`} className="opacity-40 hover:opacity-100 px-1.5">🗑</button>
            </li>
          ))}
        </ul>
      )}

      {preview && (
        <Modal title={preview.name} onClose={() => setPreview(null)} wide>
          {isImg(preview)
            ? <img src={(preview as VaultFile & { dataUrl?: string }).dataUrl} alt={preview.name} className="rounded-xl max-h-[60vh] w-auto mx-auto" />
            : <pre className="text-xs font-mono whitespace-pre-wrap max-h-[60vh] overflow-y-auto nr-scroll rounded-xl p-3" style={{ background: 'var(--surface-solid)' }}>{preview.content.slice(0, 20000)}{preview.content.length > 20000 ? '\n…(truncated)' : ''}</pre>}
          <div className="flex gap-2 justify-end mt-4">
            <GhostBtn className="!text-xs" onClick={() => download(preview)}>⤓ Download</GhostBtn>
            <GhostBtn className="!text-xs" onClick={() => remove(preview)}>🗑 Delete</GhostBtn>
          </div>
        </Modal>
      )}

      {showNew && (
        <TextFileForm onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); refresh(); toast({ kind: 'ok', title: 'File saved' }); }} />
      )}
      {confirmUi}
    </div>
  );
}

function TextFileForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [err, setErr] = useState('');
  const save = async () => {
    if (!name.trim()) { setErr('Name the file (e.g. ideas.md).'); return; }
    const bytes = new Blob([content]).size;
    if (bytes > MAX_BYTES) { setErr(`Too large (${(bytes / 1048576).toFixed(2)} MB > 2 MB).`); return; }
    const ext = extOf(name.trim());
    await idb.put('vaultFiles', {
      id: uid(), name: name.trim(),
      kind: ext === 'md' ? 'markdown' : ext === 'json' ? 'json' : 'text',
      content, size: bytes, updatedAt: Date.now(),
    });
    await logActivity('files', `Created file: ${name.trim()}`);
    onSaved();
  };
  return (
    <Modal title="New text file" onClose={onClose} wide>
      <div className="flex flex-col gap-4">
        <div><Label>File name</Label><Field value={name} onChange={(e) => setName(e.target.value)} placeholder="ideas.md" maxLength={80} autoFocus /></div>
        <div><Label>Content</Label><Area rows={10} value={content} onChange={(e) => setContent(e.target.value)} className="font-mono !text-[12.5px]" placeholder="Write…" /></div>
        {err && <p className="text-xs text-red-400" role="alert">{err}</p>}
        <div className="flex gap-3 justify-end">
          <GhostBtn onClick={onClose}>Cancel</GhostBtn>
          <Btn onClick={save}>Save file</Btn>
        </div>
      </div>
    </Modal>
  );
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [head, b64] = dataUrl.split(',');
  const mime = head.match(/data:(.*?);/)?.[1] ?? 'application/octet-stream';
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
function dl(name: string, text: string, type: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function csvCell(v: string) {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}
