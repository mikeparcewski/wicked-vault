#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import {
  findRoot, initVault, record, verify, crossCheck, declareContract, listEntries, supersede,
} from '../src/vault.mjs';

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

try {
  if (cmd === 'init') {
    emit({ initialized: initVault(cwd) }, true);
  }

  const root = findRoot(cwd, { create: cmd === 'record' || cmd === 'declare-contract' || cmd === 'supersede' });
  if (!root) emit({ error: 'no .wicked-vault/ found; run `wicked-vault init`' }, false);

  switch (cmd) {
    case 'record':
      emit(record(root, {
        scope: args.scope, phase: args.phase, claim: args.claim, kind: args.kind,
        source: args.source, verifier: args.verifier,
        run: !!args.run, artifact: typeof args.artifact === 'string' ? args.artifact : undefined,
        cwd,
      }), true);
      break;
    case 'verify': {
      const res = verify(root, args._[0] || args.id);
      emit(res, res.hash_ok && res.status === 'pass');
      break;
    }
    case 'cross-check': {
      const res = crossCheck(root, args.scope, args.phase);
      emit(res, res.overall === 'PASS');
      break;
    }
    case 'declare-contract':
      emit(declareContract(root, args.scope, args.phase, JSON.parse(readFileSync(args.spec, 'utf8'))), true);
      break;
    case 'list':
      emit(listEntries(root, args.scope, args.phase), true);
      break;
    case 'supersede':
      emit(supersede(root, args._[0] || args.id, {
        scope: args.scope, phase: args.phase, claim: args.claim, kind: args.kind,
        source: args.source, verifier: args.verifier,
        run: !!args.run, artifact: typeof args.artifact === 'string' ? args.artifact : undefined,
        cwd,
      }), true);
      break;
    default:
      emit({ error: `unknown command: ${cmd}`, commands: ['init', 'record', 'verify', 'cross-check', 'declare-contract', 'list', 'supersede'] }, false);
  }
} catch (e) {
  emit({ error: e.message }, false);
}
