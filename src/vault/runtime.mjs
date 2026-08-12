/**
 * src/vault/runtime.mjs — WICKED_RUNTIME profile resolution (the foundation
 * team-profile seam).
 *
 * The wicked foundation packages (wicked-estate, wicked-vault, wicked-ledger,
 * wicked-bus) flip together on one environment switch:
 *
 *   WICKED_RUNTIME=local   (default) — zero-infra local stores
 *   WICKED_RUNTIME=team    — self-hosted shared Postgres
 *                            (WICKED_STORE_URL=postgres://…)
 *
 * wicked-vault's only store driver today is `store_mode: 'in-repo'` — the
 * git-native, committed `.wicked-vault/` file store (docs/CONTRACTS.md §6).
 * A server-backed shared store driver does not exist, so `team` fails loudly
 * here instead of pretending. Note the honest nuance in the error: in-repo
 * evidence IS team-shareable through git itself (append-only files, PR-diff
 * audit trail); what's missing is a *server-backed* driver behind the
 * `store_mode` seam. Until it exists, honesty > fake.
 */

const PROFILES = new Set(['local', 'team']);

/**
 * Parse WICKED_RUNTIME / WICKED_STORE_URL from `env` (default: process.env).
 *
 * Returns `{ runtime, storeUrl }` where runtime is 'local' or 'team'.
 * Unset / empty WICKED_RUNTIME resolves to 'local'. Any other value throws
 * `ERR_WICKED_RUNTIME_INVALID` — a typo must never silently fall back to a
 * local store in a deployment that believes it is shared.
 */
export function resolveRuntimeProfile(env = process.env) {
  const raw = (env.WICKED_RUNTIME ?? 'local').trim().toLowerCase() || 'local';
  if (!PROFILES.has(raw)) {
    const err = new Error(
      `WICKED_RUNTIME='${raw}' is not a recognized runtime profile (expected 'local' or 'team')`,
    );
    err.code = 'ERR_WICKED_RUNTIME_INVALID';
    throw err;
  }
  return { runtime: raw, storeUrl: env.WICKED_STORE_URL };
}

/**
 * Resolve the runtime profile and fail loudly when it names a mode this
 * package cannot honor. Called by the CLI before any vault I/O.
 *
 * - local → returns the profile; the in-repo store proceeds.
 * - team  → throws `ERR_WICKED_RUNTIME_TEAM_UNSUPPORTED`: the only store
 *           driver is `store_mode: 'in-repo'`; a server-backed shared driver
 *           behind that seam is the named follow-up.
 */
export function assertRuntimeSupported(env = process.env) {
  const profile = resolveRuntimeProfile(env);
  if (profile.runtime === 'team') {
    const err = new Error(
      "WICKED_RUNTIME=team: wicked-vault's only store driver today is store_mode " +
        "'in-repo' (the git-native committed .wicked-vault/ store) — there is no " +
        'server-backed shared store driver yet, so team mode is refused rather than ' +
        'faked. In-repo evidence is still team-shareable through git itself; a ' +
        "server-backed driver behind the store_mode seam is the named follow-up " +
        '(docs/runtime-profile.md). Unset WICKED_RUNTIME (or set WICKED_RUNTIME=local) ' +
        'to use the in-repo store.',
    );
    err.code = 'ERR_WICKED_RUNTIME_TEAM_UNSUPPORTED';
    throw err;
  }
  return profile;
}
