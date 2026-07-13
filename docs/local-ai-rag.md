# Nedory — Local AI & RAG for the Book Library

Research + recommendations (July 2026) for making Nedory a trustworthy assistant
over the personal library: history, classical literature, and architecture, in
**English, Czech, and Latin**. Grounded in the current codebase — the Next.js
dashboard, the Ollama/llama.cpp backends, and the Brain pipeline
(`src/server/brain/`).

**Current fleet:**

| Device | Role | Notes |
|---|---|---|
| Galaxy S25 Ultra | Main phone, runs the Nedory dashboard | Snapdragon 8 Elite (Hexagon NPU), 12GB RAM shared with daily apps |
| Galaxy S21 Ultra | Dedicated compute node ("brain phone") | Ollama + Kiwix via `bin/nedory-node`, 7GB+ free RAM, optional Vulkan `llama-server` via `install-vulkan-llama` |

---

## 1. Model recommendations (~4.5GB class)

### The short version

| Where | Pick | Ollama tag / source | Size | Why |
|---|---|---|---|---|
| **S21 (chat, primary)** | **Qwen3.5-9B Q4** | `qwen3.5:9b` | ~5.3GB | Quality ceiling that fits 7GB free; 201 languages incl. Czech; best factual accuracy in class |
| **S21 (chat, fast)** | **Qwen3.5-4B Q4** | `qwen3.5:4b` | ~2.5GB | 2–3× the speed, same 201-language coverage; the pragmatic daily driver on an SD888 CPU |
| **S21 (chat, alt)** | **Gemma 4 E4B QAT q4_0** | `gemma4:e4b` (verify tag) or `google/gemma-4-E4B-it-qat-q4_0-gguf` for the Vulkan `llama-server` path | ~3GB | Mobile-first (Per-Layer Embeddings), official QAT quant, 140+ languages, multimodal |
| **Embeddings** | **bge-m3** (already Nedory's default) | `bge-m3` | ~1.2GB | Multilingual (EN/CS + more), the right call — keep it |

*(Exact tag names for the newest families should be confirmed with
`ollama pull` — Ollama tag naming occasionally differs from the HF repo name.)*

### Why these models (the 2026 generation)

**Qwen3.5 small series** (March 2026: 0.8B / 2B / 4B / 9B) is the headline
change since the catalog in `src/server/catalog/models.json` was written:

- 248K-token vocabulary covering **201 languages and dialects** — the strongest
  Czech of any small open model, and broad enough classical-corpus pretraining
  to read Latin passably.
- Hybrid linear-attention architecture (3:1 Gated DeltaNet to full attention) →
  **near-constant KV-cache memory** and 262K native context. For RAG this is
  the killer feature on a phone: stuffing several book excerpts into the prompt
  barely moves the memory needle, unlike the classic transformers in the
  current catalog.
- Dual thinking/non-thinking modes: non-thinking for term lookups, thinking for
  cross-referencing questions.
- GGUF (for the Vulkan `llama-server` path): `unsloth/Qwen3.5-9B-GGUF`,
  `unsloth/Qwen3.5-4B-GGUF`. 9B Q4_K_M ≈ 5.3GB, IQ4_XS ≈ 4.8GB; 4B Q4_K_M ≈
  2.5GB, Q6_K ≈ 3.5GB.

**Gemma 4 E-series** (E2B/E4B — the mobile-first variants):

- Per-Layer Embeddings: E4B has ~4B "effective" params at **~3GB in 4-bit**
  with quality above its weight class.
- Official **QAT q4_0 GGUFs** from Google — much lower quantization loss than
  post-hoc Q4 of other models.
- 140+ languages, multimodal. The larger Gemma 4 sizes (12B ≈ 7GB at Q4,
  26B-A4B, 31B) don't fit the phones.

**Worth knowing, not primary:** Aya Expanse 8B (best pure Czech *prose style*,
weaker reasoning, older generation), EuroLLM 9B (EU-language specialist, same
caveat), Qwen3.6 (small sizes not out yet — would slot straight in when they
are).

### Quantization rules of thumb

- **Q4_K_M / Q4_K_S** (or Google QAT q4_0) is the sweet spot on ARM.
- **Avoid IQ2/IQ3**: multilingual ability and factual recall degrade first —
  exactly what Nedory needs most.
- On the Vulkan `llama-server` path, add `--cache-type-k q8_0 --cache-type-v
  q8_0` to extra args to halve KV-cache memory (less critical for Qwen3.5).

### The Latin caveat

Nothing is benchmarked on Latin. The 4B–9B class reads classical and
ecclesiastical Latin passably, but **don't trust parametric knowledge for Latin
definitions** — the retrieval changes in §3 (hybrid lexical search + grounded
prompting) are what make Latin answers reliable, not model choice.

### Catalog refresh (follow-up work)

`src/server/catalog/models.json` still lists Llama 3.2/3.1, Mistral 7B,
Qwen2.5, and Gemma 2 — one to two generations old. Adding entries for
`qwen3.5:4b`, `qwen3.5:9b`, and `gemma4:e4b` (with real file sizes and
`minRamGB`) would make the Cookbook's fit-scores recommend the right things on
the S21.

---

## 2. Stack: keep Nedory, tune the split

The existing architecture is already the right one — a dashboard phone plus a
dedicated compute node over Tailscale is strictly better than squeezing
everything into one app. Recommendations within it:

- **Chat models live on the S21** (Ollama, or Vulkan `llama-server` for GPU
  offload with `-ngl 99` once Turnip proves stable on that Adreno 660 —
  benchmark both; on SD888-era chips CPU with KleidiAI-optimized llama.cpp is
  sometimes the steadier option).
- **Embeddings: use the `embeddingHost` split** that `settings/config.ts`
  already supports — run `bge-m3` on the S25's own Ollama (`localhost`) so
  library ingestion doesn't evict the chat model from the S21's RAM mid-answer.
  bge-m3 (~1.2GB) fits comfortably inside the dashboard phone's headroom.
- **Vector index: in-memory is fine until the library is actually indexed.**
  bge-m3 vectors are 1024-dim Float32 = 4KB/chunk. The current in-memory index
  (`vectorStore.ts`) loads *every* chunk row at boot; a few hundred books ≈
  150–200K chunks ≈ **~700MB+ of Node heap on the dashboard phone** — that will
  hurt. At library scale, either point `qdrantUrl` at the services box (the
  supported escape hatch), or add int8 scalar quantization to the in-memory
  index (4× smaller, negligible recall loss; ~180MB for the same corpus).
- **Sanity-check apps** (optional): AnythingLLM Mobile is the best turnkey
  on-device RAG app right now and is useful as a *quality baseline* to compare
  Nedory's retrieval against; Google AI Edge Gallery is the easiest way to try
  Gemma 4 E4B NPU-accelerated on the S25. Neither replaces anything — Nedory
  already covers their role in this setup.

---

## 3. RAG: gap analysis of the Brain pipeline

What's already right: incremental ingestion by content hash (`ingest.ts`),
paragraph-aware chunking (`chunker.ts`), multilingual embeddings by default,
scope filters, and a Qdrant escape hatch. Four concrete gaps, in impact order:

### 3.1 Add lexical (BM25) search and fuse it with dense — the big one

`search.ts` is pure dense retrieval. Dense embeddings are weakest exactly where
this library is hardest: **Latin terms, proper nouns, and technical
architecture vocabulary** (*opus reticulatum*, *sedile*, minor Bohemian
nobility). Exact lexical match catches what embeddings blur.

- `node:sqlite` ships with **FTS5 enabled** (verified on this repo's Node
  target), so this needs *zero new dependencies*: an FTS5 virtual table over
  `brain_chunks.content`, populated in `ingestDocument`, plus a contentless
  rebuild on reindex.
- Fuse with **Reciprocal Rank Fusion**: take top-20 from each of dense and
  BM25, score each hit `Σ 1/(60 + rank)`, return the fused top-K. RRF needs no
  score normalization, which matters because cosine and BM25 scores aren't
  comparable.
- Keep final K at 4–6 chunks (~1,500–2,500 tokens). More context dilutes small
  models and slows CPU prefill.

### 3.2 Chunking: add overlap, raise the target

`chunker.ts` targets 1000 chars (~250 tokens) with **no overlap**, and
hard-splits long paragraphs mid-sentence. For dense book prose:

- Target **1,200–2,000 chars (300–500 tokens)**, keep the paragraph-boundary
  logic.
- Add **10–15% overlap** between adjacent chunks so a definition that straddles
  a boundary is retrievable from either side.
- Hard-split on sentence boundaries (`. ! ?` + space) rather than a raw
  `slice()`.
- Changing chunking invalidates stored chunks — bump behavior behind the
  existing reindex flow (`reindex.ts`) so one "Reindex" click migrates.

### 3.3 Chunk metadata: language and book location

`ChunkMeta` carries `projectId`/`sourceType`/`conversationId` but nothing about
*where in which book* a chunk lives. For a trilingual library add:

- **`language`** (detect once per document at ingest — even a trivial
  stopword-based EN/CS/LA classifier is enough) → enables "answer from Czech
  sources only" filters and keeps chunks language-pure in retrieval.
- **`chapter`/section title** from the EPUB spine (`library/epub.ts` already
  walks it) → citations in chat become "Book, ch. 4" instead of a bare file
  path.

### 3.4 Ingestion at library scale

`embedTexts` sends all chunks of a document in one Ollama call — a full book is
~600 chunks, which can stall or OOM the embedder. Batch at **16–32 chunks per
call**, and ingest books sequentially. With `embeddingHost` on the S25 (see
§2), a few hundred books is an overnight job, not a blocker — and the content
hash makes it resumable for free.

### Grounded prompting for term explanations

Wherever the chat service assembles Brain context, the system prompt for
library-grounded answers should force citation and language-matching:

```
Base your answer ONLY on the excerpts below. If they don't contain the answer,
say so — do not invent facts. Quote the relevant passage (with book and
chapter) when defining a term. Answer in the language of the question. For
Latin terms, give the literal translation first, then the contextual meaning
in the source.
```

---

## Suggested order of attack

1. Pull `qwen3.5:4b` (and `bge-m3` if not present) on the S21; A/B against the
   current chat model on real questions from the books. Try `qwen3.5:9b` and
   Gemma 4 E4B QAT next.
2. Set `embeddingHost` to the S25's local Ollama; ingest a first tranche of
   books (one per language) and evaluate retrieval quality.
3. Implement §3.1 (FTS5 + RRF) — biggest quality win per line of code, no new
   dependencies.
4. Then §3.2 chunk overlap + §3.3 metadata behind a reindex.
5. Refresh `models.json` with the 2026 entries so Cookbook fit-scores stay
   honest.
6. Revisit the vector-index memory story (Qdrant on the box vs int8 in-memory)
   once chunk count crosses ~50K.

## Sources

- [Qwen 3.5 small series coverage](https://awesomeagents.ai/news/qwen-3-5-small-models-series/) · [Unsloth Qwen3.5 docs](https://unsloth.ai/docs/models/qwen3.5) · [Qwen3.5-9B requirements](https://willitrunai.com/blog/qwen-3-5-9b-vram-requirements) · [qwen3.5 on Ollama](https://ollama.com/library/qwen3.5)
- [Gemma 4 model card](https://ai.google.dev/gemma/docs/core/model_card_4) · [Gemma 4 E2B vs E4B on phones](https://www.mindstudio.ai/blog/gemma-4-e2b-vs-e4b-edge-models-audio-vision-phone) · [gemma-4-E4B-it-qat-q4_0-gguf](https://huggingface.co/google/gemma-4-E4B-it-qat-q4_0-gguf)
- [bge-m3 on Ollama](https://ollama.com/library/bge-m3) · [Ollama embedding models compared](https://www.morphllm.com/ollama-embedding-models)
- [LiteRT on Qualcomm NPU](https://developers.googleblog.com/unlocking-peak-performance-on-qualcomm-npu-with-litert/) · [llama.cpp on Samsung S25](https://github.com/ggml-org/llama.cpp/discussions/11977) · [Best local LLM apps for Android 2026](https://www.promptquorum.com/power-local-llm/best-local-llm-apps-android-2026)
- [AnythingLLM Mobile docs](https://docs.anythingllm.com/mobile/overview) · [On-device vector databases 2026](https://objectbox.io/262454-2/)
