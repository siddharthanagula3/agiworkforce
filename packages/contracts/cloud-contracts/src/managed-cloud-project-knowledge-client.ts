import { validateAttachmentFile, stripTrailingSlashes } from '@agiworkforce/types';
import type { ZodType } from 'zod';
import {
  MANAGED_CLOUD_PROJECT_KNOWLEDGE_PRESIGN_PATH,
  ManagedCloudProjectKnowledgeDeleteResponseSchema,
  ManagedCloudProjectKnowledgeListResponseSchema,
  PROJECT_KNOWLEDGE_UPLOAD_PROTOCOL_VERSION,
  ManagedCloudProjectKnowledgePresignRequestSchema,
  ManagedCloudProjectKnowledgePresignResponseSchema,
  ManagedCloudProjectKnowledgeRegisterRequestSchema,
  ManagedCloudProjectKnowledgeRegisterResponseSchema,
  managedCloudProjectKnowledgeFilePath,
  managedCloudProjectKnowledgePath,
  type ManagedCloudProjectKnowledgeFile,
} from './project-knowledge';
import { sha256HexOfBlob } from './file-digest';
import {
  createManagedCloudResumableUploadClient,
  isResumableUploadUnavailable,
} from './managed-cloud-resumable-upload-client';
import { shouldUploadInParts } from './resumable-uploads';

type ManagedKnowledgeSurface = 'web' | 'desktop' | 'mobile';

export interface ManagedCloudProjectKnowledgeClientConfig {
  baseUrl?: string;
  sourceSurface: ManagedKnowledgeSurface;
  getHeaders?: () => HeadersInit | Promise<HeadersInit>;
  decorateMutationHeaders?: (headers: Headers) => HeadersInit | Promise<HeadersInit>;
  fetchImpl?: typeof globalThis.fetch;
  uploadFetchImpl?: typeof globalThis.fetch;
}

export interface ManagedCloudProjectKnowledgeClient {
  list(projectId: string): Promise<ManagedCloudProjectKnowledgeFile[]>;
  upload(projectId: string, file: File): Promise<ManagedCloudProjectKnowledgeFile>;
  remove(projectId: string, fileId: string): Promise<void>;
}

export class ManagedCloudProjectKnowledgeHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ManagedCloudProjectKnowledgeHttpError';
  }
}

export class ManagedCloudProjectKnowledgeContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ManagedCloudProjectKnowledgeContractError';
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  return stripTrailingSlashes(baseUrl);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

async function responseError(response: Response, fallback: string): Promise<Error> {
  const payload: unknown = await response.json().catch(() => null);
  const rawError = isRecord(payload) ? payload['error'] : undefined;
  const message =
    typeof rawError === 'string'
      ? rawError
      : isRecord(rawError) && typeof rawError['message'] === 'string'
        ? rawError['message']
        : isRecord(payload) && typeof payload['message'] === 'string'
          ? payload['message']
          : fallback;
  return new ManagedCloudProjectKnowledgeHttpError(message, response.status);
}

function parseContract<T>(schema: ZodType<T>, value: unknown, label: string): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ManagedCloudProjectKnowledgeContractError(
      `Managed Cloud project knowledge ${label} contract violation: ${parsed.error.message}`,
    );
  }
  return parsed.data;
}

