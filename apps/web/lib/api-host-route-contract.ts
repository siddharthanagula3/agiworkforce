/**
 * Public path aliases served only by api.agiworkforce.com.
 *
 * Next rewrites these paths after Proxy runs. Keep the rewrite table and the
 * Proxy pass-through decision on this one contract: if Proxy redirects a
 * source first, the host condition is lost and the rewrite can never match.
 */
export const API_HOST_REWRITE_ROUTES = [
  {
    source: '/v1/chat/completions',
    destination: '/api/llm/v1/chat/completions',
    usesClerkContext: true,
  },
  {
    source: '/v1/models',
    destination: '/api/llm/v1/models',
    usesClerkContext: true,
  },
  {
    source: '/v1/embeddings',
    destination: '/api/llm/v1/embeddings',
    usesClerkContext: true,
  },
  {
    source: '/v1/credits/balance',
    destination: '/api/llm/v1/credits/balance',
    usesClerkContext: true,
  },
  {
    source: '/v1/audio/transcriptions',
    destination: '/api/llm/v1/audio/transcriptions',
    usesClerkContext: true,
  },
  { source: '/health', destination: '/api/health', usesClerkContext: false },
] as const;

const API_HOST_REWRITE_BY_SOURCE = new Map<string, (typeof API_HOST_REWRITE_ROUTES)[number]>(
  API_HOST_REWRITE_ROUTES.map((route) => [route.source, route] as const),
);

export function isApiHostRewriteSource(pathname: string): boolean {
  return API_HOST_REWRITE_BY_SOURCE.has(pathname);
}

export function apiHostRewriteUsesClerk(pathname: string): boolean {
  return API_HOST_REWRITE_BY_SOURCE.get(pathname)?.usesClerkContext ?? false;
}
