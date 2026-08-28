# Measured findings

Each was observed against the live mainnet relayer while building and running the agent, not
reasoned about. Each shaped a rule in the prompt or a fix in the harness.

---

## 1. Write responses fail while the blob persists

**Claim.** `memwal_remember` returns a relayer error — HTTP 503 `upstream unavailable`, or an MCP
request timeout — even when the blob is actually written. The client is told the write failed
when it succeeded.

**Reproduce.**
```
# during relayer load
memwal_remember(text="<a resolution>", namespace="resolved-video")   → 503 / timeout
memwal_recall(query="<same symptom>", namespace="resolved-video")    → the record is there
```

**Observed.** In a two-session run, three `memwal_remember` calls returned `✗` (503/timeout).
A later `memwal_recall` on `resolved-video` returned `2 past resolutions`, then `3` — the
"failed" writes had landed.

**What it means.** An agent that trusts the result surfaces a spurious error to the customer, or
retries and writes a duplicate into an append-only store. Client-side dedup can't be trusted
because the write result can't be trusted.

**Where it shows up.** The prompt separates an outage (can't *read* memory → refuse) from a single
failed *write* (memory still readable → keep serving, never mention it to the customer, leave it
to operator signalling). Filed as [MemWal#814](https://github.com/MystenLabs/MemWal/issues/814).

---

## 2. `recall` returns no blob ID, and there is no way to enumerate a namespace

**Claim.** `memwal_recall` returns ranked text and a score, but no stable memory ID or Walrus blob
ID per entry. `memwal_remember` returns a blob ID, but that is the only place one appears — and
finding 1 means it's often lost. There is no list/count operation.

**Reproduce.**
```
memwal_recall(query="...", namespace="resolved-video", limit=100)
# → "1. [score=0.49] Symptom: … "  — text + score only, no id
```

**Observed.** Recall printed `(3 duplicate copies collapsed)` on `resolved-video` — the service
knows there are more entries than it returns, but offers no way to list them. Counting blobs for
the account meant summing collapsed recall results, which undercounts.

**What it means.** You can't build a manifest of what an agent wrote, link a memory to its blob on
walruscan, dedup deterministically, or answer "how many memories does this account hold." Filed as
[MemWal#815](https://github.com/MystenLabs/MemWal/issues/815).

---

## 3. Per-IP connection cap stalls the agent, and doesn't release on process kill

**Claim.** The relayer enforces a per-IP active-session cap. Once tripped, new connections get
`429 ip_active_cap` — and killing every local `memwal-mcp` process does not clear it; the relayer
holds the slot on an idle timer.

**Reproduce.**
```
# after several reconnects during testing
memwal-mcp → SSE handshake HTTP 429 {"message":"MCP rate limit: ip_active_cap. Close another MCP session, then retry."}
pkill -f memwal-mcp   # 0 processes left
# new connection still 429; a full ~15-minute idle wait, a same-carrier IP change,
# and a fresh delegate login all failed to clear it
```

**What it means.** A few restarts while iterating locked the agent out for an extended period and
blocked a demo recording. Because the count is per-IP and held server-side, there is no local
remedy — only a genuinely different IP or waiting on the relayer. Related to the credential-path
limitation ([MemWal#816](https://github.com/MystenLabs/MemWal/issues/816)): running an agent on its
own wallet requires a `HOME`-override hack, since the credential path is hardcoded to `~/.memwal`.

**Where it shows up.** The harness launches the MemWal MCP server from the locally-installed binary
directly (not via `npx`), which avoids orphaning a wrapper process that would hold a slot; it also
listens first and connects memory in the background, so a stuck relayer can't wedge the web app.
