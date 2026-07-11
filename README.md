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

## `nedory` — one-command startup

Install the shortcut once (on the phone/box that runs the app):

```bash
chmod +x ~/Home-Server/bin/nedory
ln -sf ~/Home-Server/bin/nedory "$PREFIX/bin/nedory"   # Termux; elsewhere use ~/.local/bin
```

That's the only manual symlink you ever need — every time `nedory` runs, it symlinks
every other script in `bin/` (`get-zim`, `install-vulkan-llama`, …) onto the same PATH
too, so new helper scripts just work as bare commands after a `nedory update`.

Then, from anywhere:

```bash
nedory          # build if needed, then start the dashboard
nedory update   # git pull + rebuild, then start
```

On a separate compute device (e.g. an S21 running Ollama + Kiwix), `bin/nedory-node`
boots those services with one command — see the comments in that file.

### Offline Wikipedia (Kiwix)

On the compute phone, grab the ZIM files without wrestling with `curl | grep` quoting:

```bash
get-zim                          # list the EN/CS Wikipedia flavors available now
get-zim wikipedia_cs_all_nopic   # download the newest match (resumable) into ~/zim
```

`get-zim` (in `bin/`) takes a flavor name *without* the trailing date and picks the
latest. `nedory` then auto-serves `~/zim/*.zim` on `:8080`; point Settings → Kiwix URL
at `http://<that-phone-ip>:8080` and set Wikipedia grounding to **Offline**.

### GPU-accelerated inference (Vulkan/Turnip, optional)

Ollama on Android is CPU-only — no GPU/NPU delegate. `llama.cpp` has a real Vulkan
backend, and Adreno GPUs can run it via **Turnip**, an open-source Mesa driver (the
official Adreno driver tends to crash on the shaders LLM inference needs, which is
why Turnip specifically, not just any GPU driver, is what works here).

```bash
install-vulkan-llama   # on the compute phone, in Termux — builds a Vulkan llama-server
```

This is a from-source build, best-effort on unverified hardware — driver maturity
varies a lot by Adreno generation (older 6xx/7xx-family chips have years of Turnip
support; the newest chips may not yet). Once it's built, point Settings →
"llama.cpp binary path" at the resulting binary and start a server from Cookbook
with `-ngl 99` in extra args to offload all layers to the GPU. This is a separate,
parallel path to Ollama — Nedory already supports both backends, so nothing else
in the app needs to change.

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
