---
name: wicked-vault:record-evidence
description: Record a claim-backing artifact in the vault and attach a deterministic verifier. Use when capturing evidence that "tests pass", "build clean", a commit exists, or a file's contents back a claim — and when replacing stale evidence via supersede. Covers --run vs --artifact, verifier syntax, and contract pinning.
---

# wicked-vault:record-evidence

Capture an artifact, hash it tamper-evidently, and attach a verifier that can
**re-derive** its verdict later. The vault does the capture itself — it never
trusts a claimed status (G4).

## When to use

- Backing a claim with evidence: "tests pass", "build clean", "no secrets",
  "commit landed", "config has the required field".
- Replacing stale evidence with a fresh artifact (use **supersede**, below).

## Two ways to capture

### 1. Run a command and capture its result (`--run`)

The vault executes the source command and stores `{command, exit_code, stdout,
stderr, captured_at}` as the payload.

```bash
npx wicked-vault record \
  --scope checkout --phase build --claim tests-pass --kind test-run \
  --source "npm test" --criteria "all unit tests pass (exit 0)" \
  --verifier "exit_code_eq:0" --run
```

### 2. Hash an existing file (`--artifact`)

The vault reads the file and stores its bytes as the payload.

```bash
npx wicked-vault record \
  --scope checkout --phase build --claim coverage-report --kind file \
  --source "coverage/summary.json" --artifact coverage/summary.json \
  --criteria "line coverage is at least 80%" \
  --verifier "jq_pred:.total.lines.pct >= 80"
```

`record` requires **either** `--run` **or** `--artifact`, and **always**
`--criteria`.

## Required fields

| Flag | Meaning |
|---|---|
| `--scope` | the unit the claim is about (e.g. a service, module, PR) |
| `--phase` | lifecycle phase (e.g. `build`, `review`, `release`) |
| `--claim` | claim id this artifact backs (e.g. `tests-pass`) |
| `--kind` | artifact kind (e.g. `test-run`, `file`, `commit`) |
| `--source` | the command (`--run`) or path/description (`--artifact`) |
| `--criteria` | **mandatory** — the acceptance criteria this evidence claims to clear; inline text or `@file`. Hashed into the envelope and frozen to the evidence (G10) |
| `--verifier` | *optional* deterministic sub-check (see below) — a composable signal an independent evaluator can cite |

## Acceptance criteria are mandatory (G10/D1)

Every artifact must state the bar it claims to clear — `record` rejects evidence
with no `--criteria`. The criteria are hashed into the envelope, so the bar is
**frozen to the evidence**: the same evidence can never later be judged against
weaker criteria (anti-downgrade).

The **trusted path** is contract-pinned criteria: when `declare-contract` pins
`criteria` for the claim, a matching `--criteria` is stamped
`criteria_authored_by: contract`. Worker-supplied criteria are stamped
`record` (a weaker provenance class — see `wicked-vault:analyze-evidence`'s
threat model). A `--criteria` that contradicts a contract pin is a G8 downgrade
and is rejected.

The independent judgment of *whether the evidence meets these criteria* is the
job of `wicked-vault:analyze-evidence` (the judgment tier), not `record`.

## Verifier syntax

`--verifier "kind:arg"` (or a JSON object for advanced params). The v1 core
verifiers are **deterministic and pure** (G7):

| Verifier | Example | Passes when |
|---|---|---|
| `exit_code_eq` | `exit_code_eq:0` | captured exit code equals N (requires `--run`) |
| `regex_match` | `regex_match:[0-9a-f]{40}` | pattern matches stdout+stderr / file text |
| `not_contains` | `not_contains:(?i)error` | pattern is **absent** |
| `jq_pred` | `jq_pred:.ok == true` | `jq -e` on the JSON payload is truthy (needs `jq`) |
| `commit_exists` | `commit_exists:<sha>` | the git commit exists in the repo |

`llm_eval` is intentionally **not** a verifier kind — a nondeterministic judge
would falsify the purity guarantee (G7).

## Output

```json
{ "id": "...", "envelope_hash": "...", "status_at_record": "pass", "status_detail": "exit_code=0" }
```

`status_at_record` is **informational only** — `verify` and `cross-check` never
read it; they re-run the verifier (G3). The exit code is `0` on a successful
record (the recording succeeded), regardless of the verdict — to gate on the
verdict, use `verify` or `cross-check`.

## wicked-bus event

If wicked-bus is installed, `record` publishes `wicked.evidence.recorded`
(domain `wicked-vault`, subdomain `vault.record`) fire-and-forget. `supersede`
publishes `wicked.evidence.superseded`. Emission is a silent no-op when the bus
is absent or `WICKED_VAULT_NO_BUS=1` — it never affects the output or exit code.

## Replacing evidence (supersede)

Evidence is append-only (G6). To replace a stale artifact, record a replacement
and link it — the old entry is flipped to `superseded`, never deleted:

```bash
npx wicked-vault supersede <old-id> \
  --scope checkout --phase build --claim tests-pass --kind test-run \
  --source "npm test" --verifier "exit_code_eq:0" --run
```

Crash-safe ordering: the replacement is written and confirmed on disk before
the old entry is flipped, so there is always an active artifact for the claim.

## Contract pinning (G8)

If a contract pins this claim (see `wicked-vault:cross-check-evidence`), `record` rejects
a downgrade — a `kind`, `source`, or `verifier` that differs from the pin throws
a `G8 pin violation`. This stops a weaker verifier from being swapped in to make
a claim pass.
