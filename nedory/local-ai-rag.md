# Nedory — Local AI RAG Assistant for a Personal Digital Library

**Goal:** a fully on-device AI assistant that performs RAG over a personal book
collection (history, classical literature, architecture) and accurately explains
complex historical, architectural, and literary terms across **English, Czech, and
Latin**.

**Target devices:**

| Device | Role | SoC | RAM situation | Inference path |
|---|---|---|---|---|
| Galaxy S25 Ultra | Main daily phone | Snapdragon 8 Elite (Hexagon NPU) | 12GB total, shared with daily apps | NPU (LiteRT/MLC) or CPU (llama.cpp + KleidiAI) |
| Galaxy S21 Ultra | Dedicated AI device, factory reset | SD888 / Exynos 2100 | 7GB+ consistently free | CPU-only (llama.cpp), no usable NPU path |

*Research date: July 2026.*

---

## 1. Model recommendations

### The short version

| Device | Primary pick | Why | Alternative |
|---|---|---|---|
| **S25 Ultra** | **Gemma 4 E4B-it, QAT q4_0** (~3GB) | Mobile-first architecture (Per-Layer Embeddings), official Google quantization, 140+ languages, NPU-accelerated, multimodal (photograph a book page and ask about it) | Qwen3.5-4B Q4_K_M (~2.5GB) when Czech quality matters most |
| **S21 Ultra** | **Qwen3.5-9B, IQ4_XS / Q4_K_S** (~4.8–5.2GB) | The quality ceiling that fits 7GB free; best multilingual coverage (201 languages incl. Czech), best factual accuracy in class | Qwen3.5-4B Q6_K (~3.5GB) or Gemma 4 E4B QAT for 2–3× the speed |

### Why these models (2026 generation)

**Qwen3.5 small series** (released March 2026: 0.8B / 2B / 4B / 9B):
- 248K-token vocabulary covering **201 languages and dialects** — the strongest
  Czech coverage of any small open model, and its broad classical-corpus
  pretraining handles Latin passably.
- Hybrid linear-attention architecture (3:1 Gated DeltaNet to full attention) →
  **near-constant KV-cache memory** and 262K native context. This is a major win
  for RAG on mobile: stuffing 4–6 book excerpts into the prompt barely moves the
  memory needle, unlike classic transformers.
- Dual thinking/non-thinking modes; use non-thinking for term lookups, thinking
  for cross-referencing questions.
- GGUF quants: `unsloth/Qwen3.5-9B-GGUF`, `unsloth/Qwen3.5-4B-GGUF` on Hugging
  Face. 9B Q4_K_M ≈ 5.3–5.5GB; IQ4_XS/Q4_K_S ≈ 4.8–5.2GB; 4B Q4_K_M ≈ 2.5GB,
  Q6_K ≈ 3.5GB, Q8_0 ≈ 4.3GB.

**Gemma 4 E-series** (E2B, E4B — the mobile-first variants):
- **Per-Layer Embeddings (PLE)**: E4B has ~4B "effective" parameters but the
  representational depth of a much larger model, at **~3GB in 4-bit**.
- Official **QAT (quantization-aware trained) q4_0 GGUFs** from Google
  (`google/gemma-4-E4B-it-qat-q4_0-gguf`) — quality loss from quantization is
  much lower than post-hoc Q4 of other models.
- 140+ languages, multimodal (text + image + audio on the small models).
- First-class NPU path on the Snapdragon 8 Elite via LiteRT/QNN — this is what
  makes it the S25 Ultra pick: fast tokens without heating your daily phone or
  evicting your apps.
- Larger Gemma 4 sizes (12B ≈ 7GB at Q4, 26B-A4B, 31B) don't fit either device.

**Worth knowing about, not recommended as primary:**
- **Aya Expanse 8B** (Cohere, Q4_K_S ≈ 4.5GB) — explicitly trained on Czech;
  still the best pure Czech *prose style*, but weaker reasoning and factual
  accuracy than Qwen3.5, and an older generation now.
- **EuroLLM 9B** — EU-language specialist incl. Czech; same caveat.
- **Qwen3.6** — released, but the small sizes aren't out yet (27B+ only). Watch
  for a 3.6 small series; it would slot straight into this plan.

### Quantization rules of thumb

