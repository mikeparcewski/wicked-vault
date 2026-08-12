/**
 * Type declarations for src/vault/verifiers.mjs — the deterministic
 * verifier registry.
 *
 * Hand-authored against the runtime module. Keep in lockstep — CI runs
 * `npm run typecheck` against test/types/consumer.mts so drift fails loudly.
 */

/** View of a payload blob handed to verifiers. */
export interface PayloadView {
  /** UTF-8 decoding of the blob. */
  text: string;
  /** Parsed JSON, or null when the blob is not JSON. */
  json: unknown;
  /** The raw payload bytes. */
  raw: Uint8Array;
}

export type VerifierStatus = "pass" | "fail" | "error";

export interface VerifierOutcome {
  status: VerifierStatus;
  detail: string;
}

export interface VerifierContext {
  /** Repo root for verifiers that shell out (commit_exists). */
  repoRoot?: string;
}

/** Registered deterministic verifier kinds. */
export type VerifierKind = "exit_code_eq" | "regex_match" | "not_contains" | "jq_pred" | "commit_exists";

/** Per-kind parameters, as produced by parseVerifier(). */
export interface VerifierParams {
  /** exit_code_eq: expected exit code (default 0). */
  code?: number;
  /** regex_match / not_contains: the pattern (RegExp source). */
  pattern?: string;
  /** regex_match / not_contains: RegExp flags (default "m"). */
  flags?: string;
  /** jq_pred: the jq expression run with `jq -e`. */
  expr?: string;
  /** commit_exists: the commit SHA (falls back to the verifiable text). */
  sha?: string;
  /** Fallback bucket for unknown kinds. */
  value?: string;
  [param: string]: unknown;
}

export interface VerifierDef {
  determinism: "deterministic";
  /** A verifier is a PURE, DETERMINISTIC function of (payload-view, params) (G7). */
  run(view: PayloadView, params: VerifierParams, ctx?: VerifierContext): VerifierOutcome;
}

/** The registry, keyed by kind. */
export const VERIFIERS: Readonly<Record<VerifierKind, VerifierDef>>;

/**
 * Run a verifier against a payload view. An unknown kind or a throwing
 * verifier yields status "error" (G5 fail-closed) — never throws.
 */
export function runVerifier(
  verifier: { kind: VerifierKind | (string & {}); params?: VerifierParams },
  view: PayloadView,
  ctx?: VerifierContext,
): VerifierOutcome;
