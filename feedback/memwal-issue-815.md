# No way to read back a memory's blob id or enumerate a namespace (recall returns text+score only; no list/count)

Filed: [MystenLabs/MemWal#815](https://github.com/MystenLabs/MemWal/issues/815)

## Summary
There is no way to read back a memory's identifier or to enumerate what an account has stored:
- `memwal_recall` returns entries as ranked **text + score only** — no stable memory id and no Walrus blob id per entry.
- `memwal_remember` returns a blob id, but that is the *only* place an id is exposed — and it is lost whenever the write path times out (see related write-response issue).
- There is no **list / count** operation for a namespace.

## Impact
- Can't build a manifest of what an agent has written.
- Can't link a stored memory to its Walrus blob on an explorer.
- Can't reconcile or dedup deterministically.
- Can't answer a basic question like "how many memories/blobs does this account hold?" — semantic `recall` collapses duplicates and is capped by `limit`, so it undercounts. `recall` prints `(N duplicate copies collapsed)`, so the service *knows* there are more entries than it returns, but offers no way to enumerate them.

## Requests
- Include a **stable memory id and/or Walrus blob id** on each `memwal_recall` result.
- Add a **list/count** operation per namespace (paginated), independent of a semantic query.
