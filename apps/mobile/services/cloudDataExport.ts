import {
  cacheDirectory,
  deleteAsync,
  EncodingType,
  getInfoAsync,
  makeDirectoryAsync,
  writeAsStringAsync,
} from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { api } from '@/services/api';
import {
  assertCloudAccountEpochCurrent,
  type CloudAccountEpoch,
} from '@/src/features/auth/services/cloudAccountSession';

interface CloudUserExportResponse {
  success: boolean;
  data: unknown;
}

const EXPORT_DIR = `${cacheDirectory}dsar_exports/`;
const EXPORT_FILE = `${EXPORT_DIR}agi_cloud_data_export.json`;

function isExportDocument(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Download the signed-in account's reviewed Cloud portability document and
 * hand it to the native share sheet. The API request remains subject to the
 * Local/Cloud egress guard, and every device-side step is bound to the account
 * epoch captured when the user tapped Export.
 */
export async function exportCloudUserData(account: CloudAccountEpoch): Promise<void> {
  assertCloudAccountEpochCurrent(account);
  const response = await api.get<CloudUserExportResponse>('/api/user/export', {
    timeout: 120_000,
  });
  assertCloudAccountEpochCurrent(account);

  if (response.success !== true || !isExportDocument(response.data)) {
    throw new Error('AGI Cloud returned an invalid data export.');
  }

  let wroteTemporaryFile = false;
  try {
    const info = await getInfoAsync(EXPORT_DIR);
    assertCloudAccountEpochCurrent(account);
    if (!info.exists) {
      await makeDirectoryAsync(EXPORT_DIR, { intermediates: true });
    }

    assertCloudAccountEpochCurrent(account);
    await writeAsStringAsync(EXPORT_FILE, JSON.stringify(response.data, null, 2), {
      encoding: EncodingType.UTF8,
    });
    wroteTemporaryFile = true;

    assertCloudAccountEpochCurrent(account);
    if (!(await Sharing.isAvailableAsync())) {
      throw new Error('Sharing is not available on this device.');
    }

    assertCloudAccountEpochCurrent(account);
    await Sharing.shareAsync(EXPORT_FILE, {
      mimeType: 'application/json',
      dialogTitle: 'Save your AGI Cloud data export',
      UTI: 'public.json',
    });
  } finally {
    if (wroteTemporaryFile) {
      await deleteAsync(EXPORT_FILE, { idempotent: true }).catch(() => {});
    }
  }
}
