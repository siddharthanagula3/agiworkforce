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

export const DATA_EXPORT_DELIVERY_METHODS = ['email', 'in_app'] as const;
export type DataExportDelivery = (typeof DATA_EXPORT_DELIVERY_METHODS)[number];

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
  delivery: z.enum(DATA_EXPORT_DELIVERY_METHODS),
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

export const DATA_EXPORT_COMPLETENESS_STATUSES = ['complete', 'partial'] as const;
export type DataExportCompletenessStatus = (typeof DATA_EXPORT_COMPLETENESS_STATUSES)[number];

export const DataExportCompletenessSchema = z.object({
  status: z.enum(DATA_EXPORT_COMPLETENESS_STATUSES),
  unavailable_sections: z.array(z.string()),
  skipped_rows: z.array(z.object({ section: z.string(), count: z.number().int().nonnegative() })),
  truncated_sections: z.array(
    z.object({ section: z.string(), limit: z.number().int().positive() }),
  ),
  retry: z.string(),
});
export type DataExportCompleteness = z.infer<typeof DataExportCompletenessSchema>;

export const DataExportResponseSchema = z.object({
  success: z.boolean(),
  status: z.enum(DATA_EXPORT_COMPLETENESS_STATUSES).optional(),
  data: z.record(z.string(), z.unknown()),
});
export type DataExportResponse = z.infer<typeof DataExportResponseSchema>;
