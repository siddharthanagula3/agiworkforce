import { describe, expect, it } from 'vitest';
import {
  DEVICE_HEARTBEAT_INTERVAL_MS,
  DEVICE_ONLINE_WINDOW_MS,
  DEVICE_SLEEPING_WINDOW_MS,
  DeviceHeartbeatRequestSchema,
  deviceArchitecture,
  deviceOperatingSystem,
  devicePresence,
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
