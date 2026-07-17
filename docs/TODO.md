# Nedory — TODOs & Ideas

Actionable checklist. Background/reasoning for every item lives in
`docs/CODEX.md` (section references in parens). Keep this file honest: check
things off, strike dead ideas, add new ones at the bottom of the right list.

## What runs where (so "server" stops being confusing)

"Server" = a program listening on a port — not a separate machine. On the
**S25 itself**, inside Termux:

```
Browser (Chrome / installed PWA)
   │  http://localhost:3000
   ▼
Next.js dashboard  ← the app; runs in tmux session "nedory"
   │  http://127.0.0.1:9379          │  http://127.0.0.1:11434
   ▼                                 ▼
litert-lm serve (the model)      local Ollama (embeddings)
```

All of that is the phone talking to itself. The only real other machines are
the fleet nodes over Tailscale: S21 (Ollama + Kiwix), U10 (same), Lenovo
(Qdrant, future SearXNG). If every node is off, the phone still does chat,
RAG, research, tasks — fully alone.

---

## Now — on-device shakedown (after `git pull` on the branch)

- [ ] `pkg install tmux` if missing, then `nedory stop && nedory` — confirm it
      prints the tmux session line and `tmux attach -t nedory` shows the app
- [ ] Vault rescan once (Settings) — picks up the chunk cleaner re-ingest
- [ ] "What do my notes say about Egon Bondy?" — citations should be clean
      prose (no `Owner:` / `**Autor**` scaffolding)
- [ ] Create a cron task ~5 min out → **lock the phone** → come back →
      Tasks row should say "last success Xm ago (cron)" (the routines fix)
- [ ] Web toggle on a chat from the phone's own IP (DDG may 403 datacenter
      IPs but should work residential; if not → SearXNG idea below)
- [ ] Deep Research: 1 round, gemma4-e2b, something small — check report
      quality before trusting bigger runs
- [ ] Enable tool calling on Gemmi (no MCP server needed) → ask it about node
      status / hardware — built-ins should answer
- [ ] Auth once: Settings → Dashboard password → set → confirm /login gates →
      log in → log out → (optionally turn back off)
- [ ] "Add to Home Screen" — should now install as a standalone PWA
- [ ] New chat, first message → sidebar title should rename itself

## Next — build queue (ordered by value, CODEX §6–7)

- [ ] **GPU behind HTTP for litert-lm** (§6.2) — persistent GPU-engine wrapper
      process (LiteRT-LM issue #2001 pattern); ~45 vs ~15 tok/s, speeds up
      chat AND planner/autotitle/tools. Check #1929 first — if serve grew a
      `--backend` flag, it's just a launch-flag change.
- [ ] **Reranker stage** (§6.1) — bge-reranker-v2-m3 over the fused top-20
- [ ] **Heading-aware chunking** (§6.1) — split on markdown headings, prepend
      heading path to each chunk; then one vault rescan
- [ ] **Batch embeddings** (§6.1) — Ollama `/api/embed` takes arrays; current
      loop is one request per chunk
- [ ] **Missed-cron catch-up** (§6.7) — node-cron skips schedules the phone
      slept through; boot-time "should have run → run once now" pass
- [ ] **Task failure notifications** (§6.7) — `termux-notification` on error
      and on "routine hasn't fired in 2× its period"
- [ ] **SearXNG on the Lenovo box** (§6.3) — docker-compose; set URL in
      Settings; stops depending on DDG scraping
- [ ] **Nedory as MCP server** (§6.4) — expose brain_search / catalog /
      deep_research so Claude can query the vault
- [ ] **Login rate-limiting** (§6.8) — small backoff counter
- [ ] **Write-only secrets** (§6.8) — braveApiKey/tokens shouldn't round-trip
      through GET /api/settings
- [ ] **Consolidation sweep** (§6.9, own PR, zero behavior change): one SSE
      reader (6 copies today), one litertlm-JSON-call helper (3), one pill
      chip component (5), one settings-collection helper (8); fix
      graph-tab.tsx's 3 pre-existing lint errors
- [ ] **DB backup routine** (§8) — nightly `sqlite3 .backup` task, copy to
      Lenovo; eat our own dogfood (it's literally a Task)
- [ ] Task run history cap (keep last N per task)

## Ideas — bigger swings / someday

- [ ] **Fact-extraction memory** (mem0/Letta-style): background small-model
      pass distilling chat turns into deduped pinned facts (§6.6)
- [ ] Rolling summary when chats cross HISTORY_LIMIT (20) instead of silent
      truncation (§6.6)
- [ ] **Chat UX pass**: edit-and-resend, branch/fork, delete-below
      (reference: Open WebUI, LibreChat) (§6.5)
- [ ] **Voice input** — Web Speech API mic button on the composer; TTS out
      already exists (§6.5)
- [ ] Virtualize long conversations (@tanstack/react-virtual) (§6.5)
- [ ] Prompt library / slash commands (SillyTavern macros as reference) (§6.5)
- [ ] **STORM-style research** — outline-driven, perspective-guided questions;
      also: stream the report as it generates (§6.3)
- [ ] Native Ollama tool-calling path for ≥8B models, planner as small-model
      fallback (§6.4)
- [ ] EmergentHealth → Emergi: MCP endpoint if it has one, else wrap its REST
      as builtin-style tools (§6.4)
- [ ] **KleidiAI llama.cpp build for the S21** — the Exynos node's only real
      lever (§6.2)
- [ ] Czech/Slovak declension handling in lexical search ("Bondym" vs
      "Bondy") — snowball stemmer or planner-normalized entity (§6.1)
- [ ] Odysseus-style Settings IA: per-feature model defaults (chat / utility /
      vision) instead of one litertlm model id for all helpers (§6.10)
- [ ] Router/orchestrator: one dispatcher picking node+model per request
      (the old LFM2.5-as-router idea)
- [ ] Test runner (vitest) with the fake-backend fixtures from the session
      harnesses (§6.9)
- [ ] croner instead of node-cron (timezone-safe, exposes missed-run info)
- [ ] ntfy.sh for cross-device push (phone → other devices)

## Rejected (don't re-litigate without new facts — CODEX §4.1)

- ~~Replicating AI Edge Gallery's APIs inside llama.cpp~~ — Android-app-only
  APIs, meaningless for an HTTP server
- ~~colibrì / MoE expert-streaming-from-SSD~~ — needs NVMe as a RAM tier;
  phone UFS isn't that
- ~~TurboQuant KV cache~~ — no Vulkan path for Adreno; `q8_0` KV flags stay
- ~~Service-worker offline caching~~ — live local server + cached stale
  bundles = bug factory; the SW stays a no-op passthrough
- ~~Expanding the catalog regex with "what do my notes say" patterns~~ —
  answer-shaped questions belong to hybrid retrieval, not title lists
