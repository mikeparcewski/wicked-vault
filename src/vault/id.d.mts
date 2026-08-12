/**
 * Type declarations for src/vault/id.mjs — server-minted monotonic ID.
 *
 * Hand-authored against the runtime module. Keep in lockstep — CI runs
 * `npm run typecheck` against test/types/consumer.mts so drift fails loudly.
 */

/**
 * G1 — server-minted id: time-prefixed uppercase hex that sorts by creation
 * order (ULID-grade ordering; not strict ULID encoding).
 */
export function newId(): string;
