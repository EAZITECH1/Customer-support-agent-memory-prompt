# Customer support agent memory prompt

A customer-support agent memory prompt whose knowledge lives on **Walrus**, not inside a support platform or a model provider. Every issue the agent resolves becomes a durable, structured memory the company owns — and it stays useful when the model, the platform, or the client changes.

The prompt is the product. [`support-agent-prompt.md`](./support-agent-prompt.md) is the whole agent; drop it into any MCP client that exposes the [MemWal](https://github.com/MystenLabs/MemWal) tools, fill in the config block, and point it at your company's Walrus Memory account.

## In this repo

- [`support-agent-prompt.md`](./support-agent-prompt.md) — the full, copy-pasteable prompt
- [`submission.md`](./submission.md) — agent ID, MemWalAccount, wallet, blob count, checklist
- [`evidence/blobs.md`](./evidence/blobs.md) — mainnet blobs the agent wrote, with walruscan links
- [`evidence/findings.md`](./evidence/findings.md) — measured relayer findings and how each shaped the prompt
- [`feedback/`](./feedback) — the three MemWal issues filed while building this, in full

## The idea

Most support bots are amnesiac. They answer one conversation and forget it; the knowledge either never gets written down or gets locked inside one vendor's tool. This prompt treats memory as a hard dependency and writes to Walrus instead:

- **Recall before answering.** When a symptom matches a past resolution, the agent leads with the verified fix rather than re-deriving it.
- **Remember after resolving.** A closed ticket becomes a structured record — symptom, what was tried, what was *ruled out*, the fix, root cause, confidence — so the next agent (on any provider) can reuse it cold.
- **Portable and owned.** The knowledge is keyed to the company's Walrus Memory account. Switch from Claude to Codex, or from one support platform to another, and the history transfers as a permission grant. Nothing important lives only in a provider's private memory.

## How it uses Walrus Memory

On every customer message the model can call the MemWal tools — `memwal_recall`, `memwal_remember`, `memwal_remember_bulk`, `memwal_analyze`, `memwal_restore` — plus a health check. The backend runs each call against the company's Walrus Memory account through the MemWal MCP server, feeds the result back to the model, and loops until it has an answer. A resolved ticket is written as an encrypted blob on Walrus (via the MemWal relayer); a later session recalls it by semantic search. Because the memory is keyed to a Sui-owned account and not the model or the chat platform, it stays with the company across providers and clients.

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

## Quick start

Run the reference harness locally (a small Node/Express app that wraps the prompt in the MemWal tool loop). Needs **Node 18+**.

**macOS / Linux**
```bash
git clone https://github.com/EAZITECH1/Customer-support-agent-memory-prompt
cd Customer-support-agent-memory-prompt
npm install
cp .env.example .env          # then set LLM_BASE_URL, LLM_API_KEY, LLM_MODEL
npm run memwal:login          # opens a browser — sign the agent's wallet in
npm start                     # → http://localhost:8787
```

**Windows (PowerShell)**
```powershell
git clone https://github.com/EAZITECH1/Customer-support-agent-memory-prompt
cd Customer-support-agent-memory-prompt
npm install
copy .env.example .env         # then edit .env: LLM_BASE_URL, LLM_API_KEY, LLM_MODEL
npm run memwal:login           # opens a browser — sign the agent's wallet in
npm start                      # → http://localhost:8787
```

Notes:
- **Model** is any OpenAI-compatible endpoint (OpenRouter, Ollama, Groq, LM Studio…) — set the three `LLM_*` vars in `.env`.
- `npm run memwal:login` gives the agent **its own Walrus wallet**, isolated from your personal `~/.memwal` login, with the secret kept only in `.env`.
- Fill the `## Company config` block in [`support-agent-prompt.md`](./support-agent-prompt.md) — the app re-reads it on every message, so edits take effect live.
- Prove memory works without the UI: `npm run memwal:smoke` writes one memory to Walrus and reads it back.

**Prompt only, no server** — to use just the agent in your own client: load `support-agent-prompt.md` as the system prompt in any MCP client that exposes the MemWal tools (Claude Code, Cursor, Codex), fill the config block, and point it at your Walrus Memory account.

## Feedback

Issues opened against MemWal while building this:

- [#814](https://github.com/MystenLabs/MemWal/issues/814) — `memwal_remember` reports failure on a relayer 503/timeout even when the blob persists, so agents retry and create duplicates
- [#815](https://github.com/MystenLabs/MemWal/issues/815) — no way to read back a memory's blob id or enumerate a namespace
- [#816](https://github.com/MystenLabs/MemWal/issues/816) — credential path hardcoded to `~/.memwal` with no env override, blocking an isolated agent wallet

Built with Claude Code.
