# ADR-0002 — independent evidence evaluation; acceptance criteria bound to evidence

**Status:** Accepted (user-adjudicated) — revised per council 5–0 (Accept with Revisions)
**Date:** 2026-05-25
**Supersedes:** ADR-0001 Q5 scope (partial — see D2), and the v1 `verify`/`record`
semantics in CONTRACTS.md §4/§5.

## Context

The v1 vault (ADR-0001) is a deterministic evidence calculator: `verify`
recomputes hashes and re-runs pure verifiers, and a stored verdict is never
trusted because it is *re-derived identically*. Council Q5 cut the
nondeterministic tier and removed `llm_eval` because a probabilistic judge "is
neither pure, deterministic, nor re-derivable" — it falsifies G7 at the type
level.

A design conversation sharpened the product's purpose: the value is not only
*"is the recorded payload untampered and does a pure check still pass"* but
**"is this claim of completion actually backed — as judged independently of the
agent that produced it."** Self-graded "done" is the failure mode; an
independent third-party evaluation of *evidence against acceptance criteria* is
the thing that defeats it. The user adjudicated this directly (as with the Q1
override in ADR-0001).

## Council (2026-05-25)

A 5-model council (Claude, Codex/gpt-5.5, Gemini, Copilot, Pi — 4 families)
evaluated the v1 draft of this ADR. **Verdict: 5–0 Accept with Revisions.**
Option 1 (accept as-drafted) was disqualified by 4/5; Option 3 (keep
deterministic-only) recommended by none. The five convergent revisions and two
minority escalations below are folded into the decisions. Council dissent is
preserved in the consequences.

## Decisions

### D1 — Acceptance criteria are mandatory, bound to the evidence, and their authorship is attributed

`record` requires `acceptance_criteria` (free-form text or `@file`). The criteria
are hashed (`criteria_sha256`) into the envelope alongside the payload and
identifying fields (G2). Editing or swapping criteria after recording breaks the
envelope, exactly like tampering with the payload. **The bar is frozen to the
evidence** — the same evidence can never later be re-judged against weaker
criteria (anti-downgrade). Recording evidence without stating the bar is
rejected.

**Council escalation (Gemini):** "intrinsic-to-artifact" criteria can *enable*
self-grading if the worker authors its own bar at record time. Mitigation:
- The **trusted path** is contract-authored criteria — `declare-contract` pins
  the criteria for a `claim_id`; `record` must match the pin (extends G8). The
  contract is authored separately from the worker.
- When criteria are supplied at `record` time, the entry records
  `criteria_authored_by` so worker-authored bars are auditable and
  distinguishable from contract-pinned ones. Cross-check treats worker-authored
  criteria as a weaker provenance class.

### D2 — Two-tier evaluation; G7 is preserved at the CLI, and the system guarantee is renamed (G10)

- **Integrity tier — CLI, deterministic (G2 + G7 hold).** Re-derive the payload,
  criteria, and envelope hashes over the frozen `{criteria, evidence}`; re-run any
  optional deterministic sub-verifier (the v1 five remain, as composable
  sub-checks an evaluator may cite). The Node CLI **never invokes a model.**
- **Judgment tier — skill-orchestrated.** An independent model evaluates the
  frozen criteria against the evidence; the result is recorded as an
  **`opinion_attestation`** via a pure CLI append API.

**Council revision (terminology, all 5):** an LLM judgment is an
`opinion_attestation`, **not** a `verdict`. It lives in a distinct schema and is
**never commingled** with deterministic verifier results or their status fields.
`llm_eval` remains **not** a verifier kind — G7 (CLI verifier purity) is intact.

**Council revision (G10, all 5):** the *system-level* guarantee has changed and
is named explicitly rather than buried in D6. New invariant:

> **G10 — attestation-chain trust.** A judgment's trust is the trust of its
> attestation chain (frozen inputs + evaluator identity + model/prompt
> provenance + tamper-evident binding), **not** re-derivation. The integrity
> tier (G1–G9) and the judgment tier (G10) are distinct guarantee types and
> are never represented as the same kind of result.

This resolves the D2/D6 contradiction the council flagged (Copilot): the CLI
stays G7-pure; the system gains a *different* guarantee for judgments, declared
as such.

### D3 — Evaluation runs once / on demand; `verify` is integrity-only by default

**Council revision (all 5 — live-eval-every-verify was a disqualifier):**
- The independent evaluation runs **explicitly** (at record time or via an
  `evaluate` action), **not** on every `verify`.
- `verify <id>` re-derives the **integrity tier only** — deterministic,
  offline-capable, CI-gate-safe — and returns the latest `opinion_attestation`
  *for reference*, flagged `stale` if rendered against a different `evidence_sha`
  / `criteria_sha`.
- `cross-check` has two modes: **`--integrity-only` (default, deterministic,
  CI-safe)** and **`--with-attestations` (opt-in; consults the judgment tier).**
- Each evaluation appends an `opinion_attestation` to an append-only log (G6).
  The cached opinion is **never trusted as reproducible**; it is retained for
  audit and to surface evaluator disagreement over identical frozen inputs.

