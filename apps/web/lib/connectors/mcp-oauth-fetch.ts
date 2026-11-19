import 'server-only';

import type { FetchLike } from '@modelcontextprotocol/client';

import { createDeadline, credentialedFetch, readBodyCapped } from '@/lib/url-fetch/guarded-fetch';

const OAUTH_REQUEST_TIMEOUT_MS = 10_000;
const OAUTH_RESPONSE_MAX_BYTES = 1024 * 1024;
const READ_METHOD = 'GET';
const NULL_BODY_STATUSES = new Set([204, 205, 304]);

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
    if (!outcome.ok) throw new McpOAuthEgressRefusedError(outcome.refusal, outcome.detail);
    const { response } = outcome;
    let bytes: Uint8Array<ArrayBuffer> | null;
    try {
      bytes = await readBodyCapped(response, OAUTH_RESPONSE_MAX_BYTES);
    } catch (error) {
      const stopped = deadline.reason();
      if (stopped) {
        throw new McpOAuthEgressRefusedError(
          stopped,
          `Response ${stopped} for ${outcome.url.host}.`,
        );
      }
      throw error;
    }
    if (bytes === null) {
      throw new McpOAuthEgressRefusedError(
        'response_too_large',
        `The OAuth response exceeded ${OAUTH_RESPONSE_MAX_BYTES} bytes.`,
      );
    }
    return new Response(NULL_BODY_STATUSES.has(response.status) ? null : bytes, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } finally {
    deadline.release();
  }
};
