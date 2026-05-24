# wicked-vault — Interaction & Contract Specification

**Status:** v1 — council-reviewed and revised (see `adr/0001-standalone-and-council-revisions.md`).
Standalone product confirmed. Defines the contracts every consumer integrates
against. Sibling to wicked-bus / wicked-brain / wicked-testing.

> v1 changed §4 (G3/G4 honest scoping + new G9), §5 (scope cut to 5
> deterministic verifiers; `llm_eval` removed), §6 (per-entry storage), and §12
> (decisions resolved) per the council. Rationale + dissent: ADR-0001.

wicked-vault is the **evidence primitive**: it records claim-backing
artifacts, hashes them tamper-evidently, and *re-derives* their status on
demand — never trusting a stored verdict. It is consumed by wicked-garden's
compiled harness, by wicked-testing, by hand-run builds, and by CI directly.

Derived from the proven semantics of command_iq's `the-vault.EvidencePort`
(server-minted ids, four-column envelope hash, never-trust-cached
re-derivation, template registry, fail-closed), translated to a portable,
app-free, git-native standalone.

---

## 1. Identity & boundary

| Owns (the primitive) | Refuses (lives in a consumer) |
|---|---|
| `record` — independent capture: vault runs the source, hashes the payload, mints the id | "is the work *done*?" → wicked-garden gate logic / triggers |
| `verify` — re-derive status against the payload; never read a cached status | scenario / flake / verdict-*history* semantics → wicked-testing |
| `cross-check` — claims → artifacts → verdict vs. a pinned contract | claim *authoring* / work-shape / archetype → wicked-garden |
| `supersede` — atomic, append-only replacement | risk-surface → which-claims policy (consumer supplies the contract) |
| verifier family + tamper-evidence (envelope hash; git as audit chain) | notification / dashboards (subscribe to vault events instead) |

**The boundary is the package boundary.** The vault cannot decide "done" —
it has no gate logic to leak. It only answers two questions: *does this
artifact still verify?* and *is this scope+phase's contract satisfied?*

---

## 2. Place in the family

```
                 wicked-garden (compiler+harness)        wicked-testing (ledger)
                          │ declares contracts,                  │ records runs,
                          │ fires cross-check triggers           │ cites artifact ids
                          ▼                                       ▼
                       ┌──────────────────── wicked-vault ───────────────────┐
                       │ record / verify / cross-check / supersede            │
                       │ verifier registry · envelope hash · contracts        │
                       └──────────────────────────────────────────────────────┘
                          │ emits events                          │ stores in
                          ▼                                       ▼
                       wicked-bus                            git (audit chain)
```

- **wicked-garden**: consumes via integration-discovery. Its compiler emits
  per-repo contracts and triggers that call `cross-check`. Its
  `scripts/qe/evidence_tracker.py` ("satisfied when *claimed*") is **replaced**
  by reading vault verdicts ("satisfied when *verified*").
- **wicked-testing**: substrate-ready consumer. A scenario run `record`s its
  evidence; the ledger stores its verdict citing the `artifact_id`; history
  queries `verify` to re-derive. (Migration not forced — see Decision D2.)
- **wicked-bus**: vault emits lifecycle events; consumers subscribe.

---

## 3. Data contracts

### 3.1 Artifact (the recorded evidence unit — immutable)

| Field | Type | Notes |
|---|---|---|
| `id` | string (ULID) | **server-minted**; caller MUST NOT supply (G1) |
| `scope` | string | unit of work (branch / PR / epic id) |
| `phase` | string | e.g. `test`, `build`, `review` |
| `claim_id` | string | the claim this artifact backs |
| `kind` | enum | `test-run`·`typecheck`·`build`·`pr-check`·`http-probe`·`review-verdict`·`custom` |
| `source` | string | provenance: the command, file path, or URL that produced the payload — **pinned by the contract** (G8) |
| `verifier` | `{kind, params}` | the typed check (see §5) |
| `payload_sha256` | string | hash of the captured payload blob |
| `payload_ref` | string | `payloads/<sha256>` (content-addressed) |
| `envelope_hash` | string | sha256 over canonical(`scope,phase,claim_id,kind,source,verifier,payload_sha256`) (G2) |
| `status_at_record` | enum | verifier result computed **once** at record — informational; `verify` NEVER reads it (G3) |
| `state` | enum | `active` · `superseded` |
| `supersedes` | string? | prior artifact id |
| `contract_version` | string? | the contract hash in force at record |
| `created_at` / `created_by` | ts / string | actor provenance |

