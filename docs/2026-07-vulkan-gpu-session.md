# Session handoff — GPU acceleration on Nedory's compute phones (July 2026)

Detailed record of a long session that (1) got real GPU-accelerated `llama.cpp`
inference working on the S25 Ultra via Vulkan/Turnip, (2) shipped a reply
timer + tokens/sec indicator in Chat, and (3) wired the new GPU path into
Settings/Cookbook. Written as a handoff for a fresh conversation — read this
instead of re-deriving any of it.

## Fleet (corrected — this was wrong at the start of the session)

| Device | Role | Chipset (confirmed this session) |
|---|---|---|
| **Galaxy S21 Ultra** | Compute node ("brain phone") — Ollama + Kiwix via `bin/nedory-node` | **Exynos 2100, Mali-G78 GPU.** NOT Snapdragon/Adreno as assumed all session until proven otherwise via `vulkaninfo`. Turnip (a Qualcomm-Adreno-only driver) fundamentally does not apply to this phone. |
| **Galaxy S25 Ultra** | Main phone, runs the Nedory dashboard | **Genuine Snapdragon 8 Elite** (`getprop ro.board.platform` → `sun`, `ro.hardware` → `qcom`), Adreno 830. Real Turnip territory — this is where the GPU work actually landed. |
| Doogee U10 tablet | Secondary compute node over Tailscale (see PR #1, merged) | — |
| Lenovo mini-PC | Services box (Qdrant, etc.) | — |

**If a future session assumes the S21 is Snapdragon/Adreno, that assumption
is wrong — correct it immediately.** This cost significant time tonight.

## Why this work happened

Ollama's Android build is CPU-only — no GPU/NPU delegate. Google's own **AI
Edge Gallery** app ran Gemma dramatically faster than Ollama on the same S21,
even offline, because it uses **LiteRT + Qualcomm's QNN/Hexagon NPU
delegate** — fundamentally different, vendor-tuned hardware path, not
something `llama.cpp` can replicate. The achievable alternative: `llama.cpp`
has a real Vulkan backend, and Adreno GPUs can run it via **Turnip**, an
open-source Mesa driver (the proprietary Adreno driver crashes on LLM
shaders, which is why Turnip specifically, not just "a GPU driver", is
required).

## The S21 dead end (don't retry this)

1. `bin/install-vulkan-llama` was built and, after **four real dependency
   fixes** (missing Vulkan headers/glslc, a `vulkan-loader-generic` vs
   `vulkan-loader-android` package conflict, missing SPIRV-Headers, a
   brownout mid-build), successfully compiled a Vulkan-enabled `llama-server`
   on the S21.
2. Every attempt to actually load a model through it **segfaulted**, in
   different ways depending on flags (`-ngl`, `-fa`, `--no-mmap`, coopmat
   env vars, a from-source `-DGGML_VULKAN_COOPMAT_GLSLC_SUPPORT=OFF` rebuild —
   note this cmake flag turned out to be **a no-op**: it's a computed variable
   in `ggml-vulkan/CMakeLists.txt`, unconditionally overwritten by an
   internal `glslc` probe every configure, not a real user-settable option).
3. Root cause, found via Android's own crash logger (`logcat -d -b crash`,
   works without root — gives a full native backtrace `debuggerd` already
   generates for any SIGSEGV): `vulkaninfo` reported `deviceName = Mali-G78`,
   `driverID = DRIVER_ID_ARM_PROPRIETARY`. **The S21 is Exynos, not
   Snapdragon.** Turnip doesn't support Mali at all — the loader was silently
   falling through to Android's real proprietary Mali driver, which crashes
   under Termux's non-standard (non-Android-app-lifecycle) process context.
4. **OpenCL was tried as a fallback and is also a dead end on the S21**:
   `clinfo` found zero platforms. Unlike Vulkan (an official, NDK-stable
   public Android API), OpenCL was never officially exposed to regular apps —
   vendor OpenCL drivers live sealed inside the vendor partition, invisible
   to Termux regardless of SELinux specifics.
5. **Conclusion for the S21: stay CPU-only (Ollama).** The real, still-
   unexplored lever for S21 speed is **KleidiAI** (see below), not GPU.

## The S25 success (this is the real, working path)

Same `install-vulkan-llama` script, run on genuine Adreno hardware. Real bugs
hit and fixed, in order:

