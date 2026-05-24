import { spawnSync } from 'node:child_process';

// A verifier is a PURE, DETERMINISTIC function of (payload-view, params) (G7).
//   run(view, params, ctx) -> { status: 'pass' | 'fail' | 'error', detail }
// view = { text, json, raw } derived from the payload blob.
// An unknown kind is treated as ERROR by the caller (G5 fail-closed).

// For a --run capture the payload is {command, exit_code, stdout, stderr,...};
// the "verifiable text" is stdout+stderr. For a raw --artifact it is the text.
function verifiableText(view) {
  if (view.json && (view.json.stdout !== undefined || view.json.stderr !== undefined)) {
    return `${view.json.stdout ?? ''}\n${view.json.stderr ?? ''}`;
  }
  return view.text;
}

export const VERIFIERS = {
  exit_code_eq: {
    determinism: 'deterministic',
    run(view, params) {
      if (!view.json || typeof view.json.exit_code !== 'number') {
        return { status: 'fail', detail: 'payload carries no exit_code (not a --run capture)' };
      }
      const want = params.code ?? 0;
      return view.json.exit_code === want
        ? { status: 'pass', detail: `exit_code=${view.json.exit_code}` }
        : { status: 'fail', detail: `exit_code=${view.json.exit_code} != ${want}` };
    },
  },

  regex_match: {
    determinism: 'deterministic',
    run(view, params) {
      const re = new RegExp(params.pattern, params.flags || 'm');
      return re.test(verifiableText(view))
        ? { status: 'pass', detail: `matched /${params.pattern}/` }
        : { status: 'fail', detail: `no match for /${params.pattern}/` };
    },
  },

  not_contains: {
    determinism: 'deterministic',
    run(view, params) {
      const re = new RegExp(params.pattern, params.flags || 'm');
      return re.test(verifiableText(view))
        ? { status: 'fail', detail: `forbidden /${params.pattern}/ is present` }
        : { status: 'pass', detail: `/${params.pattern}/ absent` };
    },
  },

  jq_pred: {
    determinism: 'deterministic',
    run(view, params) {
      const input = view.json !== null ? JSON.stringify(view.json) : view.text;
      const r = spawnSync('jq', ['-e', params.expr], { input, encoding: 'utf8' });
      if (r.error) return { status: 'error', detail: 'jq binary not available' };
      return r.status === 0
        ? { status: 'pass', detail: `jq -e '${params.expr}' -> truthy` }
        : { status: 'fail', detail: `jq -e '${params.expr}' -> false/null` };
    },
  },

  commit_exists: {
    determinism: 'deterministic',
    run(view, params, ctx) {
      const sha = (params.sha || verifiableText(view)).trim().split(/\s+/)[0];
      const r = spawnSync('git', ['-C', ctx.repoRoot || '.', 'cat-file', '-e', `${sha}^{commit}`], { encoding: 'utf8' });
      if (r.error) return { status: 'error', detail: 'git binary not available' };
      return r.status === 0
        ? { status: 'pass', detail: `commit ${sha.slice(0, 10)} exists` }
        : { status: 'fail', detail: `commit ${sha.slice(0, 10)} not found` };
    },
  },
};

export function runVerifier(verifier, view, ctx) {
  const v = VERIFIERS[verifier.kind];
  if (!v) return { status: 'error', detail: `unknown verifier kind: ${verifier.kind}` };
  try {
    return v.run(view, verifier.params || {}, ctx || {});
  } catch (e) {
    return { status: 'error', detail: `verifier threw: ${e.message}` };
  }
}
