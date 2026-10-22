'use client';

import { getCsrfToken as getBrowserCsrfToken } from '@/lib/client/csrf';

import type {
  SecurityScanCompletedReport,
  SecurityScanDecision,
  SecurityScanDecisionResponse,
  SecurityScanStateResponse,
} from '../contract';

const API_ROOT = '/api/security-scan/sessions';

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
  scan(sessionId: string, input: { scope: string | null }): Promise<SecurityScanCompletedReport>;
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

  const sessionPath = (sessionId: string) => `${API_ROOT}/${encodeURIComponent(sessionId)}`;

  return {
    read: (sessionId) => request<SecurityScanStateResponse>(sessionPath(sessionId)),
    async scan(sessionId, input) {
      const result = await post<{ report: SecurityScanCompletedReport }>(sessionPath(sessionId), {
        consent: true,
        ...(input.scope ? { scope: input.scope } : {}),
      });
      return result.report;
    },
    decide: (sessionId, input) =>
      post<SecurityScanDecisionResponse>(
        `${sessionPath(sessionId)}/findings/${encodeURIComponent(input.findingId)}`,
        { scanId: input.scanId, decision: input.decision },
      ),
  };
}

export const securityScanApi = createSecurityScanApi();
