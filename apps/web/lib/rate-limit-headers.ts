import type { NextRequest } from 'next/server';

const admittedHeaders = new WeakMap<Request, Readonly<Record<string, string>>>();

export function recordAdmittedRateLimit(
  request: Request,
  headers: Readonly<Record<string, string>>,
): void {
  if (Object.keys(headers).length > 0) admittedHeaders.set(request, headers);
}

export function withAdmittedRateLimitHeaders<TArgs extends unknown[], TResponse extends Response>(
  handler: (request: NextRequest, ...args: TArgs) => Promise<TResponse>,
): (request: NextRequest, ...args: TArgs) => Promise<TResponse> {
  return async (request: NextRequest, ...args: TArgs): Promise<TResponse> => {
    const response = await handler(request, ...args);
    const headers = admittedHeaders.get(request);
    if (headers) {
      for (const [name, value] of Object.entries(headers)) {
        if (!response.headers.has(name)) response.headers.set(name, value);
      }
    }
    return response;
  };
}
