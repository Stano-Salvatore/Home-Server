# Session handoff — can this hardware make money? (September 2026)

Record of a long session that started as "should I mine Bitcoin on my PC or my
S21?" and ended as a monetization strategy plus a shipped PR. Written as a handoff
for a fresh conversation — **read this instead of re-deriving any of it.** Every
"no" below is backed by numbers that were checked, not guessed.

Companion to `docs/CODEX.md` (architecture) and `docs/TODO.md` (build queue).

---

## 1. The fleet, corrected

The July docs (`docs/2026-07-vulkan-gpu-session.md`) predate the Ryzen box. Current
hardware:

| Device | Role | Notes |
|---|---|---|
| **Ryzen home server** | Heavy compute | R5 3600, **RX 6900 XT 16 GB**, 32 GB DDR4-3200, Ubuntu 24.04, **44 W idle**. Runs Qwen3.6-35B and Immich ML. ~€600 total. |
| Galaxy S25 Ultra | Dashboard + litert-lm | Snapdragon 8 Elite / Adreno 830 |
| Galaxy S21 Ultra | Compute node: Ollama + Kiwix | Exynos 2100 / Mali-G78 — GPU is a dead end |
| Doogee U10 tablet | Second compute node | Over Tailscale |
| Lenovo mini-PC | Services box | Qdrant |

Disk on the Ryzen box: 512 GB NVMe (276 GB free), 1 TB Samsung 870 QVO (375 GB
free, **QLC**), 500 GB Toshiba HDD for Immich backup.

Assume **€0.25/kWh** unless told otherwise. This single number kills most options.

---

## 2. Every passive-income option, and why each failed

Checked against live 2026 data. Do not re-research these.

