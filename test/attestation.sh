#!/usr/bin/env bash
# Prove the ADR-0002 judgment tier + criteria binding, deterministically and
# WITHOUT a model (the CLI never calls one). Covers:
#   1. criteria are mandatory (G10/D1)
#   2. criteria are bound into the envelope (tamper the bar -> verify rejects)
#   3. attest is independent (evaluator==creator -> rejected, G10/D4)
#   4. attest is fail-closed (tampered artifact -> refused, G5)
#   5. attest is append-only + records provenance (evaluator/model/hash)
#   6. verify surfaces the latest opinion (integrity tier, model-free)
#   7. contract require_attestation: cross-check --with-attestations gates;
#      --integrity-only default stays CI-safe
#   8. contract-pinned criteria upgrade provenance; a mismatch is a G8 downgrade
set -u
export WICKED_VAULT_NO_BUS=1
# Resolve the vault bin relative to THIS script so the proof runs anywhere
# (local checkout, CI runner) — not a hardcoded ~/Projects path.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/.." && pwd)"
VAULT="node $ROOT/bin/wicked-vault.mjs"
FAILED=0
field() { python3 -c "import json,sys;print(json.load(sys.stdin).get('$1',''))"; }
ok()   { echo "  -> PASS: $1"; }
bad()  { echo "  -> FAIL: $1"; FAILED=1; }

WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT; cd "$WORK" || exit 2
$VAULT init >/dev/null

echo "=== 1. criteria mandatory ==="
$VAULT record --scope s --phase build --claim c --kind test-run --source "true" --run >/dev/null 2>&1 \
  && bad "record without --criteria should have failed" || ok "record rejects missing --criteria"
echo

echo "=== 2. criteria bound into the envelope ==="
ID=$($VAULT record --scope s --phase build --claim done --kind test-run \
  --source "true" --criteria "all tests pass" --verifier "exit_code_eq:0" --run | field id)
[ -n "$ID" ] && ok "recorded $ID" || bad "record produced no id"
ENTRY=".wicked-vault/entries/$ID.json"
python3 -c "import json;p='$ENTRY';d=json.load(open(p));d['acceptance_criteria']='anything goes';json.dump(d,open(p,'w'))"
CRIT_OK=$($VAULT verify "$ID" | field criteria_ok)
STATUS=$($VAULT verify "$ID" | field status)
[ "$CRIT_OK" = "False" ] && [ "$STATUS" = "fail" ] && ok "tampering the criteria text breaks verify (criteria_ok=$CRIT_OK status=$STATUS)" \
  || bad "criteria tamper not detected (criteria_ok=$CRIT_OK status=$STATUS)"
echo

# fresh artifact for the remaining (untampered) checks
ID=$($VAULT record --scope s --phase build --claim done --kind test-run \
  --source "true" --criteria "all tests pass" --verifier "exit_code_eq:0" --run | field id)

echo "=== 3. attest independence (evaluator must differ from creator) ==="
$VAULT attest "$ID" --opinion pass --rationale x --evaluator "$USER" >/dev/null 2>&1 \
  && bad "self-grade should have been rejected" || ok "attest rejects evaluator==created_by"
echo

echo "=== 4. attest records an independent opinion + provenance ==="
ATT=$($VAULT attest "$ID" --opinion pass --rationale "independently verified" \
  --evaluator "gemini-reviewer" --model "gemini/2.5-pro")
AHASH=$(printf '%s' "$ATT" | field attestation_hash)
[ -n "$AHASH" ] && ok "attested (hash $AHASH)" || bad "attest produced no hash"
LIST=$($VAULT attestations "$ID")
echo "$LIST" | python3 -c "import json,sys;a=json.load(sys.stdin)[0];assert a['evaluator']=='gemini-reviewer' and a['model']=='gemini/2.5-pro' and a['opinion']=='pass',a" \
  && ok "attestation log records evaluator + model + opinion" || bad "attestation provenance missing"
