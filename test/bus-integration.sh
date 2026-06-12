#!/usr/bin/env bash
# Prove the wicked-bus integration on three axes, WITHOUT depending on
# wicked-bus's native better-sqlite3 build (which may not match the running
# Node — and must never be a hard dependency of the vault anyway):
#
#   1. GRACEFUL  — with wicked-bus unresolvable, vault commands still work
#                  (clean JSON, correct exit code, no bus noise).
#   2. VALID     — every event the vault emits passes wicked-bus's OWN
#                  validateEvent() (the real lib/validate.js, pure JS).
#   3. EMITTED   — through a stub wicked-bus resolved from cwd/node_modules,
#                  the vault actually calls emit() with the right event_type /
#                  domain / subdomain for record, declare-contract, cross-check.
#
# Axes 2 + 3 give executable proof of the vault's side of the contract on any
# Node version. A real end-to-end write into a live bus uses the identical
# emit(db, config, event) API exercised here.
set -u

# Vault bin resolved relative to this script (portable: local + CI). The bus
# repo is an external sibling — absent in CI, the bus-specific halves skip.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/.." && pwd)"
VAULT="node $ROOT/bin/wicked-vault.mjs"
BUS_DIR="$HOME/Projects/wicked-bus"
FAILED=0

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
# Never touch a real bus, even if a stub path leaks through.
export WICKED_BUS_DATA_DIR="$WORK/bus-data"

# ---------------------------------------------------------------------------
echo "=== 1. graceful degradation (bus NOT resolvable from a bare temp dir) ==="
cd "$WORK" || exit 2
$VAULT init >/dev/null
OUT=$($VAULT record --scope t --phase build --claim c --kind test-run \
  --source "true" --criteria "exits 0" --verifier "exit_code_eq:0" --run); RC=$?
echo "$OUT"
if [ "$RC" -eq 0 ] && printf '%s' "$OUT" | grep -q '"id"'; then
  echo "  -> PASS: record works with no bus, exit 0, clean JSON"
else
  echo "  -> FAIL: record did not behave standalone (exit=$RC)"; FAILED=1
fi
echo

# ---------------------------------------------------------------------------
echo "=== 2. event validity against wicked-bus's real validateEvent() ==="
if [ -f "$BUS_DIR/lib/validate.js" ]; then
  node -e "
    const { validateEvent } = await import('$BUS_DIR/lib/validate.js');
    const events = [
      ['wicked.evidence.recorded',   'vault.record'],
      ['wicked.evidence.superseded', 'vault.supersede'],
      ['wicked.evidence.tampered',   'vault.tamper'],
      ['wicked.evidence.attested',   'vault.attest'],
      ['wicked.contract.declared',   'vault.contract'],
      ['wicked.contract.checked',    'vault.cross_check'],
      ['wicked.claim.evaluated',     'vault.cross_check'],
    ];
    for (const [event_type, subdomain] of events) {
      validateEvent({ event_type, domain: 'wicked-vault', subdomain, payload: {} },
                    { max_payload_bytes: 1048576 });
      console.log('  ok:', event_type, '(' + subdomain + ')');
    }
  " && echo "  -> PASS: all 7 vault events satisfy the bus schema" \
    || { echo "  -> FAIL: an event was rejected by validateEvent"; FAILED=1; }
else
  echo "  SKIP: $BUS_DIR/lib/validate.js not found"
fi
echo

# ---------------------------------------------------------------------------
echo "=== 3. emission through a stub wicked-bus (cwd/node_modules) ==="
# A stub module that records every emit() to a file — proves the vault's
# resolution + initBus + publish path fires the right events, no native dep.
PROJ="$WORK/proj"
STUB="$PROJ/node_modules/wicked-bus"
mkdir -p "$STUB"
export VAULT_EMIT_LOG="$WORK/emitted.jsonl"
: > "$VAULT_EMIT_LOG"

