import 'server-only';

import { GRAPH_API_BASE } from '@/lib/connectors/microsoft-graph';
import { createDeadline, credentialedFetch } from '@/lib/url-fetch/guarded-fetch';

const UPLOAD_TIMEOUT_MS = 30_000;

export class OneDriveFileUploadError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'OneDriveFileUploadError';
  }
}

export async function uploadToOneDriveAppFolder(
  access: { accessToken: string; tokenType: string },
  file: { name: string; mimeType: string; bytes: Uint8Array },
): Promise<{ id: string; webUrl?: string }> {
  const target = new URL(
    `${GRAPH_API_BASE}/me/drive/special/approot:/${encodeURIComponent(file.name)}:/content`,
  );
  const deadline = createDeadline(UPLOAD_TIMEOUT_MS);
  try {
    const outcome = await credentialedFetch(target, {
      deadline,
      redirects: 'refuse',
      method: 'PUT',
      headers: {
        Authorization: `${access.tokenType || 'Bearer'} ${access.accessToken}`,
        Accept: 'application/json',
        'Content-Type': file.mimeType,
      },
      body: file.bytes as BodyInit,
    });
    if (!outcome.ok) {
      throw new OneDriveFileUploadError('OneDrive did not answer. Try again in a moment.', 502);
    }
    const { response } = outcome;
    if (!response.ok) {
      throw new OneDriveFileUploadError(
        response.status === 401 || response.status === 403
          ? 'OneDrive did not allow saving a file. Reconnect OneDrive and allow it to save files.'
          : 'OneDrive could not save the file. Try again.',
        response.status,
      );
    }
    const created = (await response.json()) as { id?: string; webUrl?: string };
    if (!created.id)
      throw new OneDriveFileUploadError('OneDrive did not return the new file.', 502);
    return { id: created.id, ...(created.webUrl ? { webUrl: created.webUrl } : {}) };
  } finally {
    deadline.release();
  }
}
