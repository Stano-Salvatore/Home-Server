# Home Server

A self-hosted dashboard for your local AI agents — inspired by Odysseus's "Cookbook" (hardware-aware model picking) but scoped to what one person actually needs day to day: chat against your own Ollama/llama.cpp models, a RAG + long-term memory brain, a book library, agent task automation, file/photo storage, and two-way Obsidian sync.

Single Next.js app, single SQLite file, no external services required.

## Requirements

- Node.js 20+
- [Ollama](https://ollama.com) and/or [llama.cpp](https://github.com/ggml-org/llama.cpp) installed locally (Cookbook talks to whichever you have)
- `tmux` if you want llama.cpp servers started in a tmux session instead of as a detached process

## Getting started

```bash
npm install
cp .env.example .env.local   # then edit paths as needed
npm run dev
```

Open http://localhost:3000 — it redirects to `/chat`. Configure paths (Obsidian vault, library folder, uploads folder, llama.cpp binary, Ollama host) any time from `/settings`.

## Building for production

```bash
npm run build
npm run start
```

## Project layout

- `src/app` — pages and API routes (Next.js App Router)
- `src/server` — all backend logic: DB schema/client, hardware scan, model catalog + fit scoring, Ollama/llama.cpp backends, chat service, Brain (RAG + memory), Obsidian sync, library ingestion, task scheduler, file storage, settings
- `src/components` — UI (sidebar, per-feature components, shared primitives)
- `drizzle/` — generated SQL migrations, applied automatically on boot
- `data/` — gitignored runtime data (SQLite DB, uploads, covers, library)
