/**
 * Type declarations for src/vault/bus.mjs — optional, fire-and-forget
 * wicked-bus integration.
 *
 * Hand-authored against the runtime module. Keep in lockstep — CI runs
 * `npm run typecheck` against test/types/consumer.mts so drift fails loudly.
 */

/**
 * Synchronous publish closure returned by initBus(). Never throws; degrades
 * to a silent no-op when wicked-bus is unavailable or disabled.
 */
export type BusPublisher = (event_type: string, subdomain: string, payload: Record<string, unknown>) => void;

/**
 * Build the bus publisher. Dynamic-imports wicked-bus at runtime and
 * degrades to a no-op when it is absent or WICKED_VAULT_NO_BUS=1 is set.
 *
 * @param cwd directory to anchor module resolution from (default: process.cwd()).
 */
export function initBus(cwd?: string): Promise<BusPublisher>;