- Use **Q4_K_M / Q4_K_S** (or Google's QAT q4_0 where offered). This is the
  sweet spot on ARM CPUs.
- **Avoid IQ2/IQ3** aggressive quants: multilingual ability and factual recall
  are the first things to degrade — exactly the two things Nedory needs.
- Quantize the **KV cache to q8_0** (`--cache-type-k q8_0 --cache-type-v q8_0`
  in llama.cpp) to fit 4–8K context cheaply. (Less critical for Qwen3.5 thanks
  to its linear attention.)

### The Latin caveat

No mainstream model is benchmarked on Latin. In practice the 4B–9B class reads
classical and ecclesiastical Latin passably (it's well represented in
pretraining corpora), but **don't trust parametric knowledge for Latin term
definitions** — the RAG design below forces the model to ground its answers in
retrieved passages from your own books, which is the reliable path.

### Embedding model (for the RAG index)

| Model | Size | Notes |
|---|---|---|
| **BGE-M3** (GGUF q8) | ~600MB | Quality pick. Strong Czech, decent Latin, and natively produces **dense + sparse (lexical) vectors** — you get hybrid retrieval from one model. Runs in llama.cpp. |
| **multilingual-e5-base** (ONNX, int8) | ~280MB | Pragmatic pick for the S25 Ultra. Solid Czech; pair with SQLite FTS5 for the lexical side. |

Prefix conventions matter: e5 needs `query:` / `passage:` prefixes; BGE-M3 does not.

---

## 2. App / framework stack

### Turnkey (start here, this week)

- **AnythingLLM Mobile** — currently the only mainstream Android app with true
  on-device RAG: local embedding model, local vector DB, citations, GGUF models
  via llama.cpp (Cactus). Feed it EPUBs/PDFs from the phone and ask questions.
  Use it to validate the whole concept before writing any code.
- **Google AI Edge Gallery** — the easiest way to run **Gemma 4 E4B** with NPU
  acceleration on the S25 Ultra (LiteRT `.task` format). No RAG, but the fastest
  chat experience on that phone.
- **MLC Chat** — fastest general-purpose runtime on Snapdragon 8 Elite (~3–4×
  CPU-only apps via the Hexagon NPU).

### Model testing / plain chat

- **PocketPal AI** and **ChatterUI** — llama.cpp-based, load any GGUF, good for
  A/B-testing the models above on both phones before committing.
- **LM Playground** — llama.cpp with ARM KleidiAI kernels; good CPU speeds on
  the S21 Ultra.

### Power-user path

- **Termux + llama.cpp** — build `llama-server` on-device, run the 9B on the
  S21 Ultra, and drive RAG with a small Python script (chromadb-lite/sqlite-vec
  + requests). Full control over sampling, KV-cache quantization, context.

### Custom Nedory app (the real project)

| Layer | Recommendation |
|---|---|
| LLM runtime | **llama.cpp via JNI bindings** (or **Cactus** if React Native); **MediaPipe LLM Inference API** as the Google-supported alternative with LiteRT/NPU support for Gemma 4 |
| Embedder runtime | **ONNX Runtime Mobile** (for e5) or the same llama.cpp instance (for BGE-M3 GGUF) |
| Vector store | **ObjectBox** (on-device DB with built-in HNSW vector search, ~3MB binary, Kotlin-native) or **sqlite-vec** (if you prefer plain SQLite + FTS5 in one file) |
| Lexical search | **SQLite FTS5** (BM25) — free if you're already on sqlite-vec |
| Document parsing | Readium/epublib for EPUB, PdfBox-Android for PDF |

> **Optional hybrid (footnote):** since this repo is a home-server project — the
> dedicated S21 Ultra can run `llama-server` in Termux 24/7 and the S25 Ultra
> can query it over Tailscale. Everything stays on your own hardware, and your
> main phone pays zero RAM/battery cost. Strictly optional; the design above is
> fully on-device per phone.

---

## 3. RAG strategy on mobile (without crashing)

### Ingestion — one-time, streaming, never whole-book-in-RAM

1. Parse EPUB/PDF **chapter by chapter**; process and discard — a book is never
   fully resident in memory.
2. Embed chunks in **batches of 16–32**, write to the index, release.
3. Best option for a large library: **build the index once on a PC** (same
   embedding model, e.g. BGE-M3 via sentence-transformers) and **sideload the
   finished SQLite/ObjectBox file** to the phone. Indexing hundreds of books
   on-device works but takes hours and battery; on a PC it's minutes.

### Chunking

- **300–500 tokens per chunk, 10–15% overlap**, split on paragraph/section
  boundaries (never mid-sentence).
- Attach metadata to every chunk: `book`, `chapter`, `page`, `language`.
  This enables filtered retrieval ("only architecture books", "only Latin
  sources") and proper citations.
- Keep chunks **language-pure** where possible — mixed-language chunks blur the
  embedding and hurt retrieval in all three languages.

### Index

- **HNSW** (ObjectBox) or sqlite-vec, with **int8-quantized vectors** — 4×
  smaller, negligible recall loss at personal-library scale.
- Scale check: a few hundred books ≈ 100–300K chunks ≈ a few hundred MB on
  disk, **memory-mapped** so it costs almost nothing in RAM.

### Retrieval

- **Hybrid search is non-negotiable for this corpus**: dense vectors + BM25
  (SQLite FTS5), fused with Reciprocal Rank Fusion (RRF). Latin terms, proper
  nouns, and architectural vocabulary (*opus reticulatum*, *sedile*, names of
  minor Bohemian nobles) are exactly what pure dense retrieval misses and exact
  lexical match catches.
- Retrieve **top-20 candidates**, keep the **top 4–6 chunks** (~1,500–2,500
  tokens of context). More context ≠ better answers on small models — it
  dilutes attention and slows prefill on CPU.
- **Skip cross-encoder reranking on-device** — too heavy for the benefit.
  Metadata filters + RRF fusion get you most of the way.

### Memory budget

| Component | S21 Ultra (Qwen3.5-9B) | S25 Ultra (Gemma 4 E4B) |
|---|---|---|
| Model weights | ~5.0GB | ~3.0GB |
| KV cache (4–8K ctx) | ~0.3GB (linear attn) | ~0.4GB |
| Embedding model | ~0.3GB | ~0.3GB |
| Vector index (mmap) | ~0.3GB | ~0.3GB |
| **Total** | **~5.9GB** (of 7GB free) | **~4.0GB** (of shared 12GB) |

### Prompting for term explanations

Ground every definition in retrieved text and answer in the question's language:

```
You are Nedory, a research assistant for a personal library of history,
classical literature, and architecture.

Rules:
- Base your answer ONLY on the excerpts below. If they don't contain the
  answer, say so — do not invent facts.
- Quote the relevant passage (with book and chapter) when defining a term.
- Answer in the language of the question. For Latin terms, give the literal
  translation first, then the contextual meaning in the source.

Excerpts:
{retrieved_chunks_with_citations}

Question: {question}
```

---

## Suggested rollout

1. **Week 1:** Install AnythingLLM Mobile on the S21 Ultra with Qwen3.5-4B
   Q6_K; ingest 5–10 representative books (one per language); evaluate answer
   quality on real questions.
2. **Week 2:** A/B against Gemma 4 E4B QAT and Qwen3.5-9B IQ4_XS in
   PocketPal/ChatterUI; pick the per-device winners.
3. **Then:** if the turnkey app's chunking/citation quality isn't enough,
   build the custom pipeline (PC-side indexing + ObjectBox/sqlite-vec +
   llama.cpp JNI) — that's the actual Nedory app.

## Sources

- [Qwen 3.5 small series announcement coverage](https://awesomeagents.ai/news/qwen-3-5-small-models-series/) · [Unsloth Qwen3.5 docs](https://unsloth.ai/docs/models/qwen3.5) · [Qwen3.5-9B requirements](https://willitrunai.com/blog/qwen-3-5-9b-vram-requirements)
- [Gemma 4 model card](https://ai.google.dev/gemma/docs/core/model_card_4) · [Gemma 4 overview](https://ai.google.dev/gemma/docs/core) · [Gemma 4 E2B vs E4B on phones](https://www.mindstudio.ai/blog/gemma-4-e2b-vs-e4b-edge-models-audio-vision-phone) · [gemma-4-E4B-it-qat-q4_0-gguf](https://huggingface.co/google/gemma-4-E4B-it-qat-q4_0-gguf)
- [Best local LLM apps for Android 2026](https://www.promptquorum.com/power-local-llm/best-local-llm-apps-android-2026) · [AnythingLLM Mobile docs](https://docs.anythingllm.com/mobile/overview) · [anythingllm-mobile on GitHub](https://github.com/Mintplex-Labs/anythingllm-mobile)
- [LiteRT on Qualcomm NPU](https://developers.googleblog.com/unlocking-peak-performance-on-qualcomm-npu-with-litert/) · [llama.cpp on Samsung S25](https://github.com/ggml-org/llama.cpp/discussions/11977)
- [On-device vector databases 2026 (ObjectBox)](https://objectbox.io/262454-2/) · [On-device RAG for app developers](https://medium.com/google-developer-experts/on-device-rag-for-app-developers-embeddings-vector-search-and-beyond-47127e954c24)