echo

echo "=== 5. verify surfaces the latest opinion (no model call) ==="
OP=$($VAULT verify "$ID" | python3 -c "import json,sys;print(json.load(sys.stdin)['latest_attestation']['opinion'])")
[ "$OP" = "pass" ] && ok "verify.latest_attestation.opinion=$OP" || bad "latest_attestation not surfaced ($OP)"
echo

echo "=== 6. attest is fail-closed against a tampered artifact ==="
TID=$($VAULT record --scope s --phase build --claim t --kind test-run --source "true" --criteria "exits 0" --verifier "exit_code_eq:0" --run | field id)
PSHA=$(python3 -c "import json;print(json.load(open('.wicked-vault/entries/$TID.json'))['payload_sha256'])")
python3 -c "import json;p='.wicked-vault/payloads/$PSHA';d=json.load(open(p));d['exit_code']=999;open(p,'w').write(json.dumps(d,sort_keys=True))"
$VAULT attest "$TID" --opinion pass --rationale x --evaluator "someone-else" >/dev/null 2>&1 \
  && bad "attest should refuse a tampered artifact" || ok "attest fail-closed on tampered evidence"
echo

echo "=== 7. contract require_attestation gates --with-attestations; integrity-only stays CI-safe ==="
cd "$(mktemp -d)"; $VAULT init >/dev/null
cat > c.json <<'JSON'
{ "required_evidence": [ { "claim_id": "done", "kind": "test-run", "criteria": "all tests pass",
  "require_attestation": true, "required": true } ] }
JSON
$VAULT declare-contract --scope s --phase build --spec c.json >/dev/null
AB=$($VAULT record --scope s --phase build --claim done --kind test-run \
  --source "true" --criteria "all tests pass" --verifier "exit_code_eq:0" --run | field criteria_authored_by)
[ "$AB" = "contract" ] && ok "contract-pinned criteria stamped criteria_authored_by=contract" \
  || bad "expected criteria_authored_by=contract, got $AB"

INTEG=$($VAULT cross-check --scope s --phase build | field overall)
[ "$INTEG" = "PASS" ] && ok "--integrity-only default = PASS (deterministic)" || bad "integrity-only overall=$INTEG"

WA_BEFORE=$($VAULT cross-check --scope s --phase build --with-attestations)
OVR=$(printf '%s' "$WA_BEFORE" | field overall)
R0=$(printf '%s' "$WA_BEFORE" | python3 -c "import json,sys;print(json.load(sys.stdin)['claims'][0]['result'])")
[ "$OVR" = "REJECT" ] && [ "$R0" = "UNATTESTED" ] && ok "--with-attestations before judging = REJECT/UNATTESTED" \
  || bad "expected REJECT/UNATTESTED, got $OVR/$R0"

DID=$($VAULT list --scope s --phase build | python3 -c "import json,sys;print(json.load(sys.stdin)[0]['id'])")
$VAULT attest "$DID" --opinion pass --rationale "meets the bar" --evaluator "codex-reviewer" --model "codex/gpt-5.5" >/dev/null
OVR2=$($VAULT cross-check --scope s --phase build --with-attestations | field overall)
[ "$OVR2" = "PASS" ] && ok "--with-attestations after independent pass = PASS" || bad "expected PASS, got $OVR2"
echo

echo "=== 8. a criteria that contradicts the contract pin is a G8 downgrade ==="
$VAULT record --scope s --phase build --claim done --kind test-run \
  --source "true" --criteria "literally anything" --verifier "exit_code_eq:0" --run >/dev/null 2>&1 \
  && bad "mismatched criteria should be rejected (G8)" || ok "record rejects criteria != contract pin (G8)"
echo

echo "=== SUMMARY ==="
[ "$FAILED" -eq 0 ] && echo "attestation: OK" || echo "attestation: FAILURES"
exit "$FAILED"
