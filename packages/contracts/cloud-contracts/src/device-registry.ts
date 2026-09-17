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

export const DeviceCapabilitiesSchema = z
  .object({
    browser: z.boolean().default(false),
    computerUse: z.boolean().default(false),
    localModels: z.boolean().default(false),
    localMcp: z.boolean().default(false),
    remoteControl: z.boolean().default(false),
  })
  .strict();
export type DeviceCapabilities = z.infer<typeof DeviceCapabilitiesSchema>;

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

export const DeviceRenameRequestSchema = z
  .object({ name: z.string().trim().min(1).max(DEVICE_NAME_MAX_LENGTH) })
  .strict();

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
