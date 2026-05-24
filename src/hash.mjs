import { createHash } from 'node:crypto';

export function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

// Deterministic canonical JSON (recursively key-sorted, no whitespace) so a
// hash over a structure is stable regardless of key order.
function sortKeys(o) {
  if (o === null || typeof o !== 'object') return o;
  if (Array.isArray(o)) return o.map(sortKeys);
  const out = {};
  for (const k of Object.keys(o).sort()) out[k] = sortKeys(o[k]);
  return out;
}

export function canonical(obj) {
  return JSON.stringify(sortKeys(obj));
}

// G2 — the envelope hash binds the identifying tuple to the payload hash.
// Mutating ANY of these fields (or the payload) changes the envelope, so a
// later `verify` recomputation will diverge from the stored value.
export function envelopeHash(fields) {
  const tuple = {
    scope: fields.scope,
    phase: fields.phase,
    claim_id: fields.claim_id,
    kind: fields.kind,
    source: fields.source,
    verifier: { kind: fields.verifier.kind, params: fields.verifier.params || {} },
    payload_sha256: fields.payload_sha256,
  };
  return sha256(Buffer.from(canonical(tuple), 'utf8'));
}
