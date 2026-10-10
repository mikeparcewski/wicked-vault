#!/usr/bin/env bash
# Prove the full-contract pin, attestation-integrity and typed-obligation
# invariants at the CLI entry point (codex audit 2026-10-09):
#   FND-VLT-01  record + cross-check compare the FULL current contract pin
#               (kind, source, criteria, verifier kind AND params)
#   FND-VLT-02  an attestation whose stored hash no longer matches its tuple is
#               flagged corrupt and never satisfies a judgment obligation
#   FND-VLT-04  cross-check reports which obligations were satisfied
#               (integrity / judgment / vacuous) and a single contract_satisfied
set -u
export WICKED_VAULT_NO_BUS=1
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/.." && pwd)"
VAULT="node $ROOT/bin/wicked-vault.mjs"
FAILED=0
ok()  { echo "  -> PASS: $1"; }
bad() { echo "  -> FAIL: $1"; FAILED=1; }
# jget <python-expr over d>  — read JSON from stdin, print the expression.
jget() { python3 -c "import json,sys;d=json.load(sys.stdin);print($1)"; }

WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT; cd "$WORK" || exit 2
$VAULT init >/dev/null
printf '%s' '{"exit_code":1,"stdout":"tests failed"}' > capture.json
printf '%s' '{"exit_code":0,"stdout":"ok"}' > pass.json

pin() { # pin <scope> <json-claim>
  printf '%s' "{\"required_evidence\":[$2]}" > "spec-$1.json"
  $VAULT declare-contract --scope "$1" --phase build --spec "spec-$1.json" >/dev/null
}
rec() { # rec <scope> <artifact> <verifier> <source> <criteria> [kind]
  $VAULT record --scope "$1" --phase build --claim tests --kind "${6:-test-run}" --actor worker \
    --source "$4" --criteria "$5" --verifier "$3" --artifact "$2" 2>&1
}
CLAIM0='{"claim_id":"tests","kind":"test-run","criteria":"all tests must pass","source_pin":"npm test","verifier":{"kind":"exit_code_eq","params":{"code":0}}}'

echo "=== FND-VLT-01a: same verifier kind, weaker params is a G8 pin violation ==="
pin p1 "$CLAIM0"
OUT=$(rec p1 capture.json "exit_code_eq:1" "npm test" "all tests must pass")
echo "$OUT" | grep -q "G8 pin violation: verifier" \
  && ok "record rejects exit_code_eq:1 against a pinned exit_code_eq code 0" \
  || bad "record accepted a weaker verifier param: $OUT"
[ "$(ls .wicked-vault/entries | wc -l | tr -d ' ')" = "0" ] && ok "rejected record wrote no entry" || bad "rejected record left an entry"
echo

echo "=== FND-VLT-01b: exact-match pin still records and PASSes (positive control) ==="
rec p1 pass.json "exit_code_eq:0" "npm test" "all tests must pass" >/dev/null
R=$($VAULT cross-check --scope p1 --phase build)
[ "$(echo "$R" | jget "d['overall']")" = "PASS" ] && ok "exact pin -> PASS" || bad "exact pin did not PASS: $R"
echo

echo "=== FND-VLT-01b2: a pin that states no params pins the verifier kind only ==="
pin konly '{"claim_id":"tests","verifier":{"kind":"exit_code_eq"}}'
rec konly capture.json "exit_code_eq:1" "x" "y" >/dev/null
R=$($VAULT cross-check --scope konly --phase build)
[ "$(echo "$R" | jget "d['claims'][0].get('detail','')")" = "exit_code=1" ] && ok "kind-only pin binds the kind, the artifact's own params decide" || bad "kind-only pin wrong: $R"
echo

pin konly2 '{"claim_id":"tests","verifier":"{\"kind\":\"exit_code_eq\"}"}'
rec konly2 capture.json "exit_code_eq:1" "x" "y" >/dev/null
R=$($VAULT cross-check --scope konly2 --phase build)
[ "$(echo "$R" | jget "d['overall']")" = "PASS" ] && ok "JSON-string kind-only pin behaves like the object form" || bad "JSON-string kind-only pin wrong: $R"
pin missj '{"claim_id":"absent","require_attestation":true}'
R=$($VAULT cross-check --scope missj --phase build)
[ "$(echo "$R" | jget "d['obligations']['judgment']")" = "unsatisfied" ] && ok "missing artifact keeps its judgment obligation (unsatisfied)" || bad "missing-artifact judgment wrong: $R"
echo

echo "=== FND-VLT-01c: a stricter contract declared after capture fails closed ==="
# capture with no contract, then the consumer declares its bar
rec late capture.json "exit_code_eq:1" "test-fixture" "expected exit is one" >/dev/null
for variant in \
  '{"claim_id":"tests","verifier":{"kind":"exit_code_eq","params":{"code":0}}}:verifier' \
  '{"claim_id":"tests","source_pin":"npm test"}:source' \
  '{"claim_id":"tests","criteria":"all tests must pass"}:criteria' \
  '{"claim_id":"tests","kind":"build-log"}:kind'; do
  spec="${variant%:*}"; field="${variant##*:}"
  pin late "$spec"
  R=$($VAULT cross-check --scope late --phase build)
  overall=$(echo "$R" | jget "d['overall']"); detail=$(echo "$R" | jget "d['claims'][0].get('detail','')")
  if [ "$overall" != "PASS" ] && echo "$detail" | grep -q "contract pin mismatch: $field"; then
    ok "late $field pin -> $overall ($detail)"
  else
    bad "late $field pin not enforced: overall=$overall detail=$detail"
  fi