export function createManagedCloudProjectKnowledgeClient(
  config: ManagedCloudProjectKnowledgeClientConfig,
): ManagedCloudProjectKnowledgeClient {
  const baseUrl = normalizeBaseUrl(config.baseUrl ?? '');
  const fetchImpl = config.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const uploadFetchImpl = config.uploadFetchImpl ?? fetchImpl;
  const resumable = createManagedCloudResumableUploadClient({
    ...config,
    fetchImpl,
    uploadFetchImpl,
  });

  function assertRegisteredAsSent(
    registered: ManagedCloudProjectKnowledgeFile,
    projectId: string,
    file: File,
    checksumSha256: string,
  ): ManagedCloudProjectKnowledgeFile {
    if (
      registered.projectId !== projectId ||
      registered.fileName !== file.name ||
      registered.byteCount !== file.size ||
      registered.checksumSha256 !== checksumSha256
    ) {
      throw new Error('The server returned mismatched project knowledge metadata.');
    }
    return registered;
  }

  async function uploadInParts(
    projectId: string,
    file: File,
    mimeType: string,
    checksumSha256: string,
  ): Promise<ManagedCloudProjectKnowledgeFile | null> {
    try {
      const completed = await resumable.upload({
        file,
        request: {
          kind: 'knowledge-file',
          projectId,
          fileName: file.name,
          mimeType,
          byteCount: file.size,
          checksumSha256,
          sourceSurface: config.sourceSurface,
        },
      });
      if (completed.kind !== 'knowledge-file') {
        throw new ManagedCloudProjectKnowledgeContractError(
          'Managed Cloud project knowledge completion contract violation: expected a knowledge file.',
        );
      }
      return completed.file;
    } catch (error) {
      if (isResumableUploadUnavailable(error)) return null;
      throw error;
    }
  }

  async function headers(json: boolean, mutation: boolean): Promise<HeadersInit> {
    const result = new Headers(await config.getHeaders?.());
    if (json) result.set('Content-Type', 'application/json');
    if (mutation && config.decorateMutationHeaders) {
      return config.decorateMutationHeaders(result);
    }
    return Object.fromEntries(result.entries());
  }

  async function request(path: string, init: RequestInit): Promise<Response> {
    return fetchImpl(`${baseUrl}${path}`, {
      credentials: 'include',
      ...init,
    });
  }

  return {
    async list(projectId) {
      const response = await request(managedCloudProjectKnowledgePath(projectId), {
        method: 'GET',
        headers: await headers(false, false),
      });
      if (!response.ok) {
        throw await responseError(response, 'Could not load project knowledge.');
      }
      return parseContract(
        ManagedCloudProjectKnowledgeListResponseSchema,
        await response.json(),
        'list response',
      ).files;
    },

    async upload(projectId, file) {
      const validation = validateAttachmentFile(file);
      if (!validation.ok) throw new Error(validation.message);
      const mimeType = file.type || 'application/octet-stream';
      const checksumSha256 = await sha256HexOfBlob(file);

      if (shouldUploadInParts(file.size)) {
        const registered = await uploadInParts(projectId, file, mimeType, checksumSha256);
        if (registered) return assertRegisteredAsSent(registered, projectId, file, checksumSha256);
      }

      const presignBody = ManagedCloudProjectKnowledgePresignRequestSchema.parse({
        kind: 'knowledge-file',
        uploadProtocolVersion: PROJECT_KNOWLEDGE_UPLOAD_PROTOCOL_VERSION,
        projectId,
        fileName: file.name,
        mimeType,
        byteCount: file.size,
        checksumSha256,
      });
      const presignResponse = await request(MANAGED_CLOUD_PROJECT_KNOWLEDGE_PRESIGN_PATH, {
        method: 'POST',
        headers: await headers(true, true),
        body: JSON.stringify(presignBody),
      });
      if (!presignResponse.ok) {
        throw await responseError(presignResponse, `Could not prepare ${file.name}.`);
      }
      const presign = parseContract(
        ManagedCloudProjectKnowledgePresignResponseSchema,
        await presignResponse.json(),
        'presign response',
      );

      const uploadResponse = await uploadFetchImpl(presign.uploadUrl, {
        method: presign.uploadMethod,
        headers: presign.uploadHeaders,
        body: file,
      });
      if (!uploadResponse.ok) {
        throw new ManagedCloudProjectKnowledgeHttpError(
          `Could not upload ${file.name} to storage.`,
          uploadResponse.status,
        );
      }

      const registerBody = ManagedCloudProjectKnowledgeRegisterRequestSchema.parse({
        fileName: file.name,
        mimeType,
        byteCount: file.size,
        checksumSha256,
        sourceSurface: config.sourceSurface,
        storageUri: presign.storageKey,
      });
      const registrationResponse = await request(managedCloudProjectKnowledgePath(projectId), {
        method: 'POST',
        headers: await headers(true, true),
        body: JSON.stringify(registerBody),
      });
      if (!registrationResponse.ok) {
        await request(MANAGED_CLOUD_PROJECT_KNOWLEDGE_PRESIGN_PATH, {
          method: 'DELETE',
          headers: await headers(true, true),
          body: JSON.stringify({
            kind: 'knowledge-file',
            projectId,
            storageKey: presign.storageKey,
          }),
        }).catch(() => undefined);
        throw await responseError(registrationResponse, `Could not register ${file.name}.`);
      }
      const registered = parseContract(
        ManagedCloudProjectKnowledgeRegisterResponseSchema,
        await registrationResponse.json(),
        'registration response',
      ).file;
      return assertRegisteredAsSent(registered, projectId, file, checksumSha256);
    },

    async remove(projectId, fileId) {
      const response = await request(managedCloudProjectKnowledgeFilePath(projectId, fileId), {
        method: 'DELETE',
        headers: await headers(false, true),
      });
      if (!response.ok) {
        throw await responseError(response, 'Could not remove project knowledge.');
      }
      parseContract(
        ManagedCloudProjectKnowledgeDeleteResponseSchema,
        await response.json(),
        'delete response',
      );
    },
  };
}
