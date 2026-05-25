#!/usr/bin/env node
// wicked-vault installer — detects CLIs and installs skills
//
// Ported from the shared wicked-bus / wicked-brain installer. Vault ships no
// agents and no bus events yet (see README "Status"), so this is the
// skills-only variant: detect every AI CLI/IDE config root and copy the
// wicked-vault skills into each.

import { existsSync, mkdirSync, cpSync, readdirSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import { homedir } from "node:os";
import { argv } from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const skillsSource = join(__dirname, "skills");
const home = homedir();

// Claude-root candidate builder. Mirrors the wicked-testing / wicked-brain /
// wicked-bus fix: $CLAUDE_CONFIG_DIR is authoritative when set; otherwise
// probe common alt-config layouts. Claude Code's config root is redirectable,
// and a hardcoded ~/.claude silently misses users on shared-home /
// multi-tenant setups.
function buildClaudeTarget(rootDir, source, { trusted = false } = {}) {
  return {
    name: "claude",
    rootDir,
    dir: join(rootDir, "skills"),
    platform: "claude",
    identityMarkers: ["settings.json", "plugins", "projects"],
    source,
    trusted,
  };
}

function resolveClaudeCandidates() {
  const envDir = process.env.CLAUDE_CONFIG_DIR;
  if (envDir && typeof envDir === "string" && envDir.trim()) {
    // Function replacement avoids `$&` etc. being interpreted as regex
    // back-references if $HOME contains those literals.
    const root = resolve(envDir.trim().replace(/^~/, () => home));
    return [buildClaudeTarget(root, "env:CLAUDE_CONFIG_DIR", { trusted: true })];
  }
  return [
    buildClaudeTarget(join(home, ".claude"),                "default"),
    buildClaudeTarget(join(home, "alt-configs", ".claude"), "alt-configs"),
    buildClaudeTarget(join(home, ".config", "claude"),      "xdg"),
  ];
}

function claudeHasIdentityMarker(target) {
  if (target.trusted) return true;
  if (!existsSync(target.rootDir)) return false;
  return (target.identityMarkers || []).some(m => existsSync(join(target.rootDir, m)));
}

// Non-claude canonical targets. Claude is expanded dynamically above.
const CLI_TARGETS = [
  { name: "gemini",      dir: join(home, ".gemini", "skills"),      platform: "gemini" },
  { name: "copilot",     dir: join(home, ".github", "skills"),      platform: "copilot" },
  { name: "codex",       dir: join(home, ".codex", "skills"),       platform: "codex" },
  { name: "cursor",      dir: join(home, ".cursor", "skills"),      platform: "cursor" },
  { name: "kiro",        dir: join(home, ".kiro", "skills"),        platform: "kiro" },
  { name: "antigravity", dir: join(home, ".antigravity", "skills"), platform: "antigravity" },
];

const args = argv.slice(2);

// Help: print usage and exit 0 before doing any detection or filesystem work.
if (args.includes("--help") || args.includes("-h")) {
  process.stdout.write(`wicked-vault-install — install wicked-vault skills into your AI CLIs/IDEs

Copies the wicked-vault skills into every detected CLI config root so your
agent knows how to use the vault. Also registers wicked-vault as a wicked-bus
provider when the bus is available.

USAGE
  npx wicked-vault-install [options]

OPTIONS
  (no options)        Detect and install into every supported CLI found
  --cli=<name>        Install into one CLI only (comma-separated for several),
                      e.g. --cli=claude  or  --cli=claude,cursor
  --path=<dir>        Install into a specific config root, e.g. --path=~/.claude
  --help, -h          Show this help

SUPPORTED CLIs       claude, gemini, copilot, codex, cursor, kiro, antigravity
                     (\$CLAUDE_CONFIG_DIR is honored; alt-config layouts are probed)

INSTALLS (per CLI, under skills/)
  wicked-vault-init · -record-evidence · -verify-evidence · -analyze-evidence
  · -cross-check-evidence · -update

To update later:  npm install -g wicked-vault@latest && npx wicked-vault-install
                  (or just say "wicked-vault:update" to your agent)
`);
  process.exit(0);
}

console.log("wicked-vault installer\n");

// Flag parser supporting both --flag=value and --flag value forms, plus
// narrow string-boolean coercion ("true" / "false" → booleans). The ad-hoc
// parser this replaces silently dropped space-separated values — same bug
// that hit wicked-testing 0.3.2 / wicked-brain 0.3.7 / wicked-bus.
const flagValue = (name) => {
  const f = args.find(a => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!f) return null;
  let val;
  if (f.includes("=")) {
    // slice from the first '=' forward — split("=")[1] would truncate at
    // the second '=' (e.g. --path=/volumes/build=artifacts).
    val = f.slice(f.indexOf("=") + 1);
  } else {
    const idx = args.indexOf(f);
    const next = args[idx + 1];
    val = (next && !next.startsWith("-")) ? next : true;
  }
  if (val === "false") return false;
  if (val === "true")  return true;
  return val;
};

const cliArg  = flagValue("cli");
const pathArg = flagValue("path");

// Validate --cli upfront so a mistyped --cli / --cli= fails fast instead of
// silently falling through to "all detected".
if (cliArg === true || cliArg === "") {
  console.error("Error: --cli requires a value (e.g. --cli=claude or --cli claude)");
  process.exit(1);
}

let targets;

if (pathArg && typeof pathArg === "string" && pathArg !== "") {
  const customPath = resolve(pathArg.replace(/^~/, () => home));
  const dirName = basename(customPath).replace(/^\./, "");
  targets = [{
    name: dirName,
    dir: join(customPath, "skills"),
    platform: dirName,
  }];
  console.log(`Custom path: ${customPath}\n`);
} else if (pathArg === true || pathArg === "") {
  console.error("Error: --path requires a value (e.g. --path=~/.claude or --path ~/.claude)");
  process.exit(1);
} else {
  // Expanded detection: claude candidates (env var OR alt-config probes,
  // identity-marker gated) + non-claude parent-dir-exists heuristic.
  const claudeDetected = resolveClaudeCandidates().filter(claudeHasIdentityMarker);
  const otherDetected  = CLI_TARGETS.filter((t) => existsSync(resolve(t.dir, "..")));
  const detected = [...claudeDetected, ...otherDetected];

  if (detected.length === 0) {
    console.log("No supported AI CLIs detected. Supported: claude, gemini, copilot, codex, cursor, kiro, antigravity");
    console.log("Install skills manually by copying the skills/ directory, or set CLAUDE_CONFIG_DIR.");
    process.exit(1);
  }

  const claudeCount = claudeDetected.length;
  const label = (d) => d.name === "claude" && claudeCount > 1 && d.source
    ? `${d.name}[${d.source}]`
    : d.name;
  console.log(`Detected CLIs: ${detected.map(label).join(", ")}\n`);

  const cliFilter = (typeof cliArg === "string" && cliArg !== "") ? cliArg.split(",") : null;
  targets = cliFilter ? detected.filter((d) => cliFilter.includes(d.name)) : detected;
}

// Copy skills to each target CLI.
// Repo structure:      skills/wicked-vault/{name}/SKILL.md (nested namespace)
// Installed structure: {cli}/skills/wicked-vault-{name}/SKILL.md (flat, one
//                      level deep). CLI skill discovery only scans one level
//                      deep under the skills directory.
const namespace = "wicked-vault";
const namespaceSrc = join(skillsSource, namespace);
const subSkills = readdirSync(namespaceSrc).filter((d) => !d.startsWith("."));

for (const target of targets) {
  console.log(`Installing to ${target.name} (${target.dir})...`);
  mkdirSync(target.dir, { recursive: true });

  for (const skill of subSkills) {
    const src = join(namespaceSrc, skill);
    const dest = join(target.dir, `${namespace}-${skill}`);
    cpSync(src, dest, { recursive: true });
  }

  console.log(`  ${subSkills.length} skills installed`);
}

console.log(`\nwicked-vault skills installed! Available skills:`);
console.log(`  wicked-vault:init                 — Initialize a vault in a repo`);
console.log(`  wicked-vault:record-evidence      — Record evidence + the criteria it must clear`);
console.log(`  wicked-vault:verify-evidence      — Integrity tier: re-derive a single artifact (deterministic, CI-safe)`);
console.log(`  wicked-vault:analyze-evidence     — Judgment tier: independent model judges evidence vs criteria`);
console.log(`  wicked-vault:cross-check-evidence — Declare a contract and check it (integrity / +attestations)`);

// Register as a wicked-bus provider if the bus is available. Mirrors the
// wicked-brain installer. Non-fatal: the vault emits events when wicked-bus is
// present and runs fully standalone when it isn't.
try {
  const bus = await import("wicked-bus");
  const busDb = bus.openDb(typeof bus.loadConfig === "function" ? bus.loadConfig() : {});
  try {
    bus.register(busDb, { plugin: "wicked-vault", role: "provider", filter: "wicked.*" });
    console.log("\nwicked-bus: registered wicked-vault as a provider");
    console.log("  emits: wicked.evidence.recorded / .superseded / .tampered, wicked.contract.declared / .checked");
  } catch (err) {
    // Re-running install is fine — a duplicate provider registration is a no-op.
    if (err.message && err.message.includes("UNIQUE")) {
      console.log("\nwicked-bus: wicked-vault already registered as a provider");
    } else {
      console.log(`\nwicked-bus: could not register (${err.message})`);
    }
  }
  busDb.close();
} catch {
  console.log("\nwicked-bus: not available (install wicked-bus to enable event emission)");
}

console.log(`\nThe CLI itself runs via 'npx wicked-vault <command>' (exit 0 = PASS).`);
