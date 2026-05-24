import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { sha256, envelopeHash, canonical } from './hash.mjs';
import { newId } from './id.mjs';
import { runVerifier } from './verifiers.mjs';

const DIR = '.wicked-vault';
const SCHEMA = 1;

export function findRoot(start, { create = false } = {}) {
  let cur = start;
  for (;;) {
    if (existsSync(join(cur, DIR))) return cur;
    const parent = dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  if (create) { initVault(start); return start; }
  return null;
}

export function initVault(root) {
  const base = join(root, DIR);
  mkdirSync(join(base, 'entries'), { recursive: true });
  mkdirSync(join(base, 'payloads'), { recursive: true });
  mkdirSync(join(base, 'contracts'), { recursive: true });
  const cfg = join(base, 'vault.json');
  if (!existsSync(cfg)) {
    writeFileSync(cfg, JSON.stringify(
      { schema_version: SCHEMA, store_mode: 'in-repo', payload_max_bytes: 1048576 }, null, 2));
  }
  return base;
}

function paths(root) {
  const base = join(root, DIR);
  return {
    base,
    entries: join(base, 'entries'),
    payloads: join(base, 'payloads'),
    contracts: join(base, 'contracts'),
  };
}

function payloadView(buf) {
  const text = buf.toString('utf8');
  let json = null;
  try { json = JSON.parse(text); } catch { /* raw artifact */ }
  return { text, json, raw: buf };
}

// "exit_code_eq:0" | "regex_match:[0-9a-f]{40}" | a JSON object string
export function parseVerifier(spec) {
  if (spec.trim().startsWith('{')) return JSON.parse(spec);
  const idx = spec.indexOf(':');
  if (idx === -1) return { kind: spec, params: {} };
  const kind = spec.slice(0, idx);
  const rest = spec.slice(idx + 1);
  switch (kind) {
    case 'exit_code_eq': return { kind, params: { code: Number(rest) } };
    case 'regex_match':
    case 'not_contains': return { kind, params: { pattern: rest } };
    case 'commit_exists': return { kind, params: { sha: rest } };
    case 'jq_pred': return { kind, params: { expr: rest } };
    default: return { kind, params: { value: rest } };
  }
}

function loadContract(root, scope, phase) {
  const p = join(paths(root).contracts, scope, `${phase}.json`);
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
}

export function record(root, opts) {
  const P = paths(root);

  // G4 — independent capture: the vault runs the source (or reads the file) and
  // hashes/verifies it. It trusts no claimed status. (Env isolation is the
  // harness's job — see CONTRACTS.md §4 G4 threat model.)
  let blob;
  if (opts.run) {
    const r = spawnSync(opts.source, {
      shell: true, cwd: opts.cwd || root, encoding: 'buffer', maxBuffer: 16 * 1024 * 1024,
    });
    const capture = {
      command: opts.source,
      exit_code: r.status === null ? 124 : r.status,
      stdout: (r.stdout || Buffer.alloc(0)).toString('utf8'),
      stderr: (r.stderr || Buffer.alloc(0)).toString('utf8'),
      captured_at: new Date().toISOString(),
    };
    blob = Buffer.from(canonical(capture), 'utf8');
  } else if (opts.artifact) {
    blob = readFileSync(opts.artifact);
  } else {
    throw new Error('record requires --run or --artifact');
  }

  const payload_sha256 = sha256(blob);
  const verifier = parseVerifier(opts.verifier);

  // G8 — contract pinning: if a contract pins this claim, record rejects a
  // kind/source/verifier downgrade.
  const contract = loadContract(root, opts.scope, opts.phase);
  if (contract) {
    const pin = (contract.required_evidence || []).find((c) => c.claim_id === opts.claim);
    if (pin) {
      if (pin.kind && pin.kind !== opts.kind) throw new Error(`G8 pin violation: kind '${opts.kind}' != pinned '${pin.kind}'`);
      if (pin.source_pin && pin.source_pin !== opts.source) throw new Error('G8 pin violation: source != pinned source');
      if (pin.verifier && pin.verifier.kind !== verifier.kind) throw new Error(`G8 pin violation: verifier '${verifier.kind}' != pinned '${pin.verifier.kind}'`);
    }
  }

  // content-addressed payload (dedupe)
  const payloadPath = join(P.payloads, payload_sha256);
  if (!existsSync(payloadPath)) writeFileSync(payloadPath, blob);

  const id = newId();
  const fields = {
    scope: opts.scope, phase: opts.phase, claim_id: opts.claim,
    kind: opts.kind, source: opts.source, verifier, payload_sha256,
  };
  const envelope_hash = envelopeHash(fields);
  const sr = runVerifier(verifier, payloadView(blob), { repoRoot: opts.cwd || root });

  const entry = {
    id, ...fields,
    payload_ref: `payloads/${payload_sha256}`,
    envelope_hash,
    status_at_record: sr.status, // informational ONLY — verify never reads it (G3)
    state: 'active',
    supersedes: null,
    contract_version: contract ? contract.contract_version : null,
    created_at: new Date().toISOString(),
    created_by: process.env.USER || 'unknown',
  };
  writeFileSync(join(P.entries, `${id}.json`), JSON.stringify(entry, null, 2));
  return { id, envelope_hash, status_at_record: sr.status, status_detail: sr.detail };
}

// G6 — append-only supersede: record a NEW artifact stamped with `supersedes`,
// then flip the OLD entry's state to 'superseded'. Crash-safe ordering: the
// replacement is written and confirmed on disk FIRST, so a crash can never
// leave the old entry inactive with no active replacement (worst case: both
// briefly active, which cross-check tolerates — latest active wins).
export function supersede(root, oldId, recordOpts) {
  const P = paths(root);
  const oldPath = join(P.entries, `${oldId}.json`);
  if (!existsSync(oldPath)) throw new Error(`supersede: old entry not found: ${oldId}`);

  // 1. record the replacement (reuses the full record path: capture, hash,
  //    G8 pin check, verifier, envelope) and stamp the supersedes link.
  const res = record(root, recordOpts);
  const newPath = join(P.entries, `${res.id}.json`);
  const newEntry = JSON.parse(readFileSync(newPath, 'utf8'));
  newEntry.supersedes = oldId;
  writeFileSync(newPath, JSON.stringify(newEntry, null, 2));

  // 2. confirm the new entry is durably on disk BEFORE flipping the old one.
  if (!existsSync(newPath)) throw new Error('supersede: replacement entry failed to persist');

  // 3. flip the old entry to superseded (immutability is preserved for the
  //    identifying fields + payload; only `state` transitions, per G6).
  const oldEntry = JSON.parse(readFileSync(oldPath, 'utf8'));
  oldEntry.state = 'superseded';
  writeFileSync(oldPath, JSON.stringify(oldEntry, null, 2));

  return { new_id: res.id, old_id: oldId };
}

export function verify(root, id) {
  const P = paths(root);
  const entryPath = join(P.entries, `${id}.json`);
  if (!existsSync(entryPath)) return { id, hash_ok: false, status: 'error', detail: 'entry not found', rederived: false };
  const entry = JSON.parse(readFileSync(entryPath, 'utf8'));

  const payloadPath = join(P.payloads, entry.payload_sha256);
  if (!existsSync(payloadPath)) return { id, hash_ok: false, status: 'error', detail: 'payload blob missing', rederived: false };
  const blob = readFileSync(payloadPath);

  // G2 — recompute the payload hash AND the envelope hash from the actual blob
  // + entry fields, and compare to what was stored. Any tamper diverges.
  const recomputedPayloadSha = sha256(blob);
  const payload_ok = recomputedPayloadSha === entry.payload_sha256;
  const recomputedEnvelope = envelopeHash({
    scope: entry.scope, phase: entry.phase, claim_id: entry.claim_id,
    kind: entry.kind, source: entry.source, verifier: entry.verifier,
    payload_sha256: recomputedPayloadSha,
  });
  const envelope_ok = recomputedEnvelope === entry.envelope_hash;
  const hash_ok = payload_ok && envelope_ok;

  // G3 — re-derive the status by re-running the verifier against the payload.
  // status_at_record is NEVER consulted.
  const sr = runVerifier(entry.verifier, payloadView(blob), { repoRoot: root });

  // fail-closed: a pass requires BOTH an intact hash and a passing verifier.
  const status = hash_ok ? sr.status : 'fail';
  return {
    id, hash_ok, payload_ok, envelope_ok,
    status, rederived: true,
    detail: hash_ok ? sr.detail : `TAMPER: hash mismatch (payload_ok=${payload_ok}, envelope_ok=${envelope_ok})`,
    ignored_cached_status: entry.status_at_record,
  };
}

export function declareContract(root, scope, phase, spec) {
  const P = paths(root);
  const required = spec.required_evidence || spec;
  const contract_version = sha256(Buffer.from(canonical({ required_evidence: required }), 'utf8')).slice(0, 16);
  const obj = {
    scope, phase, required_evidence: required, contract_version,
    origin: spec.origin || 'cli', declared_at: new Date().toISOString(),
  };
  const dir = join(P.contracts, scope);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${phase}.json`), JSON.stringify(obj, null, 2));
  return { contract_version };
}

export function listEntries(root, scope, phase) {
  const P = paths(root);
  if (!existsSync(P.entries)) return [];
  return readdirSync(P.entries)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(P.entries, f), 'utf8')))
    .filter((e) => (!scope || e.scope === scope) && (!phase || e.phase === phase));
}

// G9 — mechanical evaluation: the contract is consumer-authored; cross-check is
// a pure function of (contract, recorded artifacts). The vault decides WHETHER
// the contract is satisfied, never WHAT it should require.
export function crossCheck(root, scope, phase) {
  const contract = loadContract(root, scope, phase);
  if (!contract) {
    return { scope, phase, overall: 'ERROR', detail: 'no contract declared (fail-closed)', claims: [] };
  }
  const active = listEntries(root, scope, phase).filter((e) => e.state === 'active');
  const claims = [];
  for (const req of (contract.required_evidence || [])) {
    const matches = active
      .filter((e) => e.claim_id === req.claim_id)
      .sort((a, b) => (a.id < b.id ? 1 : -1)); // latest active wins
    const art = matches[0];
    if (!art) {
      claims.push({ claim_id: req.claim_id, result: req.required === false ? 'PASS' : 'MISSING' });
      continue;
    }
    if (req.verifier && art.verifier.kind !== req.verifier.kind) {
      claims.push({ claim_id: req.claim_id, artifact_id: art.id, result: 'ERROR', detail: 'verifier pin mismatch' });
      continue;
    }
    const v = verify(root, art.id);
    claims.push({
      claim_id: req.claim_id, artifact_id: art.id,
      hash_ok: v.hash_ok, verifier_status: v.status,
      result: (v.hash_ok && v.status === 'pass') ? 'PASS' : 'FAIL', detail: v.detail,
    });
  }
  const overall = claims.every((c) => c.result === 'PASS')
    ? 'PASS'
    : (claims.some((c) => c.result === 'ERROR') ? 'ERROR' : 'REJECT');
  return { scope, phase, contract_version: contract.contract_version, overall, claims, evaluated_at: new Date().toISOString() };
}
