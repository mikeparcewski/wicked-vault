/**
 * Type declarations for index.mjs — the wicked-vault public API barrel.
 *
 * Mirrors the runtime barrel exactly: every value re-exported by index.mjs
 * is declared here, plus the supporting types. Keep in lockstep — CI runs
 * `npm run typecheck` against a consumer-shaped test file importing every
 * symbol, so drift fails loudly.
 */

// --- Core vault operations (record / verify / judge / gate) ---
export {
  findRoot,
  initVault,
  record,
  verify,
  inspect,
  attest,
  listAttestations,
  crossCheck,
  declareContract,
  listEntries,
  supersede,
  parseVerifier,
} from "./src/vault/vault.mjs";
export type {
  Verifier,
  ActorSource,
  CriteriaAuthor,
  Opinion,
  RecordOptions,
  RecordResult,
  VaultEntry,
  LatestAttestationSummary,
  VerifyResult,
  InspectSuccess,
  InspectResult,
  AttestOptions,
  AttestResult,
  Attestation,
  ContractClaim,
  ContractSpec,
  CrossCheckClaimResult,
  CrossCheckClaim,
  CrossCheckResult,
} from "./src/vault/vault.mjs";

// --- Deterministic hashing (G2 envelope binding) ---
export { sha256, canonical, envelopeHash } from "./src/vault/hash.mjs";
export type { EnvelopeFields } from "./src/vault/hash.mjs";

// --- Server-minted monotonic id (G1) ---
export { newId } from "./src/vault/id.mjs";

// --- Deterministic verifier registry (G7) ---
export { VERIFIERS, runVerifier } from "./src/vault/verifiers.mjs";
export type {
  PayloadView,
  VerifierStatus,
  VerifierOutcome,
  VerifierContext,
  VerifierKind,
  VerifierParams,
  VerifierDef,
} from "./src/vault/verifiers.mjs";

// --- Optional fire-and-forget wicked-bus integration ---
export { initBus } from "./src/vault/bus.mjs";
export type { BusPublisher } from "./src/vault/bus.mjs";

// --- Evidence-manifest builder + verdict enum (shared with wicked-ledger) ---
export { buildManifest, MANIFEST_VERSION, VERDICT_VALUES } from "./lib/manifest.mjs";
export type {
  Verdict,
  RunStatus,
  RunLifecycleStatus,
  EquivalenceMethod,
  VerdictEquivalence,
  ArtifactKind,
  ManifestArtifact,
  ManifestEnvironment,
  ManifestVerdict,
  ManifestAssertion,
  EvidenceManifest,
  BuildManifestRunRecord,
  BuildManifestScenarioRecord,
  BuildManifestVerdictRecord,
  BuildManifestOptions,
} from "./lib/manifest.mjs";
