/**
 * test/types/consumer.mts — consumer-shaped typecheck fixture.
 *
 * Imports EVERY symbol declared by the hand-authored index.d.mts /
 * src/vault/*.d.mts / lib/manifest.d.mts declarations the way a downstream
 * strict-TS consumer (wicked-crew gates, wicked-garden qe) would, and
 * exercises the key signatures. `npm run typecheck` compiles this with
 * `tsc --noEmit` under strict nodenext resolution; if the declarations
 * drift from the surface this file uses, CI fails loudly.
 *
 * Type-check only — nothing here is ever executed (all usage lives inside
 * never-invoked functions).
 */

// --- Root barrel: every runtime symbol index.mjs re-exports ---
import {
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
  sha256,
  canonical,
  envelopeHash,
  newId,
  VERIFIERS,
  runVerifier,
  initBus,
  buildManifest,
  MANIFEST_VERSION,
  VERDICT_VALUES,
} from "wicked-vault";

import type {
  // vault types
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
  // hash types
  EnvelopeFields,
  // verifier types
  PayloadView,
  VerifierStatus,
  VerifierOutcome,
  VerifierContext,
  VerifierKind,
  VerifierParams,
  VerifierDef,
  // bus types
  BusPublisher,
  // manifest types
  Verdict,
  RunStatus,
  EvidenceManifest,
  BuildManifestOptions,
  ManifestArtifact,
  VerdictEquivalence,
} from "wicked-vault";

// --- Deep subpaths (the pre-barrel consumer shape) keep resolving ---
import { record as deepRecord, crossCheck as deepCrossCheck } from "wicked-vault/src/vault/vault.mjs";
import { sha256 as deepSha256 } from "wicked-vault/src/vault/hash.mjs";
import { newId as deepNewId } from "wicked-vault/src/vault/id.mjs";
import { runVerifier as deepRunVerifier } from "wicked-vault/src/vault/verifiers.mjs";
import { initBus as deepInitBus } from "wicked-vault/src/vault/bus.mjs";
import { buildManifest as manifestBuild, VERDICT_VALUES as VV2 } from "wicked-vault/manifest";
import { MANIFEST_VERSION as MV2 } from "wicked-vault/lib/manifest.mjs";

function expectType<T>(_value: T): void {}

// Never invoked — type-level assertions only.
export function _vaultCoreSurface(): void {
  const root: string | null = findRoot(process.cwd(), { create: false });
  expectType<string>(initVault("/tmp/repo"));

  const opts: RecordOptions = {
    scope: "checkout",
    phase: "build",
    claim: "unit-tests-pass",
    kind: "test-run",
    source: "npm test",
    criteria: "the unit suite exits 0 with no skipped specs",
    run: true,
    verifier: "exit_code_eq:0",
    actor: "worker-claude",
    cwd: "/tmp/repo",
  };
  const rec: RecordResult = record(root!, opts);
  expectType<string>(rec.envelope_hash);
  expectType<CriteriaAuthor>(rec.criteria_authored_by);
  expectType<VerifierStatus | "n/a">(rec.status_at_record);
  expectType<string>(rec.payload_sha256);

  const v: VerifyResult = verify(root!, rec.id);
  expectType<boolean>(v.hash_ok);
  expectType<VerifierStatus>(v.status);
  expectType<boolean>(v.rederived);
  expectType<LatestAttestationSummary | null | undefined>(v.latest_attestation);

  const ins: InspectResult = inspect(root!, rec.id);
  if (!("error" in ins)) {
    const ok: InspectSuccess = ins;
    expectType<{ text: string; json: unknown }>(ok.evidence);
    expectType<ActorSource | null>(ok.created_by_source);
  }

  const attOpts: AttestOptions = {
    opinion: "pass",
    evaluator: "judge-gemini",
    rationale: "criteria verifiably cleared",
    model: "google/gemini-3-pro",
    allowWeakWorkerIdentity: false,
  };
  const att: AttestResult = attest(root!, rec.id, attOpts);
  expectType<Opinion>(att.opinion);
  const log: Attestation[] = listAttestations(root!, rec.id);
  expectType<boolean>(log[0]!.worker_identity_weak);
  expectType<ActorSource>(log[0]!.evaluator_source);

  const claimPin: ContractClaim = {
    claim_id: "unit-tests-pass",
    kind: "test-run",
    verifier: { kind: "exit_code_eq", params: { code: 0 } },
    require_attestation: true,
  };
  const spec: ContractSpec = { required_evidence: [claimPin], origin: "crew" };
  expectType<{ contract_version: string }>(declareContract(root!, "checkout", "build", spec));
  expectType<{ contract_version: string }>(declareContract(root!, "checkout", "build", [claimPin]));

  const entries: VaultEntry[] = listEntries(root!, "checkout", "build");
  expectType<"active" | "superseded">(entries[0]!.state);
  expectType<Verifier | null>(entries[0]!.verifier);

  const cc: CrossCheckResult = crossCheck(root!, "checkout", "build", { withAttestations: true });
  expectType<"PASS" | "REJECT" | "ERROR">(cc.overall);
  const claim: CrossCheckClaim = cc.claims[0]!;
  expectType<CrossCheckClaimResult>(claim.result);
  expectType<VerifierStatus | undefined>(claim.verifier_status);

  expectType<{ new_id: string; old_id: string }>(supersede(root!, rec.id, opts));

  const parsed: Verifier = parseVerifier("regex_match:[0-9a-f]{40}");
  expectType<VerifierParams>(parsed.params);
  expectType<RecordResult>(deepRecord(root!, opts));
  expectType<CrossCheckResult>(deepCrossCheck(root!, "checkout", "build"));
}

