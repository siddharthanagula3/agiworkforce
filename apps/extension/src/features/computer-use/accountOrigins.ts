import { configuredAgiWebOrigin } from '../../lib/webOrigin';
import { normalizeApprovedSiteOrigin } from '../options/site-allowlist';

const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(['localhost', '127.0.0.1', '[::1]']);

export const ACCOUNT_ORIGIN_REFUSAL =
  'AGI cannot control your AGI account or sign-in pages. Use that page yourself.';

interface HostPattern {
  readonly scheme: string;
  readonly host: string;
  readonly port: string | null;
}

export interface ManifestHostPermissions {
  readonly host_permissions?: readonly string[];
}

function parseHostPattern(pattern: string): HostPattern | null {
  const match = /^(\*|https?):\/\/([^/:]+)(?::(\d+))?\/.*$/u.exec(pattern);
  if (!match) return null;
  return { scheme: match[1]!, host: match[2]!.toLowerCase(), port: match[3] ?? null };
}

function patternCovers(pattern: HostPattern, url: URL): boolean {
  const scheme = url.protocol.slice(0, -1);
  if (pattern.scheme !== '*' ? pattern.scheme !== scheme : !['http', 'https'].includes(scheme))
    return false;
  const host = url.hostname.toLowerCase();
  const hostMatches = pattern.host.startsWith('*.')
    ? host.endsWith(pattern.host.slice(1))
    : pattern.host === host;
  return hostMatches && (pattern.port === null || pattern.port === url.port);
}

function runtimeManifest(): ManifestHostPermissions {
  return chrome.runtime.getManifest() as ManifestHostPermissions;
}

export function isLoopbackOrigin(origin: string): boolean {
  const normalized = normalizeApprovedSiteOrigin(origin);
  return normalized !== null && LOOPBACK_HOSTS.has(new URL(normalized).hostname);
}

/**
 * The origins where the user's AGI session and billing live: every host the
 * manifest grants at install apart from the any-port loopback grant, plus the
 * configured AGI web origin. Chrome never prompts for these, so no stored
 * approval can stand in for its site-access grant. An unreadable manifest
 * treats every origin as one of these.
 */
export function isExtensionAccountOrigin(
  origin: string,
  manifest: () => ManifestHostPermissions = runtimeManifest,
): boolean {
  const normalized = normalizeApprovedSiteOrigin(origin);
  if (!normalized) return false;
  if (normalized === configuredAgiWebOrigin()) return true;
  let patterns: readonly string[];
  try {
    patterns = manifest().host_permissions ?? [];
  } catch {
    return true;
  }
  const url = new URL(normalized);
  return patterns.some((raw) => {
    const pattern = parseHostPattern(raw);
    if (!pattern || pattern.host === '*') return false;
    if (LOOPBACK_HOSTS.has(pattern.host) && pattern.port === null) return false;
    return patternCovers(pattern, url);
  });
}
