'use client';

import { getCsrfToken as getBrowserCsrfToken } from '@/lib/client/csrf';

import {
  securityScanFindingPath,
  securityScanSessionPath,
  type SecurityScanCompletedReport,
  type SecurityScanDecision,
  type SecurityScanDecisionRequest,
  type SecurityScanDecisionResponse,
  type SecurityScanRequest,
  type SecurityScanResponse,
  type SecurityScanStateResponse,
} from '@agiworkforce/cloud-contracts';
import type { Effort } from '@agiworkforce/types';

export class SecurityScanApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'SecurityScanApiError';
    this.status = status;
  }
}

export interface SecurityScanApi {
  read(sessionId: string): Promise<SecurityScanStateResponse>;
  scan(
    sessionId: string,
    input: { scope: string | null; model?: string | null; effort?: Effort | null },
  ): Promise<SecurityScanCompletedReport>;
  decide(
    sessionId: string,
    input: { scanId: string; findingId: string; decision: SecurityScanDecision },
  ): Promise<SecurityScanDecisionResponse>;
}

interface SecurityScanApiDependencies {
  fetchImpl?: typeof fetch;
  getCsrfToken?: () => Promise<string>;
}

async function readError(response: Response): Promise<SecurityScanApiError> {
  let message = response.statusText || 'The request failed';
  try {
    const body = (await response.json()) as { error?: { message?: unknown } };
    if (typeof body.error?.message === 'string' && body.error.message.trim()) {
      message = body.error.message;
    }
  } catch {
    return new SecurityScanApiError(message, response.status);
  }
  return new SecurityScanApiError(message, response.status);
}

export function createSecurityScanApi(
  dependencies: SecurityScanApiDependencies = {},
): SecurityScanApi {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const getCsrfToken = dependencies.getCsrfToken ?? getBrowserCsrfToken;

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetchImpl(path, { credentials: 'include', ...init });
    if (!response.ok) throw await readError(response);
    return (await response.json()) as T;
  }

  async function post<T>(path: string, body: unknown): Promise<T> {
    return request<T>(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-csrf-token': await getCsrfToken() },
      body: JSON.stringify(body),
    });
  }

  return {
    read: (sessionId) => request<SecurityScanStateResponse>(securityScanSessionPath(sessionId)),
    async scan(sessionId, input) {
      const body: SecurityScanRequest = {
        consent: true,
        ...(input.scope ? { scope: input.scope } : {}),
        ...(input.model ? { model: input.model } : {}),
        ...(input.model && input.effort ? { effort: input.effort } : {}),
      };
      const result = await post<SecurityScanResponse>(securityScanSessionPath(sessionId), body);
      return result.report;
    },
    decide: (sessionId, input) =>
      post<SecurityScanDecisionResponse>(securityScanFindingPath(sessionId, input.findingId), {
        scanId: input.scanId,
        decision: input.decision,
      } satisfies SecurityScanDecisionRequest),
  };
}

export const securityScanApi = createSecurityScanApi();
