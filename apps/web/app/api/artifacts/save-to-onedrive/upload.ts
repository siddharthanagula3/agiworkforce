import 'server-only';

import { GRAPH_API_BASE } from '@/lib/connectors/microsoft-graph';
import { createDeadline, credentialedFetch, type Deadline } from '@/lib/url-fetch/guarded-fetch';

const UPLOAD_TIMEOUT_MS = 30_000;
const MAX_NAME_ATTEMPTS = 50;
const NOT_FOUND_STATUS = 404;

export class OneDriveFileUploadError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'OneDriveFileUploadError';
  }
}

interface GraphAccess {
  accessToken: string;
  tokenType: string;
}

function appFolderItemUrl(name: string, suffix: string): URL {
  return new URL(
    `${GRAPH_API_BASE}/me/drive/special/approot:/${encodeURIComponent(name)}${suffix}`,
  );
}

function numberedName(name: string, ordinal: number): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? `${name.slice(0, dot)} (${ordinal})${name.slice(dot)}` : `${name} (${ordinal})`;
}

async function graphCall(
  access: GraphAccess,
  target: URL,
  deadline: Deadline,
  init: { method: string; mimeType?: string; body?: Uint8Array },
): Promise<Response> {
  const outcome = await credentialedFetch(target, {
    deadline,
    redirects: 'refuse',
    method: init.method,
    headers: {
      Authorization: `${access.tokenType || 'Bearer'} ${access.accessToken}`,
      Accept: 'application/json',
      ...(init.mimeType ? { 'Content-Type': init.mimeType } : {}),
    },
    ...(init.body ? { body: init.body as BodyInit } : {}),
  });
  if (!outcome.ok) {
    throw new OneDriveFileUploadError('OneDrive did not answer. Try again in a moment.', 502);
  }
  return outcome.response;
}

function failure(status: number): OneDriveFileUploadError {
  return new OneDriveFileUploadError(
    status === 401 || status === 403
      ? 'OneDrive did not allow saving a file. Reconnect OneDrive and allow it to save files.'
      : 'OneDrive could not save the file. Try again.',
    status,
  );
}

async function firstFreeName(
  access: GraphAccess,
  name: string,
  deadline: Deadline,
): Promise<string> {
  for (let ordinal = 1; ordinal <= MAX_NAME_ATTEMPTS; ordinal += 1) {
    const candidate = ordinal === 1 ? name : numberedName(name, ordinal);
    const target = appFolderItemUrl(candidate, '');
    target.searchParams.set('$select', 'id');
    const response = await graphCall(access, target, deadline, { method: 'GET' });
    if (response.status === NOT_FOUND_STATUS) return candidate;
    if (!response.ok) throw failure(response.status);
  }
  throw new OneDriveFileUploadError(
    'The OneDrive app folder already holds too many copies of this file.',
    409,
  );
}

export async function uploadToOneDriveAppFolder(
  access: GraphAccess,
  file: { name: string; mimeType: string; bytes: Uint8Array },
): Promise<{ id: string; name: string; webUrl?: string }> {
  const deadline = createDeadline(UPLOAD_TIMEOUT_MS);
  try {
    const name = await firstFreeName(access, file.name, deadline);
    const response = await graphCall(access, appFolderItemUrl(name, ':/content'), deadline, {
      method: 'PUT',
      mimeType: file.mimeType,
      body: file.bytes,
    });
    if (!response.ok) throw failure(response.status);
    const created = (await response.json()) as { id?: string; name?: string; webUrl?: string };
    if (!created.id) {
      throw new OneDriveFileUploadError('OneDrive did not return the new file.', 502);
    }
    return {
      id: created.id,
      name: created.name ?? name,
      ...(created.webUrl ? { webUrl: created.webUrl } : {}),
    };
  } finally {
    deadline.release();
  }
}
