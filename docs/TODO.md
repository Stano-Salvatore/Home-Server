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

- [x] Push-to-talk voice loop (`nedory-voice ask`) — proven working
      end-to-end on the S21 against the real S25 dashboard.
- [ ] **Hands-free "Hey Nedory"** (`docs/voice-loop.md`) — `nedory-voice
      listen`. Wake-window widened 3s→5s after on-device testing found
      termux-microphone-record's startup lag was clipping the phrase; every
      non-empty chunk now logs what whisper heard, for tuning `WAKE_WORDS`.
      Still needs a real quiet-room retest — last attempt was outside/noisy.
- [ ] **Reminders** — new `create_reminder` tool (chat/voice: "remind me to
      X in 10 minutes" / "at 6pm"), backed by a new one-time task trigger
      type (`triggerType: "once"`, fires via setTimeout, self-disables
      after) and a best-effort `termux-notification` on completion. Fully
      verified in-sandbox (fires at the exact scheduled second, disables
      correctly, ENOENT-suppresses cleanly where termux-notification isn't
      installed) — **the one thing that needs the real S25**: confirm an
      actual Android notification appears when it fires there.
- [x] **Web Share Target capture** (voice-loop plan, Phase 2) — highlight text
      on the S25 (or any page/app) → Share → Nedory → `/share` shows what was
      shared and files it as a vault note (`writeNote`, `Shared/` folder) or a
      one-time reminder (reuses the same `createTask({triggerType: "once"})`
      path as `create_reminder`). GET-method `share_target` in the manifest —
      no service worker changes needed, the SW stays the no-op passthrough.
      Verified end-to-end in-sandbox: manifest exposes `share_target`,
      `/share?title=&text=&url=` renders the captured content, "Save as
      note" writes+ingests a real vault file (confirmed against a fake
      Ollama embed endpoint), "Remind me" creates a task that fires and
      self-disables at the scheduled second. **Not done: "list" as a third
      destination** — no list/todo-item concept exists anywhere in the app
      yet (checked: no such table, no such API); would need its own small
      feature rather than a fake fit into `memoryFacts` (those are pinned
      into *every* conversation's context — wrong semantics for a stray
      shopping-list item). **Needs the real S25**: confirm Android's share
      sheet actually lists the installed PWA as a target and that the
      capture page opens correctly from a real share (only testable on
      the device, not in-sandbox).
- [ ] **Connect Home Assistant** — Settings → Home Assistant URL + long-lived
      access token (HA → your profile → Security → Long-Lived Access
      Tokens). Once set, `home_assistant_list`/`home_assistant_control`
      become available to any tool-calling turn, chat or voice — "Hey
      Nedory, turn off the AC" now actually calls HA, not just talks about
      it. Verified against a fake HA server; **untested against the real
      Lenovo HA instance** — confirm the fuzzy entity match ("AC", "socket")
      actually resolves to your real entity_ids, tune the `entity` phrasing
      you use if it picks the wrong device.
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
- [x] **Batch embeddings** (§6.1) — switched to Ollama's `/api/embed`
      (batch), chunked at 32 texts/request. Verified: a multi-paragraph
      note's chunks went out as one request ("batch of 3 texts" in the
      fake Ollama's log), not one request per chunk.
