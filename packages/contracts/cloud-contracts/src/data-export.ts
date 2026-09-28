import { z } from 'zod';

export const MANAGED_CLOUD_DATA_EXPORT_PATH = '/api/user/export';
export const MANAGED_CLOUD_DATA_EXPORT_ARCHIVES_PATH = '/api/user/export/archives';
export const DATA_EXPORT_ARCHIVE_VOLUME_PARAM = 'volume';

export const DATA_EXPORT_DOWNLOAD_HOURS = 24;

export function managedCloudDataExportArchivePath(exportId: string, volume: number): string {
  return `${MANAGED_CLOUD_DATA_EXPORT_ARCHIVES_PATH}/${encodeURIComponent(exportId)}?${DATA_EXPORT_ARCHIVE_VOLUME_PARAM}=${volume}`;
}

export const DATA_EXPORT_ARCHIVE_STATUSES = ['preparing', 'ready', 'failed', 'expired'] as const;
export type DataExportArchiveStatus = (typeof DATA_EXPORT_ARCHIVE_STATUSES)[number];

export const DataExportArchiveVolumeSchema = z.object({
  volume: z.number().int().positive(),
  byteCount: z.number().int().nonnegative(),
  fileCount: z.number().int().nonnegative(),
  downloadPath: z.string().min(1),
});
export type DataExportArchiveVolume = z.infer<typeof DataExportArchiveVolumeSchema>;

export const DataExportArchiveSchema = z.object({
  id: z.string().min(1),
  status: z.enum(DATA_EXPORT_ARCHIVE_STATUSES),
  requestedAt: z.string().min(1),
  readyAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
  volumes: z.array(DataExportArchiveVolumeSchema),
});
export type DataExportArchive = z.infer<typeof DataExportArchiveSchema>;

export const DataExportArchiveResponseSchema = z.object({
  archive: DataExportArchiveSchema.nullable(),
});
export type DataExportArchiveResponse = z.infer<typeof DataExportArchiveResponseSchema>;
