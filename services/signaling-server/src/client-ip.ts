import type { IncomingMessage } from 'node:http';
import { isIP } from 'node:net';
import { TRUSTED_PROXY_HOPS_DEFAULT } from './constants.js';

export function isProxyTrusted(env: NodeJS.ProcessEnv = process.env): boolean {
  return env['TRUST_PROXY'] === 'true' || env['TRUST_PROXY'] === '1';
}

export function resolveTrustedProxyHops(env: NodeJS.ProcessEnv = process.env): number {
  const configured = Number(env['TRUSTED_PROXY_HOPS'] ?? TRUSTED_PROXY_HOPS_DEFAULT);
  return Number.isInteger(configured) && configured > 0 ? configured : TRUSTED_PROXY_HOPS_DEFAULT;
}

export function forwardedChain(req: IncomingMessage): string[] {
  const forwardedFor = req.headers['x-forwarded-for'];
  return (Array.isArray(forwardedFor) ? forwardedFor.join(',') : (forwardedFor ?? ''))
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function resolveClientIp(
  req: IncomingMessage,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  if (!isProxyTrusted(env)) return req.socket.remoteAddress ?? null;

  const chain = forwardedChain(req);

  // Each proxy appends the peer it observed, so only the entry `hops` from the right was written
  // by a trusted proxy; everything left of it is client-supplied and spoofable. Without that
  // entry the socket peer is the proxy itself, which every client shares, so there is no answer.
  const claimed = chain[chain.length - resolveTrustedProxyHops(env)];
  return claimed && isIP(claimed) !== 0 ? claimed : null;
}
