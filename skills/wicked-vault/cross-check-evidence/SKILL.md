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
    { "claim_id": "tests-pass",  "kind": "test-run", "criteria": "all unit tests pass (exit 0)", "verifier": { "kind": "exit_code_eq" } },
    { "claim_id": "no-secrets",  "kind": "test-run", "criteria": "no secrets in the diff", "verifier": { "kind": "not_contains" } },
    { "claim_id": "design-ok",   "kind": "review-verdict", "criteria": "the change adequately addresses the documented failure modes", "require_attestation": true },
    { "claim_id": "changelog",   "kind": "file",     "required": false }
  ]
}
```

```bash
npx wicked-vault declare-contract --scope checkout --phase release --spec contract.json
# -> { "contract_version": "<16-char hash>" }
```

- `required: false` makes a claim optional — its absence is `PASS`, not `MISSING`.
- **`criteria`** pins the acceptance criteria for the claim. This is the
  **trusted path** — criteria authored in the contract (separately from the
  worker), so a recorded artifact must match it (`criteria_authored_by:
  contract`). Strongly preferred over worker-supplied criteria.
- **`require_attestation: true`** marks a claim that needs an independent
  judgment (the judgment tier) — see Step 4. Use it for free-form criteria a
  deterministic verifier can't express ("adequately addresses the failure
  modes").
- The `contract_version` is a hash of the required-evidence set (G8 pinning).

## Step 2 — Record the evidence

Record one artifact per required claim (`wicked-vault:record-evidence`). Each `claim_id`
must match the contract, and `--criteria` must match the contract's pin. The
**latest active** artifact for a claim wins.

## Step 3 — Cross-check (integrity tier — the default, CI-safe)

```bash
npx wicked-vault cross-check --scope checkout --phase release
```

This is **`--integrity-only`** by default: deterministic, offline, no model
calls — safe to put on a CI gate. It evaluates hash integrity + any
deterministic verifier per claim.

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
| `PASS` | required artifact present, hash intact, verifier passed (and — in `--with-attestations` — an independent `pass` opinion when `require_attestation`) |
| `MISSING` | a required claim has no active artifact |
| `FAIL` | artifact present but tamper or verifier failed |
| `UNATTESTED` | `require_attestation` claim has no independent opinion recorded |
| `REJECT` | `require_attestation` claim has a non-pass / stale independent opinion |
| `ERROR` | verifier-kind pin mismatch against the contract |

`overall` is `PASS` only if every claim is `PASS`; `ERROR` if any claim errored;
otherwise `REJECT`.

## Step 4 — Judgment tier (opt-in, NOT for the default CI gate)

```bash
npx wicked-vault cross-check --scope checkout --phase release --with-attestations
```

`--with-attestations` consults the latest independent opinion per claim (the
attestations recorded by `wicked-vault:analyze-evidence`). For a claim with
`require_attestation: true`, it `PASS`es only when integrity passes **and** a
non-stale, independent `pass` opinion exists; otherwise `UNATTESTED` / `REJECT`.
For other claims the opinion is advisory (surfaced, doesn't change the result).

This mode is **not deterministic and not for the default gate** — opinions come
from a model and are point-in-time. Run `wicked-vault:analyze-evidence` first to
produce the attestations, then use this mode for a release sign-off that
requires a third-party judgment. Keep `--integrity-only` on the fast CI path.

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
