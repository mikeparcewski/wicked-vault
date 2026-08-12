#!/usr/bin/env bash
# WICKED_RUNTIME seam (foundation team-profile leg). The vault's only store
# driver is the in-repo git-native store, so:
#   1. WICKED_RUNTIME unset / local — CLI behaves exactly as before
#   2. WICKED_RUNTIME=team — every store-touching command refuses BEFORE any
#      vault I/O (exit 1, code ERR_WICKED_RUNTIME_TEAM_UNSUPPORTED, no
#      .wicked-vault/ created)
#   3. WICKED_RUNTIME=<typo> — refused loudly (ERR_WICKED_RUNTIME_INVALID),
#      never a silent local fallback
#   4. --help / --version still work under ANY profile (no store I/O)
set -u
export WICKED_VAULT_NO_BUS=1
unset WICKED_RUNTIME 2>/dev/null || true
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/.." && pwd)"
VAULT="node $ROOT/bin/wicked-vault.mjs"
FAILED=0
field() { python3 -c "import json,sys;print(json.load(sys.stdin).get('$1',''))"; }
ok()   { echo "  -> PASS: $1"; }
bad()  { echo "  -> FAIL: $1"; FAILED=1; }

WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT; cd "$WORK" || exit 2

echo "=== 1. local profile (default + explicit) records normally ==="
$VAULT record --scope rt --phase p1 --claim c1 --kind log --source "echo hi" \
  --criteria "runs" --artifact <(echo hi) >/dev/null \
  && ok "record works with WICKED_RUNTIME unset" \
  || bad "record failed with WICKED_RUNTIME unset"
WICKED_RUNTIME=local $VAULT list --scope rt >/dev/null \
  && ok "list works with WICKED_RUNTIME=local" \
  || bad "list failed with WICKED_RUNTIME=local"
echo

echo "=== 2. team profile refused before any vault I/O ==="
TEAM_DIR="$WORK/team-repo"; mkdir -p "$TEAM_DIR"
OUT="$(cd "$TEAM_DIR" && WICKED_RUNTIME=team $VAULT record --scope rt --phase p1 \
  --claim c1 --kind log --source "echo hi" --criteria "runs" --run 2>/dev/null)"
RC=$?
[ "$RC" -ne 0 ] && ok "record exits non-zero under team" || bad "record exited 0 under team"
CODE="$(printf '%s' "$OUT" | field code)"
[ "$CODE" = "ERR_WICKED_RUNTIME_TEAM_UNSUPPORTED" ] \
  && ok "code is ERR_WICKED_RUNTIME_TEAM_UNSUPPORTED" \
  || bad "unexpected code '$CODE'"
[ ! -d "$TEAM_DIR/.wicked-vault" ] \
  && ok "no .wicked-vault/ created under team (refused before I/O)" \
  || bad ".wicked-vault/ was created despite team refusal"
WICKED_RUNTIME=team $VAULT list --scope rt >/dev/null 2>&1 \
  && bad "list exited 0 under team" || ok "list refused under team"
echo

echo "=== 3. unrecognized profile refused loudly ==="
OUT="$(WICKED_RUNTIME=prod $VAULT list --scope rt 2>/dev/null)"
RC=$?
[ "$RC" -ne 0 ] && ok "unknown profile exits non-zero" || bad "unknown profile exited 0"
CODE="$(printf '%s' "$OUT" | field code)"
[ "$CODE" = "ERR_WICKED_RUNTIME_INVALID" ] \
  && ok "code is ERR_WICKED_RUNTIME_INVALID" \
  || bad "unexpected code '$CODE'"
echo

echo "=== 4. help/version bypass the profile check ==="
WICKED_RUNTIME=team $VAULT --help >/dev/null \
  && ok "--help works under team" || bad "--help failed under team"
WICKED_RUNTIME=team $VAULT --version >/dev/null \
  && ok "--version works under team" || bad "--version failed under team"
WICKED_RUNTIME=prod $VAULT --help >/dev/null \
  && ok "--help works under an invalid profile" || bad "--help failed under invalid profile"
echo

if [ "$FAILED" -ne 0 ]; then echo "RESULT: FAIL"; exit 1; fi
echo "RESULT: PASS"