| Option | Net €/month | Why it fails |
|---|---|---|
| Bitcoin mining, PC | ~ -€81 | Hashprice $0.081/TH/day vs ~940 EH/s network. A GPU earns ~€0.05/**year**. |
| Bitcoin mining, phone | ~0 | ~10 MH/s. Also cooks the battery, and the S21 is a working node. |
| GPU mining, 6900 XT | **-€15** | $0.44/day gross vs €0.90/day power. Also blocks Immich + Qwen. |
| GPU rental, Vast.ai | **not eligible** | Vast takes AMD, but the list starts at **RX 7900**. Navi 21 / gfx1030 is not on it. |
| Monero, RandomX | negative | R5 3600 has 6 cores. Best CPUs do 28-30 kH/s and are *barely* profitable at $0.10/kWh. |
| Storj | ~$1 | Only ~700 GB free, and the 870 QVO is **QLC** — constant small writes burn endurance for pocket change. |
| Theta Edge Node | €0.30-3 | Rounding error. |
| Bandwidth selling | €5-12 | **The only one that hits the target, and it should not be done.** See below. |
| Nielsen panel | ~€4 | Zero risk, gift cards. The one safe passive option. |

### Why bandwidth selling was rejected

Honeygain / EarnApp / Grass / Peer2Profit do reach €10/month. Rejected because:

- Pays **per residential IP, not per device** — the 5-device fleet earns once, not 5x.
  EarnApp caps at $5/month per IP outside the US.
- Major EU ISPs (Deutsche Telekom, Orange, BT) explicitly ban commercial bandwidth
  resale. Enforcement is line suspension, and Honeygain's liability cap is $100.
- That one connection carries Immich, Obsidian sync, and the whole Tailscale mesh.
  Risking the server to earn €8 is a terrible asymmetry.

**The economic wall, stated once:** passive hardware income is arbitraging retail
electricity against wholesale compute. You lose by construction unless you own
something scarce. Four ARM devices and a mini-PC are not scarce. This same wall
kills mining, GPU rental, and "sell tokens from the 35B" alike.

### What the hardware *does* earn

At 44 W idle the box costs ~385 kWh/year, about **€96**. It displaces Immich vs
Google One (~€120/yr) and local inference vs an AI subscription (~€240/yr). **It is
already net positive.** It pays in bills not received.

---

## 3. The Tasks page — what it actually is

Read `src/server/tasks/runner.ts` before assuming anything. `runTask` does exactly
one thing:

```js
const output = await backend.chatComplete(task.modelId, [{ role: "user", content: prompt }]);
```

**One stateless LLM call.** No tools, no retrieval, no iteration, no retry. It can
append ≤4000 chars of a changed file (file_watch) and optionally write a vault note.
That is the whole ceiling.

- The 7 built-in tools and the whole MCP path are wired into **chat and voice, not tasks**.
- `src/server/tools/planner.ts` does one planning call + ≤3 tool executions, and
  degrades past ~12 tools. That comment was written for 2-8B phone models and is
  probably **out of date now that the 6900 XT runs a 35B**.
- **Biggest gap:** Deep Research (`src/server/research/service.ts`) is by far the most
  capable module — multi-round gather/read/synthesize over web + Wikipedia + Brain —
  and **cannot be scheduled**, because `TaskInput` only carries a backend and model id.
  Adding a research task type is the highest-leverage small change in the repo.
- Second gap: tasks have no delivery. Output lands in a vault note and stops.

---

## 4. The strategy that was agreed

**Do not sell Nedory.** It is bespoke to this fleet, and every dependency (Ollama,
Kiwix, Tailscale, litert-lm, Termux) is a future support ticket. Selling a
self-hosted app means inheriting other people's machines.

Instead, three assets that compound:

| Asset | Upfront | First € | Year-one €/mo | Passive? |
|---|---|---|---|---|
| Writeups from existing docs | 30-40 h | 3-6 mo | 25-100 | Yes |
| Paid starter kit | 60-80 h | 3-8 wk | 50-300 | Yes |
| Nedory open source | 20 h + ongoing | 6-12 mo | 0-50 | **No — least passive** |

**Give Nedory away as proof, sell the foundation underneath it.** The rare thing is
not the AI, it is a full Next.js + SQLite + RAG stack with **zero native modules**
that installs on Termux. That is a template — a download, not a deployment, so no
support surface.

Market context: tech blog RPM is $25-50 vs $2-5 general. Digital products median
**$72/month** (most earn ~0; tail-heavy bet). Gumroad sellers with 3+ products earn
5.7x single-product sellers. Self-hosting is up ~40% since 2023 and local AI is the
defining 2026 homelab trend, so the timing is genuinely good.

### Freelance, as the funding mechanism

Rates: junior platform config $25-60/hr, **mid RAG + integration $50-90/hr**, senior
LLM $90-150+/hr. AI freelance demand grew **109% YoY**.

The filter for what work is safe to take is **not Claude's capability, it is whether
the user can verify the output before their name goes on it.** Safe: bug fixes,
scrapers, migrations, refactors, API glue, Next.js builds, technical docs. Never:
security audits, legal, financial, medical — anything sold as *assurance*, where
being confidently wrong is expensive and unverifiable.

Disclosure is admin, not ethics: Upwork requires disclosing AI use per project;
Fiverr is conditional (disclose if asked, honor a no-AI request).

**Plan: freelance to fund it → repeat the same job type to find the pattern →
productize the pattern.** Not freelance forever.

Full detail in `docs/freelance-market-2026.md`.

---

## 5. What shipped — PR #24

Branch `claude/bitcoin-miner-options-jixbnt` → base
`claude/odysseus-level-page-server-e5w814`. **Note: this repo has no `main`/`master`;
that branch is the trunk.**

- **Fixed a build-breaking bug.** `settings/page.tsx` imported `PowerCard` from
  `@/components/settings/power-card`, which does not exist. It lives at
  `@/components/nodes/power-card` (where `power/page.tsx` imports it correctly).
  Typecheck failed and `next build` would have too.
- **Fixed a lint error** in `compare/page.tsx` from the newer
  `react-hooks/set-state-in-effect` rule. **False positive** — `loadBoard` is async so
  its setState is in a promise continuation, not the effect body. Scoped disable.
  (Gotcha: `eslint-disable-next-line` must sit *directly* above the code line, not
  above your explanation comments.)
- **Privacy scrub.** Real Tailscale IPs + an Android username were in
  `.nedory.env.example` and a `nodes/page.tsx` placeholder. Now placeholders.
- MIT `LICENSE`; README gains features / positioning / status / contributing.
- `content/posts/zero-native-modules-nextjs-termux.md` — first post draft, ~1050 words.
- `docs/freelance-market-2026.md` — the rate research.

Verified: `npm install` clean in **20 s with no native build** (which validates the
post's whole claim), eslint clean, tsc clean apart from Next's build-generated
`RouteContext` globals.

---

## 6. Open items

- [ ] **The repo has no CI at all** — no `.github/workflows`. The build-breaking import
      above sat on the trunk because nothing checks commits. Before going public,
      add a workflow running install + lint + typecheck. ~30 lines, free on public repos.
- [ ] Research task type — let cron fire a Deep Research run, not just `chatComplete`
- [ ] Reranker (already in TODO §6.1) — high-value RAG postings name exactly
      "hybrid retrieval, reranking, eval harnesses, observability". Hybrid retrieval
      is **already built**; closing the reranker makes the feature list match the
      vocabulary buyers search for.
- [ ] Verify live freelance listing budgets in a browser (remoteok.com and the Upwork
      feed are both egress-blocked from the Claude Code environment)
- [ ] Check Nielsen panel availability in Slovakia
- [ ] Post #2 candidate: the Vulkan/Turnip/Mali dead end from the July session doc

---

## 7. Rejected — don't re-litigate without new facts

- ~~Mining anything, on any device in this fleet~~ — negative at €0.25/kWh, every algorithm
- ~~Renting the 6900 XT~~ — Vast.ai's AMD support starts at RX 7900; RDNA2 is not listed,
  and renter demand is CUDA-first anyway
- ~~Bandwidth/proxy apps~~ — see §2; risks the server to earn €8
- ~~Storj on the QVO~~ — QLC endurance vs ~$1/month
- ~~Selling Nedory as a product~~ — bespoke, support-heavy, the opposite of passive
- ~~Extracting `src/server/db/client.ts` as an npm package~~ — **superseded upstream.**
  Drizzle now ships official `drizzle-orm/node-sqlite`; the 123-line hand-rolled adapter
  can be deleted. The *migration* gap is still real though (drizzle-kit doesn't support
  node:sqlite, drizzle-orm issue #5471) — that's a blog post, not a package.
- ~~On-prem doc processing for local firms as the main plan~~ — pays best (€50-200/mo per
  client) but is client work, so it never becomes passive. Rejected on that constraint only.
