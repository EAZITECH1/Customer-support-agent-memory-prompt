# Feedback filed on MystenLabs/MemWal

Bugs found while building and running this agent, turned into tickets.

| Issue | Status | What |
| --- | --- | --- |
| [**#814**](https://github.com/MystenLabs/MemWal/issues/814) | open | `memwal_remember` returns a 503/timeout error even when the blob persists, so agents surface a false failure or retry and write duplicates into an append-only store. → [full text](memwal-issue-814.md) |
| [**#815**](https://github.com/MystenLabs/MemWal/issues/815) | open | No way to read back a memory's blob ID or enumerate a namespace — `recall` returns text + score only, and there is no list/count operation. → [full text](memwal-issue-815.md) |
| [**#816**](https://github.com/MystenLabs/MemWal/issues/816) | open | Credential path is hardcoded to `~/.memwal` with no env override, so running an agent on its own wallet (separate from the developer's login) requires a `HOME`-override hack. → [full text](memwal-issue-816.md) |

Each one maps to something concrete in the prompt or the harness:

- **#814** is why the prompt separates an outage from a single failed write: memory unavailable (can't read) means refuse; a failed write while recall still works means keep serving the customer and never mention storage. It's also why the "On reuse" rule forbids a blind re-`remember`.
- **#815** is why the on-chain evidence lists only the blob IDs the write path actually returned — the rest can't be read back from `recall`.
- **#816** is why the harness runs the agent under an isolated `HOME`, materialized from a credential kept in `.env`, so the agent's wallet never touches the developer's `~/.memwal` login.
