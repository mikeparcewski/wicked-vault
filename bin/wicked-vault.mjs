#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import {
  findRoot, initVault, record, verify, crossCheck, declareContract, listEntries, supersede,
} from '../src/vault.mjs';
import { initBus } from '../src/bus.mjs';

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) out[k] = true;
      else { out[k] = next; i++; }
    } else out._.push(a);
  }
  return out;
}

function emit(obj, ok) {
  process.stdout.write(JSON.stringify(obj, null, 2) + '\n');
  process.exit(ok ? 0 : 1);
}

const [cmd, ...rest] = process.argv.slice(2);
const args = parseArgs(rest);
const cwd = (typeof args.cwd === 'string' && args.cwd) || process.cwd();

// Optional, fire-and-forget wicked-bus publisher. `publish` is a no-op when the
// bus is unavailable or disabled (WICKED_VAULT_NO_BUS=1) and never throws, so
// event emission cannot alter the JSON on stdout or the exit code below.
const publish = await initBus(cwd);

try {
  if (cmd === 'init') {
    emit({ initialized: initVault(cwd) }, true);
  }

  const root = findRoot(cwd, { create: cmd === 'record' || cmd === 'declare-contract' || cmd === 'supersede' });
  if (!root) emit({ error: 'no .wicked-vault/ found; run `wicked-vault init`' }, false);

  switch (cmd) {
    case 'record': {
      const res = record(root, {
        scope: args.scope, phase: args.phase, claim: args.claim, kind: args.kind,
        source: args.source, verifier: args.verifier,
        run: !!args.run, artifact: typeof args.artifact === 'string' ? args.artifact : undefined,
        cwd,
      });
      publish('wicked.evidence.recorded', 'vault.record', {
        scope: args.scope, phase: args.phase, claim_id: args.claim, kind: args.kind,
        source: args.source, id: res.id, envelope_hash: res.envelope_hash,
        status_at_record: res.status_at_record,
      });
      emit(res, true);
      break;
    }
    case 'verify': {
      const res = verify(root, args._[0] || args.id);
      // Only the rare, high-value tamper case is published — a verify is a read
      // and would otherwise be noise. hash_ok=false means the payload or
      // envelope diverged from what was recorded (G2).
      if (res.rederived && res.hash_ok === false) {
        publish('wicked.evidence.tampered', 'vault.tamper', {
          id: res.id, payload_ok: res.payload_ok, envelope_ok: res.envelope_ok,
        });
      }
      emit(res, res.hash_ok && res.status === 'pass');
      break;
    }
    case 'cross-check': {
      const res = crossCheck(root, args.scope, args.phase);
      publish('wicked.contract.checked', 'vault.cross_check', {
        scope: res.scope, phase: res.phase, overall: res.overall,
        contract_version: res.contract_version, claims: (res.claims || []).length,
      });
      const tampered = (res.claims || []).filter((c) => c.hash_ok === false);
      if (tampered.length > 0) {
        publish('wicked.evidence.tampered', 'vault.cross_check', {
          scope: res.scope, phase: res.phase,
          artifact_ids: tampered.map((c) => c.artifact_id),
        });
      }
      emit(res, res.overall === 'PASS');
      break;
    }
    case 'declare-contract': {
      const res = declareContract(root, args.scope, args.phase, JSON.parse(readFileSync(args.spec, 'utf8')));
      publish('wicked.contract.declared', 'vault.contract', {
        scope: args.scope, phase: args.phase, contract_version: res.contract_version,
      });
      emit(res, true);
      break;
    }
    case 'list':
      emit(listEntries(root, args.scope, args.phase), true);
      break;
    case 'supersede': {
      const res = supersede(root, args._[0] || args.id, {
        scope: args.scope, phase: args.phase, claim: args.claim, kind: args.kind,
        source: args.source, verifier: args.verifier,
        run: !!args.run, artifact: typeof args.artifact === 'string' ? args.artifact : undefined,
        cwd,
      });
      publish('wicked.evidence.superseded', 'vault.supersede', {
        scope: args.scope, phase: args.phase, claim_id: args.claim,
        new_id: res.new_id, old_id: res.old_id,
      });
      emit(res, true);
      break;
    }
    default:
      emit({ error: `unknown command: ${cmd}`, commands: ['init', 'record', 'verify', 'cross-check', 'declare-contract', 'list', 'supersede'] }, false);
  }
} catch (e) {
  emit({ error: e.message }, false);
}
