/**
 * Type declarations for src/vault/hash.mjs — deterministic hashing utilities.
 *
 * Hand-authored against the runtime module. Keep in lockstep — CI runs
 * `npm run typecheck` against test/types/consumer.mts so drift fails loudly.
 */

/** Lowercase hex SHA-256 of the input. */
export function sha256(data: string | Uint8Array): string;

/** Deterministic canonical JSON: recursively key-sorted, no whitespace. */
export function canonical(obj: unknown): string;

/** The identifying tuple bound by the envelope hash (G2). */
export interface EnvelopeFields {
  scope: string;
  phase: string;
  claim_id: string;
  kind: string;
  source: string;
  /** Optional deterministic verifier; null for judgment-tier claims. */
  verifier?: { kind: string; params?: Record<string, unknown> } | null;
  criteria_sha256: string;
  payload_sha256: string;
}

/**
 * Tamper-evident envelope hash binding the identifying tuple (including the
 * acceptance-criteria hash) to the payload hash. Mutating any field, the
 * criteria, or the payload diverges a later `verify` recomputation.
 */
export function envelopeHash(fields: EnvelopeFields): string;
