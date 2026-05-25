```
██╗    ██╗██╗ ██████╗██╗  ██╗███████╗██████╗       ██╗   ██╗ █████╗ ██╗   ██╗██╗  ████████╗
██║    ██║██║██╔════╝██║ ██╔╝██╔════╝██╔══██╗      ██║   ██║██╔══██╗██║   ██║██║  ╚══██╔══╝
██║ █╗ ██║██║██║     █████╔╝ █████╗  ██║  ██║█████╗██║   ██║███████║██║   ██║██║     ██║
██║███╗██║██║██║     ██╔═██╗ ██╔══╝  ██║  ██║╚════╝╚██╗ ██╔╝██╔══██║██║   ██║██║     ██║
╚███╔███╔╝██║╚██████╗██║  ██╗███████╗██████╔╝       ╚████╔╝ ██║  ██║╚██████╔╝███████╗██║
 ╚══╝╚══╝ ╚═╝ ╚═════╝╚═╝  ╚═╝╚══════╝╚═════╝         ╚═══╝  ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝
```

**Local-first evidence primitive. Records claim-backing evidence with the acceptance
criteria it must clear, checks integrity deterministically, and records independent
third-party judgments — never trusting a stored verdict, never letting work self-grade
its own "done".**

Sibling to wicked-bus / wicked-brain / wicked-testing. Works with **Claude Code**,
**Gemini**, **Copilot**, **Codex**, **Cursor**, **Kiro**, and **Antigravity** (skills
install across all of them).

It exists to answer one question honestly: **is this claim actually backed by
evidence that meets its bar?** — so "tests pass", "build clean", "ready to merge"
can't be *asserted* into truth, and can't be *self-graded* into truth either.

It checks on two tiers (ADR-0002):

- **Integrity tier** — deterministic, re-derivable, model-free. Recompute the
  hashes, re-run the pure verifier. CI-gate-safe. *Never trust a cached status.*
- **Judgment tier** — an **independent** evaluator (≠ the agent that did the
  work) judges the frozen evidence against the frozen criteria; the opinion is
  recorded as a tamper-evident, append-only `opinion_attestation`. *Never trust
  a self-graded "done".*

## Boundary

| Owns (the primitive) | Refuses (lives in a consumer) |
|---|---|
| `record` · `verify` · `inspect` · `attest` · `cross-check` · `supersede` | "is the work *done*?" (gate logic) |
| criteria-binding + tamper-evidence (envelope hash; git as audit chain) | scenario/flake history; claim authoring; work-shape |
| the deterministic verifier family **and** the append-only attestation ledger | running the judge — the model lives in the `analyze-evidence` *skill*, never in the CLI |

The consumer authors the contract; the vault evaluates it mechanically (G9) and
records independent judgments without re-deriving them (G10). It cannot decide
"done" — it has no gate logic to leak.

## Install

The CLI runs via `npx wicked-vault <command>` once the package is present. To
teach your AI CLIs/IDEs how to use it, install the skills across every detected
config root (Claude Code, Gemini, Copilot, Codex, Cursor, Kiro, Antigravity):

```bash
npx wicked-vault-install               # detect and install everywhere
npx wicked-vault-install --cli=claude  # one CLI only (comma-separated for several)
npx wicked-vault-install --path ~/.claude   # a specific config root
```

This mirrors the shared wicked-bus / wicked-brain installer: `$CLAUDE_CONFIG_DIR`
is honored, alt-config layouts are probed, and skills land as
`wicked-vault-{init,record-evidence,verify-evidence,analyze-evidence,cross-check-evidence}/`
under each CLI's `skills/`. If wicked-bus is installed, the installer also
registers the vault as a bus provider (see below).

## CLI

```bash
wicked-vault init
# record: --criteria is MANDATORY (the bar this evidence claims to clear); --verifier is optional
wicked-vault record  --scope S --phase build --claim tests-pass --kind test-run \
                     --source "npm test" --criteria "all unit tests pass (exit 0)" \
                     --verifier "exit_code_eq:0" --run
wicked-vault verify  <artifact-id>            # integrity tier; exit 0 iff hash_ok && pass; surfaces latest opinion
wicked-vault inspect <artifact-id>            # frozen criteria + evidence + integrity (feeds the judge)
wicked-vault attest  <artifact-id> --opinion pass --rationale "…" \
                     --evaluator gemini-reviewer --model gemini/2.5-pro   # independent judgment; fail-closed
wicked-vault attestations <artifact-id>       # append-only opinion log
wicked-vault cross-check --scope S --phase build                    # --integrity-only (default, CI-safe)
wicked-vault cross-check --scope S --phase build --with-attestations # opt-in judgment tier
wicked-vault supersede <old-id> --scope S --criteria "…" ... --run
wicked-vault declare-contract --scope S --phase build --spec contract.json
wicked-vault list --scope S
```

Output is JSON; exit code is the gate signal (0 = PASS). The model judge runs in
the `wicked-vault:analyze-evidence` skill (`inspect → eval → attest`) — the CLI
itself never calls a model.

## Two skills, two tiers (so the caller knows what they're invoking)

- **`wicked-vault:verify-evidence`** — integrity tier. Deterministic, model-free,
  reproducible, CI-safe: is the artifact intact and does its pure verifier pass?
