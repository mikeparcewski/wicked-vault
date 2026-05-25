#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import {
  findRoot, initVault, record, verify, crossCheck, declareContract, listEntries, supersede,
  inspect, attest, listAttestations,
} from '../src/vault.mjs';
import { initBus } from '../src/bus.mjs';

// --criteria accepts inline text or @file (acceptance criteria are often
// multi-line). Resolved here so src/vault.mjs stays pure text-in.
function resolveCriteria(val) {
  if (typeof val !== 'string') return val;
  if (val.startsWith('@')) return readFileSync(val.slice(1), 'utf8');
  return val;
}

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

const HELP = `wicked-vault — local-first evidence primitive
Record evidence with the acceptance criteria it must clear, re-derive integrity
deterministically, and record independent third-party judgments. Never trusts a
stored verdict; never lets work self-grade its own "done".

USAGE
  wicked-vault <command> [options]

COMMANDS
  init                         Create .wicked-vault/ in the current repo
  record                       Capture evidence + the criteria it must clear
                               --scope S --phase P --claim C --kind K --source "<cmd|file>"
                               --criteria "<text|@file>" (--run | --artifact <file>) [--verifier "kind:arg"]
  verify   <artifact-id>       Integrity tier: re-derive hashes + verifier (deterministic,
                               model-free). Exit 0 iff intact AND pass. Surfaces latest opinion.
  inspect  <artifact-id>       Frozen criteria + evidence + integrity (what a judge evaluates)
  attest   <artifact-id>       Record an INDEPENDENT judgment (fail-closed; evaluator != creator)
                               --opinion <pass|reject|unclear> --rationale "..." --evaluator ID
                               [--model prov/ver] [--prompt-hash H] [--sampling '<json>']
  attestations <artifact-id>   Show the append-only opinion log
  cross-check                  Mechanical contract verdict; exit 0 iff PASS
                               --scope S --phase P [--integrity-only (default) | --with-attestations]
  declare-contract             Pin a contract  --scope S --phase P --spec <file>
  supersede <old-id>           Append-only replacement (same flags as record)
  list                         --scope S [--phase P]

GLOBAL
  --cwd <dir>     Operate on a vault rooted at <dir> (default: walk up from cwd)
  --help, -h      Show this help

OUTPUT   JSON on stdout; exit code is the gate signal (0 = PASS / success).
ENV      WICKED_VAULT_NO_BUS=1   Disable optional wicked-bus event emission

Skills (AI CLIs):  wicked-vault:{init,record-evidence,verify-evidence,analyze-evidence,cross-check-evidence,update}
Install skills:    npx wicked-vault-install        (run with --help for options)
Docs:              https://github.com/mikeparcewski/wicked-vault
`;

const [cmd, ...rest] = process.argv.slice(2);

// Help / no-command: print usage to stdout and exit 0 — before any vault or bus
// work, so `--help` works outside a repo and never errors.
if (cmd === undefined || cmd === '--help' || cmd === '-h' || cmd === 'help') {
  process.stdout.write(HELP);
  process.exit(0);
}

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
        source: args.source, verifier: args.verifier, criteria: resolveCriteria(args.criteria),
        run: !!args.run, artifact: typeof args.artifact === 'string' ? args.artifact : undefined,
        cwd,
      });
      publish('wicked.evidence.recorded', 'vault.record', {
        scope: args.scope, phase: args.phase, claim_id: args.claim, kind: args.kind,
        source: args.source, id: res.id, envelope_hash: res.envelope_hash,
        criteria_authored_by: res.criteria_authored_by, status_at_record: res.status_at_record,
      });
      emit(res, true);
      break;
    }
    case 'inspect':
      emit(inspect(root, args._[0] || args.id), true);
      break;
    case 'attest': {
      const res = attest(root, args._[0] || args.id, {
        opinion: args.opinion, rationale: args.rationale, evaluator: args.evaluator,
        model: args.model, prompt_hash: args['prompt-hash'],
        sampling: typeof args.sampling === 'string' ? JSON.parse(args.sampling) : undefined,
      });
      publish('wicked.evidence.attested', 'vault.attest', {
        artifact_id: args._[0] || args.id, attestation_id: res.attestation_id,
        opinion: res.opinion, evaluator: args.evaluator, model: args.model || null,
      });
      emit(res, true);
      break;
    }
    case 'attestations':
      emit(listAttestations(root, args._[0] || args.id), true);
      break;
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
      // --integrity-only is the default (deterministic, CI-safe); attestation
      // consultation is opt-in via --with-attestations (ADR-0002 D3/D10).
      const withAttestations = args['with-attestations'] === true;
      const res = crossCheck(root, args.scope, args.phase, { withAttestations });
      publish('wicked.contract.checked', 'vault.cross_check', {
        scope: res.scope, phase: res.phase, overall: res.overall, mode: res.mode,
        contract_version: res.contract_version, claims: (res.claims || []).length,
      });
      const tampered = (res.claims || []).filter((c) => c.hash_ok === false);
      if (tampered.length > 0) {
        publish('wicked.evidence.tampered', 'vault.cross_check', {
          scope: res.scope, phase: res.phase,
          artifact_ids: tampered.map((c) => c.artifact_id),
        });
      }
      // Surface each consulted independent opinion (judgment tier).
      if (withAttestations) {
        for (const c of (res.claims || [])) {
          if (c.attestation) {
            publish('wicked.claim.evaluated', 'vault.cross_check', {
              scope: res.scope, phase: res.phase, claim_id: c.claim_id,
              opinion: c.attestation.opinion, evaluator: c.attestation.evaluator,
            });
          }
        }
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
        source: args.source, verifier: args.verifier, criteria: resolveCriteria(args.criteria),
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
      emit({ error: `unknown command: ${cmd}`, commands: ['init', 'record', 'verify', 'inspect', 'attest', 'attestations', 'cross-check', 'declare-contract', 'list', 'supersede'] }, false);
  }
} catch (e) {
  emit({ error: e.message }, false);
}
