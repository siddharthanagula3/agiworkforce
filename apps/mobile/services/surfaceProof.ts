import { SURFACE_TOKEN_HEADER } from '@agiworkforce/types';
import { API_URL } from '@/lib/constants';
import { getClerkSurfaceToken } from '@/src/integrations/clerk';

const BEARER = /^Bearer \S+$/;

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function headerValue(headers: HeadersInit | undefined, name: string): string | null {
  if (!headers) return null;
  if (typeof Headers !== 'undefined' && headers instanceof Headers) return headers.get(name);
  const entries = Array.isArray(headers) ? headers : Object.entries(headers);
  const match = entries.find(([key]) => key.toLowerCase() === name.toLowerCase());
  return match ? String(match[1]) : null;
}

function withHeader(headers: HeadersInit | undefined, name: string, value: string): HeadersInit {
  if (!headers) return { [name]: value };
  if (typeof Headers !== 'undefined' && headers instanceof Headers) {
    const copy = new Headers(headers);
    copy.set(name, value);
    return copy;
  }
  if (Array.isArray(headers)) return [...headers, [name, value]];
  return { ...headers, [name]: value };
}

export async function withSurfaceProof(
  url: string,
  init: RequestInit | undefined,
): Promise<RequestInit | undefined> {
  const apiOrigin = originOf(API_URL);
  if (!apiOrigin || originOf(url) !== apiOrigin) return init;
  const authorization = headerValue(init?.headers, 'authorization');
  if (!authorization || !BEARER.test(authorization)) return init;
  if (headerValue(init?.headers, SURFACE_TOKEN_HEADER) !== null) return init;
  const proof = await getClerkSurfaceToken();
  if (!proof) return init;
  return { ...init, headers: withHeader(init?.headers, SURFACE_TOKEN_HEADER, proof) };
}