### 3.2 Contract (exit-criteria — what evidence a scope+phase requires)

| Field | Type | Notes |
|---|---|---|
| `scope` / `phase` | string | |
| `required_evidence` | `[{claim_id, kind, source_pin, verifier, required: bool}]` | the pinned shape — prevents criterion/verifier downgrade (G8) |
| `contract_version` | string | sha256 of the canonicalized `required_evidence` set — detects contract drift |
| `origin` | string | who declared it (the wicked-garden compiler, typically) |

### 3.3 Verdict (cross-check output)

```jsonc
{
  "scope": "...", "phase": "test", "contract_version": "ab12…",
  "overall": "PASS | REJECT | ERROR",
  "claims": [
    { "claim_id": "tests-pass", "artifact_id": "01J…",
      "in_contract": true, "hash_ok": true,
      "verifier_status": "pass",
      "result": "PASS | FAIL | MISSING | STALE | ERROR" }
  ],
  "evaluated_at": "…", "evaluated_by": "…"
}
```

---

## 4. Guarantee invariants (the load-bearing promises)

- **G1 server-minted ids** — the caller cannot supply or forge an id.
- **G2 envelope hash** — bound over the identifying tuple + payload hash;
  recomputed and checked on *every* `verify`. Any mutation ⇒ `hash_ok:false`.
- **G3 re-derivation** — `verify` re-runs the verifier against the payload and
  returns a fresh status. It **never** reads `status_at_record`. (BA-1 defense.)
  *Bound:* G3 proves the recorded payload still verifies; it does not re-prove
  the payload was captured honestly — that is G4's (bounded) job.
- **G4 honest recording, NOT sandboxed capture** — `record --run` executes the
  source and captures its output; `record --artifact <file>` records
  caller-supplied content. In both cases the vault hashes the payload and runs
  the verifier — it trusts no *claimed* status. **Threat model, stated plainly:**
  the vault defends against (a) post-hoc tampering — mutating a recorded payload
  or verdict (caught by G2) — and (b) stale-cache trust (caught by G3). It does
  **NOT** defend against a poisoned capture environment (PATH/env/cwd are
  inherited from the caller); execution isolation is the harness's / CI's
  responsibility, exactly as it was the runtime's in command_iq. `--artifact`
  mode proves the artifact verifies against its pinned verifier; it does not
  prove independent capture. Sandboxed capture is future hardening (later ADR).
- **G5 fail-closed** — missing artifact / unknown verifier / missing contract /
  source-pin mismatch ⇒ `ERROR`/`REJECT`, never `PASS`.
- **G6 append-only** — artifacts are immutable; `supersede` writes a new row +
  flips state atomically. git is the audit chain.
- **G7 verifier purity** — a verifier is a pure, deterministic function of
  `(payload, params)`. Re-derivable; no hidden state. (Nondeterministic kinds
  are quarantined — see §5.)
- **G8 contract pinning** — `kind`, `source`, and `verifier` are pinned per
  claim in the contract; `record` rejects a downgrade (e.g. swapping a strict
  verifier for a weaker one, or pointing `source` at a different command).