1. **`wget` not installed** — trivial, `pkg install wget`.
2. **`vulkaninfo` reported `DRIVER_ID_QUALCOMM_PROPRIETARY`, not Turnip** —
   `VK_ICD_FILENAMES` wasn't actually live in the shell.
3. **The real bug, in our own script**: `mesa-vulkan-icd-freedreno-dri3` (the
   package name the script installed) doesn't exist in Termux's repo anymore
   — it's now `mesa-vulkan-icd-freedreno`, and that package depends on
   `vulkan-loader-generic` (the standalone Khronos loader, which is what
   actually honors `VK_ICD_FILENAMES`). The script's own earlier "fix" (from
   the S21 debugging round) explicitly **uninstalled** `vulkan-loader-generic`
   in favor of `vulkan-loader-android` — which just bridges straight to
   Android's system driver and **silently ignores `VK_ICD_FILENAMES`
   entirely**. So the script was installing Turnip and then immediately
   defeating its own purpose. **Fixed in `bin/install-vulkan-llama`**
   (commit `469ab40` region) — do not reintroduce `vulkan-loader-android`.
4. Once fixed, `vulkaninfo` confirmed: `deviceName = Adreno (TM) 830`,
   `driverID = DRIVER_ID_MESA_TURNIP`, `driverName = turnip Mesa driver`,
   `Mesa 26.0.6`. Real Turnip, finally.
5. **New crash with real Turnip active**: `ggml-backend.cpp:898:
   pre-allocated tensor (cache_k_l5) in a buffer (Vulkan0) that cannot run
   the operation (NONE)` — a clean `GGML_ASSERT` abort (not a segfault).
   Turnip's Vulkan backend can't place the KV cache the normal way.
   **Fix: `--no-kv-offload`** (keeps KV cache on CPU, compute still on GPU).
6. **First successful load + generation** confirmed real GPU inference
   working end to end via `curl` to `/v1/chat/completions`.

### Tuning results (real, measured, not estimated)

- **Baseline** (`-ngl 99 --no-kv-offload`, default `n_slots=4,
  n_ctx_slot=131072`): **3.35 tok/s decode**, 5.25 tok/s prefill.
- **After tuning** (`-ngl 99 --no-kv-offload -c 8192 -np 1 -t 8
  --cache-type-k q8_0 --cache-type-v q8_0`): **~7.07 tok/s decode**, 5.62
  tok/s prefill. **Roughly doubled**, by cutting the default 4-slot/128K-
  context KV cache (which `--no-kv-offload` forces onto CPU — the oversized
  default was the dominant cost, not the driver limitation itself) down to a
  realistic 1-slot/8K, plus explicit 8-thread use and a quantized KV cache.
- Gemma 4 has a "thinking" mode (visible via a `reasoning_content` field in
  responses) that can make replies feel slower by generating more total
  tokens — that's a token-count effect, not a throughput regression.

### Known-good launch command (S25, after `install-vulkan-llama` rebuild)

```bash
VK_ICD_FILENAMES=$PREFIX/share/vulkan/icd.d/freedreno_icd.aarch64.json \
  ~/llama.cpp/build/bin/llama-server \
  -m ~/models/gemma-4-E4B-it-qat-UD-Q4_K_XL.gguf \
  -ngl 99 --no-kv-offload -c 8192 -np 1 -t 8 \
  --cache-type-k q8_0 --cache-type-v q8_0 \
  --port 8081
```

Run inside `tmux` (`tmux new -s llama`, detach with `Ctrl+B` then `D`) —
Termux losing UI focus kills a plain foreground/detached process but not a
tmux session.

### TurboQuant (Google DeepMind, ICLR 2026) — real, but not usable yet

Verified via web research: real technique, KV-cache quantization to 3–4 bits,
walsh-hadamard-rotated polar codebook quantization, ~4.6x compression at ~1%
PPL loss. **Not in mainline `llama.cpp`** as of this session — active
upstream discussion (`ggml-org/llama.cpp#20969`), early third-party forks
with CPU support done, CUDA "awaiting validation", **no Vulkan
implementation**. A pasted "Gemini" guide about it contained clear
hallucination markers (a literally broken `git clone https://github.com` with
no repo path, invented `--cache-type-k turbo2/turbo3/turbo4` flag names that
don't match the real proposed `TQ3`/`TQ4` naming) — do not follow that guide
verbatim if it resurfaces. The already-shipped, non-experimental equivalent
we're actually using is `--cache-type-k q8_0 --cache-type-v q8_0`.

## Code shipped this session (all pushed to
`claude/odysseus-level-page-server-e5w814`, which is this repo's **default
branch** — no PR needed, changes are live on pull)

