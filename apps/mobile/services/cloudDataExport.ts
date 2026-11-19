import { EncodingType, writeAsStringAsync } from 'expo-file-system/legacy';
import { withDsarTemporaryFile } from './dsarTemporaryFile';
import * as Sharing from 'expo-sharing';
import {
  DataExportCompletenessSchema,
  DataExportResponseSchema,
  type DataExportCompleteness,
} from '@agiworkforce/cloud-contracts';
import { api } from '@/services/api';
import {
  assertCloudAccountEpochCurrent,
  type CloudAccountEpoch,
} from '@/src/features/auth/services/cloudAccountSession';

export type CloudDataExportDocument = Record<string, unknown>;

export class PartialCloudDataExportError extends Error {
  constructor(
    readonly completeness: DataExportCompleteness,
    readonly document: CloudDataExportDocument,
  ) {
    super('AGI Cloud returned a partial data export.');
    this.name = 'PartialCloudDataExportError';
  }
}

export class CloudExportSharingUnavailableError extends Error {
  constructor() {
    super('Sharing is not available on this device.');
    this.name = 'CloudExportSharingUnavailableError';
  }
}

function invalidExport(): Error {
  return new Error('AGI Cloud returned an invalid data export.');
}

function readCompleteness(document: CloudDataExportDocument): DataExportCompleteness | null {
  const metadata = document['export_metadata'];
  if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) return null;
  const parsed = DataExportCompletenessSchema.safeParse(
    (metadata as Record<string, unknown>)['completeness'],
  );
  return parsed.success ? parsed.data : null;
}

export async function exportCloudUserData(account: CloudAccountEpoch): Promise<void> {
  assertCloudAccountEpochCurrent(account);
  const response = await api.get<unknown>('/api/user/export', {
    timeout: 120_000,
    accountEpoch: account,
  });
  assertCloudAccountEpochCurrent(account);

  const parsed = DataExportResponseSchema.safeParse(response);
  if (!parsed.success) throw invalidExport();
  const { success, status, data: document } = parsed.data;

  if (status === 'partial') {
    const completeness = readCompleteness(document);
    if (completeness?.status !== 'partial') throw invalidExport();
    throw new PartialCloudDataExportError(completeness, document);
  }
  if (success !== true) throw invalidExport();

  await shareCloudDataExport(account, document, 'complete');
}

/**
 * A partial export is only ever shared after the person has read what it
 * leaves out, and its file name says so wherever it is saved.
 */
export async function shareCloudDataExport(
  account: CloudAccountEpoch,
  document: CloudDataExportDocument,
  completeness: 'complete' | 'partial',
): Promise<void> {
  const partial = completeness === 'partial';
  const assertActive = () => assertCloudAccountEpochCurrent(account);
  assertActive();
  await withDsarTemporaryFile(
    partial ? 'agi_cloud_data_export_partial.json' : 'agi_cloud_data_export.json',
    assertActive,
    async (uri) => {
      assertActive();
      await writeAsStringAsync(uri, JSON.stringify(document, null, 2), {
        encoding: EncodingType.UTF8,
      });
      assertActive();
      const canShare = await Sharing.isAvailableAsync();
      assertActive();
      if (!canShare) throw new CloudExportSharingUnavailableError();
      await Sharing.shareAsync(uri, {
        mimeType: 'application/json',
        dialogTitle: partial
          ? 'Save your partial AGI Cloud data export'
          : 'Save your AGI Cloud data export',
        UTI: 'public.json',
      });
    },
  );
}

function sectionName(section: string): string {
  return section.replaceAll('_', ' ');
}

/**
 * What the server said is missing, in the order a person can act on it:
 * sections that may come back on a later request, then rows that will not.
 */
export function describePartialCloudDataExport(completeness: DataExportCompleteness): string {
  const lines: string[] = [];
  if (completeness.unavailable_sections.length > 0) {
    lines.push(
      `Not available right now: ${completeness.unavailable_sections.map(sectionName).join(', ')}. Exporting again later may include them.`,
    );
  }
  for (const { section, limit } of completeness.truncated_sections) {
    lines.push(
      `Only the most recent ${limit.toLocaleString()} entries of ${sectionName(section)} are included. Exporting again will not add the rest.`,
    );
  }
  for (const { section, count } of completeness.skipped_rows) {
    lines.push(
      `${count.toLocaleString()} ${count === 1 ? 'entry' : 'entries'} of ${sectionName(section)} could not be exported in this format.`,
    );
  }
  lines.push('Everything else in your account is included.');
  return lines.join('\n\n');
}
