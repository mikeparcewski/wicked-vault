---
name: wicked-vault:verify-evidence
description: Deterministically re-derive a single recorded artifact's integrity — recompute the payload/criteria/envelope hashes and re-run its pure verifier. Model-free, reproducible, CI-gate-safe. Use to confirm a piece of evidence is still intact and its deterministic check passes, or to detect tamper. Never trusts the cached status. For an INDEPENDENT judgment of whether the evidence MEETS its criteria, use wicked-vault:analyze-evidence.
---

# wicked-vault:verify-evidence

The **integrity tier** (G1–G9). Re-derive the verdict for **one** recorded
artifact by id: recompute the payload, criteria, and envelope hashes from the
stored bytes and **re-run the pure verifier** — never reading the status stored
at record time (G3). Deterministic, offline, no model — safe on a CI gate.

**This is not the judgment tier.** It answers *"is this artifact intact and does
its deterministic check still pass?"* — not *"does this evidence actually meet
its acceptance criteria?"* For the latter (an independent model analysis of
evidence-vs-criteria), use **`wicked-vault:analyze-evidence`**.

## When to use

- Confirming a specific artifact still holds *right now* (cheap, reproducible).
- Detecting tamper: a payload, criteria, or envelope field modified after
  recording.
- The integrity precheck before an independent analysis or a gate.

To check a whole contract at once, use `wicked-vault:cross-check-evidence`.

## Verify

```bash
npx wicked-vault verify <artifact-id>
```

Get artifact ids from `record` output or `npx wicked-vault list --scope <S>`.

## Output

```json
{
  "id": "...",
  "hash_ok": true,
  "payload_ok": true,
  "criteria_ok": true,
  "envelope_ok": true,
  "status": "pass",
  "rederived": true,
  "detail": "exit_code=0",
  "ignored_cached_status": "pass",
  "latest_attestation": { "opinion": "pass", "evaluator": "gemini-reviewer", "stale": false }
}
```

| Field | Meaning |
|---|---|
| `hash_ok` | payload, criteria, and envelope hashes all match what was stored |
| `payload_ok` / `criteria_ok` / `envelope_ok` | which part of the tamper check passed |
| `status` | re-derived integrity verdict: `pass` / `fail` / `error` |
| `rederived` | always `true` — proves the check was actually re-run |
| `ignored_cached_status` | the stored status the vault refused to trust |
| `latest_attestation` | the most recent **independent opinion** (from `analyze-evidence`), shown **for reference only** — not re-derived, not trusted as reproducible; `stale: true` if it judged different bytes |

## Exit code is the gate

Exit `0` **iff** `hash_ok && status === "pass"`. Any tamper or a failing
verifier exits non-zero — script against the exit code:

```bash
if npx wicked-vault verify "$id" >/dev/null; then echo "still intact"; fi
```

## Fail-closed (G5)

A pass requires an intact hash **and** (if the artifact carries a verifier) a
passing verifier. If any hash diverges, `status` is forced to `fail` with a
`TAMPER:` detail. A missing entry or payload blob returns `status: "error"` —
never a silent pass. The `latest_attestation` is informational and never affects
this exit code (an independent opinion is a separate, non-reproducible tier).
