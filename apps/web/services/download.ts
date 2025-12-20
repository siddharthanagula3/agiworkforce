/**
 * Client-side service for handling application downloads
 */
export async function triggerDownload(platform: 'mac' | 'windows' | 'linux') {
  // We use window.location.href to trigger the API route which handles the redirect
  // This ensures the browser handles the file download naturally
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
