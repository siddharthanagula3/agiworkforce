
import { invoke } from '../lib/tauri-mock';

export interface PrivacyPreferences {
  telemetryEnabled: boolean;
  crashReportingEnabled: boolean;
  aiModelSharingEnabled: boolean;
  analyticsEnabled: boolean;
  usageDataCollection: boolean;
}

export interface ExportMetadata {
  exported_at: string;
  app_name: string;
  export_version: string;
}

/**
 * Structure of exported user data
 */
export interface ExportedData {
  conversations: Array<{
    id: string;
    title: string | null;
    created_at: string;
    updated_at: string | null;
  }>;
  messages: Array<{
    id: string;
    conversation_id: string;
    role: string;
    content: string;
    created_at: string;
  }>;
  settings: Array<{
    key: string;
    value: string;
    category: string | null;
  }>;
  custom_instructions: Array<{
    id: string;
    name: string | null;
    content: string;
    created_at: string | null;
  }>;
  export_metadata: ExportMetadata;
}

const PRIVACY_TIMEOUT_MS = 30000;
const EXPORT_TIMEOUT_MS = 60000;
const DELETE_TIMEOUT_MS = 60000;

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

function convertPreferencesToBackend(preferences: PrivacyPreferences): Record<string, boolean> {
  return {
    telemetry_enabled: preferences.telemetryEnabled,
    crash_reporting_enabled: preferences.crashReportingEnabled,
    ai_model_sharing_enabled: preferences.aiModelSharingEnabled,
    analytics_enabled: preferences.analyticsEnabled,
    usage_data_collection: preferences.usageDataCollection,
  };
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
    await invokeWithTimeout<void>('settings_update_privacy', {
      preferences: convertPreferencesToBackend(preferences),
    });
  } catch (error) {
    throw new Error(`Failed to update privacy preferences: ${error}`);
  }
}

/**
 * Export all user data as JSON (GDPR compliance).
 *
 * @returns JSON string containing all user data
 * @throws Error if the export fails
 *
 * @example
 * ```ts
 * const data = await exportUserData();
 * const parsed = JSON.parse(data) as ExportedData;
 * console.log(`Exported ${parsed.conversations.length} conversations`);
 * ```
 */
export async function exportUserData(): Promise<string> {
  try {
    return await invokeWithTimeout<string>('privacy_export_data', undefined, EXPORT_TIMEOUT_MS);
  } catch (error) {
    throw new Error(`Failed to export user data: ${error}`);
  }
}

/**
 * Export user data and parse it into a typed object.
 *
 * @returns Parsed export data
 * @throws Error if the export or parsing fails
 *
 * @example
 * ```ts
 * const data = await exportUserDataParsed();
 * console.log(`Exported at: ${data.export_metadata.exported_at}`);
 * ```
 */
export async function exportUserDataParsed(): Promise<ExportedData> {
  const jsonString = await exportUserData();
  try {
    return JSON.parse(jsonString) as ExportedData;
  } catch (error) {
    throw new Error(`Failed to parse exported data: ${error}`);
  }
}

/**
 * Download user data as a JSON file.
 * Creates a download link and triggers the browser download.
 *
 * @returns The filename of the downloaded file
 *
 * @example
 * ```ts
 * const filename = await downloadUserData();
 * console.log(`Downloaded: ${filename}`);
 * ```
 */
export async function downloadUserData(): Promise<string> {
  const data = await exportUserData();
  const filename = `agiworkforce-data-${Date.now()}.json`;

  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  setTimeout(() => URL.revokeObjectURL(url), 60_000);

  return filename;
}

/**
 * Delete user account and all associated data.
 * WARNING: This action is permanent and cannot be undone.
 *
 * @param userId - The ID of the user to delete
 * @returns Confirmation message
 * @throws Error if the deletion fails
 *
 * @example
 * ```ts
 * const message = await deleteUserAccount('user-123');
 * console.log(message); // "Account data deleted successfully"
 * ```
 */
export async function deleteUserAccount(userId: string): Promise<string> {
  if (!userId || userId.trim().length === 0) {
    throw new Error('User ID cannot be empty');
  }

  try {
    return await invokeWithTimeout<string>('privacy_delete_account', { userId }, DELETE_TIMEOUT_MS);
  } catch (error) {
    throw new Error(`Failed to delete account: ${error}`);
  }
}

/**
 * PrivacyClient provides a class-based interface for privacy operations.
 *
 * @example
 * ```ts
 * // Update preferences
 * await PrivacyClient.updatePreferences({
 *   telemetryEnabled: false,
 *   crashReportingEnabled: true,
 *   // ...
 * });
 *
 * // Export data
 * const data = await PrivacyClient.exportData();
 * ```
 */
export class PrivacyClient {
  static async updatePreferences(preferences: PrivacyPreferences): Promise<void> {
    return updatePrivacyPreferences(preferences);
  }

  static async exportData(): Promise<string> {
    return exportUserData();
  }

  static async exportDataParsed(): Promise<ExportedData> {
    return exportUserDataParsed();
  }

  static async downloadData(): Promise<string> {
    return downloadUserData();
  }

  static async deleteAccount(userId: string): Promise<string> {
    return deleteUserAccount(userId);
  }

  static getDefaultPreferences(): PrivacyPreferences {
    return {
      telemetryEnabled: false,
      crashReportingEnabled: true, // Enabled by default for stability
      aiModelSharingEnabled: false,
      analyticsEnabled: false,
      usageDataCollection: false,
    };
  }

  static getPrivacyFocusedPreferences(): PrivacyPreferences {
    return {
      telemetryEnabled: false,
      crashReportingEnabled: false,
      aiModelSharingEnabled: false,
      analyticsEnabled: false,
      usageDataCollection: false,
    };
  }
}

export default PrivacyClient;
