export const KNOWN_DEVICE_TYPES = [
  'vscode',
  'cursor',
  'windsurf',
  'antigravity',
  'desktop',
  'cli',
] as const;

export function isKnownDeviceType(deviceType: string): boolean {
  return (KNOWN_DEVICE_TYPES as readonly string[]).includes(deviceType.toLowerCase());
}

export function friendlyDeviceName(deviceType: string): string {
  switch (deviceType.toLowerCase()) {
    case 'vscode':
      return 'VS Code';
    case 'cursor':
      return 'Cursor';
    case 'windsurf':
      return 'Windsurf';
    case 'antigravity':
      return 'Antigravity';
    case 'desktop':
      return 'AGI Desktop';
    case 'cli':
      return 'AGI CLI';
    default:
      return deviceType || 'this device';
  }
}
