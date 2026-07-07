# Home Server

A self-hosted dashboard for your local AI agents — inspired by Odysseus's "Cookbook" (hardware-aware model picking) but scoped to what one person actually needs day to day: chat against your own Ollama/llama.cpp models, a RAG + long-term memory brain, a book library, agent task automation, file/photo storage, and two-way Obsidian sync.

Single Next.js app, single SQLite file, no external services — and **no native modules**, so it installs and runs anywhere Node runs, including Android/Termux (no C++ toolchain or node-gyp needed).

## Requirements

- **Node.js 24+** (uses the built-in `node:sqlite`, which is unflagged from Node 24 on — no `better-sqlite3` compile step)
- [Ollama](https://ollama.com) and/or [llama.cpp](https://github.com/ggml-org/llama.cpp) reachable from wherever you run this (locally, or across your network / a Tailscale mesh — set the host in `/settings`)
- `tmux` if you want llama.cpp servers started in a tmux session instead of as a detached process

### Running on a phone (Termux)

This app is deliberately native-module-free so it works on Android/Termux, where packages like `better-sqlite3` and `sharp` can't compile:

```bash
pkg install nodejs git
git clone <your-repo-url> && cd Home-Server
npm install        # no native build — installs clean
cp .env.example .env.local   # set OLLAMA_HOST to your model host (e.g. a Tailscale IP)
npm run build && npm run start
```

Point `OLLAMA_HOST` at whichever device actually runs Ollama (another phone, a PC, etc.). Note: the Cookbook page scans the hardware of *this* device (the one running the dashboard), so its fit-scores aren't meaningful when inference runs on a different machine — Chat/Brain/Library/Tasks are the relevant features in that split setup.

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
