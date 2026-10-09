/* ---------- NEXORA REALITY shared models ---------- */

export type ID = string;

export interface Task {
  id: ID;
  title: string;
  notes?: string;
  done: boolean;
  priority: 'low' | 'medium' | 'high';
  due?: string; // ISO date
  recurring?: 'daily' | 'weekly' | 'monthly';
  projectId?: ID;
  createdAt: number;
  completedAt?: number;
  demo?: boolean;
}

export interface Note {
  id: ID;
  title: string;
  body: string; // markdown
  folder: string;
  tags: string[];
  favourite: boolean;
  updatedAt: number;
  createdAt: number;
  demo?: boolean;
}

export interface Project {
  id: ID;
  name: string;
  description: string;
  status: 'idea' | 'active' | 'paused' | 'done';
  color: string;
  context?: string; // project-specific context for AI
  milestones: Milestone[];
  createdAt: number;
  demo?: boolean;
}

export interface Milestone {
  id: ID;
  title: string;
  done: boolean;
  due?: string;
}

export interface Snippet {
  id: ID;
  title: string;
  language: 'html' | 'css' | 'javascript' | 'typescript' | 'python' | 'text';
  code: string;
  notes: string;
  updatedAt: number;
  demo?: boolean;
}

export interface StudioPage {
  id: ID;
  name: string;
  html: string;
  css: string;
  js: string;
  template: string;
  updatedAt: number;
  demo?: boolean;
}

export interface VaultFile {
  id: ID;
  name: string;
  kind: 'text' | 'json' | 'markdown';
  content: string;
  size: number;
  updatedAt: number;
}

export interface FocusSession {
  id: ID;
  label: string;
  minutesPlanned: number;
  minutesActual: number;
  finishedAt: number;
  completed: boolean;
  demo?: boolean;
}

export interface ChatMessage {
  id: ID;
  role: 'user' | 'assistant' | 'system';
  content: string;
  provider?: string;
  ts: number;
  error?: boolean;
}

export interface ChatThread {
  id: ID;
  title: string;
  messages: ChatMessage[];
  updatedAt: number;
  createdAt: number;
}

export interface ActivityEvent {
  id: ID;
  kind: string;
  text: string;
  ts: number;
}

export interface AppNotification {
  id: ID;
  title: string;
  body: string;
  ts: number;
  read: boolean;
  app?: string;
}

export type AppId =
  | 'commander' | 'studio' | 'missions' | 'vault' | 'forge'
  | 'codelab' | 'files' | 'focus' | 'insights' | 'settings';

export interface AppMeta {
  id: AppId;
  name: string;
  tagline: string;
  icon: string; // emoji glyph used as icon
  accent: string;
}

export const APPS: AppMeta[] = [
  { id: 'commander', name: 'AI Commander', tagline: 'Chat with Nexora AI', icon: '✦', accent: '#10b981' },
  { id: 'studio', name: 'Studio', tagline: 'Build mini websites', icon: '◈', accent: '#38bdf8' },
  { id: 'missions', name: 'Mission Control', tagline: 'Tasks & daily goals', icon: '◎', accent: '#f59e0b' },
  { id: 'vault', name: 'Knowledge Vault', tagline: 'Notes & ideas', icon: '▤', accent: '#a78bfa' },
  { id: 'forge', name: 'Project Forge', tagline: 'Boards & milestones', icon: '⬢', accent: '#f472b6' },
  { id: 'codelab', name: 'Code Lab', tagline: 'Snippets & previews', icon: '⌁', accent: '#34d399' },
  { id: 'files', name: 'File Vault', tagline: 'Uploads & exports', icon: '▦', accent: '#94a3b8' },
  { id: 'focus', name: 'Focus Mode', tagline: 'Study timer', icon: '◉', accent: '#fb7185' },
  { id: 'insights', name: 'Insights', tagline: 'Your real stats', icon: '◍', accent: '#d4af37' },
  { id: 'settings', name: 'Settings', tagline: 'Theme & data', icon: '⚙', accent: '#64748b' },
];

export const uid = (): ID =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`;

export const todayISO = (): string => new Date().toISOString().slice(0, 10);
