---
name: wicked-vault:cross-check-evidence
description: Declare a consumer-authored contract and get a mechanical PASS/REJECT verdict for a scope+phase by re-deriving every required artifact. Use when answering "is this claim actually backed by evidence that still holds?" — gate logic, release readiness, or merge checks. Fail-closed when no contract is declared.
---

# wicked-vault:cross-check-evidence

Evaluate a whole **contract** — the set of evidence a scope+phase requires — and
return a single mechanical verdict. Cross-check re-derives every required
artifact (it does not trust cached statuses) and reports `PASS` only when all of
them hold.

This is the "is the work *backed*?" question. The contract is **consumer-
authored**; the vault only decides *whether* it's satisfied, never *what* it
should require (G9). The vault has no gate logic of its own to leak.

## When to use

- A gate / release-readiness / merge check that aggregates several claims.
- Answering: "is this claim actually backed by evidence that still holds?"
- Any time a stored "ready to merge" / "tests pass" must be re-proven, not
  asserted.

For a single artifact, use `wicked-vault:verify-evidence` instead.

## Step 1 — Declare the contract

Write a JSON spec listing the required evidence, then declare it for a
scope+phase. A claim with a `verifier` pin also constrains how its evidence may
be recorded (G8 — see `wicked-vault:record-evidence`).

```jsonc
// contract.json
{
  "required_evidence": [
    { "claim_id": "tests-pass",  "kind": "test-run", "verifier": { "kind": "exit_code_eq" } },
    { "claim_id": "no-secrets",  "kind": "test-run", "verifier": { "kind": "not_contains" } },
    { "claim_id": "changelog",   "kind": "file",     "required": false }
  ]
}
```

```bash
npx wicked-vault declare-contract --scope checkout --phase release --spec contract.json
# -> { "contract_version": "<16-char hash>" }
```

`required: false` makes a claim optional — its absence is `PASS`, not `MISSING`.
The `contract_version` is a hash of the required-evidence set, so any change to
the contract produces a new version (G8 pinning).

## Step 2 — Record the evidence

Record one artifact per required claim (`wicked-vault:record-evidence`). Each `claim_id`
must match the contract. The **latest active** artifact for a claim wins.

## Step 3 — Cross-check

```bash
npx wicked-vault cross-check --scope checkout --phase release
```

```json
{
  "scope": "checkout", "phase": "release",
  "contract_version": "...",
  "overall": "PASS",
  "claims": [
    { "claim_id": "tests-pass", "artifact_id": "...", "hash_ok": true, "verifier_status": "pass", "result": "PASS", "detail": "exit_code=0" },
    { "claim_id": "no-secrets", "artifact_id": "...", "hash_ok": true, "verifier_status": "pass", "result": "PASS", "detail": "/(?i)secret/ absent" }
  ],
  "evaluated_at": "..."
}
```

## Verdicts and exit code

Exit `0` **iff** `overall === "PASS"`. Per-claim `result` is one of:

| result | meaning |
|---|---|
| `PASS` | required artifact present, hash intact, verifier passed |
| `MISSING` | a required claim has no active artifact |
| `FAIL` | artifact present but tamper or verifier failed |
| `ERROR` | verifier-kind pin mismatch against the contract |

`overall` is `PASS` only if every claim is `PASS`; `ERROR` if any claim errored;
otherwise `REJECT`.

## Fail-closed (G5)

If **no contract is declared** for the scope+phase, cross-check returns
`overall: "ERROR"` and a non-zero exit — it never reports PASS by default. An
undeclared expectation can't be silently satisfied.

## wicked-bus event

If wicked-bus is installed, `cross-check` publishes `wicked.contract.checked`
(domain `wicked-vault`, subdomain `vault.cross_check`) carrying the `overall`
verdict — this is the signal a gate consumer subscribes to. A detected tamper
also publishes `wicked.evidence.tampered`. `declare-contract` publishes
`wicked.contract.declared`. Emission is fire-and-forget and a no-op when the bus
is absent or `WICKED_VAULT_NO_BUS=1`.

## Inspecting what's recorded

```bash
npx wicked-vault list --scope checkout --phase release   # all entries (active + superseded)
```
