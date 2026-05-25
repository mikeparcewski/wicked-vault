---
name: wicked-vault:verify-evidence
description: Re-derive a single recorded artifact's verdict and check tamper-evidence. Use when confirming a specific piece of evidence still holds, detecting that a payload or envelope was modified, or checking a claim before trusting it. Never trusts the cached status.
---

# wicked-vault:verify-evidence

Re-derive the verdict for **one** recorded artifact by id. The vault recomputes
the payload and envelope hashes from the stored bytes and **re-runs the
verifier** — it never reads the status that was stored at record time (G3).

## When to use

- Confirming a specific artifact still backs its claim *right now*.
- Detecting tamper: a payload blob or envelope field that was modified after
  recording.
- Before trusting any single piece of evidence in a decision.

To check a whole contract at once instead of one artifact, use
`wicked-vault:cross-check-evidence`.

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
  "envelope_ok": true,
  "status": "pass",
  "rederived": true,
  "detail": "exit_code=0",
  "ignored_cached_status": "pass"
}
```

| Field | Meaning |
|---|---|
| `hash_ok` | both payload and envelope hashes match what was stored |
| `payload_ok` / `envelope_ok` | which half of the tamper check passed |
| `status` | re-derived verdict: `pass` / `fail` / `error` |
| `rederived` | always `true` — proves the verifier was actually re-run |
| `ignored_cached_status` | the stored status the vault refused to trust |

## Exit code is the gate

Exit `0` **iff** `hash_ok && status === "pass"`. Any tamper or a failing
verifier exits non-zero — script against the exit code:

```bash
if npx wicked-vault verify "$id" >/dev/null; then echo "still holds"; fi
```

## Fail-closed (G5)

A pass requires **both** an intact hash **and** a passing verifier. If the hash
diverges, `status` is forced to `fail` with a `TAMPER:` detail regardless of
what the verifier would have said. A missing entry or missing payload blob
returns `status: "error"` — never a silent pass.