# Mirror wicked-bus's DUAL cjs/esm exports map. The real emit/openDb live in the
# ESM entry; the CJS entry is a shim that throws on access. This is the exact
# shape that exposed the cwd-resolution bug — `require.resolve` picks the CJS
# shim, so the vault MUST import the ESM entry. If resolution regresses to the
# shim, the throwing getter -> no usable emit -> the assertion below fails.
cat > "$STUB/package.json" <<'JSON'
{ "name": "wicked-bus", "version": "0.0.0-stub", "type": "module",
  "exports": { ".": { "import": "./index.mjs", "require": "./index.cjs" } } }
JSON
cat > "$STUB/index.mjs" <<'JS'
import { appendFileSync } from 'node:fs';
export function loadConfig() { return { stub: true }; }
export function openDb() { return { stub: true }; }
export function resolveDbPath() { return process.env.WICKED_BUS_DATA_DIR + '/bus.db'; }
export function emit(_db, _config, event) {
  appendFileSync(process.env.VAULT_EMIT_LOG, JSON.stringify(event) + '\n');
  return { event_id: 1, idempotency_key: 'stub' };
}
JS
cat > "$STUB/index.cjs" <<'JS'
// CJS shim — mirrors wicked-bus. If the vault loads THIS instead of index.mjs,
// resolution regressed to the require condition; accessing emit throws.
module.exports = new Proxy({}, { get() {
  throw new Error('stub CJS shim loaded — vault picked the require condition (resolution regression)');
} });
JS

cd "$PROJ" || exit 2
$VAULT init >/dev/null
AID=$($VAULT record --scope ship --phase release --claim tests-pass --kind test-run --actor "worker-agent" \
  --source "true" --criteria "all unit tests pass (exit 0)" --verifier "exit_code_eq:0" --run \
  | python3 -c "import json,sys;print(json.load(sys.stdin)['id'])")
# independent attestation (evaluator distinct from the explicit --actor worker)
# -> wicked.evidence.attested
$VAULT attest "$AID" --opinion pass --rationale "independently confirmed" \
  --evaluator "council-reviewer" --model "gemini/2.5-pro" >/dev/null
cat > "$PROJ/contract.json" <<'JSON'
{ "required_evidence": [
  { "claim_id": "tests-pass", "kind": "test-run", "criteria": "all unit tests pass (exit 0)",
    "verifier": { "kind": "exit_code_eq" }, "required": true } ] }
JSON
$VAULT declare-contract --scope ship --phase release --spec "$PROJ/contract.json" >/dev/null
$VAULT cross-check --scope ship --phase release >/dev/null

echo "  captured emit() calls:"
sed 's/^/    /' "$VAULT_EMIT_LOG"
node -e "
  const fs = require('node:fs');
  const lines = fs.readFileSync(process.env.VAULT_EMIT_LOG, 'utf8').trim().split('\n').filter(Boolean);
  const evs = lines.map(JSON.parse);
  const seen = new Set(evs.map(e => e.event_type));
  const need = ['wicked.evidence.recorded', 'wicked.evidence.attested', 'wicked.contract.declared', 'wicked.contract.checked'];
  const allWickedVault = evs.every(e => e.domain === 'wicked-vault');
  const missing = need.filter(t => !seen.has(t));
  if (missing.length || !allWickedVault) {
    console.error('  -> FAIL: missing', missing, 'domain-ok=' + allWickedVault); process.exit(1);
  }
  const cc = evs.find(e => e.event_type === 'wicked.contract.checked');
  if (cc.payload.overall !== 'PASS') {
    console.error('  -> FAIL: cross-check payload.overall=' + cc.payload.overall); process.exit(1);
  }
  const att = evs.find(e => e.event_type === 'wicked.evidence.attested');
  if (att.payload.opinion !== 'pass' || att.payload.evaluator !== 'council-reviewer') {
    console.error('  -> FAIL: attested event payload wrong', att.payload); process.exit(1);
  }
  console.log('  -> PASS: record + attest + declare-contract + cross-check emitted; domain=wicked-vault; overall=PASS');
" || FAILED=1
echo

echo "=== SUMMARY ==="
if [ "$FAILED" -eq 0 ]; then echo "bus-integration: OK"; else echo "bus-integration: FAILURES"; fi
exit "$FAILED"
