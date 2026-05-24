# ADR-0001 — wicked-vault is a standalone product; council-driven v1 revisions

**Status:** Accepted
**Date:** 2026-05-24
**Context:** Founding contract (CONTRACTS.md v0) was reviewed by a multi-model
council (wicked-garden:jam:council) per the command_iq BLUEPRINT discipline:
council on contentious decisions, surface dissent, user adjudicates.

## Council composition

4 independent perspectives ran across 4 adversarial axes: Claude
(security/integration), Codex/gpt-5.5 (skeptic), Gemini (ops/maintainer),
Pi (pragmatist). 6 models were unavailable (no API key/config) and were
reported as such. 3 of the 4 are foreign model families — genuine
model-diversity, not an all-Claude pass.

## Findings (council verdicts on the v0 spec)

| Q | Topic | Council verdict |
|---|---|---|
| Q1 | separate product vs incubate | 4–0 NEEDS-REWORK (premature; one consumer) |
| Q2 | in-repo `manifest.jsonl` | effectively 4–0 against as-specified (concurrent-write conflicts) |
| Q3 | node/npm + CLI | 3–1 NEEDS-REWORK (stack fragmentation / scope) |
| Q4 | `cross-check` boundary | 3–1 (smuggles gate-decision logic into the primitive) |
| Q5 | deterministic core | principle APPROVED; scope rejected (cut nondeterministic tier) |
| Q6 | G3+G4 enforceability | 4–0 NEEDS-REWORK (theater without an exec-env contract) |

Two minority constraints were load-bearing and are preserved:
- **Pi (Q2 lone APPROVE)** — in-repo JSONL is fine *only* single-writer. Collapses
  to REJECT under concurrent writers. → drives the per-entry storage decision.
- **Gemini (Q4 lone APPROVE)** — removing `cross-check` fragments consumers into
  bespoke verdict aggregation. → cross-check is retained, the *boundary* is pinned.

## Decision

### Q1 — Standalone product: council OVERRIDDEN (user adjudication)

The council judged the spec in isolation. Its prematurity verdict rests on
"unproven/speculative design." That critique is materially answered by evidence
outside the spec:
1. command_iq's `the-vault.EvidencePort` is a production-proven implementation of
   these exact semantics (envelope hash, never-trust-cached re-derivation,
   template registry, fail-closed), validated across the evidence-domain epic and
   3 caught regressions.
2. The Phase-0 probe proved detect+emit generalize across 4 ecosystems.
3. Prior design sessions worked the architecture end to end.

We are extracting a known-good design, not decomposing speculatively. Codex's
own "what would change my mind — proven design" is met by the prior art the
council could not see. Consumer #1 = wicked-garden harness; declared #2 =
wicked-testing (substrate). **wicked-vault is a standalone product.**

### Q2 — Per-entry storage: ACCEPTED, and UPGRADED to mandatory

The Q1 override removes the single-writer world that made a single manifest
survivable. Source of truth becomes `entries/<ulid>.json` (one file per
artifact); concurrent writers never touch the same path. `index.sqlite` and any
rolled-up manifest are derived caches. (Supersedes v0 Decision D5.)

### Q3 — node/npm + CLI: ACCEPTED as a tradeoff

Family-consistent with bus/brain/testing (all npm). Consumers (Python
wicked-garden, shell CI) touch only the CLI; no Node library dependency is
imposed on them. Gemini's runtime-fragmentation concern is acknowledged and
accepted.

### Q4 — Boundary: ACCEPTED, pinned via new invariant G9

The consumer *authors and owns* the contract (what evidence is required, which
verifier). The vault *evaluates mechanically*: for each required claim, does an
active artifact exist whose `verify()` passes and whose `source`/`verifier`
match the pin? The vault never decides *what* is required. `cross-check` is
retained (preserving Gemini's anti-fragmentation constraint); the gate-logic
accusation is answered structurally by G9.

### Q5 — Scope: ACCEPTED

v1 core = 5 deterministic verifiers (`exit_code_eq`, `regex_match`,
`not_contains`, `jq_pred`, `commit_exists`). The nondeterministic tier
(`pr_check_status`, `http_status_eq`) is deferred to a separate
**observation-verifier extension** with explicit fresh-capture (not
re-derivation) semantics. `llm_eval` is removed entirely — it falsifies G7
(verifier purity) at the type level.

### Q6 — G3/G4: RESOLVED by command_iq's actual approach (honest scoping)

command_iq's vault did not sandbox capture; it recorded + re-derived +
hash-bound, and execution isolation was the runtime's responsibility. v1 adopts
the same: **G4 = honest recording, not sandboxed capture.** Threat model stated
plainly — the vault defends against post-hoc tampering (mutating a recorded
payload/verdict) and stale-cache trust; it does NOT defend against a poisoned
capture environment, which is the harness/CI's responsibility. Sandboxed capture
is future hardening (a later ADR).

## Consequences

- CONTRACTS.md revised to v1 (§1, §4, §5, §6, §12 changed).
- Concurrency-safe storage is non-negotiable given the standalone decision.
- `pr_check_status` capability (needed by the ci-aware-merge discipline) is
  sequenced to the observation-verifier extension, not v1 core.
- The council's dissent is preserved here; the override is traceable.