done
# compatible redeclaration: pins the artifact still matches -> PASS, version reported
pin late '{"claim_id":"tests","source_pin":"test-fixture","verifier":{"kind":"exit_code_eq","params":{"code":1}}}'
R=$($VAULT cross-check --scope late --phase build)
[ "$(echo "$R" | jget "d['overall']")" = "PASS" ] && ok "compatible late contract (pins match) -> PASS" || bad "compatible late contract rejected: $R"
echo

echo "=== FND-VLT-02: un-rehashed attestation mutation is detected ==="
pin judged '{"claim_id":"tests","require_attestation":true}'
AID=$(rec judged pass.json "exit_code_eq:0" "npm test" "all tests must pass" | jget "d['id']")
ATT=$($VAULT attest "$AID" --opinion pass --rationale "looked fine" --evaluator reviewer | jget "d['attestation_id']")
AF=".wicked-vault/attestations/$AID/$ATT.json"
R=$($VAULT cross-check --scope judged --phase build --with-attestations)
[ "$(echo "$R" | jget "d['overall']")" = "PASS" ] && ok "intact attestation -> PASS (positive control)" || bad "intact attestation did not PASS: $R"
cp "$AF" "$WORK/att.orig"
for mut in "d['evaluator']='   ';import hashlib;t={k:v for k,v in d.items() if k!='attestation_hash'};d['attestation_hash']=hashlib.sha256(json.dumps(t,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()" "d['rationale']='changed without rehash'" "d['opinion']='reject'" "d['evaluator']='someone-else'" "d['artifact_id']='01OTHER'"; do
  cp "$WORK/att.orig" "$AF"
  python3 -c "import json;p='$AF';d=json.load(open(p));$mut;json.dump(d,open(p,'w'))"
  R=$($VAULT cross-check --scope judged --phase build --with-attestations)
  overall=$(echo "$R" | jget "d['overall']"); res=$(echo "$R" | jget "d['claims'][0]['result']")
  V=$($VAULT verify "$AID")
  vc=$(echo "$V" | jget "len(d.get('corrupt_attestations') or [])")
  case "$mut" in *"'   '"*) echo "$V" | grep -q "empty evaluator identity" || vc="wrong-reason";; esac
  if [ "$overall" = "ERROR" ] && [ "$res" = "ERROR" ] && [ "$vc" = "1" ]; then
    ok "mutation [$mut] -> cross-check ERROR, verify flags 1 corrupt attestation"
  else
    bad "mutation [$mut] not detected: overall=$overall result=$res verify_corrupt=$vc"
  fi
done
L=$($VAULT attestations "$AID")
[ "$(echo "$L" | jget "d[0]['attestation_ok']")" = "False" ] && ok "attestations lists the record with attestation_ok=false" || bad "attestations did not flag: $L"
cp "$WORK/att.orig" "$AF"
printf '%s' '{not json' > ".wicked-vault/attestations/$AID/zzz-garbage.json"
R=$($VAULT cross-check --scope judged --phase build --with-attestations)
[ "$(echo "$R" | jget "d['overall']")" = "ERROR" ] && ok "unparseable attestation file -> ERROR (fail closed)" || bad "unparseable attestation not flagged: $R"
rm -f ".wicked-vault/attestations/$AID/zzz-garbage.json"
echo

echo "=== FND-VLT-04: typed obligations ==="
R=$($VAULT cross-check --scope judged --phase build)
read -r ov integ judg sat <<<"$(echo "$R" | jget "d['overall'],d['obligations']['integrity'],d['obligations']['judgment'],d['contract_satisfied']" | tr -d "(),'")"
[ "$ov" = "PASS" ] && [ "$integ" = "satisfied" ] && [ "$judg" = "not_evaluated" ] && [ "$sat" = "False" ] \
  && ok "integrity-only with require_attestation: overall PASS but judgment not_evaluated, contract_satisfied=false" \
  || bad "integrity-only obligations wrong: $ov $integ $judg $sat"
R=$($VAULT cross-check --scope judged --phase build --with-attestations)
read -r ov integ judg sat <<<"$(echo "$R" | jget "d['overall'],d['obligations']['integrity'],d['obligations']['judgment'],d['contract_satisfied']" | tr -d "(),'")"
[ "$ov" = "PASS" ] && [ "$integ" = "satisfied" ] && [ "$judg" = "satisfied" ] && [ "$sat" = "True" ] \
  && ok "judgment mode satisfied: contract_satisfied=true" || bad "judgment-mode obligations wrong: $ov $integ $judg $sat"
R=$($VAULT cross-check --scope p1 --phase build)
[ "$(echo "$R" | jget "d['obligations']['judgment']")" = "not_required" ] && [ "$(echo "$R" | jget "d['contract_satisfied']")" = "True" ] \
  && ok "no judgment required: judgment not_required, contract_satisfied=true" || bad "not_required case wrong: $R"
pin empty ''
R=$($VAULT cross-check --scope empty --phase build)
read -r ov integ sat <<<"$(echo "$R" | jget "d['overall'],d['obligations']['integrity'],d['contract_satisfied']" | tr -d "(),'")"
[ "$ov" = "PASS" ] && [ "$integ" = "vacuous" ] && [ "$sat" = "False" ] \
  && ok "empty contract: overall PASS (unchanged) but integrity vacuous, contract_satisfied=false" \
  || bad "empty contract obligations wrong: $ov $integ $sat"
echo

[ "$FAILED" = "0" ] && echo "ALL CONTRACT-INTEGRITY PROOFS PASS" || { echo "CONTRACT-INTEGRITY PROOFS FAILED"; exit 1; }
