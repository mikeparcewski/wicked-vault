/**
 * index.mjs — wicked-vault public API barrel.
 *
 * The programmatic surface of the local-first evidence primitive. Everything
 * here is also reachable by deep subpath (e.g.
 * `import { record } from "wicked-vault/src/vault/vault.mjs"`) — the barrel
 * exists so consumers (wicked-crew gates, wicked-testing) can
 * `import { record, verify, crossCheck } from "wicked-vault"` and get the
 * hand-authored type declarations (index.d.mts) with it.
 *
 * The CLI (`wicked-vault` on PATH via the bin entry) remains the primary
 * gate interface; this module is the same engine, in-process.
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

// --- Deterministic hashing (G2 envelope binding) ---
export { sha256, canonical, envelopeHash } from "./src/vault/hash.mjs";

// --- Server-minted monotonic id (G1) ---
export { newId } from "./src/vault/id.mjs";

// --- Deterministic verifier registry (G7) ---
export { VERIFIERS, runVerifier } from "./src/vault/verifiers.mjs";

// --- Optional fire-and-forget wicked-bus integration ---
export { initBus } from "./src/vault/bus.mjs";

// --- Evidence-manifest builder + verdict enum (shared with wicked-ledger) ---
export { buildManifest, MANIFEST_VERSION, VERDICT_VALUES } from "./lib/manifest.mjs";
