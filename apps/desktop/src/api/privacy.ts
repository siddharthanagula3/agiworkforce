import { PRIVACY_TIMEOUT_MS } from '../constants/timeouts';
import { invoke } from '../lib/tauri-mock';

export interface PrivacyPreferences {
  telemetryEnabled: boolean;
  crashReportingEnabled: boolean;
  aiModelSharingEnabled: boolean;
  analyticsEnabled: boolean;
  usageDataCollection: boolean;
}

async function invokeWithTimeout<T>(
  command: string,
  args?: Record<string, unknown>,
  timeoutMs: number = PRIVACY_TIMEOUT_MS,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Privacy command '${command}' timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    invoke<T>(command, args)
      .then((result) => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

/**
 * Update privacy preferences.
 *
 * @param preferences - Privacy settings to save
 * @throws Error if the operation fails
 *
 * @example
 * ```ts
 * await updatePrivacyPreferences({
 *   telemetryEnabled: false,
 *   crashReportingEnabled: true,
 *   aiModelSharingEnabled: false,
 *   analyticsEnabled: false,
 *   usageDataCollection: false,
 * });
 * ```
 */
export async function updatePrivacyPreferences(preferences: PrivacyPreferences): Promise<void> {
  try {
    await invokeWithTimeout<void>('settings_update_privacy', { preferences });
  } catch (error) {
    throw new Error(`Failed to update privacy preferences: ${error}`);
  }
}

export async function exportLocalData(): Promise<string | null> {
  return invoke<string | null>('privacy_export_data');
}

export async function deleteLocalData(): Promise<boolean> {
  return (await invoke<boolean>('privacy_delete_account')) === true;
}
