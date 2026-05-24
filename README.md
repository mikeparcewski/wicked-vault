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
```

Status: v0.1.0 — core proven on real repos; `pr_check_status`/`http_status_eq`,
the sqlite query cache, and wicked-bus events are not yet implemented.
