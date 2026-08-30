#!/usr/bin/env bash
# Evidence-manifest 2.1 twin-sync proofs (XC-4). wicked-ledger 0.4.0 moved the
# shared evidence-manifest contract to 2.1 (optional scenario_evidence block +
# claim_level enum); vault vendors the twin validator (lib/manifest.mjs) and
# the JSON-schema copy (schemas/evidence.json). Proves both generations:
#   1. a 2.1 bundle with scenario_evidence validates (JS twin AND JSON schema —
#      the pre-sync schema's additionalProperties:false rejected the block)
#   2. a 2.0 bundle still validates against both
#   3. junk still rejects (bad claim_level, missing trio, honest-cap
#      violations, garbage, unknown top-level keys)
# The proofs live in test/manifest.spec.mjs (node, temp dirs only); the ajv
# devDependency drives the schema half — run `npm install` first.
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/.." && pwd)"
exec node "$ROOT/test/manifest.spec.mjs"