1. **`bin/install-vulkan-llama`** — fixed the `mesa-vulkan-icd-freedreno`
   package name + the self-defeating `vulkan-loader-android` swap (see
   above). Also has a leftover, harmless-but-ineffective
   `-DGGML_VULKAN_COOPMAT_GLSLC_SUPPORT=OFF` cmake flag from an earlier,
   incorrect hypothesis — safe to remove in a future cleanup pass, doesn't
   currently hurt anything.

2. **Chat reply timer + tokens/sec** (commit `fb93b88`):
   - `src/server/backends/types.ts` — `ModelBackend.chatStream` now yields
     `ChatStreamChunk = { text: string; tokenCount?: number }` instead of
     plain strings.
   - `src/server/backends/ollama.ts` — captures Ollama's real `eval_count`
     from the final streamed line.
   - `src/server/backends/llamacpp.ts` — sends
     `stream_options: { include_usage: true }` (OpenAI-compatible) to get
     llama.cpp's real `usage.completion_tokens` from the final SSE chunk.
   - `src/server/chat/service.ts` — `streamAssistant` measures wall-clock
     `durationMs`, uses the backend's real token count when available, else
     `estimateTokenCount()` (~4 chars/token fallback). Persists both on the
     assistant message row; yields a `{ stats }` SSE event.
   - `src/server/db/schema.ts` + `drizzle/0004_acoustic_chronomancer.sql` —
     new nullable `duration_ms`, `token_count` columns on `messages`.
   - `src/lib/useChatStream.ts`, `src/components/chat/message-bubble.tsx` —
     client plumbing + display as `"3.2s · 7.1 tok/s"` under each reply.
   - `src/server/council/service.ts` — updated for the new chunk shape
     (Council/Compare mode also uses `chatStream`).

3. **Settings + Cookbook wiring for GPU builds** (commit `fb93b88`):
   - `src/server/settings/config.ts` — new `llamaCppEnv` setting: space-
     separated `KEY=value` pairs applied as env vars to every llama.cpp
     server launch. This is what makes `VK_ICD_FILENAMES` settable from the
     UI instead of only the CLI.
   - `src/server/backends/llamacpp.ts` — `startServer()` now parses and
     applies `llamaCppEnv` (both the `spawn()` path via `env:` and the
     `tmux` path via an inline shell env-var prefix).
   - `src/app/settings/page.tsx` — new field for it.
   - `src/components/cookbook/running-panel.tsx` — new **"Start a llama.cpp
     server"** form (name, model path, extra args pre-filled with the tuned
     flags above, tmux checkbox default-on).

4. **`src/lib/friendlyError.ts`** (commit `6a72fad`) — removed a hardcoded
   "Is the S21 awake?" in the generic unreachable-host error message; it was
   actively misleading when the actually-unreachable node was the S25 (or
   anything else). Now says "check the node's URL under Nodes" generically.

## To actually use the GPU path (on the S25, after `nedory update`)

1. Settings → **llama.cpp binary path** → `~/llama.cpp/build/bin/llama-server`
2. Settings → **llama.cpp environment overrides** →
   `VK_ICD_FILENAMES=/data/data/com.termux/files/usr/share/vulkan/icd.d/freedreno_icd.aarch64.json`
3. Cookbook → **Start a llama.cpp server** → name it, model path →
   `~/models/gemma-4-E4B-it-qat-UD-Q4_K_XL.gguf`, leave the pre-filled tuned
   extra args, tmux on, Start.
4. Chat → pick it from the model dropdown → send → should show the new
   `Xs · Y tok/s` line under the reply.

## Unresolved / open at end of session

