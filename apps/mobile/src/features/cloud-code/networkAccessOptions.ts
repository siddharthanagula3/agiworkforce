import type { CloudCodeNetworkAccess } from '@agiworkforce/types';

export interface NetworkAccessOption {
  id: CloudCodeNetworkAccess;
  label: string;
  description: string;
}

export const NETWORK_ACCESS_OPTIONS: ReadonlyArray<NetworkAccessOption> = [
  { id: 'none', label: 'Isolated', description: 'Commands cannot reach the internet.' },
  {
    id: 'trusted',
    label: 'Trusted hosts',
    description: 'Package registries and code hosts only. Required to clone a repository.',
  },
  {
    id: 'full',
    label: 'Full internet',
    description: 'Unrestricted outbound access from this isolated environment.',
  },
];

export const DEFAULT_NETWORK_ACCESS: CloudCodeNetworkAccess = 'trusted';

export function isNetworkAccess(value: unknown): value is CloudCodeNetworkAccess {
  return NETWORK_ACCESS_OPTIONS.some((option) => option.id === value);
}

export function networkAccessLabel(id: CloudCodeNetworkAccess): string {
  return NETWORK_ACCESS_OPTIONS.find((option) => option.id === id)?.label ?? '';
}