- **`wicked-vault:analyze-evidence`** — judgment tier. Runs an *independent*
  model to judge evidence against criteria; non-reproducible; records an
  attestation. The name tells you you're spending a model call and getting an
  opinion, not a re-derivation.

## Independent evaluation (the judgment tier — G10)

For criteria a deterministic verifier can't express ("the change adequately
addresses the documented failure modes"), the `wicked-vault:analyze-evidence`
skill orchestrates an **independent** judge:

1. `inspect` returns the frozen criteria + evidence.
2. a model **distinct from the worker** judges criteria-vs-evidence (criteria
   and evidence are passed as escaped *data*, never as instructions).
3. `attest` records the `{opinion, rationale, evaluator, model, …}` to an
   append-only, tamper-evident log.

Guarantees that hold: criteria are frozen to the evidence (anti-downgrade);
`attest` is **fail-closed** on a tampered artifact and **rejects a self-grade**
(`evaluator == created_by`). What's traded: a judgment is **not reproducible** —
it's re-evaluated, not re-derived. The default CI gate stays on the
deterministic `--integrity-only` path; the judgment tier is opt-in. Threat model
(prompt injection, lax-bar self-grade) and the council 5–0 review:
[`docs/adr/0002`](docs/adr/0002-independent-evaluation-and-criteria-binding.md).

## wicked-bus integration (optional)

The vault is a zero-dependency primitive; wicked-bus is a **sibling**, never a
hard dependency. When wicked-bus is resolvable (installed globally or in the
project the vault runs from) the vault publishes events fire-and-forget. When it
isn't — or when `WICKED_VAULT_NO_BUS=1` is set — emission is a silent no-op and
the CLI behaves identically. A bus error never changes a verdict, the JSON on
stdout, or an exit code.

| Command | event_type | subdomain | key payload |
|---|---|---|---|
| `record` | `wicked.evidence.recorded` | `vault.record` | scope, phase, claim_id, kind, id, envelope_hash |
| `supersede` | `wicked.evidence.superseded` | `vault.supersede` | new_id, old_id, scope, phase, claim_id |
| `verify` / `cross-check` (tamper only) | `wicked.evidence.tampered` | `vault.tamper` / `vault.cross_check` | id(s), payload_ok, envelope_ok |
| `declare-contract` | `wicked.contract.declared` | `vault.contract` | scope, phase, contract_version |
| `cross-check` | `wicked.contract.checked` | `vault.cross_check` | scope, phase, **overall**, mode, contract_version |
| `attest` | `wicked.evidence.attested` | `vault.attest` | artifact_id, attestation_id, **opinion**, evaluator, model |
| `cross-check --with-attestations` | `wicked.claim.evaluated` | `vault.cross_check` | scope, phase, claim_id, opinion, evaluator |

All events use `domain: wicked-vault`. `wicked.contract.checked` carries the
mechanical verdict (`PASS` / `REJECT` / `ERROR`) — the signal a gate consumer
(wicked-testing, wicked-garden) subscribes to. `wicked.evidence.attested` carries
an independent `opinion` + its `evaluator`/`model` provenance (a judgment-tier
signal, *not* a deterministic verdict). `wicked.evidence.tampered` is the
high-value alarm: a payload, criteria, or envelope diverged from what was
recorded (G2).

## Guarantees

G1 server-minted ids · G2 envelope-hash tamper-evidence (**binds the criteria
too**) · **G3 re-derivation (never trust a cached status)** · G4 honest
recording (not sandboxed — harness owns isolation) · G5 fail-closed · G6
append-only · G7 verifier purity (CLI never calls a model) · G8 contract pinning
· G9 mechanical evaluation · **G10 attestation-chain trust** (independent
judgments are recorded, not re-derived; distinct from deterministic results).
Full text + threat model: [`docs/CONTRACTS.md`](docs/CONTRACTS.md). Founding
decisions + council reviews:
[`docs/adr/0001`](docs/adr/0001-standalone-and-council-revisions.md) ·
[`docs/adr/0002`](docs/adr/0002-independent-evaluation-and-criteria-binding.md).

## Verifiers (deterministic sub-checks — optional)

`exit_code_eq` · `regex_match` · `not_contains` · `jq_pred` · `commit_exists`.
Since ADR-0002 the verifier is an *optional* composable sub-check an independent
evaluator may cite — not the whole story. Nondeterministic observation verifiers
(`pr_check_status`, `http_status_eq`) are a separate extension. `llm_eval` is
**not** a verifier kind (it would falsify G7) — independent judgment lives in the
`analyze-evidence` skill instead, recorded as an `opinion_attestation` under G10.

## Proof

```bash
npm run prove                 # record -> tamper -> verify-rejects on a real repo
bash test/verifiers.sh        # the 5 verifiers, pass + fail cases
bash test/attestation.sh      # criteria-binding, attest fail-closed/independence, require_attestation
bash test/bus-integration.sh  # graceful no-op + event validity + emission (incl. attested)
```

Status: v0.2.0 — deterministic core proven on real repos; criteria-binding +
independent judgment tier (ADR-0002, council 5–0) implemented and proven;
wicked-bus emission + provider registration (optional, fire-and-forget). Not yet
implemented: `pr_check_status`/`http_status_eq` and the sqlite query cache.
