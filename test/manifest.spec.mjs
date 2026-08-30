/**
 * test/manifest.spec.mjs — evidence-manifest 2.1 twin-sync proofs (XC-4).
 *
 * wicked-vault vendors the evidence-manifest twin (lib/manifest.mjs mirrors
 * wicked-ledger's lib/manifest.mjs; schemas/evidence.json is the vendored
 * JSON-schema copy of the same contract). wicked-ledger 0.4.0 moved the
 * contract to manifest 2.1 (optional scenario_evidence block + claim_level
 * enum) — a MINOR bump, so BOTH generations must keep validating here:
 *
 *   1. a 2.1 bundle carrying scenario_evidence validates — against the JS
 *      twin (validateManifest) AND against schemas/evidence.json (the
 *      pre-sync schema's `additionalProperties: false` rejected it)
 *   2. a 2.0 bundle (no scenario_evidence) still validates against both
 *   3. junk still rejects: bad claim_level, missing required trio, the
 *      honest-cap invariant (overall claim stronger than the weakest leg),
 *      garbage input, unknown top-level keys (producer integrity intact)
 *
 * Run via test/manifest.sh (the bash proof wrapper). Uses a TEMP dir only.
 */

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

// Root barrel must re-export the full 2.1 surface.
import {
  buildManifest,
  validateManifest,
  MANIFEST_VERSION,
  VERDICT_VALUES,
  CLAIM_LEVELS,
} from "../index.mjs";

const require = createRequire(import.meta.url);

let failures = 0;
function ok(label) {
  process.stdout.write(`  -> PASS: ${label}\n`);
}
function check(label, fn) {
  try {
    fn();
    ok(label);
  } catch (err) {
    failures++;
    process.stdout.write(`  -> FAIL: ${label}\n    ${err && err.stack ? err.stack : err}\n`);
  }
}

// --- ajv against schemas/evidence.json (draft 2020-12) -----------------------
const Ajv2020Mod = require("ajv/dist/2020");
const Ajv2020 = Ajv2020Mod.default ?? Ajv2020Mod;
const addFormatsMod = require("ajv-formats");
const addFormats = addFormatsMod.default ?? addFormatsMod;
const schema = JSON.parse(readFileSync(new URL("../schemas/evidence.json", import.meta.url), "utf8"));
const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
const schemaValidate = ajv.compile(schema);
const schemaErrors = () => (schemaValidate.errors ?? []).map((e) => `${e.instancePath} ${e.message}`).join("; ");

// --- fixtures ----------------------------------------------------------------
const RUN_ID = "0f0e46f8-9c1b-4a6e-8f57-0d9d3c2b1a00";
const PROJECT_ID = "6b1d2c3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e";
const SCENARIO_ID = "a1b2c3d4-e5f6-4a5b-8c7d-0e1f2a3b4c5d";

const runRecord = {
  id: RUN_ID,
  project_id: PROJECT_ID,
  scenario_id: SCENARIO_ID,
  status: "passed",
  started_at: "2026-08-29T00:00:00.000Z",
  finished_at: "2026-08-29T00:01:00.000Z",
};
const scenarioRecord = { name: "S11 — terminal state + acceptance read", source_path: "scenarios/s11.md" };
const verdictRecord = { verdict: "PASS", reviewer: "acceptance-test-reviewer", created_at: "2026-08-29T00:02:00.000Z" };

const scenarioEvidence21 = {
  scenario: "S11 — terminal state + acceptance read",
  status: "PASS",
  claim_level: "machinery-verified",
  ui_steps: ["Completed badge rendered", "Evidence tab populated"],
  screenshots: ["S11-terminal-run.png"],
  wire_evidence: { events: 157, last: "sessionCompleted" },
  db_evidence: "ndjson tail shows sessionCompleted",
  terminal_state_proof: "sessionCompleted in the durable log",
  notes: ["acceptance leg API-substituted (disclosed)"],
  legs: [
    { leg: "ui", claim_level: "certified" },
    { leg: "acceptance", claim_level: "machinery-verified", reason: "API-only by design" },
  ],
};

// A literal 2.0-generation bundle, as an older producer wrote it to disk.
const bundle20 = {
  manifest_version: "2.0.0",
  run_id: RUN_ID,
  project_id: PROJECT_ID,
  scenario_id: SCENARIO_ID,
  scenario_name: "export-csv",
  started_at: "2026-08-29T00:00:00.000Z",
  finished_at: "2026-08-29T00:01:00.000Z",
  duration_ms: 60000,
  status: "passed",
  verdict: { value: "PASS", reviewer: "acceptance-test-reviewer", recorded_at: "2026-08-29T00:02:00.000Z" },
  environment: { os: "darwin 25.0.0", node: "22.0.0", qe_version: "0.2.0" },
  artifacts: [],
};

const work = mkdtempSync(join(tmpdir(), "wicked-vault-manifest-"));
process.stdout.write(`# manifest proofs work dir: ${work}\n`);