- [ ] **Rescan/watcher race on a brand-new file** (discovered while
      verifying the above) — adding a vault file while the watcher is
      active fires both the watcher's own ingest AND (if a rescan happens
      to run around the same time) a second insert attempt, which fails
      with a caught-but-logged `UNIQUE constraint failed: source_path`.
      Not data-losing (the watcher's ingestion already won), just noisy.
- [x] **Missed-cron catch-up** (§6.7) — boot-time pass using cron-parser to
      compute each task's last-scheduled-fire time; runs once if no actual
      run happened since. Only ever catches up the single most recent
      missed slot. Verified: backdated a task's createdAt, restarted,
      confirmed a real run fired; restarted again, confirmed no duplicate.
- [ ] **Task failure notifications** (§6.7) — `termux-notification` on error
      and on "routine hasn't fired in 2× its period"
- [ ] **SearXNG on the Lenovo box** (§6.3) — docker-compose; set URL in
      Settings; stops depending on DDG scraping
- [ ] **Nedory as MCP server** (§6.4) — expose brain_search / catalog /
      deep_research so Claude can query the vault
- [x] **Login rate-limiting** (§6.8) — global exponential backoff (1s→30s
      cap) after 3 free attempts, checked before the password itself
- [x] **Write-only secrets** (§6.8) — braveApiKey/homeAssistantToken no
      longer round-trip through GET /api/settings (masked + a secretsSet
      map instead); an empty secret on save leaves the stored value alone
- [x] **Consolidation sweep** (§6.9) — readSSE() (3 client-side copies →
      1), litertlmCall() (3 copies → 1), PillToggle (7 copies → 1),
      readJsonBlob()/writeJsonBlob() (8 settings-collection modules: custom
      nodes/links, scopes, parent overrides, hub, agents, vaults, ollama
      nodes — the latter two kept their legacy-setting seeding logic local,
      only the parse/fallback core extracted); fixed graph-tab.tsx's 3
      pre-existing lint errors + council's dead `options` state. Repo lints
      with zero errors, zero warnings. All 8 modules re-verified end-to-end
      (create/read/update/delete) against the real dashboard after the
      refactor, not just typecheck.
- [x] **DB backup routine** (§8) — nightly (3am) `VACUUM INTO` snapshot
      (SQLite's own atomic backup mechanism, safer than a plain file copy
      against a live WAL-mode DB), 14-day retention, manual "Back up now"
      button in Settings. Not a user-facing Task (that would've needed a
      new non-LLM task type) — a fixed cron registered at boot instead,
      same node-cron infrastructure. Verified: valid/complete SQLite
      output confirmed by reopening and querying it, and pruning tested
      directly (seeded 16 extra files, confirmed exactly the 14 newest
      survived a further backup).
      **Not done: "copy to Lenovo"** — `dbBackupDir` can point at any
      mounted path (e.g. an SSHFS mount to the Lenovo), but there's no
      built-in remote-transfer client. Mount a network path there, or
      pull the backups from `data/backups` some other way.
- [x] Task run history cap (last 50 per task, pruned after every run)
- [x] **ConversationList has no mobile collapse** — real S25 testing (not
      just desktop-width Playwright) caught this live: the chat column's
      mobile gutter was reserved space for a list that had no way to hide,
      leaving a dead blank strip instead of centering. Fixed properly:
      ConversationList is now an off-canvas drawer on mobile sharing
      Sidebar's hamburger (useMobileNavOpen), gutter removed entirely.

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
- [ ] **Home Assistant automations** (voice-loop plan, Phase 1) — AC on
      weather-forecast + time + temperature; vacuum on phone-leaves-home-zone
      + 10min delay. Pure HA config, no LLM, no Nedory code — the only gap is
      getting the robot vacuum into HA at all.
- [ ] **Real wake-word engine** (voice-loop plan, Phase 4 upgrade) — swap
      `bin/nedory-voice`'s whisper-polling wake detection (works, but
      battery-hungry and prone to false triggers/mishearings — confirmed live
      on-device: whisper's tiny model transcribed "Hey Nedory" as "Nederi"
      consistently, and ~10 added `WAKE_WORDS` mishearing-variants still
      didn't reliably catch it) for a proper always-on wake-word model.
      **Porcupine's Python SDK is a confirmed dead end on Termux** — not a
      binary-load failure, `pvporcupine` explicitly checks
      `platform.system()` and raises `ValueError: Unsupported system
      'Android'.` outright. Don't re-try this path. A native Android app is
      the real fix — parked until the OptiPlex/PC arrives (below), at which
      point the voice loop moving off the S21 entirely may make this whole
      question moot anyway.
- [ ] **Voice loop moves to the OptiPlex** (voice-loop plan, Phase 5) — once
      it lands, move whisper.cpp (and ideally Nedory's own brain) off the
      S21 onto real hardware; the S21 becomes purely mic+speakers+wake-word.
- [ ] **Nedory writes Home Assistant automations** (voice-loop plan, Phase
      5) — natural language → generated HA automation YAML, via an MCP-style
      tool once Nedory-as-MCP-server (above) exists.
- [ ] **mobile-use for in-app control** (voice-loop plan, Phase 5) — agent
      drives Android apps via ADB for things HA can't reach.

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
