import 'server-only';

const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';
const GOOGLE_DOC_MIME = 'application/vnd.google-apps.document';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const UPLOAD_TIMEOUT_MS = 30_000;
const WRITE_SCOPES = new Set([
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive',
  'drive.file',
  'drive',
]);

export class GoogleDocsExportError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'GoogleDocsExportError';
  }
}

export function canCreateDriveFiles(grantedScopes: readonly string[]): boolean {
  return grantedScopes.some((scope) => WRITE_SCOPES.has(scope));
}

export async function createGoogleDocFromDocx(
  accessToken: string,
  name: string,
  docx: Uint8Array,
): Promise<{ id: string; webViewLink: string }> {
  const boundary = `agi-${crypto.randomUUID()}`;
  const metadata = JSON.stringify({ name, mimeType: GOOGLE_DOC_MIME });
  const encoder = new TextEncoder();
  const head = encoder.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${DOCX_MIME}\r\n\r\n`,
  );
  const tail = encoder.encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(head.byteLength + docx.byteLength + tail.byteLength);
  body.set(head, 0);
  body.set(docx, head.byteLength);
  body.set(tail, head.byteLength + docx.byteLength);

  const url = new URL(DRIVE_UPLOAD_URL);
  url.searchParams.set('uploadType', 'multipart');
  url.searchParams.set('fields', 'id,webViewLink');
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
    signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new GoogleDocsExportError(
      response.status === 403 || response.status === 401
        ? 'Google Drive did not allow creating a document. Reconnect Google Drive and allow it to create files.'
        : 'Google Drive could not create the document. Try again.',
      response.status,
    );
  }
  const created = (await response.json()) as { id?: string; webViewLink?: string };
  if (!created.id)
    throw new GoogleDocsExportError('Google Drive did not return the new document.', 502);
  return {
    id: created.id,
    webViewLink:
      created.webViewLink ??
      `https://docs.google.com/document/d/${encodeURIComponent(created.id)}/edit`,
  };
}
