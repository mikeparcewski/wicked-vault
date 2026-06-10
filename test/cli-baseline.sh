#!/usr/bin/env bash
# Prove the out-of-the-box CLI contract — the vault must be useful with ZERO
# ceremony in a repo that has never seen it. Covers:
#   1. --version / --help work outside any repo (no vault required, exit 0)
#   2. record auto-creates .wicked-vault/ (init is optional scaffolding)
#   3. list in a vault-less repo answers truthfully: [] (exit 0, not an error)
#   4. reads/gates in a vault-less repo fail closed with a precise,
#      machine-readable reason (code: VAULT_NOT_FOUND), never "run init"
#      ceremony that wouldn't produce evidence anyway
#   5. cross-check in a vault-less repo reports overall: FAIL (truthful gate
#      signal for wicked-loom, which reads `overall` from stdout JSON)
set -u
export WICKED_VAULT_NO_BUS=1
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/.." && pwd)"
VAULT="node $ROOT/bin/wicked-vault.mjs"
FAILED=0
field() { python3 -c "import json,sys;print(json.load(sys.stdin).get('$1',''))"; }
ok()   { echo "  -> PASS: $1"; }
bad()  { echo "  -> FAIL: $1"; FAILED=1; }

WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT; cd "$WORK" || exit 2

echo "=== 1. --version / --help need no vault ==="
PKG_VER="$(field version < "$ROOT/package.json")"
CLI_VER="$($VAULT --version)" && [ "$CLI_VER" = "$PKG_VER" ] \
  && ok "--version prints package version ($CLI_VER) outside a repo" \
  || bad "--version failed or mismatched (cli='$CLI_VER' pkg='$PKG_VER')"
$VAULT -v >/dev/null && ok "-v exits 0" || bad "-v failed"
$VAULT --help >/dev/null && ok "--help exits 0" || bad "--help failed"
echo

echo "=== 2. record auto-creates the vault ==="
echo "hello" > a.txt
$VAULT record --scope s --phase build --claim c1 --kind file --source a.txt \
  --criteria "file exists" --artifact a.txt >/dev/null \
  && [ -d .wicked-vault ] \
  && ok "record created .wicked-vault/ without init" \
  || bad "record did not auto-create the vault"
echo

echo "=== 3. list without a vault answers [] ==="
FRESH="$(mktemp -d)"
OUT="$(cd "$FRESH" && $VAULT list --scope s)" && [ "$(echo "$OUT" | python3 -c 'import json,sys;print(json.load(sys.stdin))')" = "[]" ] \
  && ok "list -> [] exit 0 in a vault-less repo" \
  || bad "list should succeed with [] in a vault-less repo (got: $OUT)"
echo

echo "=== 4. reads fail closed with code VAULT_NOT_FOUND ==="
OUT="$(cd "$FRESH" && $VAULT verify some-id)" \
  && bad "verify should exit nonzero without a vault" \
  || { CODE="$(echo "$OUT" | field code)"; [ "$CODE" = "VAULT_NOT_FOUND" ] \
       && ok "verify fails closed with code VAULT_NOT_FOUND" \
       || bad "verify error lacks code VAULT_NOT_FOUND (got '$CODE')"; }
echo

echo "=== 5. cross-check reports a truthful gate FAIL ==="
CC="$(cd "$FRESH" && $VAULT cross-check --scope s --phase build)" \
  && bad "cross-check should exit nonzero without a vault" \
  || { [ "$(echo "$CC" | field overall)" = "FAIL" ] && [ "$(echo "$CC" | field code)" = "VAULT_NOT_FOUND" ] \
       && ok "cross-check -> overall FAIL + code VAULT_NOT_FOUND" \
       || bad "cross-check shape wrong (got: $CC)"; }
rm -rf "$FRESH"
echo

echo "=== SUMMARY ==="
[ "$FAILED" -eq 0 ] && echo "cli-baseline: OK" || echo "cli-baseline: FAILURES"
exit "$FAILED"
