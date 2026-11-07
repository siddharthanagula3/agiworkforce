import { EncodingType, writeAsStringAsync } from 'expo-file-system/legacy';
import { withDsarTemporaryFile } from './dsarTemporaryFile';
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

function isExportDocument(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function exportCloudUserData(account: CloudAccountEpoch): Promise<void> {
  assertCloudAccountEpochCurrent(account);
  const response = await api.get<CloudUserExportResponse>('/api/user/export', {
    timeout: 120_000,
    accountEpoch: account,
  });
  assertCloudAccountEpochCurrent(account);

  if (response.success !== true || !isExportDocument(response.data)) {
    throw new Error('AGI Cloud returned an invalid data export.');
  }

  const assertActive = () => assertCloudAccountEpochCurrent(account);
  await withDsarTemporaryFile('agi_cloud_data_export.json', assertActive, async (uri) => {
    assertActive();
    await writeAsStringAsync(uri, JSON.stringify(response.data, null, 2), {
      encoding: EncodingType.UTF8,
    });
    assertActive();
    const canShare = await Sharing.isAvailableAsync();
    assertActive();
    if (!canShare) throw new Error('Sharing is not available on this device.');
    await Sharing.shareAsync(uri, {
      mimeType: 'application/json',
      dialogTitle: 'Save your AGI Cloud data export',
      UTI: 'public.json',
    });
  });
}
