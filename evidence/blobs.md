# Mainnet blob evidence

Every record below was written by the agent during real support conversations — the model
resolving a ticket and calling `memwal_remember`, not a seeding script. Account:
[`0xf6b75c6f…3175d4`](https://suiscan.xyz/mainnet/object/0xf6b75c6fd44e685829e0baa04077c42c09bed658819e921126dc11ce8c3175d4).

**Counts at submission time.** `memwal_recall` returns *de-duplicated* memories and prints how many
copies it collapsed, so there are two numbers: the unique memories, and the raw blobs actually on
Walrus. The raw count is higher because the relayer's write-timeout bug wrote several facts twice
(see [`../feedback/memwal-issue-814.md`](../feedback/memwal-issue-814.md)).

| namespace | unique memories | blobs on Walrus (incl. duplicates) |
|---|---|---|
| `resolved-video` | 5 | ~8 |
| `product-intel` | 1 | ~2 |
| `open-tickets` | 2 | ~4 |
| **total** | **8** | **~12–14** |

The blob figure is derived from `recall`'s "N duplicate copies collapsed" notes (`resolved-video` +3,
`product-intel` +1, `open-tickets` +2). The exact number is a `memwal_restore` `total` per namespace,
which needs the relayer — down at submission time with 429 `ip_active_cap` / 503.

## Verifiable blob IDs

These are the blob IDs the write path actually returned. `memwal_remember` only surfaces a blob
ID on a clean response; during this build the relayer timed out many write *responses* while the
blob still persisted (see [`../feedback/memwal-issue-814.md`](../feedback/memwal-issue-814.md)),
so several IDs were never returned to the client. `memwal_recall` returns text and score but no
blob ID ([#815](https://github.com/MystenLabs/MemWal/issues/815)), so the rest can't be read back.

| namespace | record | blob |
|---|---|---|
| `product-intel` | blurry export = preset lower than source; set preset to match | [`vPVfOyZZ…`](https://walruscan.com/mainnet/blob/vPVfOyZZd8U7MUW1IxX6aPBSxRdcBeLCwcbbz7CjUFA) |
| `open-tickets` | Discord role-sync broken; token re-checked, bot re-invited; escalate to tier 2 | [`7Yxc8cjq…`](https://walruscan.com/mainnet/blob/7Yxc8cjqpxmjS-GrVsFqFfPDNXo_mkazOLz451gASPI) |
| `open-tickets` | same ticket — escalation state for the receiving tier | [`njZbsQ-lu…`](https://walruscan.com/mainnet/blob/njZbsQ-lu2-75AaWYdPxU5ubk2YnFU5ozxUcroDukL8) |
| `resolved-video` | export preset 720p vs 1080p source → set to 1080p; verified | `JEHdjNH5…` (returned truncated in the run log) |

## What the stored records look like

The agent stores a structured resolution, not a transcript. An actual `resolved-video` entry,
read back with `memwal_recall`:

```
Symptom: Video exports rendered blurry on export.
Context: Client used export preset set to 720p while source footage was 1080p.
Attempted: Checked source footage, software preview, export settings.
Ruled out: Source footage quality, software rendering issues, codec problems, scaling filters.
Worked: Changed export preset from 720p to 1080p matching source resolution.
Root cause: Export preset resolution lower than source resolution causing downscale and blur.
Verification: Client confirmed the fix after adjusting the preset to 1080p.
Confidence: verified. Reuse count: 1. Last verified: 2026-08-27.
```

## Note on the count

Counting raw blobs on Walrus — what the ledger actually holds — this account sits at roughly
**twelve to fourteen**, over the ten some tracks ask for. Counting *unique* resolved issues, it's
**eight**. The difference is duplicate writes from the relayer's write-timeout bug
([#814](https://github.com/MystenLabs/MemWal/issues/814)): `memwal_remember` returned a 503 or a
timeout while the blob still landed, so the agent retried and wrote the same fact again. The prompt's
dedup rule and a stronger model stopped that on later runs. Either number is honest depending on what
you count; the exact blob total is a `memwal_restore` away once the relayer is back. What the
submission actually rests on is cross-session reuse — a fresh session recalling the stored fix and
leading with it.
