# Freelance market notes — local/private AI integration (Sept 2026)

Research snapshot gathered while deciding whether "local and privacy-preserving AI
integration" is a lane worth entering. Rates are from public 2026 market reporting,
not from scraped live listings — remoteok.com and the Upwork job feed are both
blocked from the research environment, so individual postings with budgets attached
still need to be checked by hand from a browser.

## Rates

| Tier | Work | Rate |
|---|---|---|
| Junior | Platform config, no-code chatbot setup | $25–60/hr |
| **Mid** | **RAG and integration work** | **$50–90/hr** |
| Senior | LLM engineering | $90–150+/hr |
| Specialist | AI/ML broadly | $50–300+/hr |

Mid tier is the realistic entry band. Expect below it until reviews accumulate —
a new account with no history competes on price regardless of actual skill.

## Project sizes

| Shape | Budget |
|---|---|
| Small fixed-price RAG chatbot, ~14 days | $500–800 |
| Mid-complexity custom LLM + RAG, 8–14 weeks | $75k–120k |
| Production RAG build | $30k–100k |
| Ongoing operating cost, client-side | $1k–15k/month |

The gap between the $500 fixed-price gigs and the $30k+ builds is enormous, and it is
mostly a credibility gap rather than a technical one. The bottom of the market is a
race to zero; the middle needs proof you have shipped something real.

## Demand signal

- AI-related freelance demand grew **109% year over year** on Upwork
- Full-stack development held the **#1 spot** in Upwork's coding category, 2025 and 2026
- Self-hosting overall is up ~40% since 2023, with local AI as the defining 2026 homelab trend

## The skills that get named on high-value RAG work

Production RAG postings ask for: **hybrid retrieval, reranking, eval harnesses,
observability.**

Worth noting against our own codebase:

- Hybrid retrieval — **already built** (`src/server/brain`)
- Reranking — **on the TODO** (bge-reranker-v2-m3 over fused top-20, CODEX §6.1)
- Eval harness — not built
- Observability — partial (task run history, node status, service health)

Closing the reranker and eval-harness gaps would put the project's feature list
against the exact vocabulary these postings use. That is a cheap way to make a
portfolio piece legible to buyers.

## Platform AI disclosure rules

- **Upwork** — disclose AI use to clients on every project. AI-assisted proposals are
  allowed; fully automated submission without human review is not.
- **Fiverr** — conditional. Disclose if the client asks, or honor a no-AI request made
  before or at the start of an order.

Not a moral question, an admin one. Pick the platform, follow its rule.

## Positioning

The differentiator is not "I can build a RAG chatbot" — thousands of people bid that.
It is "it never leaves your server," backed by a running multi-node local system as
proof. That pitch only works for buyers who have a reason to care: regulated data,
GDPR exposure, client confidentiality, or an offline requirement.

## Still to verify by hand

- [ ] Actual live listing budgets in this lane (browser, not scriptable from here)
- [ ] Whether Slovak/Czech-language requirements appear as a premium or a discount
- [ ] Whether "self-hosted" / "on-premise" appears often enough to be a searchable filter
