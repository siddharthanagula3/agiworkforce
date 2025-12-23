export async function triggerDownload(platform: 'mac' | 'windows' | 'linux') {
  window.location.href = `/api/download?platform=${platform}`;
}

export function getPlatformExtension(platform: string): string {
  switch (platform) {
    case 'mac':
      return '.dmg';
    case 'windows':
      return '.exe';
    case 'linux':
      return '.AppImage';
    default:
      return '';
  }
}
