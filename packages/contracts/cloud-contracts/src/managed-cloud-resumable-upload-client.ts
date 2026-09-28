import { ErrorCode, stripTrailingSlashes } from '@agiworkforce/types';
import type { ZodType } from 'zod';
import {
  MANAGED_CLOUD_RESUMABLE_UPLOADS_PATH,
  ManagedCloudResumableUploadCompleteResponseSchema,
  ManagedCloudResumableUploadCreateRequestSchema,
  ManagedCloudResumableUploadPartsResponseSchema,
  ManagedCloudResumableUploadProgressSchema,
  ManagedCloudResumableUploadSessionSchema,
  managedCloudResumableUploadPartsPath,
  managedCloudResumableUploadPath,
  managedCloudResumableUploadSessionPath,
  resumableUploadPartRange,
  type ManagedCloudResumableUploadCompleteRequest,
  type ManagedCloudResumableUploadCompleteResponse,
  type ManagedCloudResumableUploadCreateRequest,
  type ManagedCloudResumableUploadSession,
  type ManagedCloudResumableUploadSignedPart,
} from './resumable-uploads';

export interface ResumableUploadSessionStore {
  read(fingerprint: string): string | null | Promise<string | null>;
  write(fingerprint: string, value: string): void | Promise<void>;
  remove(fingerprint: string): void | Promise<void>;
}

export interface ManagedCloudResumableUploadClientConfig {
  baseUrl?: string;
  getHeaders?: () => HeadersInit | Promise<HeadersInit>;
  decorateMutationHeaders?: (headers: Headers) => HeadersInit | Promise<HeadersInit>;
  fetchImpl?: typeof globalThis.fetch;
  uploadFetchImpl?: typeof globalThis.fetch;
  sessions?: ResumableUploadSessionStore | null;
  sleep?: (milliseconds: number) => Promise<void>;
}

export interface ManagedCloudResumableUploadInput {
  file: Blob;
  request: ManagedCloudResumableUploadCreateRequest;
  completion?: Omit<ManagedCloudResumableUploadCompleteRequest, 'session'>;
  signal?: AbortSignal;
  onCompleting?: () => void;
}

export interface ManagedCloudResumableUploadClient {
  upload(
    input: ManagedCloudResumableUploadInput,
  ): Promise<ManagedCloudResumableUploadCompleteResponse>;
}

export class ManagedCloudResumableUploadError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null = null,
  ) {
    super(message);
    this.name = 'ManagedCloudResumableUploadError';
  }
}

export function isResumableUploadUnavailable(error: unknown): boolean {
  return (
    error instanceof ManagedCloudResumableUploadError &&
    error.code === ErrorCode.CAPABILITY_UNAVAILABLE
  );
}

const SESSION_STORAGE_PREFIX = 'agi.resumable-upload.';
const PART_ATTEMPTS = 4;
const RETRY_BASE_DELAY_MS = 500;
const RETRY_MAX_DELAY_MS = 8_000;
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const EXPIRED_SIGNATURE_STATUS = 403;
const SESSION_GONE_STATUSES = new Set([401, 403, 404, 409]);

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function webStorageSessions(): ResumableUploadSessionStore | null {
  let storage: Storage | undefined;
  try {
    storage = (globalThis as { localStorage?: Storage }).localStorage;
  } catch {
    return null;
  }
  if (!storage) return null;
  const store = storage;
  return {
    read(fingerprint) {
      try {
        return store.getItem(`${SESSION_STORAGE_PREFIX}${fingerprint}`);
      } catch {
        return null;
      }
    },
    write(fingerprint, value) {
      try {
        store.setItem(`${SESSION_STORAGE_PREFIX}${fingerprint}`, value);
      } catch {
        return;
      }
    },
    remove(fingerprint) {
      try {
        store.removeItem(`${SESSION_STORAGE_PREFIX}${fingerprint}`);
      } catch {
        return;
      }
    },
  };
}

function assertNotAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const error = new Error('The upload was cancelled.');
  error.name = 'AbortError';
  throw error;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
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
  const code = isRecord(rawError) && typeof rawError['code'] === 'string' ? rawError['code'] : null;
  return new ManagedCloudResumableUploadError(message, response.status, code);
}