### D4 — Independence is mechanically checked, not honor-system

**Council revision (all 5 — D4 as drafted was theater):**
- `attest` **rejects** when the recorded `evaluator` equals the artifact's
  `created_by` (catches the lazy/default self-grade). Spoofable, but a mechanical
  baseline + audit trail, not pure honor-system.
- The `analyze-evidence` skill invokes an evaluator **distinct from the worker** —
  an external model CLI or isolated subagent (lineage: wicked-testing reviewer
  isolation; `wicked-garden:jam:council` external CLIs).
- Stronger enforcement (signed evaluator identity, separate credential boundary)
  is named as future hardening; v1 ships the mechanical check + recorded
  provenance.

### D5 — CLI surface (deterministic, model-free)

- `record --criteria <text|@file>` — criteria required; bound in envelope.
- `inspect <id>` — return frozen criteria + evidence + integrity + raw data
  (what the skill feeds the evaluator).
- `attest <id> --opinion <pass|reject|unclear> --rationale <text> --evaluator <id>
  --model <provider/version> [--prompt-hash <h>] [--sampling <json>]` — append an
  `opinion_attestation`; **fail-closed** if the frozen inputs no longer
  hash-match, and **reject** if `evaluator == created_by`.
- `verify <id>` — re-derive integrity + return latest attestation (+ `stale`).
- `attestations <id>` — the append-only opinion log.
- `cross-check [--integrity-only | --with-attestations]`.

### D6 — The determinism trade, stated plainly

Verdict reproducibility for *judgments* is **intentionally surrendered** for
independence (governed by G10). Input integrity remains fully reproducible and
tamper-evident (G2/G3/G7). "Never trust the cached verdict" now has two
complementary readings: *re-derive deterministically* (integrity + mechanical
sub-checks) and *re-evaluate independently* (completion judgment).

### D7 — Prompt-injection threat model

**Council revision (4/5):** the evidence payload and (worker-authored) criteria
are attacker-influenceable inputs to the judge. Stated threat model:
- **T1 — lax-bar self-grade:** worker authors weak criteria → guaranteed PASS.
  Mitigated by D1 (contract-pinned criteria as the trusted path;
  `criteria_authored_by` attribution).
- **T2 — payload/criteria prompt injection:** content steers the judge to PASS.
  Mitigations the `analyze-evidence` skill MUST apply: evidence and criteria are
  passed to the judge as **escaped, quoted data** (never as instructions); the
  judge returns a **structured output schema** (opinion + rationale + cited
  sub-checks), not free text; **refusal/`unclear` on instruction-conflict**;
  **fail-closed** on ambiguous or unparseable evaluator output.
- **Residual risk:** a sufficiently capable injection may still flip a judgment;
  the attestation log makes the inputs and evaluator auditable after the fact but
  does not prevent T2 in v1. Stated, not solved — honest scoping per ADR-0001 Q6.

## Consequences

- CONTRACTS.md → v2: new invariant **G10**; G3 reframed (integrity re-derivation +
  independent re-evaluation); `verify` documented as two-tier; `record` requires
  criteria; `opinion_attestation` schema + threat model added.
- The judgment-tier orchestration lives in a dedicated **`wicked-vault:analyze-evidence`**
  skill (see Amendment 1); `wicked-vault:verify-evidence` stays the deterministic
  integrity check. The independence + injection rules live in `analyze-evidence`.
- New wicked-bus events: `wicked.evidence.attested`, `wicked.claim.evaluated`.
- The v1 deterministic verifiers are retained as composable sub-checks.
- ADR-0001 Q5 council dissent acknowledged; this is a user-adjudicated extension
  that preserves Q5's specific disqualifier (no `llm_eval` verifier kind) while
  adding independent evaluation at the orchestration layer.
- **Open empirical question (Pi):** if the dominant failure mode is "agent fakes
  a test run" (caught by deterministic verifiers) rather than "work technically
  passes checks but misses the acceptance criteria" (needs judgment), the
  judgment tier's complexity may be unjustified. Worth measuring once consumers
  exist.

## Amendment 1 (2026-05-25) — split the judgment tier into its own skill

The two tiers are now two skills, so the caller's *intent is legible at the
invocation surface* — not just in the data model (distinct `opinion_attestation`
type) and the flags (`--integrity-only` default):

- **`wicked-vault:verify-evidence`** — integrity tier only. Deterministic,
  model-free, reproducible, CI-safe.
- **`wicked-vault:analyze-evidence`** — judgment tier. Orchestrates
  `inspect → independent eval → attest`; runs a model; non-reproducible.

This reinforces council revisions #1 (distinct types) and #2 (judgment is never
the default) at the invocation layer, and mirrors the CLI, which has a `verify`
verb but deliberately **no `analyze` verb** (the model never runs in the CLI).
No CLI/core change — a skill-surface refinement. Not re-councilled: it makes the
accepted D2 boundary more legible, it does not change it.
