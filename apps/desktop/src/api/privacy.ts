/**
 * Privacy API Wrapper
 *
 * Provides TypeScript API for GDPR-compliant privacy operations.
 * Enables users to control their data and privacy preferences.
 *
 * Commands exposed:
 * - settings_update_privacy - Update privacy preference controls
 * - privacy_export_data - Export all user data (GDPR compliance)
 * - privacy_delete_account - Delete user account and all data
 */

import { invoke } from '../lib/tauri-mock';

// ============================================================================
// Types
// ============================================================================

/**
 * Privacy preferences for data collection and sharing
 */
export interface PrivacyPreferences {
  /** Enable anonymous usage telemetry */
  telemetryEnabled: boolean;
  /** Enable automatic crash reporting */
  crashReportingEnabled: boolean;
  /** Share anonymized AI interactions for model improvement */
  aiModelSharingEnabled: boolean;
  /** Enable analytics tracking */
  analyticsEnabled: boolean;
  /** Enable detailed usage pattern collection */
  usageDataCollection: boolean;
}

/**
 * Metadata included in data exports
 */
export interface ExportMetadata {
  /** ISO 8601 timestamp of when the export was created */
  exported_at: string;
  /** Application name */
  app_name: string;
  /** Export format version */
  export_version: string;
}

/**
 * Structure of exported user data
 */
export interface ExportedData {
  /** All user conversations */
  conversations: Array<{
    id: string;
    title: string | null;
    created_at: string;
    updated_at: string | null;
  }>;
  /** All user messages */
  messages: Array<{
    id: string;
    conversation_id: string;
    role: string;
    content: string;
    created_at: string;
  }>;
  /** User settings */
  settings: Array<{
    key: string;
    value: string;
    category: string | null;
  }>;
  /** Custom instructions */
  custom_instructions: Array<{
    id: string;
    name: string | null;
    content: string;
    created_at: string | null;
  }>;
  /** Export metadata */
  export_metadata: ExportMetadata;
}

// ============================================================================
// Configuration
// ============================================================================

const PRIVACY_TIMEOUT_MS = 30000;
const EXPORT_TIMEOUT_MS = 60000; // Longer timeout for data export
const DELETE_TIMEOUT_MS = 60000; // Longer timeout for account deletion

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Invoke a Tauri command with timeout
 */
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
 * Convert frontend camelCase preferences to backend snake_case format
 */
function convertPreferencesToBackend(preferences: PrivacyPreferences): Record<string, boolean> {
  return {
    telemetry_enabled: preferences.telemetryEnabled,
    crash_reporting_enabled: preferences.crashReportingEnabled,
    ai_model_sharing_enabled: preferences.aiModelSharingEnabled,
    analytics_enabled: preferences.analyticsEnabled,
    usage_data_collection: preferences.usageDataCollection,
  };
}

// ============================================================================
// API Functions
// ============================================================================

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
    // The backend expects snake_case format matching the Rust struct
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

  // Create download blob
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  // Trigger download
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Cleanup after browser initiates download (60s delay for async download start)
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

// ============================================================================
// Client Class (Alternative API)
// ============================================================================

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
  /**
   * Update privacy preferences
   */
  static async updatePreferences(preferences: PrivacyPreferences): Promise<void> {
    return updatePrivacyPreferences(preferences);
  }

  /**
   * Export all user data as JSON string
   */
  static async exportData(): Promise<string> {
    return exportUserData();
  }

  /**
   * Export and parse user data
   */
  static async exportDataParsed(): Promise<ExportedData> {
    return exportUserDataParsed();
  }

  /**
   * Download user data as a file
   */
  static async downloadData(): Promise<string> {
    return downloadUserData();
  }

  /**
   * Delete user account (permanent action)
   */
  static async deleteAccount(userId: string): Promise<string> {
    return deleteUserAccount(userId);
  }

  /**
   * Get default privacy preferences (all data collection disabled)
   */
  static getDefaultPreferences(): PrivacyPreferences {
    return {
      telemetryEnabled: false,
      crashReportingEnabled: true, // Enabled by default for stability
      aiModelSharingEnabled: false,
      analyticsEnabled: false,
      usageDataCollection: false,
    };
  }

  /**
   * Get privacy-focused preferences (minimal data collection)
   */
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
