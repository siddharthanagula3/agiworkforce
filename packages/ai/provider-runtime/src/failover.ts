import type { ErrorCategory } from './errors';

const CREDENTIAL_FAILURE_CATEGORIES: ReadonlySet<ErrorCategory> = new Set(['auth']);

export function isCredentialFailureCategory(category: string): boolean {
  return CREDENTIAL_FAILURE_CATEGORIES.has(category as ErrorCategory);
}

export interface CredentialFailoverStateOptions {
  /**
   * Credentials a shared breaker already holds open.
   *
   * Without this the memory lasts one request, so a key that has been dead for
   * an hour is rediscovered by every caller in turn, each paying one refusal
   * per route on that provider before moving on.
   */
  openCredentialIds?: Iterable<string>;
  /**
   * Called the first time a credential is rejected in this request, so the
   * caller can write the rejection where the next request will read it.
   */
  onCredentialRejected?: (credentialId: string) => void;
}

export class CredentialFailoverState {
  private readonly rejectedProviderIds = new Set<string>();
  private readonly openCredentialIds: ReadonlySet<string>;
  private readonly onCredentialRejected: ((credentialId: string) => void) | undefined;

  constructor(options: CredentialFailoverStateOptions = {}) {
    this.openCredentialIds = new Set(options.openCredentialIds ?? []);
    this.onCredentialRejected = options.onCredentialRejected;
  }

  recordFailure(provider: string, category: string): boolean {
    if (!isCredentialFailureCategory(category)) return false;
    const first = !this.rejectedProviderIds.has(provider);
    this.rejectedProviderIds.add(provider);
    if (first) this.onCredentialRejected?.(provider);
    return true;
  }

  blocksRoute(provider: string): boolean {
    return this.rejectedProviderIds.has(provider) || this.openCredentialIds.has(provider);
  }

  rejectedProviders(): readonly string[] {
    return [...this.rejectedProviderIds];
  }

  /** Credentials this request has not touched, blocked by the shared breaker. */
  parkedProviders(): readonly string[] {
    return [...this.openCredentialIds].filter(
      (credentialId) => !this.rejectedProviderIds.has(credentialId),
    );
  }
}
