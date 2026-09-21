import type { PlatformCapability } from '@agiworkforce/types';
import { z } from 'zod';

export const DEVICE_HEARTBEAT_PATH = '/api/devices/heartbeat';

export const DEVICE_HEARTBEAT_INTERVAL_MS = 5 * 60_000;

export const DEVICE_ONLINE_WINDOW_MS = 2 * DEVICE_HEARTBEAT_INTERVAL_MS + 60_000;

export const DEVICE_SLEEPING_WINDOW_MS = 30 * 24 * 60 * 60_000;

export const DEVICE_SURFACES = ['desktop', 'cli', 'vscode', 'chrome', 'mobile'] as const;
export type DeviceSurface = (typeof DEVICE_SURFACES)[number];

export const DEVICE_OPERATING_SYSTEMS = [
  'macos',
  'windows',
  'linux',
  'ios',
  'android',
  'chromeos',
  'other',
] as const;
export type DeviceOperatingSystem = (typeof DEVICE_OPERATING_SYSTEMS)[number];

export const DEVICE_ARCHITECTURES = ['arm64', 'x64', 'x86', 'arm', 'other'] as const;
export type DeviceArchitecture = (typeof DEVICE_ARCHITECTURES)[number];

export const DEVICE_PRESENCE_STATES = ['online', 'sleeping', 'offline'] as const;
export type DevicePresence = (typeof DEVICE_PRESENCE_STATES)[number];

export const DEVICE_NAME_MAX_LENGTH = 120;

// The five below default to off, so a build that predates a field cannot claim
// it by omission. The rest are optional: absent means the device said nothing,
// which a server must tell apart from a device that said no.
export const DeviceCapabilitiesSchema = z
  .object({
    browser: z.boolean().default(false),
    computerUse: z.boolean().default(false),
    localModels: z.boolean().default(false),
    localMcp: z.boolean().default(false),
    remoteControl: z.boolean().default(false),
    workingDirectory: z.boolean().optional(),
    filesystem: z.boolean().optional(),
    localExecution: z.boolean().optional(),
    terminal: z.boolean().optional(),
    localDatabase: z.boolean().optional(),
    screenCapture: z.boolean().optional(),
    clipboard: z.boolean().optional(),
    nativeIntegrations: z.boolean().optional(),
    photos: z.boolean().optional(),
    notifications: z.boolean().optional(),
  })
  .strict();
export type DeviceCapabilities = z.infer<typeof DeviceCapabilitiesSchema>;

/**
 * Which advertised boolean answers which platform capability. The matrix owns
 * the vocabulary; this names the field a device sends to claim one of its rows.
 */
export const DEVICE_CAPABILITY_FIELDS: Readonly<
  Partial<Record<PlatformCapability, keyof DeviceCapabilities>>
> = Object.freeze({
  canUseBrowserAutomation: 'browser',
  canUseDesktopAutomation: 'computerUse',
  canUseLocalModels: 'localModels',
  canUseLocalMcp: 'localMcp',
  canUseWorkingDirectory: 'workingDirectory',
  canUseFileSystem: 'filesystem',
  canRunLocalCode: 'localExecution',
  canUseTerminal: 'terminal',
  canUseLocalDatabase: 'localDatabase',
  canTakeScreenshot: 'screenCapture',
  canUseClipboard: 'clipboard',
  canUseNativeIntegrations: 'nativeIntegrations',
  canUsePhotos: 'photos',
  canUseNotifications: 'notifications',
});

/**
 * What a device said about one capability: `true`, `false`, or nothing at all.
 * A caller that cannot tell the third apart falls back on the surface name.
 */
export function advertisedDeviceCapability(
  capabilities: DeviceCapabilities | null | undefined,
  capability: PlatformCapability,
): boolean | undefined {
  const field = DEVICE_CAPABILITY_FIELDS[capability];
  if (field === undefined || !capabilities) return undefined;
  return capabilities[field];
}

export const DeviceHeartbeatRequestSchema = z
  .object({
    surface: z.enum(DEVICE_SURFACES),
    installId: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/),
    name: z.string().trim().min(1).max(DEVICE_NAME_MAX_LENGTH).optional(),
    os: z.enum(DEVICE_OPERATING_SYSTEMS),
    osVersion: z.string().trim().min(1).max(64).optional(),
    architecture: z.enum(DEVICE_ARCHITECTURES).optional(),
    appVersion: z.string().trim().min(1).max(64).optional(),
    shell: z
      .string()
      .regex(/^[a-z][a-z0-9-]{0,31}$/)
      .optional(),
    capabilities: DeviceCapabilitiesSchema.default({
      browser: false,
      computerUse: false,
      localModels: false,
      localMcp: false,
      remoteControl: false,
    }),
  })
  .strict();
