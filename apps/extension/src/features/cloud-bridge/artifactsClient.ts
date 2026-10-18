import { FREE_TRIAL_GATEWAY, getAuthToken } from './freeTrialClient';
import { platformRequestHeaders } from '../../platformHeaders';

export const ARTIFACT_INDEX_PATH = '/api/artifacts/index';
export const CHROME_ARTIFACT_PAGE_SIZE = 50;

export interface ChromeArtifact {
  id: string;
  conversationId: string;
  messageId: string;
  title: string | null;
  type: string;
  language: string | null;
  createdAt: string;
}

export interface ChromeArtifactsDependencies {
  getAuthToken: typeof getAuthToken;
  fetchImpl: (input: string, init?: RequestInit) => Promise<Response>;
}

export type ChromeArtifactsErrorCode = 'auth_required' | 'cancelled' | 'server_error';

export interface ChromeArtifactsError {
  status: 'error';
  code: ChromeArtifactsErrorCode;
  message: string;
}

export type ChromeArtifactListResult =
  { status: 'success'; artifacts: ChromeArtifact[] } | ChromeArtifactsError;

export class ChromeArtifactsHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ChromeArtifactsHttpError';
  }
}

const DEFAULT_DEPENDENCIES: ChromeArtifactsDependencies = {
  getAuthToken,
  fetchImpl: (input, init) => fetch(input, init),
};

function signedOut(): ChromeArtifactsError {
  return {
    status: 'error',
    code: 'auth_required',
    message: 'Sign in to your AGI account to see your artifacts.',
  };
}

export function describeArtifactsFailure(
  error: unknown,
  signal?: AbortSignal,
): ChromeArtifactsError {
  if (signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
    return { status: 'error', code: 'cancelled', message: 'Cancelled.' };
  }
  const status = error instanceof ChromeArtifactsHttpError ? error.status : null;
  if (status === 401 || status === 403) return signedOut();
  return {
    status: 'error',
    code: 'server_error',
    message: error instanceof Error ? error.message : 'Artifacts are unavailable right now.',
  };
}

export function parseChromeArtifacts(value: unknown): ChromeArtifact[] {
  if (!value || typeof value !== 'object') {
    throw new Error('The artifact index returned an unreadable response.');
  }
  const rows = (value as Record<string, unknown>)['artifacts'];
  if (!Array.isArray(rows)) {
    throw new Error('The artifact index returned no artifact list.');
  }
  const artifacts: ChromeArtifact[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const record = row as Record<string, unknown>;
    const id = record['id'];
    const conversationId = record['conversationId'];
    const messageId = record['messageId'];
    const type = record['type'];
    const createdAt = record['createdAt'];
    if (
      typeof id !== 'string' ||
      typeof conversationId !== 'string' ||
      typeof messageId !== 'string' ||
      typeof type !== 'string' ||
      typeof createdAt !== 'string'
    ) {
      continue;
    }
    artifacts.push({
      id,
      conversationId,
      messageId,
      title: typeof record['title'] === 'string' ? record['title'] : null,
      type,
      language: typeof record['language'] === 'string' ? record['language'] : null,
      createdAt,
    });
  }
  return artifacts;
}

export function chromeArtifactConversationUrl(conversationId: string): string {
  return `${FREE_TRIAL_GATEWAY}/chat/${encodeURIComponent(conversationId)}`;
}

export async function listChromeArtifacts(
  options: { signal?: AbortSignal } = {},
  dependencies: Partial<ChromeArtifactsDependencies> = {},
): Promise<ChromeArtifactListResult> {
  const deps = { ...DEFAULT_DEPENDENCIES, ...dependencies };
  try {
    const token = await deps.getAuthToken();
    if (!token) return signedOut();
    const response = await deps.fetchImpl(
      `${FREE_TRIAL_GATEWAY}${ARTIFACT_INDEX_PATH}?limit=${CHROME_ARTIFACT_PAGE_SIZE}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Requested-With': 'XMLHttpRequest',
          ...platformRequestHeaders(),
        },
        ...(options.signal ? { signal: options.signal } : {}),
      },
    );
    if (!response.ok) {
      throw new ChromeArtifactsHttpError(
        `The artifact index is unavailable (${response.status}).`,
        response.status,
      );
    }
    return { status: 'success', artifacts: parseChromeArtifacts(await response.json()) };
  } catch (error) {
    return describeArtifactsFailure(error, options.signal);
  }
}
