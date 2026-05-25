#!/usr/bin/env bash
# Prove the 3 verifiers not exercised by prove-on-memos.sh:
#   not_contains, commit_exists, jq_pred
# Each gets a PASS case and a FAIL case. jq_pred additionally documents the
# fail-closed (G5) behavior when jq is absent. The vault lives in a TEMP dir
# (mktemp -d) — never a real repo — and is cleaned up on exit.
#
# commit_exists note: `verify` runs the verifier with repoRoot = the vault root.
# So the temp vault dir is made a git working-tree of the real memos object
# store via a `.git` gitlink FILE (`gitdir: <memos>/.git`). This lets
# `git cat-file -e <sha>` resolve real memos commits WITHOUT modifying memos
# (no git init, no worktree add, no commit) and keeps the vault in the temp dir.
set -u

# Asserts on stdout JSON + exit codes only — no bus side effects here
# (see test/bus-integration.sh for the wicked-bus path).
export WICKED_VAULT_NO_BUS=1

VAULT="node $HOME/Projects/wicked-vault/bin/wicked-vault.mjs"
MEMOS="$HOME/Projects/memos"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
cd "$WORK" || { echo "cannot cd to temp dir"; exit 2; }

# Pull a JSON field from CLI stdout (cross-platform: python3 with python fallback).
field() {
  python3 -c "import json,sys;print(json.load(sys.stdin).get('$1',''))" 2>/dev/null \
    || python -c "import json,sys;print(json.load(sys.stdin).get('$1',''))"
}

PASS_COUNT=0
FAIL_EXPECTED_COUNT=0
note() { echo "  -> $1"; }

echo "### vault root (temp): $WORK"
$VAULT init
echo

# ---------------------------------------------------------------------------
echo "=== not_contains ==="
# A --run capture of an echo; verifiableText = stdout+stderr.

echo "# PASS: forbidden pattern ABSENT from a clean build log"
NC_PASS=$($VAULT record --scope vtest --phase build --claim no-errors --kind test-run \
  --source "echo build succeeded with no issues" --verifier "not_contains:FATAL" --run)
echo "$NC_PASS"
NC_PASS_ID=$(printf '%s' "$NC_PASS" | field id)
$VAULT verify "$NC_PASS_ID"; RC=$?
echo "verify exit=$RC"
[ "$RC" -eq 0 ] && { note "PASS as expected (forbidden 'FATAL' absent)"; PASS_COUNT=$((PASS_COUNT+1)); } \
                || note "UNEXPECTED: expected pass"
echo

echo "# FAIL: forbidden pattern PRESENT in the log"
NC_FAIL=$($VAULT record --scope vtest --phase build --claim no-errors --kind test-run \
  --source "echo build hit a FATAL stop" --verifier "not_contains:FATAL" --run)
echo "$NC_FAIL"
NC_FAIL_ID=$(printf '%s' "$NC_FAIL" | field id)
$VAULT verify "$NC_FAIL_ID"; RC=$?
echo "verify exit=$RC"
[ "$RC" -ne 0 ] && { note "FAIL as expected (forbidden 'FATAL' present)"; FAIL_EXPECTED_COUNT=$((FAIL_EXPECTED_COUNT+1)); } \
                || note "UNEXPECTED: expected fail"
echo

