# Mainnet blob evidence

Every record below was written by the agent during real support conversations — the model
resolving a ticket and calling `memwal_remember`, not a seeding script. Account:
[`0xf6b75c6f…3175d4`](https://suiscan.xyz/mainnet/object/0xf6b75c6fd44e685829e0baa04077c42c09bed658819e921126dc11ce8c3175d4).

**Counts, from `memwal_recall` across each namespace at submission time:**

| namespace | blobs |
|---|---|
| `resolved-video` | 5 |
| `product-intel` | 1 |
| `open-tickets` | 2 |
| **total** | **8** |

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

Eight blobs, not the ten some tracks ask for. The gap is the relayer outage at submission time
(429 `ip_active_cap` / 503) blocking further writes — not a design limit. The
`resolved-video` count of five includes a few near-duplicates written before the prompt's dedup
rule and a stronger model removed them on later runs; the cross-session reuse that matters is
proven by a fresh session recalling the stored fix and leading with it.
