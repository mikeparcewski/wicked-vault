---
name: wicked-vault:update
description: |
  Check for and install wicked-vault updates. Compares the installed version
  against the npm registry, updates the published CLI, and refreshes the skills
  across all detected AI CLIs (Claude Code, Gemini, Copilot, Codex, Cursor,
  Kiro, Antigravity).

  Use when: "update wicked-vault", "check for vault updates", "wicked-vault update",
  or periodically to stay current.
---

# wicked-vault:update

Check for and install updates to wicked-vault and its skills.

## Cross-Platform Notes

Commands work on macOS, Linux, and Windows. Prefer agent-native tools
(Read, Write, Grep, Glob) over shell where possible. JSON parsing uses
`python3 … || python …` so it runs on macOS, Linux, WSL, and Git Bash.

## When to use

- User asks to update or check for updates.
- After unexpected behavior that might be fixed in a newer version.
- Periodically (suggest checking monthly).

## Process

### Step 1 — Check the installed version

Global install:

```bash
npm list -g wicked-vault --json 2>/dev/null | python3 -c "
import json, sys
try:
    d = json.load(sys.stdin)
    print(d.get('dependencies', {}).get('wicked-vault', {}).get('version', 'not installed'))
except Exception:
    print('not installed')
" 2>/dev/null || npm list -g wicked-vault --json 2>/dev/null | python -c "
import json, sys
try:
    d = json.load(sys.stdin)
    print(d.get('dependencies', {}).get('wicked-vault', {}).get('version', 'not installed'))
except Exception:
    print('not installed')
"
```

Also check a local (project-level) install:

```bash
npm list wicked-vault --json 2>/dev/null
```

If neither is installed, the user may be running via `npx wicked-vault@latest`
(always current) — note that and skip to Step 5 to (re)install skills.

### Step 2 — Check the latest version on npm

```bash
npm view wicked-vault version 2>/dev/null
```

### Step 3 — Compare

- Up to date: "wicked-vault is up to date (v{version})."
- Update available: "wicked-vault v{new} is available (you have v{current}). Update now?"

If the user only wanted to check, stop here and report current vs. available.

### Step 4 — Update the package (if approved)

Global:

```bash
npm install -g wicked-vault@latest 2>&1
```

Local (project):

```bash
npm install wicked-vault@latest 2>&1
```

If `EACCES` / permission denied:
- macOS/Linux: `sudo npm install -g wicked-vault@latest`
- Windows: re-run the shell as Administrator
- Report the failure — do NOT silently skip.

### Step 5 — Refresh the skills in all CLIs

After updating the package, re-run the installer to copy the updated skills
into every detected CLI:

```bash
npx wicked-vault-install
```

Or target one CLI:

```bash
npx wicked-vault-install --cli=claude
```

(The installer is idempotent — re-running overwrites the installed skills with
the current version and re-registers the wicked-bus provider if the bus is
present.)

### Step 6 — Verify

Re-run the Step 1 version check and confirm it matches latest. Also confirm the
CLI runs:

```bash
npx wicked-vault --help | head -1
```

If it still shows the old version:
1. `which wicked-vault` (macOS/Linux) or `where wicked-vault` (Windows).
2. `npm cache clean --force`.
3. Check whether nvm / fnm / volta is pinning a stale copy.

### Step 7 — Report

```
wicked-vault updated: v{old} → v{new}
Skills refreshed in {N} CLIs: {list}
```

## Notes

- wicked-vault has **no background server** to update (unlike wicked-brain) —
  updating is just the package + the skills.
- The published package is provenance-signed; `npm view wicked-vault --json`
  shows the attestation under `dist.attestations` if you want to confirm
  supply-chain integrity after updating.
