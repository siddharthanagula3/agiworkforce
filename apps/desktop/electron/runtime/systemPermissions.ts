import { desktopCapturer, shell, systemPreferences } from 'electron';
import type {
  SystemPermissionKind,
  SystemPermissionStatus,
} from '@agiworkforce/local-runtime-contract';

const MAC_PRIVACY_PANES: Readonly<Record<SystemPermissionKind, string>> = {
  'screen-recording':
    'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
  accessibility: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
  microphone: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
};

const WINDOWS_MICROPHONE_SETTINGS = 'ms-settings:privacy-microphone';

function mediaStatus(media: 'screen' | 'microphone'): SystemPermissionStatus {
  const status = systemPreferences.getMediaAccessStatus(media);
  if (status === 'granted' || status === 'denied' || status === 'restricted') return status;
  return 'not-determined';
}

export function systemPermissionStatus(kind: SystemPermissionKind): SystemPermissionStatus {
  if (process.platform === 'darwin') {
    if (kind === 'accessibility') {
      return systemPreferences.isTrustedAccessibilityClient(false) ? 'granted' : 'denied';
    }
    return mediaStatus(kind === 'microphone' ? 'microphone' : 'screen');
  }
  if (process.platform === 'win32' && kind === 'microphone') return mediaStatus('microphone');
  return 'not-required';
}

export function systemPermissionStatuses(): Record<SystemPermissionKind, SystemPermissionStatus> {
  return {
    'screen-recording': systemPermissionStatus('screen-recording'),
    accessibility: systemPermissionStatus('accessibility'),
    microphone: systemPermissionStatus('microphone'),
  };
}

export function listForAccessibility(): void {
  if (process.platform !== 'darwin') return;
  if (!systemPreferences.isTrustedAccessibilityClient(false)) {
    systemPreferences.isTrustedAccessibilityClient(true);
  }
}

export async function openSystemPermission(kind: SystemPermissionKind): Promise<boolean> {
  if (process.platform === 'darwin') {
    if (systemPermissionStatus(kind) === 'not-determined') {
      if (kind === 'microphone') {
        await systemPreferences.askForMediaAccess('microphone');
        return true;
      }
      if (kind === 'screen-recording') {
        await desktopCapturer.getSources({
          types: ['screen'],
          thumbnailSize: { width: 1, height: 1 },
        });
        return true;
      }
    }
    await shell.openExternal(MAC_PRIVACY_PANES[kind]);
    return true;
  }
  if (process.platform === 'win32' && kind === 'microphone') {
    await shell.openExternal(WINDOWS_MICROPHONE_SETTINGS);
    return true;
  }
  return false;
}
