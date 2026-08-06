import 'server-only';

export const DURABLE_INITIAL_TURNS_ENV = 'AGI_DURABLE_INITIAL_TURNS';

/**
 * Whether a first agentic turn may start on the durable Workflow transport
 * instead of the request-scoped inline stream.
 *
 * ON by default: a managed agent turn that only exists inside the HTTP request
 * that started it dies with the laptop lid, which is the whole defect durable
 * sessions exist to fix. The env var is an incident-response kill-switch on the
 * same convention as `AGI_MANAGED_COMPUTE_PRIVATE_BETA` — set
 * `AGI_DURABLE_INITIAL_TURNS=0` (or `false`/`off`) to send every new turn back
 * down the inline path. Any other value, including unset, keeps it on.
 *
 * Reverting is safe at any moment: runs already executing on the Workflow
 * transport keep running and stay resumable through the approve endpoint, which
 * has always been durable. Only newly started turns change transport.
 */
export function areDurableInitialTurnsEnabled(): boolean {
  const raw = process.env[DURABLE_INITIAL_TURNS_ENV]?.trim().toLowerCase();
  return raw !== '0' && raw !== 'false' && raw !== 'off';
}
