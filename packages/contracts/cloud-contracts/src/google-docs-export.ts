import { z } from 'zod';

export const GOOGLE_DOCS_EXPORT_PATH = '/api/artifacts/export/google-docs';

export const GoogleDocsExportRequestSchema = z.object({
  title: z.string().trim().min(1).max(200),
  content: z.string().min(1).max(1_000_000),
});
export type GoogleDocsExportRequest = z.input<typeof GoogleDocsExportRequestSchema>;

export interface GoogleDocsExportResponse {
  url: string;
}

/** Why an export was refused before anything reached Drive, and what to tell the person. */
export const GOOGLE_DOCS_EXPORT_REFUSALS = {
  google_drive_not_connected: 'Connect Google Drive to save documents to it.',
  google_drive_reconnect_required: 'Reconnect Google Drive to save documents to it.',
  google_drive_write_not_granted:
    'Google Drive is connected for reading only. Reconnect it and allow it to create files.',
} as const;
export type GoogleDocsExportRefusalCode = keyof typeof GOOGLE_DOCS_EXPORT_REFUSALS;

export function isGoogleDocsExportRefusalCode(code: string): code is GoogleDocsExportRefusalCode {
  return Object.prototype.hasOwnProperty.call(GOOGLE_DOCS_EXPORT_REFUSALS, code);
}