export function _hashIdVerifierSurface(): void {
  expectType<string>(sha256("bytes"));
  expectType<string>(sha256(new Uint8Array([1, 2, 3])));
  expectType<string>(canonical({ b: 1, a: [2, 3] }));
  const fields: EnvelopeFields = {
    scope: "s",
    phase: "p",
    claim_id: "c",
    kind: "k",
    source: "cmd",
    verifier: null,
    criteria_sha256: "0".repeat(64),
    payload_sha256: "f".repeat(64),
  };
  expectType<string>(envelopeHash(fields));
  expectType<string>(newId());
  expectType<string>(deepSha256("x"));
  expectType<string>(deepNewId());

  const view: PayloadView = { text: "{}", json: {}, raw: new Uint8Array() };
  const kind: VerifierKind = "exit_code_eq";
  const def: VerifierDef = VERIFIERS[kind];
  expectType<"deterministic">(def.determinism);
  const ctx: VerifierContext = { repoRoot: "/tmp/repo" };
  const outcome: VerifierOutcome = runVerifier({ kind: "jq_pred", params: { expr: ".ok" } }, view, ctx);
  expectType<VerifierStatus>(outcome.status);
  expectType<string>(outcome.detail);
  expectType<VerifierOutcome>(deepRunVerifier({ kind }, view));
}

export async function _busSurface(): Promise<void> {
  const publish: BusPublisher = await initBus("/tmp/repo");
  publish("wicked.test.evidence.recorded", "vault.record", { id: "x" });
  expectType<BusPublisher>(await deepInitBus());
}

export function _manifestSurface(): void {
  expectType<string>(MANIFEST_VERSION);
  expectType<string>(MV2);
  expectType<Verdict>(VERDICT_VALUES[0]);
  expectType<Verdict>(VV2[3]);

  const opts: BuildManifestOptions = {
    runRecord: { id: "run-1", project_id: "p-1", scenario_id: "s-1", status: "passed", started_at: "2026-08-11T00:00:00Z", finished_at: "2026-08-11T00:01:00Z" },
    scenarioRecord: { name: "export-csv" },
    verdictRecord: { verdict: "PASS", reviewer: "acceptance-test-reviewer" },
    evidenceDir: "/tmp/evidence/run-1",
    qeVersion: "0.2.0",
  };
  // Legacy alias still type-checks for one release cycle.
  const legacyOpts: BuildManifestOptions = { ...opts, qeVersion: undefined, wickedTestingVersion: "0.1.0" };
  void legacyOpts;
  const { manifest, path } = buildManifest(opts);
  expectType<EvidenceManifest>(manifest);
  expectType<string>(path);
  expectType<RunStatus>(manifest.status);
  expectType<ManifestArtifact[]>(manifest.artifacts);
  expectType<VerdictEquivalence | undefined>(manifest.verdict.equivalence);
  expectType<{ manifest: EvidenceManifest; path: string }>(manifestBuild(opts));
}
