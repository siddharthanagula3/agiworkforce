import 'server-only';

export const DURABLE_INITIAL_TURNS_ENV = 'AGI_DURABLE_INITIAL_TURNS';

/**
 * Whether a first agentic turn may start on the durable Workflow transport
 * instead of the request-scoped inline stream.
 *
 * OFF unless explicitly enabled: Workflow startup is an external dependency,
 * and a transport that accepts the flow request without ever returning from
 * `start()` would otherwise strand every paid chat before provider egress. Set
 * `AGI_DURABLE_INITIAL_TURNS=1` (or `true`/`on`) only after a deployment health
 * check proves that a flow reaches its first step. Unset or any other value uses
 * the request-scoped stream.
 *
 * Reverting is safe at any moment: runs already executing on the Workflow
 * transport keep running and stay resumable through the approve endpoint, which
 * has always been durable. Only newly started turns change transport.
 */
export function areDurableInitialTurnsEnabled(): boolean {
  const raw = process.env[DURABLE_INITIAL_TURNS_ENV]?.trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'on';
}
