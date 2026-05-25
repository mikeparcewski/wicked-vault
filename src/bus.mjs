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

import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

const DOMAIN = 'wicked-vault';

// Resolve the wicked-bus module namespace, or null. Two layers, in order:
//   1. bare specifier — works when wicked-bus is installed globally or hoisted
//      alongside the vault.
//   2. the consumer project's node_modules (anchored at cwd) — the common case,
//      since sibling tools live in the same repo the vault is invoked from, and
//      the vault itself ships no node_modules.
async function resolveBus(cwd) {
  try {
    return await import('wicked-bus');
  } catch {
    /* fall through to layer 2 */
  }
  try {
    const require = createRequire(join(cwd, '__vault_bus_anchor__.js'));
    const entry = require.resolve('wicked-bus');
    return await import(pathToFileURL(entry).href);
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
  if (!bus || typeof bus.emit !== 'function' || typeof bus.openDb !== 'function') {
    return NOOP;
  }

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
