# Submission

| | |
|---|---|
| Project | Customer Support Agent — memory-first, on Walrus |
| Prompt | Original design — [support-agent-prompt.md](support-agent-prompt.md) |
| Agent ID (delegate public key) | `21a5566e62214e85fdd9010d19b571bf8b6c897bd84472fe8b948766675a4c2a4` |
| MemWalAccount | [`0xf6b75c6fd44e685829e0baa04077c42c09bed658819e921126dc11ce8c3175d4`](https://suiscan.xyz/mainnet/object/0xf6b75c6fd44e685829e0baa04077c42c09bed658819e921126dc11ce8c3175d4) |
| Agent wallet | `0x679d547b18cf9f2e77f1d33f932cbf4de5c63dda6a5c5d0e44caf7ae4334cd1b` |
| Blobs on Mainnet | 8 (resolved-video 5 · product-intel 1 · open-tickets 2) |
| Network | Mainnet |
| MemWal package | `0xe7c16fbea0560e7057e2bf7422feaa4fb313749fc69c9e9092fac7a33b81d7f5` |
| Overview page | one-page visual overview (Claude Artifact — share link on request) |
| Demo video | _to add_ |
| Issues filed | [MemWal#814](https://github.com/MystenLabs/MemWal/issues/814) · [#815](https://github.com/MystenLabs/MemWal/issues/815) · [#816](https://github.com/MystenLabs/MemWal/issues/816) |

## What it is

A customer-support agent for a Web3 creator studio that turns every resolved ticket into
durable, structured knowledge on Walrus. A fix reached in one conversation is recalled in a
separate session, because the memory lives on the company's Walrus account rather than in a chat
log or a vendor's database. The prompt is the product; the app around it is a thin harness that
runs the model through the MemWal tool loop and streams the memory activity to the UI.

## Checklist

- [x] Full copy-pasteable prompt — [support-agent-prompt.md](support-agent-prompt.md)
- [x] Multi-namespace memory design (`resolved-{area}`, `open-tickets`, `customer-{id}`, `product-intel`) with tier scoping
- [x] Blobs written on Mainnet — 8 ([evidence/blobs.md](evidence/blobs.md))
- [x] Agent ID + MemWalAccount + agent wallet recorded (table above)
- [x] Behavior calibration — 8-point suite, all passing ([evidence/findings.md](evidence/findings.md))
- [x] Feedback / GitHub issues on MystenLabs/MemWal — [#814](https://github.com/MystenLabs/MemWal/issues/814), [#815](https://github.com/MystenLabs/MemWal/issues/815), [#816](https://github.com/MystenLabs/MemWal/issues/816)
- [ ] Demo video recorded — script ready; recording once the relayer outage clears (or the fallback cut, which needs no live recall)
- [ ] ≥10 blobs on Mainnet — currently **8**; short of ten because a Walrus relayer outage (429 `ip_active_cap` / 503) has blocked further writes. A handful more resolved tickets clears it once the relayer is back.

## Honest note on the relayer

During and after this build the managed relayer was intermittently unavailable (429 rate-limit
and 503 upstream errors). It blocked live recall and further writes at submission time. The
memories already on Walrus are unaffected and verifiable at the links in
[evidence/blobs.md](evidence/blobs.md) — which is the argument for storing them there: the data
outlives the service.
