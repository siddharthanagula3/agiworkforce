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

export function resolveClientIp(
  req: IncomingMessage,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const socketIp = req.socket.remoteAddress;
  if (!isProxyTrusted(env)) return socketIp ?? 'unknown';

  const forwardedFor = req.headers['x-forwarded-for'];
  const chain = (Array.isArray(forwardedFor) ? forwardedFor.join(',') : (forwardedFor ?? ''))
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  // Each proxy appends the peer it observed, so only the entry `hops` from the right was written
  // by a trusted proxy; everything left of it is client-supplied and spoofable.
  const claimed = chain[chain.length - resolveTrustedProxyHops(env)];
  if (claimed && isIP(claimed) !== 0) return claimed;

  return socketIp ?? 'unknown';
}
