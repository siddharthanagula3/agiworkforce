/**
 * Credential-failure failover policy.
 *
 * `fallback.ts` answers "which model next"; this module answers "may this
 * failure rotate at all". It exists for one class the availability sets miss:
 * a managed attempt authenticates with the platform's OWN key for that
 * upstream, so an `auth` classification (401/403, revoked OAuth token,
 * disabled organization, exhausted credit balance) condemns ONE provider
 * account. It says nothing about the request and nothing about the other
 * providers on the resolver's fallback plan, so treating it as terminal
 * strands a request that a distinct provider would have served.
 *
 * The same fact bounds the rotation: every remaining route on the rejected
 * provider would present the same rejected key, so those routes are skipped
 * rather than attempted — otherwise a suspended provider with three plan
 * entries burns the request deadline on three guaranteed 401s.
 *
 * Trust boundary (CLAUDE.md): this policy is for a surface where every
 * attempt already authenticates with the same platform-held credentials.
 * Local and BYOK sessions must not use it to reach for another provider's
 * key on the user's behalf — that requires the explicit fork/consent flow.
 */

import type { ErrorCategory } from './errors';

/**
 * Categories whose failure is scoped to one provider account rather than to
 * the request. `classifyError` folds every credential-shaped rejection —
 * `auth_401`, `auth_403`, `oauth_revoked`, `org_disabled`,
 * `credit_balance_low` — into the single `auth` category.
 */
const CREDENTIAL_FAILURE_CATEGORIES: ReadonlySet<ErrorCategory> = new Set(['auth']);

/** True when the classified category reports a rejected provider credential. */
export function isCredentialFailureCategory(category: string): boolean {
  return CREDENTIAL_FAILURE_CATEGORIES.has(category as ErrorCategory);
}

/**
 * Per-request record of the providers whose credentials have been rejected.
 *
 * Scoped to a single request deliberately: a key can be restored (or a
 * suspension lifted) between requests, and a process-lifetime cache of
 * "provider X is dead" would keep routing around a recovered provider.
 */
export class CredentialFailoverState {
  private readonly rejectedProviderIds = new Set<string>();

  /**
   * Record one failed attempt against the provider that served it. Returns
   * `true` when the failure is a credential rejection, which both admits a
   * rotation the availability rules would have refused and marks the provider
   * unusable for the rest of this request.
   */
  recordFailure(provider: string, category: string): boolean {
    if (!isCredentialFailureCategory(category)) return false;
    this.rejectedProviderIds.add(provider);
    return true;
  }

  /** True when a candidate route could only replay a rejected credential. */
  blocksRoute(provider: string): boolean {
    return this.rejectedProviderIds.has(provider);
  }

  /** Providers rejected so far, in rejection order — for failover telemetry. */
  rejectedProviders(): readonly string[] {
    return [...this.rejectedProviderIds];
  }
}