function parseContract<T>(schema: ZodType<T>, value: unknown, label: string): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ManagedCloudResumableUploadError(
      `Resumable upload ${label} contract violation: ${parsed.error.message}`,
      502,
    );
  }
  return parsed.data;
}

function sessionFingerprint(request: ManagedCloudResumableUploadCreateRequest): string {
  const scope = request.kind === 'knowledge-file' ? request.projectId : '';
  return [request.kind, scope, request.checksumSha256.toLowerCase(), request.byteCount].join(':');
}

function readStoredSession(value: string | null): ManagedCloudResumableUploadSession | null {
  if (!value) return null;
  let decoded: unknown;
  try {
    decoded = JSON.parse(value);
  } catch {
    return null;
  }
  const parsed = ManagedCloudResumableUploadSessionSchema.safeParse(decoded);
  if (!parsed.success) return null;
  const expiresAt = Date.parse(parsed.data.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt > Date.now() ? parsed.data : null;
}

export function createManagedCloudResumableUploadClient(
  config: ManagedCloudResumableUploadClientConfig = {},
): ManagedCloudResumableUploadClient {
  const baseUrl = stripTrailingSlashes(config.baseUrl ?? '');
  const fetchImpl = config.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const uploadFetchImpl = config.uploadFetchImpl ?? fetchImpl;
  const sessions = config.sessions === undefined ? webStorageSessions() : config.sessions;
  const sleep = config.sleep ?? defaultSleep;

  async function headers(json: boolean, mutation: boolean): Promise<HeadersInit> {
    const result = new Headers(await config.getHeaders?.());
    if (json) result.set('Content-Type', 'application/json');
    if (mutation && config.decorateMutationHeaders) {
      return config.decorateMutationHeaders(result);
    }
    return Object.fromEntries(result.entries());
  }

  async function request(path: string, init: RequestInit): Promise<Response> {
    return fetchImpl(`${baseUrl}${path}`, { credentials: 'include', ...init });
  }

  async function forget(fingerprint: string): Promise<void> {
    await sessions?.remove(fingerprint);
  }

  async function openSession(
    createRequest: ManagedCloudResumableUploadCreateRequest,
    signal?: AbortSignal,
  ): Promise<ManagedCloudResumableUploadSession> {
    const response = await request(MANAGED_CLOUD_RESUMABLE_UPLOADS_PATH, {
      method: 'POST',
      headers: await headers(true, true),
      body: JSON.stringify(ManagedCloudResumableUploadCreateRequestSchema.parse(createRequest)),
      signal,
    });
    if (!response.ok) {
      throw await responseError(response, `Could not start uploading ${createRequest.fileName}.`);
    }
    return parseContract(
      ManagedCloudResumableUploadSessionSchema,
      await response.json(),
      'session response',
    );
  }

  async function storedParts(
    session: ManagedCloudResumableUploadSession,
    signal?: AbortSignal,
  ): Promise<Map<number, number> | null> {
    const response = await request(
      managedCloudResumableUploadSessionPath(session.uploadId, session.session),
      { method: 'GET', headers: await headers(false, false), signal },
    );
    if (SESSION_GONE_STATUSES.has(response.status)) return null;
    if (!response.ok) throw await responseError(response, 'Could not read the upload progress.');
    const progress = parseContract(
      ManagedCloudResumableUploadProgressSchema,
      await response.json(),
      'progress response',
    );
    return new Map(progress.parts.map((part) => [part.partNumber, part.size]));
  }

  async function signParts(
    session: ManagedCloudResumableUploadSession,
    partNumbers: number[],
    signal?: AbortSignal,
  ): Promise<Map<number, ManagedCloudResumableUploadSignedPart>> {
    const response = await request(managedCloudResumableUploadPartsPath(session.uploadId), {
      method: 'POST',
      headers: await headers(true, true),
      body: JSON.stringify({ session: session.session, partNumbers }),
      signal,
    });
    if (!response.ok) throw await responseError(response, 'Could not prepare the upload.');
    const signed = parseContract(
      ManagedCloudResumableUploadPartsResponseSchema,
      await response.json(),
      'parts response',
    );
    return new Map(signed.parts.map((part) => [part.partNumber, part]));
  }

  async function sendPart(
    session: ManagedCloudResumableUploadSession,
    signed: ManagedCloudResumableUploadSignedPart,
    body: Blob,
    signal?: AbortSignal,
  ): Promise<void> {
    let target = signed;
    for (let attempt = 1; ; attempt += 1) {
      assertNotAborted(signal);
      let status: number;
      try {
        const response = await uploadFetchImpl(target.url, {
          method: target.method,
          headers: target.headers,
          body,
          signal,
        });
        if (response.ok) return;
        status = response.status;
      } catch (error) {
        if (isAbortError(error)) throw error;
        status = 0;
      }
      const retryable = status === 0 || RETRYABLE_STATUSES.has(status);
      const expired = status === EXPIRED_SIGNATURE_STATUS && attempt === 1;
      if ((!retryable && !expired) || attempt >= PART_ATTEMPTS) {
        throw new ManagedCloudResumableUploadError(
          'The upload was interrupted. Try again to continue from where it stopped.',
          status,
        );
      }
      if (expired) {
        const renewed = (await signParts(session, [signed.partNumber], signal)).get(
          signed.partNumber,
        );
        if (!renewed) {
          throw new ManagedCloudResumableUploadError('Could not prepare the upload.', 502);
        }
        target = renewed;
        continue;
      }
      const backoff = Math.min(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1), RETRY_MAX_DELAY_MS);
      await sleep(backoff);
    }
  }

  async function abort(session: ManagedCloudResumableUploadSession): Promise<void> {
    await request(managedCloudResumableUploadSessionPath(session.uploadId, session.session), {
      method: 'DELETE',
      headers: await headers(false, true),
    }).catch(() => undefined);
  }

  async function complete(
    session: ManagedCloudResumableUploadSession,
    completion: ManagedCloudResumableUploadInput['completion'],
    signal?: AbortSignal,
  ): Promise<ManagedCloudResumableUploadCompleteResponse> {
    const response = await request(managedCloudResumableUploadPath(session.uploadId), {
      method: 'POST',
      headers: await headers(true, true),
      body: JSON.stringify({ ...completion, session: session.session }),
      signal,
    });
    if (!response.ok) throw await responseError(response, 'Could not finish the upload.');
    return parseContract(
      ManagedCloudResumableUploadCompleteResponseSchema,
      await response.json(),
      'completion response',
    );
  }

  return {
    async upload({ file, request: createRequest, completion, signal, onCompleting }) {
      assertNotAborted(signal);
      if (file.size !== createRequest.byteCount) {
        throw new ManagedCloudResumableUploadError(
          `${createRequest.fileName} changed while it was being prepared. Select it again.`,
          400,
        );
      }
      const fingerprint = sessionFingerprint(createRequest);
      let session = readStoredSession((await sessions?.read(fingerprint)) ?? null);
      let stored = session ? await storedParts(session, signal) : null;
      if (!session || !stored) {
        session = await openSession(createRequest, signal);
        stored = new Map();
        await sessions?.write(fingerprint, JSON.stringify(session));
      }

      const openSessionHandle = session;
      try {
        const pending: number[] = [];
        for (let partNumber = 1; partNumber <= openSessionHandle.partCount; partNumber += 1) {
          const range = resumableUploadPartRange(
            partNumber,
            createRequest.byteCount,
            openSessionHandle.partBytes,
          );
          if (stored.get(partNumber) !== range.end - range.start) pending.push(partNumber);
        }
        if (pending.length > 0) {
          const signed = await signParts(openSessionHandle, pending, signal);
          for (const partNumber of pending) {
            const part = signed.get(partNumber);
            if (!part) {
              throw new ManagedCloudResumableUploadError('Could not prepare the upload.', 502);
            }
            const range = resumableUploadPartRange(
              partNumber,
              createRequest.byteCount,
              openSessionHandle.partBytes,
            );
            await sendPart(openSessionHandle, part, file.slice(range.start, range.end), signal);
          }
        }
        assertNotAborted(signal);
        onCompleting?.();
        const completed = await complete(openSessionHandle, completion, signal);
        await forget(fingerprint);
        return completed;
      } catch (error) {
        if (isAbortError(error)) {
          await abort(openSessionHandle);
          await forget(fingerprint);
        } else if (
          error instanceof ManagedCloudResumableUploadError &&
          error.status >= 400 &&
          error.status < 500 &&
          !RETRYABLE_STATUSES.has(error.status)
        ) {
          await forget(fingerprint);
        }
        throw error;
      }
    },
  };
}
