---
name: wicked-vault:init
description: Initialize a wicked-vault in a repository so claims can be backed by re-derivable evidence. OPTIONAL ceremony — record/declare-contract/supersede create the vault automatically; use init only to scaffold explicitly. A read command reporting code VAULT_NOT_FOUND means no evidence exists yet, which record (not init) fixes.
---

# wicked-vault:init

Set up the local-first **evidence primitive** in the current repository. The
vault records claim-backing artifacts, hashes them so naive/accidental mutation
is detected on re-derivation, and *re-derives* their verdict on demand — it
never trusts a stored status. (The hash detects mutation; the committed,
branch-protected git history is the durable tamper-evidence — see below and the
README "Tamper detection" section.)

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
  vault.json     # schema_version, store_mode: in-repo, payload_max_bytes (enforced on record)
  entries/       # one JSON envelope per recorded artifact (append-only)
  payloads/      # content-addressed payload blobs (sha256-named, deduped)
  contracts/     # consumer-authored contracts, per scope/phase
  attestations/  # append-only independent opinion log, per artifact
```

`payload_max_bytes` (default 1 MiB) is enforced at `record` time: an over-size
payload is rejected fail-closed (no entry, no blob written) so the committed
audit chain stays lean. Set it to `0` to disable the guard.

`record`, `declare-contract`, and `supersede` auto-create the vault if one
isn't found, so explicit `init` is mostly for clarity. `verify`, `cross-check`,
and `list` do **not** auto-create — they fail-closed when no vault exists.

The vault is discovered by walking up from the current directory, so any
subdirectory of the repo can run vault commands.

## Commit the vault — it is the real tamper-evidence backstop

`store_mode` defaults to `in-repo`, and **`.wicked-vault/` should be committed.**
This is not incidental: the envelope hash only catches *naive/accidental*
mutation — a determined local writer can recompute every hash after editing
(the hashes are unkeyed SHA-256 over public fields). The protection that
actually survives a determined editor is the **committed, branch-protected git
history**: it is what makes after-the-fact tampering visible in a diff and
preventable with branch protection. Audit-trail-grade, not cryptographic — see
the README "Tamper detection" section and CONTRACTS.md §6.

So **do not git-ignore the vault.** Commit `entries/`, `payloads/`,
`contracts/`, and `attestations/`; only the derived `index.sqlite` query cache
is ignored (it is rebuilt from the source of truth). If you have a deliberate
reason to keep evidence local-only (throwaway scratch, never reviewed), that is
an explicit opt-out — add `.wicked-vault/` to your `.gitignore` knowing you have
forfeited the only durable tamper-evidence the vault offers.

## Next steps

- `wicked-vault:record-evidence` — capture an artifact and attach a verifier.
- `wicked-vault:cross-check-evidence` — declare a contract and get a mechanical verdict.

## Output

Every command emits JSON to stdout and uses the **exit code as the gate
signal** (`0` = PASS / success). `init` returns the absolute path of the
created `.wicked-vault/` directory.