try {
  check("twin is on manifest 2.1 (MANIFEST_VERSION + CLAIM_LEVELS in lockstep with wicked-ledger 0.4.0)", () => {
    assert.equal(MANIFEST_VERSION, "2.1.0");
    assert.deepEqual([...CLAIM_LEVELS], ["certified", "machinery-verified", "skipped"]);
    assert.deepEqual([...VERDICT_VALUES], ["PASS", "FAIL", "PARTIAL", "CONDITIONAL", "INCONCLUSIVE", "N-A", "SKIP"]);
  });

  // --- 1. a 2.1 bundle with scenario_evidence validates -----------------------
  let manifest21;
  check("2.1: buildManifest carries a conforming scenario_evidence block and writes it", () => {
    const dir = join(work, "run-21");
    const { manifest, path } = buildManifest({
      runRecord, scenarioRecord, verdictRecord,
      evidenceDir: dir,
      qeVersion: "0.2.0",
      cli: "claude",
      scenarioEvidence: scenarioEvidence21,
    });
    manifest21 = manifest;
    assert.equal(manifest.manifest_version, "2.1.0");
    assert.equal(manifest.scenario_evidence.claim_level, "machinery-verified");
    assert.equal(manifest.scenario_evidence.legs.length, 2);
    assert.ok(existsSync(path));
    const onDisk = JSON.parse(readFileSync(path, "utf8"));
    assert.deepEqual(onDisk.scenario_evidence, scenarioEvidence21);
  });

  check("2.1: the JS twin validates the bundle (validateManifest ok)", () => {
    const res = validateManifest(manifest21);
    assert.equal(res.ok, true, JSON.stringify(res.violations));
    assert.deepEqual(res.violations, []);
  });

  check("2.1: schemas/evidence.json accepts the bundle (the pre-sync additionalProperties:false rejection is gone)", () => {
    assert.equal(schemaValidate(manifest21), true, schemaErrors());
  });

  // --- 2. a 2.0 bundle still validates ----------------------------------------
  check("2.0: a literal 2.0.0 bundle (no scenario_evidence) still validates against the JS twin", () => {
    const res = validateManifest(bundle20);
    assert.equal(res.ok, true, JSON.stringify(res.violations));
  });

  check("2.0: schemas/evidence.json still accepts the 2.0.0 bundle", () => {
    assert.equal(schemaValidate(bundle20), true, schemaErrors());
  });

  check("2.0-shaped output: buildManifest without scenarioEvidence emits no scenario_evidence key and validates", () => {
    const dir = join(work, "run-20-shaped");
    const { manifest } = buildManifest({ runRecord, scenarioRecord, verdictRecord, evidenceDir: dir, qeVersion: "0.2.0" });
    assert.ok(!("scenario_evidence" in manifest));
    assert.equal(validateManifest(manifest).ok, true);
    assert.equal(schemaValidate(manifest), true, schemaErrors());
  });

  // --- 3. junk still rejects ---------------------------------------------------
  check("junk: buildManifest fails loud on an invalid claim_level (never writes)", () => {
    const dir = join(work, "run-junk");
    assert.throws(
      () => buildManifest({
        runRecord, scenarioRecord, verdictRecord,
        evidenceDir: dir,
        qeVersion: "0.2.0",
        scenarioEvidence: { scenario: "S1", status: "PASS", claim_level: "vibes" },
      }),
      /invalid claim_level 'vibes'/,
    );
    assert.ok(!existsSync(join(dir, "manifest.json")));
  });

  check("junk: honest-cap invariant — overall claim can't beat the weakest leg", () => {
    const bad = {
      ...bundle20,
      manifest_version: "2.1.0",
      scenario_evidence: {
        scenario: "S9",
        status: "PASS",
        claim_level: "certified", // stronger than the machinery-verified leg
        legs: [{ leg: "graph-wires", claim_level: "machinery-verified" }],
      },
    };
    const res = validateManifest(bad);
    assert.equal(res.ok, false);
    assert.ok(res.violations.some((v) => v.field === "scenario_evidence.claim_level"), JSON.stringify(res.violations));
  });

  check("junk: scenario_evidence missing its required trio rejects in BOTH validators", () => {
    const bad = { ...bundle20, manifest_version: "2.1.0", scenario_evidence: { notes: "no trio here" } };
    const res = validateManifest(bad);
    assert.equal(res.ok, false);
    assert.equal(schemaValidate(bad), false);
  });

  check("junk: garbage input rejects in BOTH validators (never throws in validateManifest)", () => {
    assert.equal(validateManifest(null).ok, false);
    assert.equal(validateManifest("nope").ok, false);
    assert.equal(validateManifest({ totally: "junk" }).ok, false);
    assert.equal(schemaValidate({ totally: "junk" }), false);
  });

  check("junk: unknown top-level keys still reject under the schema's producer-integrity guard", () => {
    assert.equal(schemaValidate({ ...bundle20, made_up_key: true }), false);
  });
} finally {
  rmSync(work, { recursive: true, force: true });
}

if (failures > 0) {
  process.stdout.write(`manifest proofs: ${failures} FAILED\n`);
  process.exit(1);
}
process.stdout.write("manifest proofs: all passed\n");
