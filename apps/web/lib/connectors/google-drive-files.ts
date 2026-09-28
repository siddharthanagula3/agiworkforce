import 'server-only';

export const GOOGLE_DRIVE_CONNECTOR_ID = 'google-drive';

const DRIVE_FILES_ENDPOINT = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_REQUEST_TIMEOUT_MS = 30_000;

const GOOGLE_WORKSPACE_EXPORTS: Readonly<Record<string, { mimeType: string; extension: string }>> =
  {
    'application/vnd.google-apps.document': {
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      extension: 'docx',
    },
    'application/vnd.google-apps.spreadsheet': {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      extension: 'xlsx',
    },
    'application/vnd.google-apps.presentation': {
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      extension: 'pptx',
    },
  };

export class GoogleDriveFileError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'GoogleDriveFileError';
  }
}

export interface GoogleDriveFile {
  fileName: string;
  mimeType: string;
  data: Buffer;
}

async function driveRequest(url: URL, accessToken: string): Promise<Response> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(DRIVE_REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new GoogleDriveFileError(
      response.status === 404 || response.status === 403
        ? 'Google Drive did not allow access to that file. Pick it again.'
        : 'Google Drive could not send that file. Try again.',
      response.status,
    );
  }
  return response;
}

function withExtension(name: string, extension: string): string {
  return name.toLowerCase().endsWith(`.${extension}`) ? name : `${name}.${extension}`;
}

export async function downloadGoogleDriveFile(
  accessToken: string,
  fileId: string,
  maxBytes: number,
): Promise<GoogleDriveFile> {
  const metadataUrl = new URL(`${DRIVE_FILES_ENDPOINT}/${encodeURIComponent(fileId)}`);
  metadataUrl.searchParams.set('fields', 'id,name,mimeType,size');
  metadataUrl.searchParams.set('supportsAllDrives', 'true');
  const metadata = (await (await driveRequest(metadataUrl, accessToken)).json()) as {
    name?: string;
    mimeType?: string;
    size?: string;
  };
  const name = metadata.name?.trim() || 'Google Drive file';
  const sourceMime = metadata.mimeType ?? 'application/octet-stream';
  if (metadata.size && Number(metadata.size) > maxBytes) {
    throw new GoogleDriveFileError(`"${name}" is larger than a project source can be.`, 413);
  }

  const exported = GOOGLE_WORKSPACE_EXPORTS[sourceMime];
  if (!exported && sourceMime.startsWith('application/vnd.google-apps.')) {
    throw new GoogleDriveFileError(`"${name}" is a kind of Google file that cannot be added.`, 415);
  }
  const contentUrl = new URL(
    exported
      ? `${DRIVE_FILES_ENDPOINT}/${encodeURIComponent(fileId)}/export`
      : `${DRIVE_FILES_ENDPOINT}/${encodeURIComponent(fileId)}`,
  );
  if (exported) contentUrl.searchParams.set('mimeType', exported.mimeType);
  else {
    contentUrl.searchParams.set('alt', 'media');
    contentUrl.searchParams.set('supportsAllDrives', 'true');
  }
  const data = Buffer.from(await (await driveRequest(contentUrl, accessToken)).arrayBuffer());
  if (data.byteLength > maxBytes) {
    throw new GoogleDriveFileError(`"${name}" is larger than a project source can be.`, 413);
  }
  return {
    fileName: exported ? withExtension(name, exported.extension) : name,
    mimeType: exported ? exported.mimeType : sourceMime,
    data,
  };
}
