/**
 * Type declarations for src/vault/vault.mjs — core vault operations.
 *
 * Hand-authored against the runtime module and the entry/attestation shapes
 * it persists under .wicked-vault/ (see docs/ and schemas/). Keep in
 * lockstep — CI runs `npm run typecheck` against test/types/consumer.mts so
 * drift fails loudly.
 */

import type { PayloadView, VerifierKind, VerifierParams, VerifierStatus } from "./verifiers.mjs";

/** A parsed deterministic verifier spec. */
export interface Verifier {
  kind: VerifierKind | (string & {});
  params: VerifierParams;
}

/**
 * Parse a verifier spec: "exit_code_eq:0", "regex_match:[0-9a-f]{40}", or a
 * JSON object string. A bare kind yields empty params.
 */
export function parseVerifier(spec: string): Verifier;

/**
 * Provenance of an acting identity (worker or judge):
 *  - "explicit"  — CLI --actor / --evaluator (deliberate assertion)
 *  - "env-actor" — WICKED_VAULT_ACTOR env (harness-asserted)
 *  - "env-user"  — ambient $USER / USERNAME (weak, easily spoofed)
 *  - "anonymous" — nothing resolved
 */
export type ActorSource = "explicit" | "env-actor" | "env-user" | "anonymous";

/** Who authored the frozen acceptance criteria (D1 provenance class). */
export type CriteriaAuthor = "record" | "contract";

/** Independent-judgment opinion values (G10). */
export type Opinion = "pass" | "reject" | "unclear";

/**
 * Walk upward from `start` looking for a .wicked-vault/ directory.
 * Returns the repo root that contains it, or null (or, with
 * `create: true`, initializes a vault at `start` and returns `start`).
 */
export function findRoot(start: string, opts?: { create?: boolean }): string | null;

/**
 * Create .wicked-vault/ (entries/, payloads/, contracts/, attestations/ and
 * vault.json) under `root`. Idempotent. Returns the vault base path.
 */
export function initVault(root: string): string;

export interface RecordOptions {
  /** Scope the claim belongs to (e.g. a feature or work item id). */
  scope: string;
  /** Phase the claim belongs to (e.g. "build", "review"). */
  phase: string;
  /** Claim id within the scope/phase contract. */
  claim: string;
  /** Evidence kind (e.g. "test-run"). */
  kind: string;
  /** The command to run (--run) or a description of the artifact source. */
  source: string;
  /**
   * G10/D1 — the acceptance criteria this evidence claims to clear.
   * Mandatory; record() throws without it.
   */
  criteria: string;
  /** Execute `source` as a shell command and capture {command, exit_code, stdout, stderr}. */
  run?: boolean;
  /** Path of an artifact file to read as the payload (alternative to `run`). */
  artifact?: string;
  /** Optional deterministic verifier spec (see parseVerifier). */
  verifier?: string;
  /** Asserted worker identity; falls back to WICKED_VAULT_ACTOR then $USER. */
  actor?: string;
  /** Working directory for --run captures and verifier context. */
  cwd?: string;
}

export interface RecordResult {
  id: string;
  envelope_hash: string;
  criteria_authored_by: CriteriaAuthor;
  /** Informational only — verify() never reads it (G3). */
  status_at_record: VerifierStatus | "n/a";
  status_detail: string;
  /** Content-addressed payload SHA-256 (the dedupe key under payloads/). */
  payload_sha256: string;
}

/**
 * G4 — independent capture: run the source (or read the file), hash it,
 * freeze the acceptance criteria, apply contract pins (G8), and persist an
 * append-only entry. Throws on a missing payload source, missing criteria,
 * an oversize payload (fail-closed, G5), or a G8 pin violation.
 */
export function record(root: string, opts: RecordOptions): RecordResult;

/** A persisted evidence entry (entries/<id>.json). */
export interface VaultEntry {
  id: string;
  scope: string;
  phase: string;
  claim_id: string;
  kind: string;
  source: string;
  verifier: Verifier | null;
  criteria_sha256: string;
  payload_sha256: string;
  acceptance_criteria: string;
  criteria_authored_by: CriteriaAuthor;
  /** Relative ref into the content-addressed store, e.g. "payloads/<sha256>". */
  payload_ref: string;
  envelope_hash: string;
  /** Informational only — verify() never trusts it (G3). */
  status_at_record: VerifierStatus | "n/a";
  state: "active" | "superseded";
  /** Id of the entry this one replaced, or null. */
  supersedes: string | null;
  contract_version: string | null;
  created_at: string;
  created_by: string;
  /** Absent on entries recorded by pre-provenance versions. */
  created_by_source?: ActorSource;
}

/**
 * G6 — append-only replacement: records a NEW artifact stamped with
 * `supersedes`, then flips the old entry's state to "superseded".
 */
export function supersede(root: string, oldId: string, recordOpts: RecordOptions): { new_id: string; old_id: string };

/** Latest independent opinion surfaced by verify() (reference only, G10). */
export interface LatestAttestationSummary {
  attestation_id: string;
  opinion: Opinion;
  evaluator: string;
  model: string | null;
  created_at: string;
  /** True when the opinion judged different bytes (payload or criteria changed since). */
  stale: boolean;
}

export interface VerifyResult {
  id: string;
  /** payload_ok && criteria_ok && envelope_ok. False on any tamper or a missing entry/blob. */
  hash_ok: boolean;
  /** Absent on the early-error paths (entry or payload blob not found). */
  payload_ok?: boolean;
  criteria_ok?: boolean;
  envelope_ok?: boolean;
  /** "pass" iff hash intact AND (no verifier OR the re-derived verifier passes). */
  status: VerifierStatus;
  /** False when the entry/blob could not be loaded, so nothing was re-derived. */
  rederived: boolean;
  detail: string;
  /** The stored status_at_record, surfaced to show it was NOT consulted (G3). */
  ignored_cached_status?: VerifierStatus | "n/a";
  latest_attestation?: LatestAttestationSummary | null;
}