- **G9 mechanical evaluation (the boundary, enforced)** — the vault never
  *authors* a contract; the consumer (wicked-garden compiler / wicked-testing)
  does. `cross-check`'s verdict is a pure function of `(consumer-authored
  contract, recorded artifacts)`: for each required claim, does an active
  artifact exist whose `verify()` passes and whose `source`/`verifier` match the
  pin? The vault decides *whether the contract is satisfied*, never *what the
  contract should require*. This is what keeps `cross-check` a primitive and not
  gate-decision policy — answering the council's Q4.

---

## 5. Verifier contract (the extension point)

**Interface:** `verify(payload: bytes, params: dict) -> {status: "pass"|"fail", detail: str}`.
Pure, deterministic, side-effect-free beyond reading the payload.

**v1 core — 5 deterministic verifiers only** (council Q5: scope cut):

| Kind | Params |
|---|---|
| `exit_code_eq` | `{code: 0}` |
| `regex_match` | `{pattern, flags}` |
| `not_contains` | `{pattern}` |
| `jq_pred` | `{expr}` |
| `commit_exists` | `{sha}` (shells `git cat-file -e`) |

All five are pure, deterministic functions of `(payload, params)` — re-derivable
indefinitely (G7 holds). `structural_eq` is a deferred deterministic add (niche
golden-file comparison).

**Deferred — observation-verifier extension (separate spec, NOT v1 core).**
`pr_check_status` (`gh pr checks`) and `http_status_eq` are point-in-time
*observations*, not re-derivable facts. They ship as a distinct tier with
**explicitly different semantics**: `verify` performs a *fresh capture* rather
than re-deriving the old payload, params are **pinned by the contract** (URL,
PR — never agent-controlled), and G7 is declared inapplicable for the tier.
Sequenced here because the ci-aware-merge discipline needs `pr_check_status` —
but it does not belong in the deterministic founding spec.

**Removed: `llm_eval`.** A probabilistic judge is neither pure, deterministic,
nor re-derivable — registering it falsifies G7 at the type level (council
disqualifier). If "an LLM judges this artifact" is ever wanted, it is its own
spec with its own non-G7 semantics, not a verifier kind here.

**Custom verifiers** register via `verifiers/<kind>.{js,py}` exporting the
interface + a `determinism` declaration. Unknown kind at `verify` ⇒ `ERROR`
(G5), never a silent pass.


---

## 6. Storage contract (portable, git-native)

In-repo, committed (Decision D1) — **one file per artifact** (council Q2):

```
.wicked-vault/
  vault.json                  # {schema_version, store_mode, payload_max_bytes}
  entries/<ulid>.json         # SOURCE OF TRUTH — ONE artifact per file
  payloads/<sha256>           # content-addressed payload blobs
  contracts/<scope>/<phase>.json
  index.sqlite                # DERIVED query cache (gitignored), rebuilt by `reindex`
```

- **One file per artifact eliminates the write-serialization bottleneck.**
  Concurrent CI jobs / branches never touch the same path, so there are no
  merge conflicts on the source of truth. (This replaced a single
  `manifest.jsonl`, which the council flagged as a disqualifier under
  concurrent writers — and the standalone decision (ADR-0001) makes concurrent
  writers the default case.)
- **Source of truth = `entries/` + `payloads/`** (supersedes v0 Decision D5).
  Both content-addressed and committed ⇒ git is the audit chain: append-only,
  tamper-evident, and the PR diff shows exactly what evidence was added.
  *Caveat (honest):* git history is rewritable by a determined actor — this is
  audit-trail-grade tamper-evidence, not cryptographic immutability. G2's
  envelope hash detects payload/verdict mutation; it does not prevent a force-push
  that rewrites both. CI branch protection is the backstop.
- **Large payloads:** `payload_max_bytes` guard; over-size payloads externalize
  (hash recorded in the entry, blob stored out-of-tree) to keep the repo lean.

---

## 7. Event contract (wicked-bus)

Emits (domain `vault`):

| Event | Payload | Subscribers |
|---|---|---|
| `vault:artifact:recorded` | `{id, scope, phase, claim_id, kind, status_at_record}` | testing, dashboards |
| `vault:artifact:verified` | `{id, hash_ok, status}` | garden triggers |
| `vault:crosscheck:completed` | `{scope, phase, overall, contract_version}` | garden, testing |
| `vault:artifact:superseded` | `{old_id, new_id}` | testing |
| `vault:verify:failed` | `{id, reason}` | dashboards, alerting |

Vault is a pure **producer** here (mirrors `the-vault`'s subscriber-clean shape).

---

## 8. CLI contract (authoritative, cross-language)

The CLI with stable `--json` output is the lingua franca (Python wicked-garden
scripts, Node consumers, CI shell all call it identically).

```
wicked-vault record   --scope S --phase P --claim C --kind K \
                      --source "<cmd|file|url>" --verifier "exit_code_eq:0" \
                      (--run | --artifact <file>)            -> {id, envelope_hash, status_at_record}
