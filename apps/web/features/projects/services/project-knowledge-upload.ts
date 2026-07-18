import { validateAttachmentFile, type ProjectKnowledgeFile } from '@agiworkforce/types';
import { getCsrfToken } from '@/lib/client/csrf';

interface UploadProjectKnowledgeFileInput {
  projectId: string;
  file: File;
  onProgress?: (progress: number) => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function errorMessage(value: unknown, fallback: string): string {
  if (!isRecord(value)) return fallback;
  if (typeof value['message'] === 'string') return value['message'];
  const error = value['error'];
  if (typeof error === 'string') return error;
  if (isRecord(error) && typeof error['message'] === 'string') return error['message'];
  return fallback;
}

function parseRegisteredFile(value: unknown): ProjectKnowledgeFile {
  if (!isRecord(value) || !isRecord(value['file'])) {
    throw new Error('The server returned invalid file metadata.');
  }
  const file = value['file'];
  const requiredStrings = [
    'id',
    'projectId',
    'fileName',
    'mimeType',
    'checksumSha256',
    'sourceSurface',
    'addedAt',
    'storageUri',
  ] as const;
  if (
    requiredStrings.some((key) => typeof file[key] !== 'string') ||
    typeof file['byteCount'] !== 'number'
  ) {
    throw new Error('The server returned invalid file metadata.');
  }
  return file as unknown as ProjectKnowledgeFile;
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function readFileBuffer(file: File): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === 'function') return file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Unable to read the selected file.'));
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) resolve(reader.result);
      else reject(new Error('Unable to read the selected file.'));
    };
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Canonical browser transaction for project knowledge uploads:
 * validate → checksum → presign → object PUT → register metadata.
 */
export async function uploadProjectKnowledgeFile({
  projectId,
  file,
  onProgress,
}: UploadProjectKnowledgeFileInput): Promise<ProjectKnowledgeFile> {
  const validation = validateAttachmentFile(file);
  if (!validation.ok) throw new Error(validation.message);

  onProgress?.(0);
  const mimeType = file.type || 'application/octet-stream';
  const checksumSha256 = await sha256Hex(await readFileBuffer(file));
  const csrfToken = await getCsrfToken();

  const presignResponse = await fetch('/api/uploads/presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
    body: JSON.stringify({
      kind: 'knowledge-file',
      fileName: file.name,
      mimeType,
      byteCount: file.size,
      projectId,
    }),
  });
  const presignBody: unknown = await presignResponse.json().catch(() => null);
  if (!presignResponse.ok) {
    throw new Error(
      errorMessage(presignBody, `Failed to prepare upload (${presignResponse.status})`),
    );
  }
  if (
    !isRecord(presignBody) ||
    typeof presignBody['uploadUrl'] !== 'string' ||
    typeof presignBody['publicUrl'] !== 'string'
  ) {
    throw new Error('The server returned an invalid upload destination.');
  }
  const uploadHeaders = isRecord(presignBody['uploadHeaders'])
    ? Object.fromEntries(
        Object.entries(presignBody['uploadHeaders']).filter(
          (entry): entry is [string, string] => typeof entry[1] === 'string',
        ),
      )
    : { 'Content-Type': mimeType };

  const uploadResponse = await fetch(presignBody['uploadUrl'], {
    method: 'PUT',
    headers: uploadHeaders,
    body: file,
  });
  if (!uploadResponse.ok) {
    throw new Error(`Upload failed (${uploadResponse.status})`);
  }
  onProgress?.(80);

  const registrationResponse = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/knowledge-files`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({
        fileName: file.name,
        mimeType,
        byteCount: file.size,
        checksumSha256,
        sourceSurface: 'web',
        storageUri: presignBody['publicUrl'],
      }),
    },
  );
  const registrationBody: unknown = await registrationResponse.json().catch(() => null);
  if (!registrationResponse.ok) {
    if (isRecord(registrationBody) && registrationBody['error'] === 'knowledge_files_unavailable') {
      throw new Error('Knowledge files require Cloud Managed (not yet available).');
    }
    throw new Error(
      errorMessage(registrationBody, `Failed to register upload (${registrationResponse.status})`),
    );
  }

  const registeredFile = parseRegisteredFile(registrationBody);
  if (
    registeredFile.projectId !== projectId ||
    registeredFile.fileName !== file.name ||
    registeredFile.byteCount !== file.size ||
    registeredFile.checksumSha256 !== checksumSha256
  ) {
    throw new Error('The server returned invalid file metadata.');
  }
  onProgress?.(100);
  return registeredFile;
}
