/* Tiny promise-based IndexedDB wrapper. All app data lives here.
   localStorage is used only for lightweight preferences (see prefs.ts). */

const DB_NAME = 'nexora-reality';
const DB_VERSION = 1;

export const STORES = [
  'tasks',
  'notes',
  'projects',
  'snippets',
  'studioPages',
  'vaultFiles',
  'focusSessions',
  'chatThreads',
  'activity',
  'notifications',
] as const;

export type StoreName = (typeof STORES)[number];

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) {
        if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let dbp: Promise<IDBDatabase> | null = null;
const db = () => (dbp ??= open());

async function tx<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(store, mode);
    const req = fn(t.objectStore(store));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
    t.onabort = () => reject(t.error);
  });
}

export const idb = {
  async all<T>(store: StoreName): Promise<T[]> {
    return tx<T[]>(store, 'readonly', (s) => s.getAll());
  },
  async get<T>(store: StoreName, id: string): Promise<T | undefined> {
    return tx<T | undefined>(store, 'readonly', (s) => s.get(id));
  },
  async put<T extends { id: string }>(store: StoreName, value: T): Promise<void> {
    await tx(store, 'readwrite', (s) => s.put(value));
  },
  async del(store: StoreName, id: string): Promise<void> {
    await tx(store, 'readwrite', (s) => s.delete(id));
  },
  async clear(store: StoreName): Promise<void> {
    await tx(store, 'readwrite', (s) => s.clear());
  },
  async count(store: StoreName): Promise<number> {
    return tx<number>(store, 'readonly', (s) => s.count());
  },
};

export async function logActivity(kind: string, text: string): Promise<void> {
  const { uid } = await import('../types');
  await idb.put('activity', { id: uid(), kind, text, ts: Date.now() });
  // keep the log bounded
  const all = await idb.all<{ id: string; ts: number }>('activity');
  if (all.length > 300) {
    const sorted = all.sort((a, b) => b.ts - a.ts).slice(300);
    await Promise.all(sorted.map((e) => idb.del('activity', e.id)));
  }
}

export async function pushNotification(title: string, body: string, app?: string): Promise<void> {
  const { uid } = await import('../types');
  await idb.put('notifications', { id: uid(), title, body, ts: Date.now(), read: false, app });
}
