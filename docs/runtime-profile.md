# WICKED_RUNTIME profile — wicked-vault

The wicked foundation packages (wicked-estate, wicked-vault, wicked-ledger,
wicked-bus) flip together on one environment switch:

| Env | Meaning |
|---|---|
| `WICKED_RUNTIME=local` (or unset) | Zero-infra local stores — the default. |
| `WICKED_RUNTIME=team` | Self-hosted shared Postgres (`WICKED_STORE_URL=postgres://…`). |

Any other `WICKED_RUNTIME` value is an error (`ERR_WICKED_RUNTIME_INVALID`) —
a typo must never silently fall back to a local store in a deployment that
believes it is shared.

## wicked-vault's store driver today: `store_mode: 'in-repo'`

The storage contract (docs/CONTRACTS.md §6) is git-native and committed:
one file per artifact under `.wicked-vault/`, content-addressed payloads,
`store_mode: 'in-repo'` pinned in `vault.json`. There is **no server-backed
shared store driver**, so under `WICKED_RUNTIME=team` the CLI refuses every
store-touching command **before any vault I/O**
(`ERR_WICKED_RUNTIME_TEAM_UNSUPPORTED`); `--help` / `--version` still work.

Honest nuance: in-repo evidence **is** team-shareable through git itself —
append-only files, PR-diff audit trail, concurrent writers by design. What
`team` promises and the vault cannot yet deliver is a *server-backed* shared
store. Refusing loudly is preferred over silently recording evidence whose
home differs from what the profile claims.

`resolveRuntimeProfile(env?)` and `assertRuntimeSupported(env?)` are exported
from the package barrel for consumers that resolve the profile in-process.

## Named follow-up: a server-backed `store_mode` driver

The team-mode implementation is a second driver behind the existing
`store_mode` seam (`vault.json`): e.g. `store_mode: 'server'` backed by the
shared Postgres named in `WICKED_STORE_URL`, providing the same
record / verify / attest / cross-check surface with the same append-only and
envelope-hash guarantees. Until that driver lands, `team` is rejected here by
design.
