---
name: wicked-vault:init
description: Initialize a wicked-vault in a repository so claims can be backed by re-derivable evidence. Use when setting up the vault for the first time, when a vault command reports "no .wicked-vault/ found", or before the first record/cross-check in a project.
---

# wicked-vault:init

Set up the local-first **evidence primitive** in the current repository. The
vault records claim-backing artifacts, hashes them tamper-evidently, and
*re-derives* their verdict on demand — it never trusts a stored status.

## When to use

- First time using the vault in a repo.
- A command failed with `no .wicked-vault/ found; run \`wicked-vault init\``.
- Before the first `record` or `declare-contract` in a project.

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