# ---------------------------------------------------------------------------
echo "=== commit_exists (real repo objects: $MEMOS) ==="
if [ -d "$MEMOS/.git" ]; then
  REAL_SHA=$(git -C "$MEMOS" rev-parse HEAD)
  echo "real HEAD sha: $REAL_SHA"

  # Make the temp vault dir a git working-tree of memos's object store via a
  # gitlink file. Does NOT touch memos. Both record AND verify run git with
  # repoRoot = this dir, so commits resolve against the real memos objects.
  printf 'gitdir: %s\n' "$MEMOS/.git" > "$WORK/.git"
  echo "wrote gitlink: $WORK/.git -> $MEMOS/.git"

  echo "# PASS: a real HEAD sha exists in the repo objects"
  CE_PASS=$($VAULT record --scope vtest --phase review --claim head-real --kind custom \
    --source "git rev-parse HEAD" --verifier "commit_exists:$REAL_SHA" \
    --artifact <(printf '%s' "$REAL_SHA"))
  echo "$CE_PASS"
  CE_PASS_ID=$(printf '%s' "$CE_PASS" | field id)
  $VAULT verify "$CE_PASS_ID"; RC=$?
  echo "verify exit=$RC"
  [ "$RC" -eq 0 ] && { note "PASS as expected (real commit exists)"; PASS_COUNT=$((PASS_COUNT+1)); } \
                  || note "UNEXPECTED: expected pass"
  echo

  echo "# FAIL: a fabricated sha does not exist"
  FAKE_SHA="deadbeefdeadbeefdeadbeefdeadbeefdeadbeef"
  CE_FAIL=$($VAULT record --scope vtest --phase review --claim head-fake --kind custom \
    --source "echo fabricated" --verifier "commit_exists:$FAKE_SHA" \
    --artifact <(printf '%s' "$FAKE_SHA"))
  echo "$CE_FAIL"
  CE_FAIL_ID=$(printf '%s' "$CE_FAIL" | field id)
  $VAULT verify "$CE_FAIL_ID"; RC=$?
  echo "verify exit=$RC"
  [ "$RC" -ne 0 ] && { note "FAIL as expected (fabricated commit absent)"; FAIL_EXPECTED_COUNT=$((FAIL_EXPECTED_COUNT+1)); } \
                  || note "UNEXPECTED: expected fail"

  # drop the gitlink so the rest of the run is in a clean (non-git) temp dir
  rm -f "$WORK/.git"
else
  echo "SKIP: no git repo at $MEMOS"
fi
echo

# ---------------------------------------------------------------------------
echo "=== jq_pred ==="
if command -v jq >/dev/null 2>&1; then
  echo "jq present: $(jq --version)"

  echo "# PASS: truthy predicate over the JSON capture (.exit_code == 0)"
  JQ_PASS=$($VAULT record --scope vtest --phase test --claim jq-truthy --kind test-run \
    --source "echo hello" --verifier "jq_pred:.exit_code == 0" --run)
  echo "$JQ_PASS"
  JQ_PASS_ID=$(printf '%s' "$JQ_PASS" | field id)
  $VAULT verify "$JQ_PASS_ID"; RC=$?
  echo "verify exit=$RC"
  [ "$RC" -eq 0 ] && { note "PASS as expected (predicate truthy)"; PASS_COUNT=$((PASS_COUNT+1)); } \
                  || note "UNEXPECTED: expected pass"
  echo

  echo "# FAIL: falsy predicate over the same shape (.exit_code == 99)"
  JQ_FAIL=$($VAULT record --scope vtest --phase test --claim jq-falsy --kind test-run \
    --source "echo hello" --verifier "jq_pred:.exit_code == 99" --run)
  echo "$JQ_FAIL"
  JQ_FAIL_ID=$(printf '%s' "$JQ_FAIL" | field id)
  $VAULT verify "$JQ_FAIL_ID"; RC=$?
  echo "verify exit=$RC"
  [ "$RC" -ne 0 ] && { note "FAIL as expected (predicate falsy)"; FAIL_EXPECTED_COUNT=$((FAIL_EXPECTED_COUNT+1)); } \
                  || note "UNEXPECTED: expected fail"
else
  echo "jq ABSENT on PATH."
  echo "Per G5 (fail-closed), jq_pred must return status:error — NOT a silent pass."
  echo "This is the CORRECT behavior, not a bug."
  JQ_ERR=$($VAULT record --scope vtest --phase test --claim jq-noerr --kind test-run \
    --source "echo hello" --verifier "jq_pred:.exit_code == 0" --run)
  echo "$JQ_ERR"
  JQ_ERR_STATUS=$(printf '%s' "$JQ_ERR" | field status_at_record)
  JQ_ERR_ID=$(printf '%s' "$JQ_ERR" | field id)
  echo "status_at_record=$JQ_ERR_STATUS (expect: error)"
  $VAULT verify "$JQ_ERR_ID"; RC=$?
  echo "verify exit=$RC (expect non-zero — fail-closed)"
  [ "$JQ_ERR_STATUS" = "error" ] && note "fail-closed confirmed (status=error, G5)" \
                                 || note "UNEXPECTED: expected status=error"
fi
echo

# ---------------------------------------------------------------------------
echo "=== SUMMARY ==="
echo "pass-cases that returned exit 0: $PASS_COUNT"
echo "fail-cases that returned non-zero exit: $FAIL_EXPECTED_COUNT"
echo "(temp vault $WORK will be removed on exit)"
