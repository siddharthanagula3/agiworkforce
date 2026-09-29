import type { DeviceCapabilities, DevicePresence } from '@agiworkforce/cloud-contracts';
import { api } from '@/services/api';

const DEVICES_PATH = '/api/settings/devices';
const COMPUTER_SURFACES = new Set(['desktop', 'cli', 'vscode']);

export interface AccountComputer {
  id: string;
  kind: string;
  name: string | null;
  platform: string | null;
  architecture: string | null;
  presence: DevicePresence;
  capabilities: DeviceCapabilities | null;
  lastSeenAt: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

export async function listAccountComputers(): Promise<AccountComputer[]> {
  const body = await api.get<unknown>(DEVICES_PATH);
  const devices = isRecord(body) && Array.isArray(body['devices']) ? body['devices'] : [];
  return devices.flatMap((device): AccountComputer[] => {
    if (!isRecord(device) || typeof device['id'] !== 'string') return [];
    const kind = device['kind'];
    if (typeof kind !== 'string' || !COMPUTER_SURFACES.has(kind)) return [];
    const presence = device['presence'];
    return [
      {
        id: device['id'],
        kind,
        name: nullableString(device['name']),
        platform: nullableString(device['platform']),
        architecture: nullableString(device['architecture']),
        presence: presence === 'online' || presence === 'sleeping' ? presence : 'offline',
        capabilities: isRecord(device['capabilities'])
          ? (device['capabilities'] as DeviceCapabilities)
          : null,
        lastSeenAt: nullableString(device['lastSeenAt']),
      },
    ];
  });
}
