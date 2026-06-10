---
name: wicked-vault:init
description: Initialize a wicked-vault in a repository so claims can be backed by re-derivable evidence. OPTIONAL ceremony — record/declare-contract/supersede create the vault automatically; use init only to scaffold explicitly. A read command reporting code VAULT_NOT_FOUND means no evidence exists yet, which record (not init) fixes.
---

# wicked-vault:init

Set up the local-first **evidence primitive** in the current repository. The
vault records claim-backing artifacts, hashes them tamper-evidently, and
*re-derives* their verdict on demand — it never trusts a stored status.

## When to use

- You want the `.wicked-vault/` scaffold to exist before any evidence is
  recorded (e.g. committing the directory layout, pre-provisioning CI).
- Otherwise init is **optional**: `record`, `declare-contract`, and
  `supersede` create the vault automatically on first use.
- A read command failing with `code: VAULT_NOT_FOUND` means no evidence has
  been recorded in that repo — recording evidence fixes it; bare init alone
  does not produce evidence.

## Initialize

```bash
npx wicked-vault init
```

This creates `.wicked-vault/` at the repo root with:

```
.wicked-vault/
  vault.json     # schema_version, store_mode: in-repo, payload_max_bytes
  entries/       # one JSON envelope per recorded artifact (append-only)
  payloads/      # content-addressed payload blobs (sha256-named, deduped)
  contracts/     # consumer-authored contracts, per scope/phase
```

`record`, `declare-contract`, and `supersede` auto-create the vault if one
isn't found, so explicit `init` is mostly for clarity. `verify`, `cross-check`,
and `list` do **not** auto-create — they fail-closed when no vault exists.

The vault is discovered by walking up from the current directory, so any
subdirectory of the repo can run vault commands.

## Should this be committed?

`store_mode` defaults to `in-repo` — the vault lives inside the working tree
and git becomes the audit chain. Decide per project whether `.wicked-vault/` is
committed (shared, auditable evidence) or git-ignored (local-only scratch). The
repo's own `.gitignore` ignores `.wicked-vault/` by default; remove that line to
commit evidence.

## Next steps

- `wicked-vault:record-evidence` — capture an artifact and attach a verifier.
- `wicked-vault:cross-check-evidence` — declare a contract and get a mechanical verdict.

## Output

Every command emits JSON to stdout and uses the **exit code as the gate
signal** (`0` = PASS / success). `init` returns the absolute path of the
created `.wicked-vault/` directory.
