# wicked-vault

Local-first **evidence primitive**. Records claim-backing artifacts, hashes them
tamper-evidently, and *re-derives* their verdict on demand — it never trusts a
stored status. Sibling to wicked-bus / wicked-brain / wicked-testing.

It exists to answer one question honestly: **is this claim actually backed by
evidence that still holds?** — so "tests pass", "build clean", "ready to merge"
can't be asserted into truth.

## Boundary

| Owns (the primitive) | Refuses (lives in a consumer) |
|---|---|
| `record` · `verify` · `cross-check` · `supersede` | "is the work *done*?" (gate logic) |
| the verifier family + tamper-evidence (envelope hash; git as audit chain) | scenario/flake history; claim authoring; work-shape |

The consumer authors the contract; the vault evaluates it mechanically (G9).
It cannot decide "done" — it has no gate logic to leak.

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
`wicked-vault-{init,record,verify,cross-check}/` under each CLI's `skills/`. If
wicked-bus is installed, the installer also registers the vault as a bus
provider (see below).

## CLI

```bash
wicked-vault init
wicked-vault record  --scope S --phase build --claim tests-pass --kind test-run \
                     --source "npm test" --verifier "exit_code_eq:0" --run
wicked-vault verify  <artifact-id>            # re-derives; exit 0 iff hash_ok && pass
wicked-vault cross-check --scope S --phase build   # mechanical contract verdict; exit 0 iff PASS
wicked-vault supersede <old-id> --scope S ... --run
wicked-vault declare-contract --scope S --phase build --spec contract.json
wicked-vault list --scope S
```

Output is JSON; exit code is the gate signal (0 = PASS).

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
| `cross-check` | `wicked.contract.checked` | `vault.cross_check` | scope, phase, **overall**, contract_version |

All events use `domain: wicked-vault`. `wicked.contract.checked` carries the
mechanical verdict (`PASS` / `REJECT` / `ERROR`) — the signal a gate consumer
(wicked-testing, wicked-garden) subscribes to. `wicked.evidence.tampered` is the
high-value alarm: a payload or envelope diverged from what was recorded (G2).

## Guarantees

G1 server-minted ids · G2 envelope-hash tamper-evidence · **G3 re-derivation
(never trust a cached status)** · G4 honest recording (not sandboxed — harness
owns isolation) · G5 fail-closed · G6 append-only · G7 verifier purity ·
G8 contract pinning · G9 mechanical evaluation. Full text + threat model:
[`docs/CONTRACTS.md`](docs/CONTRACTS.md). Founding decisions + council review:
[`docs/adr/0001`](docs/adr/0001-standalone-and-council-revisions.md).

## Verifiers (v1 core — deterministic)

`exit_code_eq` · `regex_match` · `not_contains` · `jq_pred` · `commit_exists`.
Nondeterministic observation verifiers (`pr_check_status`, `http_status_eq`) are
a separate extension; `llm_eval` is intentionally not a verifier kind (it would
falsify G7).

## Proof

```bash
npm run prove                 # record -> tamper -> verify-rejects on a real repo
bash test/verifiers.sh        # the 5 verifiers, pass + fail cases
bash test/bus-integration.sh  # graceful no-op + event validity + emission
```

Status: v0.1.0 — core proven on real repos; wicked-bus event emission +
provider registration implemented (optional, fire-and-forget). Not yet
implemented: `pr_check_status`/`http_status_eq` and the sqlite query cache.
