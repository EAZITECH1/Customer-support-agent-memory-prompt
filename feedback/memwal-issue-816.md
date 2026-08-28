# memwal-mcp credential path hardcoded to ~/.memwal with no env override — blocks running an isolated agent wallet

Filed: [MystenLabs/MemWal#816](https://github.com/MystenLabs/MemWal/issues/816)

## Summary
In `@mysten-incubation/memwal-mcp`, credentials are loaded/saved from `os.homedir() + "/.memwal/credentials.json"` with **no way to point at a different credentials file**. To run a dedicated agent with its **own wallet** — separate from the developer's personal MemWal login — the only workaround is overriding `HOME` for the child process. That is hacky and also relocates every other `HOME`-based path the process touches.

## Related
The docs list `MEMWAL_SERVER_URL` (and `--relayer`) as a relayer override, but when a `credentials.json` is present, the credential's own `relayerUrl` appears to take precedence, so the env override is effectively ignored. Please clarify/​document the precedence.

## Requests
- Add an env var / CLI flag for the **credentials file path** (e.g. `MEMWAL_CREDENTIALS_PATH`), so an application can run an agent-owned wallet without touching `~/.memwal`.
- Document the precedence of `MEMWAL_SERVER_URL` vs. the credential's stored `relayerUrl`.

## Context
Building an autonomous customer-support agent that needed its own wallet, kept isolated from the developer's primary MemWal login on the same machine.