wicked-vault verify   <artifact-id>                          -> {id, hash_ok, status, rederived:true}  (exit 0 iff pass+hash_ok)
wicked-vault cross-check --scope S --phase P (--from-contract | --claims <file>)
                                                             -> Verdict   (exit 0 iff overall PASS)
wicked-vault supersede <artifact-id> (--run|--artifact …)    -> {new_id, old_id}
wicked-vault declare-contract --scope S --phase P --spec <f> -> {contract_version}
wicked-vault get-contract --scope S --phase P                -> Contract
wicked-vault list     --scope S [--phase P]                  -> [Artifact…]
wicked-vault history  --claim C                              -> [Artifact…]  (supersede chain)
wicked-vault reindex                                         -> rebuilds index.sqlite from entries/
```

Vault root auto-detected by walking up to `.wicked-vault/`; `--cwd` overrides.
Every command accepts `--json` and exits non-zero on `FAIL`/`ERROR` (G5).

---

## 9. Integration-discovery contract

Registers provider `wicked-vault` with capabilities `[record, verify,
cross-check, declare-contract]`. wicked-garden and wicked-testing discover it
the same way they discover bus/brain; if absent, consumers degrade to a
documented "no-vault" path (garden: emit a claims-doc-only lint; testing:
local evidence JSON as today).

---

## 10. Consumer interaction sequences

**A. wicked-garden — compile time**
1. detect repo bindings (test_command, surfaces).
2. `declare-contract` per (scope, phase): required claims, with `source` pinned
   to the repo's real commands and `verifier` per claim.
3. emit triggers (pre-commit / CI) that call `cross-check --from-contract`.

**B. wicked-garden — runtime gate (the on-switch)**
1. agent claims "done".
2. compiled trigger runs `wicked-vault cross-check --from-contract`.
3. verdict gates: `overall != PASS` ⇒ block / CI red. The agent never supplies
   the verdict; it can only `record` artifacts the vault re-derives.

**C. wicked-testing — substrate**
1. scenario run ⇒ `record --run` (capture).
2. ledger stores its verdict + `artifact_id`.
3. history/flake queries ⇒ `verify <id>` to re-derive past evidence.

**D. hand-run / CI — standalone**
- `wicked-vault record --run` in a build step; `cross-check` before merge.
  No wicked-garden required.

**E. validator-pair utility**
- each validator's verdict is `record`ed as `kind: review-verdict`; the PR body
  cites the `artifact_id`s; a high-risk surface's contract lists them as
  `required: true`, so `cross-check` REJECTs until both verdicts exist.

---

## 11. Versioning

- `schema_version` in `vault.json` gates entry-format migrations.
- `contract_version` (hash of `required_evidence`) is stamped on every artifact
  and verdict — a verdict declares which contract it judged against, so contract
  drift is detectable (Copilot's `criteria_version` insight from command_iq).

---

## 12. Open decisions (recommendations — override as needed)

All resolved by the council + ADR-0001.

| # | Decision | Resolution | Source |
|---|---|---|---|
| D0 | standalone vs incubate | **standalone product** — council's incubate verdict overridden; command_iq's proven `EvidencePort` + Phase-0 proof answer the "premature" critique | user adjudication (ADR-0001) |
| D1 | evidence location | **in-repo `.wicked-vault/`, committed** — evidence travels with the PR | accepted |
| D2 | wicked-testing relationship | **substrate-ready, no forced migration** | accepted |
| D3 | runtime/packaging | **node/npm + CLI** (CLI authoritative) — runtime-fragmentation cost accepted as a tradeoff | accepted (council Q3 dissent noted) |
| D4 | verifier scope | **5 deterministic verifiers in v1 core**; nondeterministic = separate observation extension; `llm_eval` removed | council Q5 |
| D5 | source of truth | **`entries/<ulid>.json` (one file per artifact)** + content-addressed payloads; sqlite derived. *Supersedes v0 single-manifest.* | council Q2 (mandatory under D0) |
| D6 | gate boundary | **consumer authors contract, vault evaluates mechanically** (G9) — `cross-check` retained | council Q4 |
| D7 | capture model | **G4 = honest recording, not sandboxed capture**; harness owns execution isolation (as command_iq's runtime did) | council Q6 |
