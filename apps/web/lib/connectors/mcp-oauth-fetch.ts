import 'server-only';

import type { FetchLike } from '@modelcontextprotocol/client';

import { createDeadline, credentialedFetch } from '@/lib/url-fetch/guarded-fetch';

const OAUTH_REQUEST_TIMEOUT_MS = 10_000;
const READ_METHOD = 'GET';

export class McpOAuthEgressRefusedError extends Error {
  constructor(
    readonly refusal: string,
    detail: string,
  ) {
    super(detail);
    this.name = 'McpOAuthEgressRefusedError';
  }
}

function requestUrl(input: string | URL): URL {
  return input instanceof URL ? input : new URL(input);
}

export const mcpOAuthFetch: FetchLike = async (input, init) => {
  const method = init?.method?.toUpperCase() ?? READ_METHOD;
  const deadline = createDeadline(OAUTH_REQUEST_TIMEOUT_MS, init?.signal ?? undefined);
  try {
    const outcome = await credentialedFetch(requestUrl(input), {
      deadline,
      redirects: method === READ_METHOD ? 'same-origin' : 'refuse',
      method,
      headers: Object.fromEntries(new Headers(init?.headers ?? {}).entries()),
      ...(init?.body === undefined || init.body === null ? {} : { body: init.body }),
    });
    if (outcome.ok) return outcome.response;
    throw new McpOAuthEgressRefusedError(outcome.refusal, outcome.detail);
  } finally {
    deadline.release();
  }
};
