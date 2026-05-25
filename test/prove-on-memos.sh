#!/usr/bin/env bash
# Phase-1 proof: exercise the real record -> verify -> cross-check loop on a
# real repo (memos), demonstrating G2 (tamper-evident hash), G3 (never trust
# the cached status), G5 (fail-closed), G8 (contract pin), G9 (mechanical
# cross-check). Uses only real git/shell commands — no go toolchain needed.
set -u
# This proof asserts on stdout JSON + exit codes only; keep it deterministic and
# free of bus side effects (see test/bus-integration.sh for the bus path).
export WICKED_VAULT_NO_BUS=1
REPO="${1:-$HOME/Projects/memos}"
# Vault bin resolved relative to this script (portable). REPO is an external
# repo the proof runs against (defaults to ~/Projects/memos; pass one as $1).
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/.." && pwd)"
VAULT="node $ROOT/bin/wicked-vault.mjs"
cd "$REPO" || { echo "no repo at $REPO"; exit 2; }
rm -rf .wicked-vault

field() { python3 -c "import json,sys;print(json.load(sys.stdin).get('$1',''))"; }

echo "### 0. init vault inside $REPO"
$VAULT init

echo; echo "### 1. HONEST record — real HEAD commit; verifier regex_match 40-hex"
H=$($VAULT record --scope demo --phase build --claim head-commit --kind test-run \
      --source "git rev-parse HEAD" --criteria "HEAD resolves to a 40-hex commit sha" \
      --verifier "regex_match:[0-9a-f]{40}" --run)
echo "$H"
HID=$(printf '%s' "$H" | field id)

echo; echo "### 1b. verify honest  -> expect status=pass hash_ok=true exit=0"
$VAULT verify "$HID"; echo "exit=$?"

echo; echo "### 2. FAILING record — command 'false' (exit 1), claim 'tests-pass', verifier exit_code_eq:0"
F=$($VAULT record --scope demo --phase build --claim tests-pass --kind test-run \
      --source "false" --criteria "the test command exits 0" --verifier "exit_code_eq:0" --run)
echo "$F"
FID=$(printf '%s' "$F" | field id)
echo "(status_at_record is informational: $(printf '%s' "$F" | field status_at_record))"

ENTRY=".wicked-vault/entries/$FID.json"

echo; echo "### 3. G3 — flip the CACHED status to 'pass' (the lie). verify must STILL fail."
python3 -c "import json;p='$ENTRY';d=json.load(open(p));d['status_at_record']='pass';json.dump(d,open(p,'w'),indent=2)"
echo "edited status_at_record -> 'pass'. re-deriving:"
$VAULT verify "$FID"; echo "exit=$?  (hash_ok stays true; status re-derived as fail; cached lie ignored)"

echo; echo "### 4. G2 — tamper the PAYLOAD blob to fake exit_code=0. verify must detect hash_ok=false."
PSHA=$(python3 -c "import json;print(json.load(open('$ENTRY'))['payload_sha256'])")
python3 -c "
import json
p='.wicked-vault/payloads/$PSHA'
d=json.load(open(p)); d['exit_code']=0; d['stdout']='all tests pass'
open(p,'w').write(json.dumps(d, sort_keys=True))
"
echo "payload rewritten to exit_code=0. verify:"
$VAULT verify "$FID"; echo "exit=$?  (hash_ok=false -> REJECT despite the faked pass)"

echo; echo "### 5. G9 — declare a contract requiring tests-pass, then cross-check"
CONTRACT="$(mktemp)"
cat > "$CONTRACT" <<'JSON'
{ "required_evidence": [
  { "claim_id": "tests-pass", "kind": "test-run",
    "verifier": { "kind": "exit_code_eq", "params": { "code": 0 } }, "required": true } ] }
JSON
$VAULT declare-contract --scope demo --phase build --spec "$CONTRACT"
echo "cross-check (tests-pass artifact is tampered) -> expect overall=REJECT exit=1:"
$VAULT cross-check --scope demo --phase build; echo "exit=$?"

echo; echo "### 6. HONEST FIX — record a genuinely passing tests-pass artifact ('true'), re-cross-check"
$VAULT record --scope demo --phase build --claim tests-pass --kind test-run \
      --source "true" --criteria "the test command exits 0" --verifier "exit_code_eq:0" --run > /dev/null
echo "cross-check again -> expect overall=PASS exit=0 (latest active passing artifact wins):"
$VAULT cross-check --scope demo --phase build; echo "exit=$?"

echo; echo "### cleanup"
rm -rf .wicked-vault "$CONTRACT"
echo "done."
