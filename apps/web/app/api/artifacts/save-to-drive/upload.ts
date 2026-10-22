import 'server-only';

const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';
const UPLOAD_TIMEOUT_MS = 30_000;

export class DriveFileUploadError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'DriveFileUploadError';
  }
}

export async function uploadDriveFile(
  accessToken: string,
  file: { name: string; mimeType: string; bytes: Uint8Array },
): Promise<{ id: string; webViewLink?: string }> {
  const boundary = `agi-${crypto.randomUUID()}`;
  const encoder = new TextEncoder();
  const head = encoder.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: file.name })}\r\n--${boundary}\r\nContent-Type: ${file.mimeType}\r\n\r\n`,
  );
  const tail = encoder.encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(head.byteLength + file.bytes.byteLength + tail.byteLength);
  body.set(head, 0);
  body.set(file.bytes, head.byteLength);
  body.set(tail, head.byteLength + file.bytes.byteLength);

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
    throw new DriveFileUploadError(
      response.status === 403 || response.status === 401
        ? 'Google Drive did not allow creating a file. Reconnect Google Drive and allow it to create files.'
        : 'Google Drive could not save the file. Try again.',
      response.status,
    );
  }
  const created = (await response.json()) as { id?: string; webViewLink?: string };
  if (!created.id) throw new DriveFileUploadError('Google Drive did not return the new file.', 502);
  return { id: created.id, ...(created.webViewLink ? { webViewLink: created.webViewLink } : {}) };
}
