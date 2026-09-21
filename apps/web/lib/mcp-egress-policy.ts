import type { McpEgressPolicy } from '@agiworkforce/mcp';

import { createDeadline, credentialedFetch } from '@/lib/url-fetch/guarded-fetch';
import { assertResolvedPublicHostname } from './egress-policy';

const MCP_DIAL_TIMEOUT_MS = 120_000;

export class McpEgressRefusedError extends Error {
  readonly refusal: string;

  constructor(refusal: string, detail: string) {
    super(detail);
    this.name = 'McpEgressRefusedError';
    this.refusal = refusal;
  }
}

/**
 * The dial carries the user's credential to a server the user named, so this
 * process follows the hops rather than the client: every hop is vetted, and a
 * redirect off the registered origin is refused rather than followed with the
 * credential attached.
 */
async function mcpPolicyFetch(
  input: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const headers = Object.fromEntries(new Headers(init?.headers ?? {}).entries());
  const deadline = createDeadline(MCP_DIAL_TIMEOUT_MS, init?.signal ?? undefined);
  try {
    const outcome = await credentialedFetch(new URL(href), {
      deadline,
      redirects: 'same-origin',
      headers,
      ...(init?.method ? { method: init.method } : {}),
      ...(init?.body === undefined || init.body === null ? {} : { body: init.body }),
    });
    if (outcome.ok) return outcome.response;
    throw new McpEgressRefusedError(outcome.refusal, outcome.detail);
  } finally {
    deadline.release();
  }
}

export const MCP_EGRESS_POLICY: McpEgressPolicy = {
  assertAllowedUrl: (url: string) => assertResolvedPublicHostname(url),
  fetch: (input, init) => mcpPolicyFetch(input, init),
};
