import 'server-only';

export const MAX_EXTRA_EGRESS_HOSTS = 10;

const HOSTNAME_LABEL = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?';
const EXTRA_EGRESS_HOST_RE = new RegExp(
  `^(?:\\*\\.)?(?:${HOSTNAME_LABEL}\\.)+${HOSTNAME_LABEL}$`,
  'i',
);
const MAX_HOSTNAME_LENGTH = 253;
const NUMERIC_LABEL_RE = /^[0-9]+$/;
const RESERVED_TOP_LEVEL_LABELS = new Set([
  'localhost',
  'local',
  'internal',
  'arpa',
  'home',
  'lan',
  'corp',
  'onion',
]);

function isAddressLiteralOrReservedName(host: string): boolean {
  const labels = host.replace(/^\*\./, '').split('.');
  const topLevel = labels[labels.length - 1] ?? '';
  return NUMERIC_LABEL_RE.test(topLevel) || RESERVED_TOP_LEVEL_LABELS.has(topLevel);
}

export class InvalidExtraEgressHostsError extends Error {}

export function normalizeExtraEgressHosts(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new InvalidExtraEgressHostsError('extraHosts must be a list of hostnames');
  }
  if (value.length > MAX_EXTRA_EGRESS_HOSTS) {
    throw new InvalidExtraEgressHostsError(
      `extraHosts allows at most ${MAX_EXTRA_EGRESS_HOSTS} entries`,
    );
  }
  const hosts: string[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (typeof raw !== 'string') {
      throw new InvalidExtraEgressHostsError('Each extra host must be a string');
    }
    const host = raw.trim().toLowerCase();
    if (
      host.length === 0 ||
      host.length > MAX_HOSTNAME_LENGTH ||
      !EXTRA_EGRESS_HOST_RE.test(host)
    ) {
      throw new InvalidExtraEgressHostsError(
        `"${raw}" is not a valid hostname (a single leading "*." wildcard is allowed)`,
      );
    }
    if (isAddressLiteralOrReservedName(host)) {
      throw new InvalidExtraEgressHostsError(
        `"${raw}" is an address literal or a reserved internal name; name a public DNS host`,
      );
    }
    if (!seen.has(host)) {
      seen.add(host);
      hosts.push(host);
    }
  }
  return hosts;
}
