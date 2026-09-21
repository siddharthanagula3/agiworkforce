import { ALL_PLATFORM_CAPABILITIES, PLATFORM_CAPABILITIES } from '@agiworkforce/types';
import type { PlatformCapability } from '@agiworkforce/types';
import { describe, expect, it } from 'vitest';

import {
  DEVICE_CAPABILITY_FIELDS,
  DeviceCapabilitiesSchema,
  DeviceHeartbeatRequestSchema,
  advertisedDeviceCapability,
} from '../device-registry';

/**
 * A capability a machine has and a browser does not is one the server cannot
 * infer from the request, so the device has to say it. The list is read from
 * the platform matrix rather than restated, which is what makes this fail on
 * the day a device row gains a capability the schema has no field for.
 */
function deviceScopedCapabilities(): PlatformCapability[] {
  return ALL_PLATFORM_CAPABILITIES.filter(
    (capability) =>
      (PLATFORM_CAPABILITIES.desktop[capability] || PLATFORM_CAPABILITIES.mobile[capability]) &&
      !PLATFORM_CAPABILITIES.web[capability],
  );
}

const HEARTBEAT = { surface: 'desktop', installId: 'install-1234', os: 'macos' } as const;

describe('device capability advertisement', () => {
  it('reads the matrix it is measuring against', () => {
    expect(deviceScopedCapabilities().length).toBeGreaterThan(0);
  });

  it('gives every device-scoped capability a field a device can send', () => {
    const missing = deviceScopedCapabilities().filter(
      (capability) => DEVICE_CAPABILITY_FIELDS[capability] === undefined,
    );
    expect(missing).toEqual([]);
  });

  it('accepts every one of those fields, so the strict schema is not the limit', () => {
    for (const capability of deviceScopedCapabilities()) {
      const field = DEVICE_CAPABILITY_FIELDS[capability];
      if (field === undefined) continue;
      const parsed = DeviceCapabilitiesSchema.safeParse({ [field]: true });
      expect(parsed.success, `${capability} cannot be advertised as ${field}`).toBe(true);
      if (parsed.success) expect(advertisedDeviceCapability(parsed.data, capability)).toBe(true);
    }
  });

  it('maps no field that the matrix does not declare device-scoped', () => {
    const scoped = new Set<string>(deviceScopedCapabilities());
    expect(Object.keys(DEVICE_CAPABILITY_FIELDS).filter((name) => !scoped.has(name))).toEqual([]);
  });

  it('still refuses a misspelt capability, so a typo is never silently dropped', () => {
    expect(DeviceCapabilitiesSchema.safeParse({ termnial: true }).success).toBe(false);
    expect(DeviceCapabilitiesSchema.safeParse({ terminal: 'yes' }).success).toBe(false);
  });

  it('validates a build that omits the new fields and reads the silence as nothing said', () => {
    const parsed = DeviceHeartbeatRequestSchema.parse(HEARTBEAT);
    for (const capability of deviceScopedCapabilities()) {
      const advertised = advertisedDeviceCapability(parsed.capabilities, capability);
      expect(advertised, `${capability} was invented from an omitted field`).not.toBe(true);
    }
    expect(advertisedDeviceCapability(parsed.capabilities, 'canUseTerminal')).toBeUndefined();
  });

  it('tells a refusal apart from silence', () => {
    const parsed = DeviceHeartbeatRequestSchema.parse({
      ...HEARTBEAT,
      capabilities: { terminal: false },
    });
    expect(advertisedDeviceCapability(parsed.capabilities, 'canUseTerminal')).toBe(false);
    expect(advertisedDeviceCapability(parsed.capabilities, 'canUseFileSystem')).toBeUndefined();
  });

  it('answers nothing for a capability no device advertises', () => {
    const parsed = DeviceHeartbeatRequestSchema.parse(HEARTBEAT);
    expect(advertisedDeviceCapability(parsed.capabilities, 'canChat')).toBeUndefined();
    expect(advertisedDeviceCapability(null, 'canUseTerminal')).toBeUndefined();
  });
});
