
import type { ErrorCategory } from './errors';

const CREDENTIAL_FAILURE_CATEGORIES: ReadonlySet<ErrorCategory> = new Set(['auth']);

export function isCredentialFailureCategory(category: string): boolean {
  return CREDENTIAL_FAILURE_CATEGORIES.has(category as ErrorCategory);
}

export class CredentialFailoverState {
  private readonly rejectedProviderIds = new Set<string>();

  recordFailure(provider: string, category: string): boolean {
    if (!isCredentialFailureCategory(category)) return false;
    this.rejectedProviderIds.add(provider);
    return true;
  }

  blocksRoute(provider: string): boolean {
    return this.rejectedProviderIds.has(provider);
  }

  rejectedProviders(): readonly string[] {
    return [...this.rejectedProviderIds];
  }
}
