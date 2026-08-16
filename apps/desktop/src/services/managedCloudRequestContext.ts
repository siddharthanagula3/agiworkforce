import { accountBoundCloudFetch, getAuthHeaders } from '../api/cloudApi';
import { guardedFetch } from '../lib/egressGuard';
import {
  assertManagedCloudBoundary,
  captureManagedCloudBoundary,
  subscribeManagedCloudBoundary,
  type ManagedCloudBoundary,
} from './managedCloudBoundary';

export interface ManagedCloudRequestContext {
  readonly boundary: ManagedCloudBoundary;
  assertBoundary(): void;
  getHeaders(): Promise<Record<string, string>>;
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  fetchExternal(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

export function createManagedCloudRequestContext(label: string): ManagedCloudRequestContext {
  const boundary = captureManagedCloudBoundary(label);
  const assertBoundary = () => assertManagedCloudBoundary(boundary);

  return {
    boundary,
    assertBoundary,
    async getHeaders() {
      assertBoundary();
      const headers = await getAuthHeaders(boundary.accountId);
      assertBoundary();
      return headers;
    },
    fetch(input, init) {
      assertBoundary();
      return accountBoundCloudFetch(input, init, boundary.accountId, assertBoundary);
    },
    async fetchExternal(input, init) {
      assertBoundary();
      const boundaryController = new AbortController();
      const abortForBoundaryChange = () =>
        boundaryController.abort(
          new DOMException(
            'The Managed Cloud account changed during external transfer.',
            'AbortError',
          ),
        );
      const unsubscribeBoundary = subscribeManagedCloudBoundary(boundary, abortForBoundaryChange);
      const callerSignal = init?.signal;
      const abortFromCaller = () => boundaryController.abort(callerSignal?.reason);
      if (callerSignal?.aborted) abortFromCaller();
      else callerSignal?.addEventListener('abort', abortFromCaller, { once: true });

      try {
        if (boundaryController.signal.aborted) {
          throw boundaryController.signal.reason;
        }
        const response = await guardedFetch(input, {
          ...init,
          signal: boundaryController.signal,
        });
        assertBoundary();
        return response;
      } finally {
        callerSignal?.removeEventListener('abort', abortFromCaller);
        unsubscribeBoundary();
      }
    },
  };
}
