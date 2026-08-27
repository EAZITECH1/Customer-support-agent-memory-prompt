# Customer support agent memory prompt

A customer-support agent memory prompt whose knowledge lives on **Walrus**, not inside a support platform or a model provider. Every issue the agent resolves becomes a durable, structured memory the company owns — and it stays useful when the model, the platform, or the client changes.

The prompt is the product. [`support-bot-prompt.md`](./support-bot-prompt.md) is the whole agent; drop it into any MCP client that exposes the [MemWal](https://github.com/MystenLabs/MemWal) tools, fill in the config block, and point it at your company's Walrus Memory account.

## The idea

Most support bots are amnesiac. They answer one conversation and forget it; the knowledge either never gets written down or gets locked inside one vendor's tool. This prompt treats memory as a hard dependency and writes to Walrus instead:

- **Recall before answering.** When a symptom matches a past resolution, the agent leads with the verified fix rather than re-deriving it.
- **Remember after resolving.** A closed ticket becomes a structured record — symptom, what was tried, what was *ruled out*, the fix, root cause, confidence — so the next agent (on any provider) can reuse it cold.
- **Portable and owned.** The knowledge is keyed to the company's Walrus Memory account. Switch from Claude to Codex, or from one support platform to another, and the history transfers as a permission grant. Nothing important lives only in a provider's private memory.

## How the memory is organized

Four namespace families, treated as security boundaries by tier:

| Namespace | Holds |
|---|---|
| `resolved-{area}` | Verified, reusable fixes — one per product area. The owned knowledge base. |
| `open-tickets` | Live investigation state for unresolved/escalated tickets. Shared across tiers so a handoff carries the work, not just the complaint. |
| `customer-{id}` | Per-customer history: setup, past issues, what they've already been told. Scoped. |
| `product-intel` | Recurring bugs, known limitations, systemic patterns worth escalating to engineering. |

Tiers (`tier_1` / `tier_2` / `engineering`) get explicit read/write scopes, so a customer-facing context never surfaces another customer's history or internal notes.

The agent uses the MemWal tools directly: `memwal_recall`, `memwal_remember`, `memwal_remember_bulk`, `memwal_analyze`, `memwal_restore`, plus a health check before it trusts memory.

## Calibration

The prompt was tuned against an 8-point behavioral test — a human plays the customer, and each test checks a specific behavior fires (or correctly doesn't):

| # | Behavior | Result |
|---|---|---|
| 1 | Recalls first; never fabricates a past fix | pass |
| 2 | Writes a structured resolution; says nothing about storage to the customer | pass |
| 3 | Recalls a stored fix across a session boundary and leads with it | pass |
| 4 | Reuses an existing resolution instead of writing a duplicate | pass |
| 5 | Escalation writes full state to `open-tickets`; the next tier inherits it | pass |
| 6 | Never stores secrets (tokens, card numbers) — summarizes around them | pass |
| 7 | If memory is unavailable, refuses to answer from general knowledge | pass |
| 8 | Respects tier scope — won't leak internal notes to a customer context | pass |

Two changes got the last behaviors to hold: an explicit **outage-vs-hiccup** rule (a single failed write is not a reason to refuse or to alarm the customer) and a **no-duplicate / no-storage-narration** rule (the customer experiences a person who remembers them, never the machinery). A capable instruction-following model matters here — smaller models pass the structural tests but leak storage narration and write duplicates.

## On-chain evidence

The reference deployment has written its memories to Walrus on Sui **mainnet**. The account object holding them:

- **MemWalAccount object:** `0xf6b75c6fd44e685829e0baa04077c42c09bed658819e921126dc11ce8c3175d4`
  - type `…::account::MemWalAccount`, shared object — [view on Suiscan](https://suiscan.xyz/mainnet/object/0xf6b75c6fd44e685829e0baa04077c42c09bed658819e921126dc11ce8c3175d4)
- **Sample blobs on Walrus** (walruscan):
  - [`vPVfOyZZ…`](https://walruscan.com/mainnet/blob/vPVfOyZZd8U7MUW1IxX6aPBSxRdcBeLCwcbbz7CjUFA) — a `product-intel` pattern
  - [`7Yxc8cjq…`](https://walruscan.com/mainnet/blob/7Yxc8cjqpxmjS-GrVsFqFfPDNXo_mkazOLz451gASPI) — an `open-tickets` escalation

## Using it

1. Give your MCP client the MemWal tools and sign the agent's wallet in (`memwal_login`).
2. Copy `support-bot-prompt.md` as the system prompt and fill in the `## Company config` block — company, tiers, product areas, and your Walrus Memory account.
3. Wire the agent into your support surface. On the first run it health-checks memory and, if you list any `knowledge_sources`, ingests them once via `memwal_analyze`.

The prompt assumes nothing about the host beyond the MemWal tools, so it runs the same in Claude Code, Cursor, or your own agent loop.

## Feedback

Issues opened against MemWal while building this:

- [#814](https://github.com/MystenLabs/MemWal/issues/814) — `memwal_remember` reports failure on a relayer 503/timeout even when the blob persists, so agents retry and create duplicates
- [#815](https://github.com/MystenLabs/MemWal/issues/815) — no way to read back a memory's blob id or enumerate a namespace
- [#816](https://github.com/MystenLabs/MemWal/issues/816) — credential path hardcoded to `~/.memwal` with no env override, blocking an isolated agent wallet

Built with Claude Code.