- **Live connectivity blip**: last screenshot showed `[S25 Ultra]
  gemma4:e4b-it-qat` (an **Ollama** tag, not the GGUF/Vulkan path above)
  failing with "can't reach the model host" despite the sidebar showing
  "2/2 nodes up". Traced the routing code (`registry.ts`,
  `nodes.ts::resolveHost`) and found no bug — the model only appears in the
  dropdown if a reachability check passed moments earlier, so this looks
  like a timing blip (Ollama on the S25 became briefly unreachable between
  page load and Send) rather than a code issue. **Not yet confirmed fixed or
  re-diagnosed** — next session should check `curl
  http://127.0.0.1:11434/api/tags` on the S25 and `ollama list` to confirm
  `gemma4:e4b-it-qat` is actually pulled there.
- **Agent launcher can't target llama.cpp models**: `resolveAgentOption()` in
  `src/lib/agentModel.ts` filters `backend === "ollama"` only, so the Athena
  persona card in Agents can't launch onto a GPU-accelerated llama.cpp
  server — only Chat's plain model picker can. Flagged, not fixed, on
  purpose (explicitly deferred scope from the original plan).
- **Cookbook's fit-score catalog is Ollama-only**: `CatalogModel` in
  `src/server/catalog/fitScore.ts` has no GGUF/llama.cpp concept — extending
  it (download-with-progress flow, fit scoring for GGUF files) was
  explicitly deferred, not started.
- **PR #2** (`docs/local-ai-rag.md`, branch
  `claude/nedory-local-ai-rag-dt2yq6`, opened by a separate session) is an
  open draft with book-library RAG research — model picks (Qwen3.5-4B/9B),
  and a Brain pipeline gap analysis (biggest: add BM25/FTS5 lexical search
  fused with existing dense embeddings via Reciprocal Rank Fusion — `node:
  sqlite` already ships FTS5, zero new deps needed). Not started, sitting
  for review.
- **KleidiAI CPU acceleration** — real, verified, not yet implemented on
  either phone. `llama.cpp`'s CPU backend auto-dispatches SME2/I8MM/DotProd
  microkernels via Arm KleidiAI (`-DGGML_CPU_KLEIDIAI=ON`, on by default,
  just needs explicit `-march`). **Neither S21 (Snapdragon 888) nor S25
  (first-gen Snapdragon 8 Elite) has SME** — only I8MM/DotProd gains apply,
  not the flashier SME2 numbers. Correct `-march` flags: S25 →
  `armv9.2-a+i8mm+dotprod+bf16`, S21 → `armv8.2-a+dotprod+fp16`. This is the
  real, low-risk lever for the S21 specifically, now that GPU is a confirmed
  dead end there.
- **Hexagon/NPU backend** — explicitly ruled out for this setup. Real
  (`llama.cpp`'s experimental `-DGGML_HEXAGON` / `HTP0` backend), but wants
  `adb`/root and FastRPC device access (`/dev/fastrpc-*dsp`), a poor fit for
  the unrooted-Termux architecture this whole project is built on.

## Model recommendations (from verified research, not guesses — cross-check
before reusing)

| Model | Size (Q4) | Notes |
|---|---|---|
| Qwen3.5-4B | ~2.5GB | 201 languages, hybrid linear attention → near-constant KV-cache memory even with long chat history |
| Qwen3.5-9B | ~5.3GB | Quality ceiling, still fits 12GB+ RAM |
| Qwen3-4B-Instruct-2507 | ~2.4GB | Best for tool-calling/agent work specifically |
| Gemma 4 E4B QAT (Unsloth `UD-Q4_K_XL` dynamic requant) | ~3GB | What's actually running tonight; official Google QAT quant, avoid naive Q4_0 (measurably worse per Unsloth's own docs) |
| Phi-4-mini (3.8B) | ~2.3GB | ~15-20% faster than Qwen3-4B, better multi-turn tool-planning |
| LFM2.5-230M | <400MB | Not a chat model — router/orchestrator for fast intent classification in front of a bigger model |

## Key files map

- `bin/install-vulkan-llama` — the Turnip build script (now fixed)
- `src/server/backends/{types,ollama,llamacpp,registry}.ts` — backend
  abstraction, now with real token-count reporting
- `src/server/chat/service.ts` — chat orchestration, timing/stats logic
- `src/server/settings/config.ts` — `llamaCppEnv` setting
- `src/components/cookbook/running-panel.tsx` — server start/stop UI
- `src/lib/friendlyError.ts` — user-facing error text
- `docs/local-ai-rag.md` (PR #2, separate/unrelated) — book-library RAG
  research, not GPU-related
