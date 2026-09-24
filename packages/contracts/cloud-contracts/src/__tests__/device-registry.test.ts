import { describe, expect, it } from 'vitest';
import {
  DEVICE_HEARTBEAT_INTERVAL_MS,
  DEVICE_NAME_MAX_LENGTH,
  DEVICE_ONLINE_WINDOW_MS,
  DEVICE_OPERATING_SYSTEMS,
  DEVICE_SLEEPING_WINDOW_MS,
  DEVICE_SURFACES,
  DeviceHeartbeatRequestSchema,
  DeviceRenameRequestSchema,
  deviceArchitecture,
  deviceDisplayName,
  deviceOperatingSystem,
  devicePresence,
  generatedDeviceName,
  isDeviceNameReset,
} from '../device-registry';

const NOW = Date.parse('2026-09-17T12:00:00.000Z');

function ago(ms: number): string {
  return new Date(NOW - ms).toISOString();
}

describe('device presence', () => {
  it('stays online through one missed heartbeat', () => {
    expect(DEVICE_ONLINE_WINDOW_MS).toBeGreaterThan(DEVICE_HEARTBEAT_INTERVAL_MS);
    expect(devicePresence(ago(DEVICE_HEARTBEAT_INTERVAL_MS + 30_000), NOW)).toBe('online');
  });

  it('is sleeping once heartbeats stop, and offline after the sleeping window', () => {
    expect(devicePresence(ago(DEVICE_ONLINE_WINDOW_MS + 1), NOW)).toBe('sleeping');
    expect(devicePresence(ago(DEVICE_SLEEPING_WINDOW_MS + 1), NOW)).toBe('offline');
  });

  it('is offline for a device that never checked in or a timestamp nobody can read', () => {
    expect(devicePresence(null, NOW)).toBe('offline');
    expect(devicePresence('not a date', NOW)).toBe('offline');
  });
});

describe('heartbeat request', () => {
  it('defaults every capability to off so a client cannot claim one by omission', () => {
    const parsed = DeviceHeartbeatRequestSchema.parse({
      surface: 'cli',
      installId: 'install-1234',
      os: 'linux',
    });
    expect(parsed.capabilities).toEqual({
      browser: false,
      computerUse: false,
      localModels: false,
      localMcp: false,
      remoteControl: false,
    });
  });

  it('refuses fields the registry does not store', () => {
    expect(
      DeviceHeartbeatRequestSchema.safeParse({
        surface: 'desktop',
        installId: 'install-1234',
        os: 'macos',
        userId: 'someone-else',
      }).success,
    ).toBe(false);
  });

  it('refuses an install id that could smuggle a path or query', () => {
    expect(
      DeviceHeartbeatRequestSchema.safeParse({
        surface: 'desktop',
        installId: '../../etc',
        os: 'macos',
      }).success,
    ).toBe(false);
  });
});

describe('platform normalisation', () => {
  it('maps node and rust spellings onto the stored vocabulary', () => {
    expect(deviceOperatingSystem('darwin')).toBe('macos');
    expect(deviceOperatingSystem('win32')).toBe('windows');
    expect(deviceOperatingSystem('cros')).toBe('chromeos');
    expect(deviceArchitecture('aarch64')).toBe('arm64');
    expect(deviceArchitecture('x86_64')).toBe('x64');
    expect(deviceArchitecture('riscv64')).toBe('other');
  });
});

describe('renaming a device, and taking it back', () => {
  it('accepts a chosen name and refuses one that says nothing', () => {
    expect(DeviceRenameRequestSchema.safeParse({ name: 'Studio Mac' }).success).toBe(true);
    expect(DeviceRenameRequestSchema.safeParse({ name: '   ' }).success).toBe(false);
    expect(
      DeviceRenameRequestSchema.safeParse({ name: 'x'.repeat(DEVICE_NAME_MAX_LENGTH + 1) }).success,
    ).toBe(false);
  });

  it('carries a way back to the name nobody chose', () => {
    const parsed = DeviceRenameRequestSchema.safeParse({ name: null });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(isDeviceNameReset(parsed.data)).toBe(true);
    expect(isDeviceNameReset({ name: 'Studio Mac' })).toBe(false);
  });

  it('generates a readable name for every surface on every operating system', () => {
    const seen = new Set<string>();
    for (const surface of DEVICE_SURFACES) {
      for (const os of DEVICE_OPERATING_SYSTEMS) {
        const generated = generatedDeviceName({ surface, os });
        expect(generated.trim(), `${surface}/${os}`).toBe(generated);
        expect(generated.length, `${surface}/${os}`).toBeGreaterThan(0);
        expect(generated.length, `${surface}/${os}`).toBeLessThanOrEqual(DEVICE_NAME_MAX_LENGTH);
        expect(DeviceRenameRequestSchema.safeParse({ name: generated }).success).toBe(true);
        seen.add(generated);
      }
    }
    expect(seen.size).toBe(DEVICE_SURFACES.length * DEVICE_OPERATING_SYSTEMS.length);
  });

  it('shows the generated name wherever no name was kept', () => {
    const device = { surface: 'desktop', os: 'macos' } as const;
    const generated = generatedDeviceName(device);
    for (const stored of [null, undefined, '', '   ']) {
      expect(deviceDisplayName(stored, device), JSON.stringify(stored)).toBe(generated);
    }
    expect(deviceDisplayName('Studio Mac', device)).toBe('Studio Mac');
  });
});
