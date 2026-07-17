# Nedory Codex — everything: architecture, history, review, roadmap

> The complete record of what this project is, how every module works, what was
> tried and didn't work, what was changed for the better, and where to take it
> next (with inspiration sources per area). Written July 2026, at the tip of the
> `claude/litertlm-home-server-integration-9ldh93` branch (PR #3, 18 commits).

---

## 1. What Nedory is

A fully local, self-hosted AI workspace — a Next.js 16 app (webpack mode,
Node ≥ 24, drizzle + SQLite via `node:sqlite`) running **on a Galaxy S25 Ultra
in Termux**, orchestrating a small fleet:

| Device | Role | Notes |
|---|---|---|
| Galaxy S25 Ultra | Dashboard + litert-lm + local embeddings | Snapdragon 8 Elite / Adreno 830; OpenCL reachable from Termux (unlike the S21) |
| Galaxy S21 Ultra | Compute node: Ollama + Kiwix | Exynos/Mali — GPU is a dead end (Turnip is Adreno-only); KleidiAI is the unexplored lever |
| Doogee U10 tablet | Second compute node over Tailscale | Ollama + Kiwix |
| Lenovo mini-PC | Services box | Qdrant; future SearXNG / heavier agents |

Everything works offline: chat, RAG over an Obsidian vault + ebook library,
offline Wikipedia via Kiwix, deep research, scheduled tasks. Internet adds web
search and live Wikipedia, but is never required.

The look is deliberately modeled on **Odysseus** (PewDiePie's self-hosted AI
workspace): coral `#e06c75` on blue-black panels, steel-blue secondary accent,
Fira Code everywhere, message cards with mono stats footers, coral scrollbars.

---

## 2. Architecture map — every module and what it does

### 2.1 Data layer

- **`src/server/db/client.ts`** — the project's cleverest hack: drizzle-orm
  driven by Node's built-in `node:sqlite` (`DatabaseSync`) through a thin
  adapter that impersonates better-sqlite3's API for drizzle's session +
  migrator. Exists because better-sqlite3 needs node-gyp, which can't build on
  Termux. Also exports the raw `sqlite` handle for raw-SQL consumers (FTS5).
  Sets `busy_timeout=10000` (parallel `next build` workers), WAL,
  `foreign_keys=ON`. Migrations run once from `instrumentation.ts` →
  `bootstrap()`, never at import time (build workers raced the migrator).
- **`schema.ts`** — 12 tables: settings (KV), llamacpp_servers, projects,
  conversations, messages, brain_documents, brain_chunks, memory_facts,
  library_books, tasks, task_runs, research_runs, files. Plus the
  `brain_chunks_fts` FTS5 virtual table (raw-SQL migration 0005, not in
  drizzle schema — virtual tables aren't representable there).
- **Migrations** `drizzle/0000–0006`: hand-written SQL + `meta/_journal.json`
  entries for 0005 (FTS5 + backfill) and 0006 (web_enabled + research_runs);
  no snapshots needed since schema.ts already matched.

A recurring storage idiom: **small config lives as JSON blobs in the settings
KV table** (nodes, vaults, custom nodes/links, scopes, parent overrides, hub,
agents, dashboard sessions) — each module reimplements `load()/save()` with
defensive JSON.parse. See §6 "Extract a settings-collection helper".

### 2.2 Model backends (`src/server/backends/`)

- **`types.ts`** — `BackendKind = "ollama" | "llamacpp" | "litertlm"` (the
  canonical union; every other copy was consolidated here after an audit found
  17 stale `"ollama" | "llamacpp"` copies predating litertlm), `ChatMessage`,
  `ChatStreamChunk` (`tokenCount` optional — attached to the final yield when
  a backend knows its exact count), `ModelBackend` interface
  (listRunning/chatStream/chatComplete).
- **`ollama.ts`** — multi-node aware; targets are `nodeId::tag`. NDJSON stream
  parsing; `eval_count` → exact token count; `pullModel` progress generator;
  `embed()` loops texts one-by-one against `/api/embeddings` (see §6 —
  batching + the newer `/api/embed` endpoint are an easy win).
- **`llamacpp.ts`** — full process lifecycle: port allocation (8081–8199),
  spawn either detached or in tmux (`llamacpp-<id>` sessions), health-poll
  `/health`, DB-backed server rows, `recoverRunningServers()` on boot marks
  dead ones stopped. Env overrides parsed from a Settings string
  (VK_ICD_FILENAMES for Vulkan/Turnip on Android). OpenAI-compatible SSE with
  `stream_options.include_usage` for exact token counts.
- **`litertlm.ts`** — Google's LiteRT-LM `serve` (OpenAI-compatible,
  `127.0.0.1:9379`). No lifecycle management (started manually in tmux — see
  journal §4.2), no usage stats (upstream), CPU-only until upstream ships a
  `--backend` flag for serve (google-ai-edge/LiteRT-LM#1929). Base URL + model
  id are Settings-backed functions (`litertlmBaseUrl()`/`litertlmModelId()`)
  shared by the three small-model helper callers.
- **`registry.ts`** — probes all backends in parallel for the model picker;
  `backendFor(kind)` dispatch; `probeNodes()` per-node health/loaded/installed.

### 2.3 Brain (`src/server/brain/`) — the RAG engine

- **`ingest.ts`** — hash-gated document ingestion (unchanged content = no
  re-chunk/re-embed, which is what makes vault rescans cheap). Applies
  `cleanNoteContent()` **before hashing** — deliberately, so a cleaner change
  re-ingests exactly the affected notes on the next rescan. Writes chunks to
  SQLite + FTS + vector index. `deleteDocument` explicitly deletes FTS rows
  (the FK cascade can't reach a virtual table).
- **`chunker.ts`** — paragraph-accumulating chunker, target 1000 chars, min
  200, hard-split at 1500. Simple; see §6 for heading-aware alternatives.
- **`cleanText.ts`** — two-layer cleanup born from a real observed citation
  (`# Dlouhé Ucho Owner: Stanislav Nándory ***Autor :** Egon* *Bondy*`):
  `cleanNoteContent()` at chunk time (YAML strip for non-obsidian paths,
  Notion-export `**Autor :**` metadata lines → plain `Autor:` — requires 2–3
  leading asterisks so markdown bullets survive, tolerates the colon on either
  side of the closing `**`), `presentChunk()` at render time only (same
  normalization + title-heading dedup) so stored text keeps matching FTS and
  embeddings.
- **`embeddings.ts`** — thin wrapper: Settings-selected model (default
  `bge-m3`, multilingual for Czech/Slovak notes) on a Settings-selected host
  (blank = default node; set to the phone's own Ollama to keep embedding RAM
  off the compute node).
- **`vectorTypes.ts` / `vectorStore.ts` / `qdrant.ts`** — the vector
  abstraction: declarative `MetaFilter` (`sourceTypeEq/Ne`, `projectIdIn`,
  `conversationIdNe`, `documentIdIn`) with a shared `metaMatches()` predicate,
  implemented identically by the in-memory index (Float32Array cosine over
  globalThis-cached chunks) and the dependency-free Qdrant REST client
  (payload indexes, null→"" sentinels, collection auto-created at first
  vector's dimensionality, reset drops the collection so an embedding-model
  switch can change dimensions).
- **`lexical.ts`** — BM25 over the `brain_chunks_fts` FTS5 shadow table
  (`unicode61 remove_diacritics 2` → "Klima" matches "Klíma"). MATCH queries
  are rebuilt as quoted tokens joined with OR (raw user text contains FTS5
  syntax chars that throw); tokens under 3 chars dropped unless that empties
  the query. Write-side mirror (`ftsInsertChunks/DeleteDocument/DeleteAll`)
  is best-effort — the FTS table is an index, a reindex rebuilds it.
- **`search.ts`** — hybrid retrieval: ~20 dense + ~20 lexical candidates fused
  by reciprocal rank fusion (k=60), fused top-K returned. Lexical hits get the
  SAME MetaFilter treatment via metaMatches over doc-derived ChunkMeta. Fusion
  sits **above** the vector-store abstraction so in-memory and Qdrant both
  benefit. `minScore` stays a cosine floor (applied pre-fusion to the dense
  list); chat-memory recall opts out entirely (`lexical: false`) to keep its
  0.55 threshold semantics.
- **`planner.ts`** — the LLM query planner: classifies enumerate/answer/exists
  + entity + scope via one litert-lm structured call. Regex fast path
  (`catalog.ts`'s `isCatalogQuery`) costs nothing; 3s timeout + defensive JSON
  parsing degrade to answer mode. Scope NAMES from the model are resolved to
  ids in code (diacritics-folded compare) — model-invented ids never trusted.
- **`catalog.ts`** — exhaustive title/path LIKE matching for "list all X"
  questions (top-K cosine silently drops matches), stopword-stripping keyword
  extractor tuned for Czech/Slovak proper nouns.
- **`chatMemory.ts`** — every chat turn ingested as a `chat`-sourceType
  document; rolling 5 GB cap with oldest-first eviction; recall is
  project-isolated, excludes the current conversation, dense-only with a 0.55
  cosine floor. `knowledgeFilter()` is the RAG filter (never chat memory,
  project-aware, optional scope narrowing).
- **`scopes.ts` / `customNodes.ts` / `customLinks.ts` / `parentOverrides.ts` /
  `hub.ts`** — the Brain graph: user-drawn nodes/links/colors around the
  auto-derived document tree; a "scope" is a custom node with member docs
  (bulk-assign by path keyword or explicit ids), used to narrow retrieval.
- **`memory.ts`** — pinned facts (CRUD), injected into every chat.
- **`reindex.ts`** — re-embeds all stored chunk text (embedding-model swap)
  and rebuilds FTS. Note: reindex re-embeds *stored chunks*; a vault *rescan*
  is what re-chunks from source (relevant after chunker/cleaner changes).

### 2.4 Chat pipeline (`src/server/chat/service.ts`)

`streamAssistant()` is the heart: builds context in order — system prompt →
pinned facts → chat-memory recall → (if Brain on) planner-routed retrieval
(enumerate = exhaustive catalog prompt; exists = yes/no over titles; answer =
hybrid RAG block with presentChunk cleanup) → (if Wikipedia on) `[Wn]` block →
(if Web on) `[Sn]` block → agent context bridge → MCP tool results `[Tn]` —
then streams the reply, persists it with duration/tokenCount (estimated at
~4 chars/token when the backend doesn't report), remembers the turn into chat
memory, and auto-titles first exchanges. Yields cosmetic `{status}` events at
phase boundaries ("searching your notes…", "writing a reply…") because Brain
replies spend 30–60 s in retrieval + CPU prefill and silence reads as frozen.
Cross-cutting rule: **every context source is best-effort** — wrapped so its
failure degrades to absence, never to a broken reply.

- **`autotitle.ts`** — one 20-token litert-lm call names a "New Chat" after
  its first exchange. Same planner pattern: 3s timeout, silent no-op.
- **`council/service.ts`** — one-shot ask (no persistence/history) used by
  Council: N participants answer the same prompt (sequential by default —
  parallel 7B models OOM a single phone), then a chair model synthesizes.

### 2.5 Knowledge sources

- **`obsidian/`** — multi-vault registry (`vaults.ts`), chokidar watcher with
  self-write suppression + manual rescan (Android shared storage often emits
  no inotify events), traversal-guarded note writer (sanitize → resolve →
  prefix-check) that files new notes next to their first real cited note.
- **`library/`** — epub2/pdf-parse extraction, SHA1-gated rescans, SVG
  placeholder covers, linked Brain documents that follow manual renames.
- **`files/`** — uploads with text extraction into Brain, thumbnails.
- **`wikipedia/`** — dual provider: live MediaWiki API or offline Kiwix
  (comma-separated multi-URL fallback chain), langs configurable (en,cs).
- **`search/websearch.ts`** — SearXNG (self-hosted JSON API) / DuckDuckGo
  (html endpoint + lite fallback, regex-parsed, UA-spoofed) / Brave (API key).
  Every provider degrades to `[]`. `fetchPageText()` reduces a result page to
  readable text (html-to-text with nav/header/footer stripped) for research.

### 2.6 Deep Research (`src/server/research/service.ts`, `/research`)

Multi-round background jobs: model plans 2–4 queries → each round gathers from
web + Wikipedia + Brain (`Promise.allSettled`, any source can fail) → top web
hits deepened via full-page fetch → dense cited notes → gap-driven follow-up
queries → final mode-shaped markdown report (Auto/Product/Compare/How-to/
Fact-check prompt briefs). Progress written to the DB row (status text, round,
source count), UI polls 2.5 s while running; cooperative cancellation via a
globalThis flag set checked at every checkpoint. Finished reports are ingested
into Brain (`research:<id>` sourcePath) so research compounds; deleting a run
removes its Brain doc.

### 2.7 Agents + MCP tools

- **`agents/agents.ts`** — persona registry (Athena 🦉 books, Emergi ❤️‍🩹
  health, Gemmi ⚙️ sysops) seeded from installed model tags, with one-time
  migrations (emoji, wiki default, colors, model-tag rename) that self-heal.
  Each agent: model tag, system prompt, Brain scope, context bridge
  (one-shot GET + bearer), and now `toolsEnabled` + `mcpServers[]`.
- **`mcp/client.ts`** — hand-rolled MCP client (Streamable HTTP, JSON-RPC
  2.0): initialize (session id captured) → tools/list → tools/call, handling
  both application/json and text/event-stream responses. Deliberately not the
  SDK: three RPCs don't justify the transport machinery, and dependency-free
  is Termux-safe.
- **`tools/`** — `builtin.ts` (Nedory's own state as zero-config tools:
  node_status, hardware, service_health), `registry.ts` (merges built-ins with
  every configured server's discovered tools, namespaced `serverId__toolName`;
  a dead server contributes nothing), `planner.ts` (one structured call picks
  ≤3 relevant tools; **not** a multi-turn agentic loop — that doesn't hold up
  on 2–8B local models; Nedory executes the calls itself and injects `[Tn]`
  results as context).

### 2.8 Tasks, hardware, ops

- **`tasks/`** — DB-backed automation: manual / cron (node-cron) / file-watch
  (chokidar + glob→regex) triggers registered in a globalThis scheduler,
  reconciled on every CRUD, started at boot. Runner injects a changed file's
  content (capped 4000 chars) into the prompt; output optionally saved to the
  vault with a filename template.
- **`hardware/scan.ts` + `catalog/fitScore.ts`** — systeminformation +
  nvidia-smi probe (1h cached), curated model catalog scored
  PERFECT/GOOD/TIGHT/WON'T FIT with est. tok/s — the Cookbook page.
- **`nodes/`** — Ollama node registry + Kiwix/Qdrant service probes.
- **`auth/session.ts` + `proxy.ts`** — opt-in dashboard password (see §4.9).
- **`bootstrap.ts`** (via `instrumentation.ts`) — migrations, dir creation,
  llama.cpp recovery, vector index load, vault watchers, task scheduler.
- **`bin/nedory`** — the one-command launcher: self-heals PATH symlinks, wakes
  compute nodes over SSH, starts local Ollama, builds if needed, and runs the
  dashboard **in a detached tmux session** (see §4.13 — this was the routines
  bug). `install-boot` wires it into Termux:Boot.

### 2.9 Client (`src/lib`, `src/components`, `src/app`)

- **`useChatStream.ts`** — SSE reader appending deltas/citations/stats/status
  to the last message; dispatches `nedory-conversations-changed` on stream end
  so the sidebar list refreshes titles/recency without a navigation.
- **`useSidebarCollapsed.ts`** — module value + window event + localStorage:
  one collapsed flag shared by nav rail and chat list (different layout
  subtrees, so React context was the wrong tool).
- **Chat UI** — landing hero (rotating time-of-day greeting, floating composer
  card with inline model picker + Brain/Wikipedia/Web pill chips, first
  message handed to `/chat/[id]` via sessionStorage since the stream must run
  there), Odysseus-style message cards (`● You HH:MM` / `✦ model HH:MM`, mono
  `96 tok · 6.4s · 15.0 tok/s` footers, coral-tinted status bar while pending,
  collapsed "N sources" citation cards).
- **Pages** — brain (graph/documents/search/memory tabs), agents (editor with
  MCP "Test & add"), council, research, cookbook, nodes, library, tasks,
  files, projects, settings, login.
- **`markdown.tsx`** — react-markdown + GFM + rehype-highlight, **no
  rehype-raw** (model output can't inject HTML — verified: zero
  `dangerouslySetInnerHTML`/eval in the whole app), copy-button code blocks.

---

## 3. Recurring design patterns (the house style)

1. **The planner pattern** — anywhere a small local model makes a decision:
   one structured-output call, hard 3s timeout, defensive parsing (strip
   fences, JSON.parse in try/catch, validate enums, never trust model-invented
   ids), silent degradation to the no-model behavior. Instances: brain
   planner, tool planner, auto-title. Rationale: multi-turn agentic loops
   don't hold up on 2–8B models, and chat must never block on a helper.
2. **Best-effort context** — every context source (RAG, wiki, web, tools,
   memory, bridge) is individually try/caught; failure = absence.
3. **globalThis singletons** — vector index, watchers, scheduler, self-write
   map, research cancels: Next bundles route handlers and instrumentation
   into separate module graphs, so module-level state isn't process-wide.
4. **Settings-backed everything** — no hardcoded hosts/models; env vars seed
   the settings table once, the table wins after.
5. **Hash-gated ingestion** — content hash decides re-chunk/re-embed; cleaning
   before hashing turns cleaner changes into targeted backfills.
6. **Dependency-free HTTP clients** — Qdrant, MCP, litert-lm, DDG: plain
   fetch, no SDKs. Termux-safe (no native builds), fully understood.
7. **tmux as the process supervisor** — llama.cpp servers, litert-lm serve,
   and now the dashboard itself. Android kills backgrounded terminal
   processes; wake-lock alone doesn't help.

---

## 4. The engineering journal — what we tried, what failed, what we changed

Chronological, across the sessions that built this branch. Failures are the
point of this section; each one taught the codebase something.

### 4.1 Prehistory (from session handoffs)

- **better-sqlite3 wouldn't compile on Termux** (node-gyp) → the
  `node:sqlite` + drizzle adapter in `db/client.ts`. This decision paid for
  itself twice: zero native deps also meant FTS5 came free later.
- **llama.cpp GPU on the S25** took real fighting: Vulkan/Turnip segfaulted on
  coopmat shaders (fixed by disabling coopmat generation in
  `install-vulkan-llama`), an earlier script version silently uninstalled
  Turnip's own dependency, and the default Vulkan loader ignores Turnip unless
  `VK_ICD_FILENAMES` points at the freedreno ICD (hence the `llamaCppEnv`
  setting). Tuned result: ~7 tok/s decode on Gemma 4 E4B QAT with
  `-ngl 99 --no-kv-offload -c 8192 -np 1 -t 8 --cache-type-k q8_0
  --cache-type-v q8_0`.
- **S21 GPU is a dead end**: `clinfo` finds zero OpenCL platforms, Turnip is
  Adreno-only, Mali gets nothing. KleidiAI (Arm CPU kernels) is the S21's real
  unexplored lever.
- **Rejected**: "replicate AI Edge Gallery's optimizations inside llama.cpp"
  (the pasted APIs — LlmInferenceOptions etc. — are Android-app-only, useless
  for an HTTP-server architecture); colibrì/GLM MoE expert-streaming-from-SSD
  (needs NVMe as a memory tier; phone UFS isn't that); TurboQuant KV-cache
  quantization (no usable Vulkan path for Adreno — kept `q8_0` KV flags
  instead); Hermes Agent (real, but belongs on the Lenovo box, not a phone).

### 4.2 LiteRT-LM discovery (the "is Gallery faster?" question)

- The claim "there's no way to use LiteRT-LM inside Termux, it's an Android
  SDK" (an ~April 2026 blog) turned out **stale/wrong** — official docs now
  state Termux/aarch64 CLI+Python support. `uv tool install litert-lm` (0.14.0)
  worked first try.
- The official README had a **typo** pairing the E2B repo with an E4B filename
  → HTTP 404. Correct file: `gemma-4-E2B-it.litertlm` (2.4 GiB).
- **GPU worked from plain Termux** on the S25: `--backend=gpu` dlopens
  Qualcomm's proprietary OpenCL ("Loaded OpenCL library with dlopen"), ~45
  tok/s vs llama.cpp's ~7 (partly model-size — E2B vs E4B — but decisively
  ahead). The S21 lesson ("OpenCL is categorically unreachable from Termux")
  did **not** generalize across driver stacks.
- **`litert-lm serve` cannot use the GPU** — confirmed upstream bug
  google-ai-edge/LiteRT-LM#1929 (serve exposes no `--backend` flag; universal,
  not Android-specific). Serve is CPU/XNNPack (~15 tok/s) — still ~2× the
  llama.cpp GPU path, so it was wired in immediately. When the flag ships,
  only the launch command changes. Issue #2001 documents a Jetson team's
  workaround (a custom stdin/stdout REPL around a persistent GPU engine) —
  deliberately not attempted yet; it's the roadmap's biggest perf item.
- Verified before writing any code: `/v1/models` and streaming
  `/v1/chat/completions` are standard OpenAI shapes; **no usage block** ever
  (hence the estimate fallback).

### 4.3 The phone/cloud split bit us twice

- The litertlm backend was first written **directly on the phone** (heredocs
  over nano — mobile editing lesson: full-file writes beat line edits) and
  never committed. The first cloud session found an *empty* fresh clone and
  recreated all three files from the handoff document. Lesson encoded since:
  handoffs must contain full file contents, and work must be pushed.
- Later, a panicked "PR #3's work doesn't exist upstream anymore!" turned out
  to be the phone sitting on the **default branch** (`claude/odysseus-…`,
  which is `origin/HEAD`) while all work lived on the PR branch. Nothing was
  force-pushed; `git checkout <branch>` was blocked by the *original*
  uncommitted phone-side files — resolved with `git stash -u`. Lesson: on a
  repo whose "deploy" is `git pull`, know which branch the device tracks.
- **Termux `npm run build` flakiness**: one build died with
  `Error: invalid type: unit value, expected usize` — a serde panic inside the
  SWC **WASM** fallback (no native aarch64 SWC binary for Termux). The same
  commit built clean in a normal Linux environment, and the panic later
  self-resolved on the phone. Treat as environmental; retry before blaming
  code.

### 4.4 Hybrid retrieval (the Egon Bondy failure)

- Observed: "What do my notes say about Egon Bondy?" retrieved **nothing**
  despite real notes. Two confirmed causes: proper names embed poorly in small
  embedding models (pure dense top-K missed), and the catalog regex required
  adjacent trigger words ("what **do my** notes say" didn't match), so the
  query fell through to the broken dense path. Regex-based intent detection
  was judged **unwinnable** (phrasing variety + Slovak/English code-switching)
  — the explicit instruction was "make it work long, long term", hence the
  three-layer fix: FTS5/BM25 hybrid + LLM planner + plan-routed chat.
- `remove_diacritics 2` verified live in `node:sqlite` before building
  ("Klima" ↔ "Klíma") — Node's bundled SQLite ships FTS5, zero new deps.
- **minScore vs RRF**: fused scores live on a tiny scale (~1/61), so chat
  memory's 0.55 cosine floor would have filtered everything. Options were
  "rescale", "drop minScore", or "opt out" — chose `lexical: false` for chat
  recall (BM25 word matches on casual chat text would drag unrelated chatter
  in anyway), and pre-fusion dense-only application elsewhere.
- **Deliberately did NOT** add "what do my notes say"-style alternations to
  the catalog regex (the spec offered it as optional): those are
  answer-shaped questions, and enumerate mode would return a title list
  instead of content-grounded answers. The planner/hybrid path handles them.
- Verified end-to-end with the exact failing query: top BM25 hit is the Bondy
  chunk. Confirmed working on-device by the user afterwards.

### 4.5 Chunk cleanup (Notion export scaffolding)

- Real citation showed `Owner: Stanislav Nándory ***Autor :** Egon* *Bondy*`
  garbage. Investigation first: **YAML frontmatter was already stripped**
  (gray-matter in both watcher and rescan) — the leak was Notion-export
  *inline* metadata in note bodies, a different thing than assumed.
- Regex iterations that failed on the way: v1 (`\*{1,3}` leading) ate
  markdown bullets (`* item: desc`) — fixed by requiring `\*{2,3}`; v2 missed
  `**Rok** : ---` (closing bold *before* the colon) — fixed by allowing
  asterisks on either side. Seven-case test suite pins both.
- Key constraint honored: **never rewrite stored chunks** (FTS/embeddings must
  keep matching them) — cleanup happens at chunk-creation for new content and
  at render time (`presentChunk`) for old.

### 4.6 The Odysseus UI pass — bugs the browser caught

Playwright against a live dev server caught four real issues static review
never would have:

- **`sticky left-0` cancels a slide-away**: the collapsed sidebar applied
  `-ml-56` (layout moved — the content pane reflowed!) but the rail stayed
  visibly pinned: computed `marginLeft: -224px` yet `rect.x: 0`, because
  `position: sticky` with `left: 0` horizontally re-pins to the viewport
  edge. Fix: `left-0 md:left-auto` (left-0 only exists for the mobile fixed
  drawer).
- **Next 16 dev blocks cross-origin dev assets**: pages loaded via
  `127.0.0.1` never hydrated (zero interactivity, effects never ran) because
  the dev server considered `localhost` its origin and 403'd the HMR/JS
  requests. Cost a full debugging detour; the tell was "page renders,
  nothing works". Test via the same hostname the server logs.
- **Playwright `text=` doesn't match input placeholders** — produced a
  false "conversation list never reappears" alarm; the collapse/expand had
  worked all along. Assert on attributes/bounding boxes, not placeholder text.
- **Randomness looks broken in small samples**: three identical greetings in
  a row from a 5-item pool (4% chance) — an 8-reload sample showed all five.
- Also: seeding SQLite from a second process raced WAL visibility for one
  screenshot (data was fine one request later), and `react-hooks/
  set-state-in-effect` (Next 16's stricter rule) rejected the classic
  "read localStorage in an effect" idiom three times — settled pattern:
  `setTimeout(…, 0)` inside the effect, which also guarantees hydration-safe
  SSR markup. (`graph-tab.tsx` still carries pre-existing violations of this
  rule — see §6.)

### 4.7 Web search + Deep Research

- **DuckDuckGo 403s datacenter IPs** — both `html.` and `lite.` endpoints,
  from the cloud sandbox. Expected (DDG blocks cloud ranges); the phone's
  residential/mobile IP is the real test. Mitigations shipped: lite-endpoint
  fallback, every failure → `[]`, SearXNG as the reliable self-hosted option
  (Settings-configured; Lenovo box candidate).
- Research pipeline degradation verified with no model up: run lands in
  `status: error, "fetch failed"` cleanly, never wedges. Full-quality output
  is untested pending on-device models — 1-round runs recommended first
  (every round is several model calls over big contexts = minutes of CPU
  prefill on a phone).
- Hardware-scan→model-fit (the third Odysseus guide feature) turned out to
  **already exist** in Cookbook — audit before building.

### 4.8 MCP tool calling

- Chose hand-rolled over `@modelcontextprotocol/sdk`: three RPCs
  (initialize/tools-list/tools-call), and the SDK's transport machinery isn't
  worth a dependency on Termux. Session id from initialize is reused across a
  turn's calls; both JSON and SSE response framings handled.
- Cross-server tool-name collisions solved by `serverId__toolName`
  namespacing; a dead/slow server contributes nothing (Promise.allSettled).
- Verified with a throwaway MCP server + a throwaway litert-lm-shaped planner
  endpoint: discovery, both dispatch paths, planner selection, unknown-tool
  handling, `toolsEnabled=false` short-circuit, and the safety-critical
  degradation (planner → zero calls in 119 ms when the model is unreachable).
  One harness lesson: the app's real chat path streams (`stream:true`) while
  the planner path doesn't — fakes must implement **both** shapes.

### 4.9 The audit — auth (and the near-miss)

- Finding: **47 API routes, zero authentication**, Next binds 0.0.0.0 —
  anything on the tailnet/LAN could read every note/chat and rewrite
  vault/library/uploads paths (i.e., write files anywhere the process can).
- Next 16 renamed `middleware.ts` → **`proxy.ts`** — caught by reading
  `node_modules/next/dist/docs` *before* writing (per AGENTS.md's explicit
  warning); a middleware.ts would have silently never run.
- **Near-miss caught in design review**: the first draft exempted the whole
  `/api/auth/*` prefix from the gate — which would have let anyone overwrite
  an already-set password without logging in. Narrowed to
  `/login`, `/api/auth/{login,status,logout}`; `/api/auth/password`
  additionally re-checks the session itself (Next's own docs warn a matcher
  change can silently drop proxy coverage).
- Design choices: single shared secret (matches the threat model — personal
  dashboard, not multi-user SaaS), sessions as sha256-hashed random tokens in
  the settings table (capped 20), `timingSafeEqual` over fixed-length digests
  (naive compare throws on length mismatch and leaks timing), cookie
  `httpOnly + sameSite=lax` but **not** `secure` (plain http:// over
  LAN/Tailscale — a secure cookie would silently never be sent), reads bypass
  the settings cache (proxy may live in a separate module instance; a
  password change must bite on the next request), and **off-by-default** so
  shipping it can't lock anyone out overnight.
- Verified with a 12-case matrix: default no-op; gating (307 pages / 401
  API); wrong password sets no cookie; forged cookie rejected; logout revokes;
  password change while logged in doesn't self-lock and kills the old
  password; static assets + login bundle reachable throughout (no lockout
  loop); disabling restores everything even with stale cookies.

### 4.10 Type-debt audit fix

17 copies of `"ollama" | "llamacpp"` predating litertlm across client and
server — no runtime bug (values cross untyped JSON/DB boundaries) but the type
checker was blind to real mismatches (litertlm conversations in Council/
Tasks). Consolidated to `ChatBackend` (client, `lib/types.ts`) and
`BackendKind` (server, `backends/types.ts`) — two types, not one, to avoid
importing server modules into client bundles.

### 4.11 Auto-title + research→Brain

- Auto-title fires only when `title === "New Chat" && history.length === 1`
  (the just-inserted user message). A test-harness artifact taught the
  gating: a broken first send had already inserted a user message, so the
  retry was exchange #2 and the title correctly *didn't* fire — looked like a
  bug, was actually the feature working.
- The sidebar couldn't see title changes (no navigation happens) → a
  `nedory-conversations-changed` window event dispatched when any stream
  completes; conversation list listens. Same signal pattern as the collapsed
  sidebar.
- Research reports ingest into Brain on completion (stable `research:<id>`
  sourcePath = idempotent), and `deleteRun` removes the doc — verified through
  ingest → catalog hit → hybrid-search hit → delete → gone, against a fake
  Ollama embeddings endpoint (`/api/embeddings` returning random vectors).

### 4.12 litert-lm constants → Settings (and a latent bug)

Promoting `LITERTLM_BASE_URL/MODEL_ID` to Settings surfaced a real bug:
`chatStream/chatComplete` **ignored their `target` parameter** entirely —
harmless with one imported model, but would have silently misrouted the moment
a second `.litertlm` model was imported. Now `target || configured default`,
and `listRunning`'s reported port is parsed from the configured URL instead of
hardcoded 9379.

### 4.13 Routines "doesn't work" — the tmux root cause

The report was "routines don't work". The scheduler code was **proven
innocent** first: a cron task created via the real API genuinely fired ~90 s
later in the sandbox, and fired again after a full server restart (node-cron
re-registers from the DB at boot — persistence works). The actual bug:
`bin/nedory` launched the dashboard with a bare foreground `exec npm run
start` tied to one terminal tab. `termux-wake-lock` prevents CPU sleep, not
Android killing a backgrounded Termux tab — so scheduled tasks looked fine
during live testing (screen on) and silently never fired once the phone
locked. The dashboard now runs in a detached `tmux` session (`nedory`), with
teardown wired into `stop_running()` and a graceful no-tmux fallback. The
same fix litert-lm serve and llama.cpp servers already used — the dashboard
just never got it. Plus: task rows now show "last success 2m ago (cron)" /
"never fired yet" at a glance, so a dead scheduler is visible instead of
discoverable-days-later.

### 4.14 Sandbox lessons (for future sessions)

- `pkill -f "next dev"` in a compound command **kills the invoking shell's
  own process group** here (exit 144) and aborts the rest of the command —
  kill by PID or `lsof -ti:PORT | xargs kill` in a separate step instead.
- Next dev's singleton lock: a half-dead `next-server` blocks new dev servers
  with "Another next dev server is already running" — kill all three
  processes (`sh -c`, node wrapper, `next-server`).
- tsx harnesses hit the *unmigrated* default DB unless `DB_PATH` points at a
  scratch DB a dev-server boot has migrated.
- Long git commit messages with parentheses/quotes need the `git commit -m
  "$(cat <<'EOF' … EOF)"` heredoc form.

---

## 5. Current measured numbers (this fleet, real)

| Path | Backend | tok/s |
|---|---|---|
| llama.cpp Vulkan/Turnip, Gemma 4 E4B QAT (tuned) | GPU | ~7 |
| litert-lm serve, Gemma 4 E2B | CPU/XNNPack | ~15 |
| litert-lm run, Gemma 4 E2B | GPU (ML Drift/OpenCL) | ~45 |

The gap between rows 2 and 3 is the single biggest available performance win
(§7.1). Brain-enabled replies: 30–60 s dominated by CPU prefill over the
multi-chunk context, not retrieval.

---

## 6. Review — improvements per area, with inspiration sources

Ordered roughly by value-for-effort. "Inspiration" = concrete projects worth
reading before building.

### 6.1 Retrieval quality
- **Add a reranker stage**: RRF fuses ranks; a cross-encoder re-scoring the
  fused top-20 → top-5 is the standard next step and `bge-reranker-v2-m3`
  (multilingual, pairs with the bge-m3 embedder) runs on CPU at acceptable
  latency for 20 pairs. Inspiration: Open WebUI's hybrid search (BM25 +
  reranker), LlamaIndex two-stage retrieval.
- **Heading-aware chunking**: the chunker splits on blank lines only; markdown
  headings are natural boundaries and the heading path (`Books > Egon Bondy >
  Poems`) prepended to each chunk measurably improves both embedding and BM25
  matching. Inspiration: Chonkie, LangChain `MarkdownHeaderTextSplitter`,
  sentence-window retrieval.
- **Ollama embed batching**: `embed()` loops one request per chunk; Ollama's
  newer `/api/embed` accepts arrays (and the old `/api/embeddings` is
  deprecated). Vault rescans would speed up several-fold.
- **Query expansion for Slovak/Czech**: diacritics folding is done; declension
  isn't ("Bondym" vs "Bondy" — FTS5 sees different tokens). A cheap stemmer
  (snowball has Czech) as extra OR-tokens, or the planner emitting a
  normalized entity, would close it.

### 6.2 Performance (the big one)
- **GPU behind HTTP for litert-lm** — the #2001-style wrapper: a small
  persistent process that loads the GPU engine once and speaks
  stdin/stdout JSON lines; Nedory talks to it instead of `serve`. ~3× on
  chat AND every planner/autotitle/research call. Watch #1929 first — if
  Google ships `--backend` on serve, this is a launch-flag change instead.
- **Prefill mitigation**: context is rebuilt from scratch every turn.
  llama.cpp has prompt caching by slot; litert-lm doesn't expose one via
  serve. Trimming the RAG block (rerank harder, send 3 chunks not 5) is the
  practical lever today.
- **KleidiAI for the S21** (Arm-optimized CPU kernels, merged into llama.cpp)
  — the identified-but-never-executed lever for the Exynos node.

### 6.3 Deep Research
- Current pipeline is linear plan→gather→synthesize×N. Inspiration for the
  next tier: **GPT Researcher** (planner/executor split, source curation),
  **Stanford STORM** (outline-driven, perspective-guided question asking —
  markedly better reports), **Perplexica** (SearXNG-native focus modes).
- Cheap wins first: stream the report as it generates (the plumbing exists —
  research is the one model call not streamed); per-source dedup by domain;
  a "sources used" quality gate (drop rounds that found nothing instead of
  synthesizing air).
- **SearXNG on the Lenovo box** turns web search from "DDG scraping that may
  403" into a stable self-hosted JSON API — one docker-compose away.

### 6.4 Agents & tools
- **Nedory as an MCP server** — expose `brain_search`, `catalog`,
  `deep_research` as tools so Claude (or anything MCP) can query the vault.
  The reverse direction of what was built; the types/registry already exist.
  Inspiration: the `@modelcontextprotocol/sdk` server half, Karakeep's MCP.
- **Native tool calling for big-enough models**: Ollama supports structured
  `tools` for ≥8B models; the planner pattern could upgrade to real function
  calling when the target model supports it, keeping the one-shot planner as
  the small-model fallback.
- **EmergentHealth**: if it exposes MCP, plug it into Emergi as configured;
  if REST-only, wrap its endpoints as builtin-style tools (the `BuiltinTool`
  shape was designed for exactly this).

### 6.5 Chat UX
- Message actions: edit-and-resend, branch/fork, delete-below — the biggest
  daily-use gaps vs Open WebUI/LibreChat (both are good reference
  implementations of conversation trees).
- **Voice input**: Android Chrome's Web Speech API is mostly UI work; TTS out
  (`SpeakButton`) already exists — this closes the loop.
- Virtualize long conversations (100+ message DOM gets heavy on a phone) —
  `@tanstack/react-virtual` is the standard.
- Prompt library / quick commands (`/summarize`, persona switching) —
  inspiration: SillyTavern's macros, Open WebUI's prompt store.

### 6.6 Memory
- Chat memory is verbatim turn storage with cosine recall. The next tier is
  **fact extraction**: a background small-model pass distilling turns into
  pinned-style facts with dedup/update semantics. Inspiration: **mem0**,
  Letta (MemGPT) memory blocks, Open WebUI's memory feature.
- `HISTORY_LIMIT = 20` truncates silently; a rolling summary of the dropped
  prefix (one summarization call when crossing the limit) keeps long chats
  coherent.

### 6.7 Tasks/routines
- node-cron does **not** fire missed schedules (phone was off at 9:00 → no
  9:00 run). A catch-up pass at boot ("last_run < previous scheduled time →
  run now, once") would make routines phone-realistic. Inspiration: Huginn's
  schedule semantics, systemd `Persistent=true` timers.
- Task run history grows unbounded — cap per task (keep last N).
- **Notifications**: Termux has `termux-notification`; a task that fails (or
  a routine that hasn't fired in >2× its period) should surface on the phone,
  not wait to be noticed. ntfy.sh is the self-hosted push option for
  cross-device.

### 6.8 Security (beyond the shipped gate)
- **Login rate-limiting** (a counter + backoff in the sessions blob) — the
  password check is timing-safe but bruteforceable at network speed.
- Secrets (`braveApiKey`, `contextToken`, MCP bearer tokens) are plaintext in
  the settings table and round-trip through `/api/settings` GET. Move to
  write-only fields (accept writes, return `"•••"`), encrypt-at-rest is
  overkill for the threat model but write-only is cheap.
- `GET /api/settings` leaks config to any logged-in device — fine for one
  owner, but pairs badly with the plaintext secrets above.

### 6.9 Code quality / consolidation (all internal, no behavior change)
- **One SSE reader**: the same `getReader/decode/split("\n\n" or "\n")` loop
  exists 6× (ollama, llamacpp, litertlm, useChatStream, council streamAsk,
  MCP client's event parse). Extract `parseSSE(stream): AsyncIterable<string>`.
- **One structured-small-model-call helper**: brain planner, tool planner,
  autotitle share timeout/fence-strip/parse/validate — extract
  `litertlmJson(system, user, {maxTokens, timeout})`.
- **One pill-chip component**: the Brain/Wikipedia/Web/mode chip markup is
  copy-pasted 5×.
- **One settings-collection helper**: `nodes/vaults/customNodes/customLinks/
  scopes/parentOverrides/hub/agents` all reimplement load/save-JSON-blob.
- **Fix `graph-tab.tsx`'s 3 pre-existing lint errors** (set-state-in-effect ×2,
  ref mutation) — the only file failing repo-wide lint.
- `bin/nedory` prints hardcoded `:3000` even when `PORT` overrides it —
  cosmetic.
- Add a test runner. Everything verified this branch was verified by
  *disposable* harnesses (fake MCP/litert-lm/Ollama servers + curl + tsx
  scripts) that were deleted after use; `vitest` + those same fakes as
  committed fixtures would make the verification repeatable. The fakes are
  reconstructable from §4's descriptions.

### 6.10 Where to look for inspiration, generally
- **Open WebUI** — the reference for local-LLM chat UX + hybrid RAG details.
- **LibreChat** — conversation branching, multi-model UX.
- **Perplexica / GPT Researcher / STORM** — research pipelines.
- **mem0 / Letta** — memory architecture.
- **Karakeep (ex-Hoarder)** — self-hosted knowledge + MCP integration done
  tastefully.
- **khoj** — Obsidian-first personal AI search.
- **SillyTavern** — power-user chat ergonomics (macros, personas).
- **Odysseus itself** — the design north star; its Settings information
  architecture (endpoint/model per feature: chat/utility/vision defaults)
  is worth copying as Nedory grows more small-model helpers.
- **node-cron alternatives**: croner (timezone-safe, missed-run info).
- **Serwist** — if the PWA ever wants real offline caching (deliberately
  avoided today; see §4 — a stale cached bundle on a live local server is a
  bug factory).

---

## 7. Roadmap (ordered)

1. **Merge PR #3** and shake down on-device: vault rescan, Bondy query,
   Web toggle from a residential IP, a locked-phone cron task, the auth
   matrix, MCP built-ins on Gemmi.
2. **GPU-behind-HTTP for litert-lm** (§6.2) — 3× everything.
3. **Reranker + heading-aware chunking + embed batching** (§6.1) — retrieval
   quality tier 2.
4. **Missed-cron catch-up + failure notifications** (§6.7) — makes routines
   trustworthy on a device that sleeps.
5. **Nedory as MCP server** (§6.4) — the vault becomes tool-callable from
   Claude.
6. **Fact-extraction memory** (§6.6).
7. **Chat UX pass**: edit/branch/voice (§6.5).
8. **Consolidation sweep** (§6.9) — best done as its own PR, zero behavior
   change.

---

## 8. Honest limitations register

- litert-lm serve is CPU-only (upstream #1929); planner/autotitle/tools all
  eat its ~15 tok/s budget — usually fine (≤200 tokens each) but they queue
  behind a long chat generation on the same single-slot server.
- DuckDuckGo scraping is fragile by nature (markup drift, IP blocks);
  SearXNG is the stable path.
- Research report quality on a 2B model is unproven; mode briefs and cited
  notes are prompt-level mitigations, not guarantees.
- The tool planner sees tool names/descriptions but not full JSON schemas —
  2B models read prose better than schemas, but complex tool args will need
  the schema surfaced eventually.
- No tests beyond lint/build + the (deleted) session harnesses (§6.9).
- Auth is a single shared secret over plain HTTP on a trusted network — the
  right size for the threat model, not for exposure beyond Tailscale.
- `data/app.db` has no backup story; a nightly `sqlite3 .backup` task (a
  routine!) or Litestream to the Lenovo box would close it.
