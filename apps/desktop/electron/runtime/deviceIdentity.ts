import { app } from 'electron';
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * How this installation names itself to a cloud turn that wants to hand it a
 * step.
 *
 * The id is generated here and never leaves this machine except on the user's
 * own requests, so it identifies the installation rather than the hardware: a
 * reinstall is a new device, which is the honest answer to "may this machine
 * answer the step the other one was asked".
 */

export interface DeviceIdentity {
  deviceId: string;
  deviceName: string;
}

let cached: DeviceIdentity | null = null;

function identityPath(): string {
  return path.join(app.getPath('userData'), 'device-identity.json');
}

function readStoredId(): string | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(identityPath(), 'utf8'));
    if (!parsed || typeof parsed !== 'object') return null;
    const stored = (parsed as Record<string, unknown>)['deviceId'];
    return typeof stored === 'string' && stored.length > 0 ? stored : null;
  } catch {
    return null;
  }
}

function persistId(deviceId: string): void {
  try {
    writeFileSync(identityPath(), `${JSON.stringify({ deviceId }, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
  } catch (error) {
    console.warn('[device] could not persist the device id:', error);
  }
}

function friendlyName(): string {
  const raw = hostname().trim();
  const withoutSuffix = raw.replace(/\.local$/i, '');
  return withoutSuffix.length > 0 ? withoutSuffix.slice(0, 200) : 'This computer';
}

export function deviceIdentity(): DeviceIdentity {
  if (cached) return cached;
  const stored = readStoredId();
  const deviceId = stored ?? randomUUID();
  if (!stored) persistId(deviceId);
  cached = { deviceId, deviceName: friendlyName() };
  return cached;
}
