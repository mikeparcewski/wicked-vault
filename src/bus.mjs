// Optional, fire-and-forget wicked-bus integration.
//
// The vault is a zero-dependency, local-first primitive. wicked-bus is a
// *sibling* primitive, never a hard dependency: this module dynamic-imports it
// at runtime and degrades to a silent no-op when it is absent or disabled.
// Emission NEVER blocks or breaks a vault command — by the time we publish, the
// evidence write has already happened (G6 append-only), and a bus problem must
// not change a verdict, the stdout JSON, or an exit code.
//
// Opt out entirely with WICKED_VAULT_NO_BUS=1.

import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';

const DOMAIN = 'wicked-vault';

// Given a resolved file inside a package, return its ESM ("import") entry.
// `require.resolve()` applies the "require" condition, so for a dual-published
// package it returns the CJS entry — and wicked-bus ships a CJS *shim* with no
// real exports (importing it yields `emit: undefined`). We must read the
// package.json and import the ESM entry instead. (`require.resolve` can't fetch
// package.json directly when "exports" doesn't expose it, so walk up to the
// package root and read it from disk.)
function esmEntryForPackage(resolvedFile) {
  let dir = dirname(resolvedFile);
  for (let i = 0; i < 10; i++) {
    const pj = join(dir, 'package.json');
    if (existsSync(pj)) {
      let pkg;
      try { pkg = JSON.parse(readFileSync(pj, 'utf8')); } catch { return null; }
      const dot = pkg.exports && pkg.exports['.'] !== undefined ? pkg.exports['.'] : pkg.exports;
      const rel =
        (dot && typeof dot === 'object' && (dot.import || dot.default)) ||
        (typeof dot === 'string' ? dot : null) ||
        pkg.module || pkg.main || 'index.js';
      return join(dir, rel);
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

// Resolve the wicked-bus module namespace, or null. Two layers, in order:
//   1. bare specifier — works when wicked-bus is installed globally or hoisted
//      alongside the vault. import() uses the ESM condition, so it returns the
//      real module.
//   2. the consumer project's node_modules (anchored at cwd) — the common case,
//      since sibling tools live in the same repo the vault is invoked from, and
//      the vault itself ships no node_modules. require.resolve locates the
//      package; we import its ESM entry so we get real exports, not a CJS shim.
async function resolveBus(cwd) {
  try {
    return await import('wicked-bus');
  } catch {
    /* fall through to layer 2 */
  }
  try {
    const require = createRequire(join(cwd, '__vault_bus_anchor__.js'));
    const located = require.resolve('wicked-bus');
    const esm = esmEntryForPackage(located) || located;
    return await import(pathToFileURL(esm).href);
  } catch {
    return null;
  }
}

/**
 * Build the bus publisher.
 *
 * @param {string} [cwd] directory to anchor module resolution from.
 * @returns {Promise<(event_type: string, subdomain: string, payload: object) => void>}
 *   a synchronous publish closure, or a no-op when the bus is unavailable or
 *   disabled. The returned function never throws.
 */
export async function initBus(cwd = process.cwd()) {
  const NOOP = () => {};
  if (process.env.WICKED_VAULT_NO_BUS === '1') return NOOP;

  const bus = await resolveBus(cwd);
  // Defensive capability check — a pathological module (e.g. a CJS shim whose
  // property access throws) must degrade to a no-op, never crash the vault.
  let usable = false;
  try {
    usable = !!bus && typeof bus.emit === 'function' && typeof bus.openDb === 'function';
  } catch {
    usable = false;
  }
  if (!usable) return NOOP;

  let db;
  let config;
  try {
    config = typeof bus.loadConfig === 'function' ? bus.loadConfig() : {};
    // openDb opens (and idempotently initializes) the local bus db — this is
    // wicked-bus's own auto-init model, the same path the wicked-brain
    // installer uses.
    db = bus.openDb(config);
  } catch {
    return NOOP;
  }

  return (event_type, subdomain, payload) => {
    try {
      bus.emit(db, config, { event_type, domain: DOMAIN, subdomain, payload });
    } catch {
      // swallow — a bus error must never break a vault command
    }
  };
}