/**
 * G2/G3 — integrity tier: recompute payload, criteria, and envelope hashes
 * from the actual bytes and re-derive the deterministic verifier. Never
 * trusts the stored status.
 */
export function verify(root: string, id: string): VerifyResult;

/** inspect() result when the entry exists. */
export interface InspectSuccess {
  id: string;
  scope: string;
  phase: string;
  claim_id: string;
  kind: string;
  source: string;
  acceptance_criteria: string;
  criteria_authored_by: CriteriaAuthor;
  created_by: string;
  created_by_source: ActorSource | null;
  /** Raw payload views, to be passed to a judge as ESCAPED DATA (D7). */
  evidence: { text: string; json: unknown };
  hash_ok: boolean;
  integrity_status: VerifierStatus;
}

export type InspectResult = InspectSuccess | { id: string; error: string };

/**
 * What the analyze-evidence skill feeds the independent judge: the frozen
 * criteria + evidence + an integrity check.
 */
export function inspect(root: string, id: string): InspectResult;

export interface AttestOptions {
  opinion: Opinion;
  /** The independent judge's asserted identity. Mandatory; must differ from the worker (G10/D4). */
  evaluator: string;
  rationale?: string;
  /** Judge model provenance, e.g. "anthropic/claude-fable-5". */
  model?: string;
  prompt_hash?: string;
  sampling?: unknown;
  /**
   * Attest even when the artifact was recorded under a weak/ambient worker
   * identity; the weakness is stamped on the attestation for audit.
   */
  allowWeakWorkerIdentity?: boolean;
}

export interface AttestResult {
  attestation_id: string;
  attestation_hash: string;
  opinion: Opinion;
}

/**
 * G10 — append an independent opinion. Fail-closed: refuses a tampered
 * artifact, an ambient evaluator identity, a self-grade
 * (evaluator == creator), and (without allowWeakWorkerIdentity) a weak
 * worker identity.
 */
export function attest(root: string, id: string, opts: AttestOptions): AttestResult;

/** A persisted attestation (attestations/<artifact-id>/<attestation-id>.json). */
export interface Attestation {
  attestation_id: string;
  artifact_id: string;
  opinion: Opinion;
  rationale: string;
  evaluator: string;
  evaluator_source: ActorSource;
  model: string | null;
  prompt_hash: string | null;
  sampling: unknown;
  /** Payload SHA the opinion judged — staleness is detected against these. */
  evidence_sha256: string;
  criteria_sha256: string;
  /** True when the independence claim rested on a weak/ambient worker identity. */
  worker_identity_weak: boolean;
  created_at: string;
  /** Tamper-evident binding over the attestation tuple (G2-style). */
  attestation_hash: string;
}

/** The append-only opinion log for an artifact, newest first. */
export function listAttestations(root: string, id: string): Attestation[];

/** One pinned claim in a consumer-authored contract. */
export interface ContractClaim {
  claim_id: string;
  /** Pin the evidence kind. */
  kind?: string;
  /** Pin the exact source (command/file). */
  source_pin?: string;
  /** Pin the verifier kind. */
  verifier?: { kind: VerifierKind | (string & {}); params?: VerifierParams };
  /** D1 trusted path: criteria pinned by the contract (exact-match enforced). */
  criteria?: string;
  /** false marks the claim optional in cross-check (missing evidence still passes). */
  required?: boolean;
  /** Require a passing, non-stale, independent opinion in --with-attestations mode (G10). */
  require_attestation?: boolean;
}

export interface ContractSpec {
  required_evidence?: ContractClaim[];
  origin?: string;
}

/**
 * G8 — pin a contract for scope/phase. Accepts a full spec or a bare claim
 * array. Returns the content-derived contract version (16-hex prefix).
 */
export function declareContract(
  root: string,
  scope: string,
  phase: string,
  spec: ContractSpec | ContractClaim[],
): { contract_version: string };

/** List persisted entries, optionally filtered by scope and phase. */
export function listEntries(root: string, scope?: string, phase?: string): VaultEntry[];

export type CrossCheckClaimResult = "PASS" | "FAIL" | "MISSING" | "ERROR" | "UNATTESTED" | "REJECT";

export interface CrossCheckClaim {
  claim_id: string;
  /** Absent when no active artifact matched the claim. */
  artifact_id?: string;
  result: CrossCheckClaimResult;
  detail?: string;
  hash_ok?: boolean;
  verifier_status?: VerifierStatus;
  /** Present in --with-attestations mode: the latest opinion, or null. */
  attestation?: {
    attestation_id: string;
    opinion: Opinion;
    evaluator: string;
    model: string | null;
    stale: boolean;
  } | null;
}

export interface CrossCheckResult {
  scope: string;
  phase: string;
  overall: "PASS" | "REJECT" | "ERROR";
  /** Absent on the no-contract ERROR path. */
  contract_version?: string;
  mode?: "integrity-only" | "with-attestations";
  detail?: string;
  claims: CrossCheckClaim[];
  evaluated_at?: string;
}

/**
 * G9 — mechanical contract verdict: a pure function of (contract, recorded
 * artifacts). Fail-closed ERROR when no contract is declared.
 */
export function crossCheck(
  root: string,
  scope: string,
  phase: string,
  opts?: { withAttestations?: boolean },
): CrossCheckResult;

export type { PayloadView, VerifierKind, VerifierParams, VerifierStatus };
