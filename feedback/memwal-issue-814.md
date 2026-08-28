# memwal_remember reports failure on relayer 503/timeout even when the blob is persisted → false-negative writes and duplicates

Filed: [MystenLabs/MemWal#814](https://github.com/MystenLabs/MemWal/issues/814)

## Summary
Using the MCP server (`@mysten-incubation/memwal-mcp`), `memwal_remember` intermittently returns a relayer error — HTTP 503 `upstream unavailable`, or an MCP request timeout — **even though the blob is actually persisted**. A subsequent `memwal_recall` reliably surfaces the entry that the client was told failed to write.

So the write succeeded server-side, but the client saw a failure.

## Impact
- Agents treat the write as failed and either surface a spurious error to the end user, or **retry** — creating **duplicate blobs for the same fact**. The store is append-only, so those duplicates are permanent (`recall` even reports `(N duplicate copies collapsed)`).
- Any client-side dedup or "increment `reuse_count`" logic can't work, because the write result can't be trusted.

## Observed / repro
1. Issue several `memwal_remember` calls during a period of relayer load.
2. Some return `503 upstream unavailable` or `MCP error -32001: Request timed out`.
3. `memwal_recall` on the same namespace afterward returns those "failed" entries.

## Expected
The write result should reflect the true persisted state — or the API should give clients a way to reconcile a slow/failed response with the actual outcome.

## Suggestions
- Support an **idempotency key** on `memwal_remember` so a retry can't create a duplicate.
- Return the **blob id as soon as the blob is committed**, even if downstream indexing lags, so a timeout on the response path doesn't lose it.
- Distinguish "not persisted" from "persisted but response delayed" in the error surface.
