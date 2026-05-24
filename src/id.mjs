import { randomBytes } from 'node:crypto';

// G1 — server-minted id. Time-prefixed hex so ids sort by creation order
// (ULID-grade ordering; not strict ULID encoding). Callers cannot supply it.
export function newId() {
  const t = Date.now().toString(16).padStart(12, '0');
  const r = randomBytes(8).toString('hex');
  return (t + r).toUpperCase();
}