export type DeviceHeartbeatRequest = z.input<typeof DeviceHeartbeatRequestSchema>;

export const DeviceHeartbeatResponseSchema = z.object({
  deviceId: z.string().uuid(),
  nextHeartbeatInMs: z.number().int().positive(),
});
export type DeviceHeartbeatResponse = z.infer<typeof DeviceHeartbeatResponseSchema>;

/**
 * `null` is the way back. A schema that only accepted one to a hundred and
 * twenty characters left a user who had renamed a device with no way to undo
 * it, because there was no string that meant "the name you gave it yourself"
 * and an empty one was refused.
 */
export const DeviceRenameRequestSchema = z
  .object({ name: z.string().trim().min(1).max(DEVICE_NAME_MAX_LENGTH).nullable() })
  .strict();

export type DeviceRenameRequest = z.infer<typeof DeviceRenameRequestSchema>;

export function isDeviceNameReset(request: DeviceRenameRequest): boolean {
  return request.name === null;
}

const DEVICE_OPERATING_SYSTEM_LABELS: Readonly<Record<DeviceOperatingSystem, string>> = {
  macos: 'Mac',
  windows: 'Windows',
  linux: 'Linux',
  ios: 'iPhone',
  android: 'Android',
  chromeos: 'ChromeOS',
  other: 'Device',
};

// `null` where the operating system already names the device: a phone called
// "iPhone Mobile" has been named twice and read once.
const DEVICE_SURFACE_LABELS: Readonly<Record<DeviceSurface, string | null>> = {
  desktop: 'Desktop',
  cli: 'CLI',
  vscode: 'VS Code',
  chrome: 'Chrome',
  mobile: null,
};

export interface GeneratedDeviceNameInput {
  surface: DeviceSurface;
  os: DeviceOperatingSystem;
}

/**
 * The name a device carries when nobody has given it one. Derived rather than
 * stored, so a reset is a null in one column and every surface renders the
 * same words for the same device instead of each inventing its own.
 */
export function generatedDeviceName(input: GeneratedDeviceNameInput): string {
  const os = DEVICE_OPERATING_SYSTEM_LABELS[input.os];
  const surface = DEVICE_SURFACE_LABELS[input.surface];
  return surface === null ? os : `${os} ${surface}`;
}

/** What a reader is shown: the chosen name, or the generated one in its place. */
export function deviceDisplayName(
  name: string | null | undefined,
  input: GeneratedDeviceNameInput,
): string {
  const chosen = name?.trim() ?? '';
  return chosen.length === 0 ? generatedDeviceName(input) : chosen;
}

export function devicePresence(lastSeenAt: string | null, now = Date.now()): DevicePresence {
  if (!lastSeenAt) return 'offline';
  const seen = Date.parse(lastSeenAt);
  if (!Number.isFinite(seen)) return 'offline';
  const age = now - seen;
  if (age <= DEVICE_ONLINE_WINDOW_MS) return 'online';
  if (age <= DEVICE_SLEEPING_WINDOW_MS) return 'sleeping';
  return 'offline';
}

export function deviceOperatingSystem(platform: string): DeviceOperatingSystem {
  const value = platform.toLowerCase();
  if (value === 'darwin' || value === 'macos' || value.startsWith('mac')) return 'macos';
  if (value === 'win32' || value.startsWith('win')) return 'windows';
  if (value === 'linux') return 'linux';
  if (value === 'ios') return 'ios';
  if (value === 'android') return 'android';
  if (value === 'cros' || value === 'chromeos') return 'chromeos';
  return 'other';
}

export function deviceArchitecture(arch: string): DeviceArchitecture {
  const value = arch.toLowerCase();
  if (value === 'arm64' || value === 'aarch64') return 'arm64';
  if (value === 'x64' || value === 'x86_64' || value === 'x86-64' || value === 'amd64')
    return 'x64';
  if (value === 'ia32' || value === 'x86' || value === 'i386' || value === 'i686') return 'x86';
  if (value === 'arm' || value.startsWith('armv')) return 'arm';
  return 'other';
}
