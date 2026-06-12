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
  recorded as a hash-bound, append-only `opinion_attestation` (mutation-
  detecting in the same sense as the envelope — see "Tamper detection"). *Never
  trust a self-graded "done".*

## Boundary

| Owns (the primitive) | Refuses (lives in a consumer) |
|---|---|
| `record` · `verify` · `inspect` · `attest` · `cross-check` · `supersede` | "is the work *done*?" (gate logic) |
| criteria-binding + mutation detection (envelope hash detects naive tamper; committed git history is the audit chain) | scenario/flake history; claim authoring; work-shape |
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
npx wicked-vault-install --help        # options
```

This mirrors the shared wicked-bus / wicked-brain installer: `$CLAUDE_CONFIG_DIR`
is honored, alt-config layouts are probed, and skills land as
`wicked-vault-{init,record-evidence,verify-evidence,analyze-evidence,cross-check-evidence,update}/`
under each CLI's `skills/`. If wicked-bus is installed, the installer also
registers the vault as a bus provider (see below).

**Updating:** say `wicked-vault:update` to your agent, or run
`npm install -g wicked-vault@latest && npx wicked-vault-install` — it compares
your version against npm and refreshes the skills across every CLI. Both
binaries support `--help`.

## CLI

```bash
wicked-vault init   # optional — record / declare-contract / supersede create .wicked-vault/ automatically
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
   append-only, hash-bound log (mutation-detecting; the committed git history is
   the durable tamper-evidence — see "Tamper detection").

Guarantees that hold: criteria are frozen to the evidence (anti-downgrade);
`attest` is **fail-closed** on a tampered artifact and **rejects a self-grade**
(`evaluator == created_by`, compared trimmed + case-folded). The independence
check is hardened: the worker should record with an explicit `--actor` (or
`WICKED_VAULT_ACTOR`) — when the artifact carries only an *ambient* identity
(bare `$USER` / anonymous), `attest` **fails closed** and requires
`--allow-weak-worker-identity` (which stamps the weakness on the attestation for
audit), and the **evaluator** identity must itself be an explicit assertion.
This is a stronger mechanical baseline + audit trail, **not** cryptographic
independence — a determined human can still assert two distinct strings locally;
real independence comes from a separate evaluator process/credential and the
committed git trail. What's traded: a judgment is **not reproducible** —
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

Proven end-to-end: `test/bus-integration.sh` drives the vault into a **real**
wicked-bus (db isolated to a temp dir) and reads every event back off the bus —
and runs in CI on every push.

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

## Tamper detection — what it does, and what it does NOT do

Be precise about the word "tamper-evident", because the mechanism is easy to
overstate:

- **What the envelope hash catches:** *naive or accidental* mutation. The
  envelope is an **unkeyed SHA-256** over the artifact's public fields (scope,
  phase, claim, kind, source, verifier, `criteria_sha256`, `payload_sha256`).
  `verify` re-derives every hash from the bytes on disk and re-runs the pure
  verifier — so a hand-edit to a payload, the criteria, or a cached status is
  detected (`hash_ok: false`), and a stale "pass" is never trusted (G3). This
  defeats the common failure modes: a fat-fingered edit, a tool that rewrites a
  file, an agent that flips `status_at_record`.
- **What it does NOT do:** it is **not** cryptographically tamper-*resistant*
  against a *determined local writer*. Because the hashes are unkeyed and over
  public fields, anyone who can edit `entries/` can also recompute every hash to
  match — `verify` would then return `hash_ok: true` on a forged entry. There is
  no secret key, no signature, no HMAC. **Do not rely on the envelope hash alone
  as a security boundary.**
- **Where real tamper-EVIDENCE comes from:** the **committed, branch-protected
  git history** of `.wicked-vault/`. Evidence is committed by default; the PR
  diff shows exactly what was recorded, and branch protection prevents silent
  rewrites. This is **audit-trail-grade** tamper-evidence (you can see, in a
  reviewable history, what changed and who changed it) — **not** cryptographic
  immutability (a force-push by a privileged actor can still rewrite history; CI
  branch protection is the backstop). This matches CONTRACTS.md §6 and ADR-0002.

In one line: **the envelope hash detects mutation; committed, branch-protected
git history is what makes that mutation *evident and accountable*.**

## Guarantees

G1 server-minted ids · **G2 envelope hash — detects naive/accidental payload,
criteria, or envelope mutation (unkeyed SHA-256 over public fields; binds the
criteria too). NOT a defense against a determined local writer — see "Tamper
detection" above.** · **G3 re-derivation (never trust a cached status)** · G4
honest recording (not sandboxed — harness owns isolation) · G5 fail-closed · G6
append-only (git history is the audit chain) · G7 verifier purity (CLI never
calls a model) · G8 contract pinning · G9 mechanical evaluation · **G10
attestation-chain trust** (independent judgments are recorded, not re-derived;
distinct from deterministic results). Full text + threat model:
[`docs/CONTRACTS.md`](docs/CONTRACTS.md). Founding
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
npm test                      # the full gating suite (cli-baseline + attestation + bus + verifiers)
npm run prove                 # record -> tamper -> verify-rejects on a real repo (needs a sibling repo)
bash test/verifiers.sh        # the 5 verifiers, pass + fail cases
bash test/attestation.sh      # criteria-binding, attest fail-closed/independence (incl. weak-identity), payload limit, require_attestation
bash test/bus-integration.sh  # graceful no-op + schema validity + real-bus emission (init/record/attest/cross-check)
```

`npm test` runs the gating proofs (`cli-baseline.sh`, `attestation.sh`,
`bus-integration.sh`, `verifiers.sh`) and is what CI invokes
(`.github/workflows/ci.yml`) on ubuntu + macos, with a Windows CLI smoke.

Status: v0.3.1 — deterministic core proven on real repos; criteria-binding +
independent judgment tier (ADR-0002, council 5–0) implemented and proven;
wicked-bus integration **proven end-to-end against a real bus** (emit → store →
poll), optional and fire-and-forget; `--help` on both binaries + a
`wicked-vault:update` skill. Not yet implemented:
`pr_check_status`/`http_status_eq` and the sqlite query cache.
