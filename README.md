# NEXORA REALITY ✦

Your personal AI-powered digital universe — a futuristic operating environment in the browser,
optimised for Android phones, low-end devices and slow networks.

## What's inside

| Area | Description |
|---|---|
| **Command Centre** | Greeting, live clock, quick actions, today's missions, pinned apps, focus ring, projects, quick notes, notifications, activity — with rearrangeable widgets |
| **AI Commander** | Streaming chat with **automatic Gemini → Groq failover** (no manual switching), conversation history, copy/retry, contextual system prompts built from your real tasks/projects/focus |
| **Studio** | Build tiny websites from templates or AI prompts; HTML/CSS/JS editors; sandboxed live preview; one-click HTML export |
| **Mission Control** | Tasks with priorities, due dates, recurring schedules, project links, search & filters |
| **Knowledge Vault** | Markdown notes with folders, tags, favourites, full search |
| **Project Forge** | Projects with statuses, milestones, linked tasks and AI context per project |
| **Code Lab** | Snippets with syntax highlighting, AI explanations, sandboxed HTML previews |
| **File Vault** | Upload text/code/markdown/images (2 MB max each), previews, exports (notes JSON, tasks CSV) |
| **Focus Mode** | Study timer with presets, zen mode, session history, daily goal ring |
| **Insights** | Real stats calculated live from your data — never fabricated |
| **Settings** | Themes, accents, accessibility, pinned apps, AI status, privacy, backup/restore, demo-data cleanup |

Plus: installable PWA with offline support, ⌘K command bar, bottom navigation,
skeleton loaders, toasts, empty states, onboarding.

## Tech

- **Frontend:** React 18 + TypeScript + Vite + Tailwind CSS, code-split per mini-app
- **Storage:** IndexedDB for all data, localStorage for preferences only — works fully offline, no account needed
- **AI:** `api/ai.ts` Vercel serverless function — keys stay server-side; streams SSE; automatic failover with 90 s client cooldowns and bounded retries

## Run locally

```bash
npm install
npm run dev        # frontend only (AI shows "not configured" until deployed with keys)
npm run build      # production build → dist/
```

## Deploy (Vercel, free)

1. Push this folder to GitHub (or `vercel` CLI from the folder).
2. Import the repo in Vercel — framework preset **Vite**, build command `npm run build`, output dir `dist`.
3. Add environment variables (Project → Settings → Environment Variables):
   - `GEMINI_API_KEY` — Google AI Studio key (primary)
   - `GROQ_API_KEY` — Groq console key (failover)
   - Optional: `AI_PRIMARY_PROVIDER` (`gemini`|`groq`), `GEMINI_MODEL`, `GROQ_MODEL`
4. Redeploy. Open **AI Commander → Settings → AI status** to confirm both providers are green.

> Keys are **never** in the frontend. The app detects a missing backend and keeps every
> non-AI feature working with an honest "AI not configured" notice.

## Environment variables

See `.env.example`. Never commit real keys.

## Project structure

```
api/ai.ts               # serverless AI gateway (Gemini → Groq failover, SSE)
src/
  App.tsx               # hash routing, prefs, onboarding gate
  components/           # Logo, Shell (nav + command bar), ui kit
  views/                # Home, Launcher, Commander, Onboarding
  apps/                 # Studio, Missions, Vault, Forge, CodeLab, FileVault, Focus, Insights, Settings
  services/             # db (IndexedDB), prefs, ai (client), demo (seed data)
public/                 # PWA icons + manifest (generated at build)
```

## Notes

- Demo data is seeded on first launch and clearly labelled **DEMO** — remove it anytime in Settings → Storage & data.
- Optional Supabase cloud sync is intentionally not wired yet (stays ₦0); the service layer (`services/db.ts`) is the seam to add it.
- Generated/iframe previews run sandboxed (`sandbox="allow-scripts"`) and cannot touch app data.
