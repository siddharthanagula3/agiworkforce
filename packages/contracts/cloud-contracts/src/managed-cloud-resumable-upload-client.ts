import { managedUploadRequestOptions, type ManagedUploadRequestOptions } from './managed-upload';
import { ErrorCode, stripTrailingSlashes } from '@agiworkforce/types';
import type { ZodType } from 'zod';
import { CHAT_LARGE_FILE_POLICY } from './chat-attachments';
import {
  ManagedCloudChatFileIntakeStatusResponseSchema,
  managedCloudChatFileIntakePath,
  type ManagedCloudChatFileIntake,
} from './chat-file-intake';
import {
  CHAT_LARGE_FILE_UPLOAD_KIND,
  MANAGED_CLOUD_RESUMABLE_UPLOADS_PATH,
  RESUMABLE_UPLOAD_PART_CONCURRENCY,
  RESUMABLE_UPLOAD_SEGMENT_OFFSET_PARAM,
  ManagedCloudChatLargeFileCompleteResponseSchema,
  ManagedCloudChatLargeFileCreateRequestSchema,
  ManagedCloudResumableUploadCompleteResponseSchema,
  ManagedCloudResumableUploadCreateRequestSchema,
  ManagedCloudResumableUploadPartsResponseSchema,
  ManagedCloudResumableUploadProgressSchema,
  ManagedCloudResumableUploadSessionSchema,
  managedCloudResumableUploadPartsPath,
  managedCloudResumableUploadPath,
  managedCloudResumableUploadSessionPath,
  resumableUploadPartRange,
  type ResumableUploadPartRange,
  type ManagedCloudChatLargeFileCompleteResponse,
  type ManagedCloudChatLargeFileCreateRequest,
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

/** One part's bytes, addressed by their range in the file, and where storage takes them. */
export interface ResumableUploadPart {
  partNumber: number;
  start: number;
  end: number;
  url: string;
  method: 'PUT';
  headers: Record<string, string>;
  signal?: AbortSignal;
}

/**
 * Sends one part and resolves to the storage response status. It rejects only
 * when the signal aborts or the network fails, which the client retries.
 */
export type ResumableUploadPartSender = (part: ResumableUploadPart) => Promise<number>;

/** A Blob, or the size of a file whose parts a {@link ResumableUploadPartSender} reads itself. */
export interface ResumableUploadSource {
  readonly size: number;
  slice?(start: number, end: number): Blob;
}

/** Whether the person can see the upload: the page is visible or the app is in the foreground. */
export interface ResumableUploadVisibility {
  isVisible(): boolean;
  /** Calls the listener whenever visibility may have changed; returns the unsubscribe. */
  subscribe(listener: () => void): () => void;
}

export interface ManagedCloudResumableUploadClientConfig {
  baseUrl?: string;
  assertCurrent?: () => void;
  getHeaders?: () => HeadersInit | Promise<HeadersInit>;
  decorateMutationHeaders?: (headers: Headers) => HeadersInit | Promise<HeadersInit>;
  fetchImpl?: typeof globalThis.fetch;
  uploadFetchImpl?: typeof globalThis.fetch;
  sessions?: ResumableUploadSessionStore | null;
  sleep?: (milliseconds: number) => Promise<void>;
  sendPart?: ResumableUploadPartSender;
  /** Parts of a large chat file in flight at once; the web value of the upload contract unless set. */
  partConcurrency?: number;
  /**
   * A large chat file's checks are polled only while this reports visible. The
   * page's own visibility unless set; null polls regardless.
   */
  visibility?: ResumableUploadVisibility | null;
}

export type ManagedCloudResumableUploadRequest =
  ManagedCloudResumableUploadCreateRequest | ManagedCloudChatLargeFileCreateRequest;

export interface ManagedCloudResumableUploadInput {
  file: ResumableUploadSource;
  request: ManagedCloudResumableUploadRequest;
  completion?: Omit<ManagedCloudResumableUploadCompleteRequest, 'session'>;
  signal?: AbortSignal;
  onCompleting?: () => void;
  /** Bytes storage holds for this upload, after it resumes and after each part lands. */
  onStored?: (storedBytes: number, totalBytes: number) => void;
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

/**
 * The code on an upload error whose intake answer this build cannot read, such
 * as a state added after it shipped. Polling stops, and retrying cannot help.
 */
export const RESUMABLE_UPLOAD_INTAKE_STATUS_UNREADABLE = 'intake_status_unreadable';

/**
 * How many times in a row a client reads an intake's status without an answer
 * before it stops waiting and reports that the file could not be verified.
 */
export const CHAT_FILE_INTAKE_STATUS_READ_ATTEMPTS = 4;

const SESSION_STORAGE_PREFIX = 'agi.resumable-upload.';
const PART_ATTEMPTS = 4;
const RETRY_BASE_DELAY_MS = 500;
const RETRY_MAX_DELAY_MS = 8_000;
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const EXPIRED_SIGNATURE_STATUS = 403;
const UNREADABLE_SOURCE_STATUS = 400;
const UNREADABLE_INTAKE_STATUS = 502;
const INTAKE_REJECTED_STATUS = 422;
const INTAKE_FAILED_STATUS = 503;
const INTAKE_CANCELLED_STATUS = 409;

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function documentVisibility(): ResumableUploadVisibility | null {
  const page = (globalThis as { document?: Document }).document;
  if (!page || typeof page.addEventListener !== 'function') return null;
  if (typeof page.visibilityState !== 'string') return null;
  return {
    isVisible: () => page.visibilityState !== 'hidden',
    subscribe(listener) {
      page.addEventListener('visibilitychange', listener);
      return () => page.removeEventListener('visibilitychange', listener);
    },
  };
}

function isLargeFileRequest(
  request: ManagedCloudResumableUploadRequest,
): request is ManagedCloudChatLargeFileCreateRequest {
  return request.kind === CHAT_LARGE_FILE_UPLOAD_KIND;
}

function unreadableIntake(fileName: string): ManagedCloudResumableUploadError {
  return new ManagedCloudResumableUploadError(
    `Could not verify ${fileName}.`,
    UNREADABLE_INTAKE_STATUS,
    RESUMABLE_UPLOAD_INTAKE_STATUS_UNREADABLE,
  );
}

function settledIntake(
  intake: ManagedCloudChatFileIntake,
  fileName: string,
): ManagedCloudResumableUploadCompleteResponse | null {
  switch (intake.state) {
    case 'ready':
      if (!intake.attachment) throw unreadableIntake(fileName);
      return { kind: 'chat-attachment', attachment: intake.attachment };
    case 'rejected':
      throw new ManagedCloudResumableUploadError(
        intake.message ?? `"${fileName}" could not be attached.`,
        INTAKE_REJECTED_STATUS,
        intake.refusalCode ?? null,
      );
    case 'failed':
      throw new ManagedCloudResumableUploadError(
        intake.message ?? `Could not check ${fileName}. Try again.`,
        INTAKE_FAILED_STATUS,
        intake.failureCode ?? null,
      );
    case 'cancelled':
      throw new ManagedCloudResumableUploadError(
        intake.message ?? `The upload of ${fileName} stopped. Attach it again.`,
        INTAKE_CANCELLED_STATUS,
        intake.cancelReason ?? null,
      );
    default:
      return null;
  }
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

function abortError(): Error {
  const error = new Error('The upload was cancelled.');
  error.name = 'AbortError';
  return error;
}

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

async function responseError(
  response: Response,
  fallback: string,
  signal?: AbortSignal,
): Promise<Error> {
  const payload: unknown = await response.json().catch((error: unknown) => {
    if (signal?.aborted && isAbortError(error)) throw error;
    return null;
  });
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

function sessionScope(request: ManagedCloudResumableUploadRequest): string {
  if (request.kind === 'knowledge-file') return request.projectId;
  // The server binds a large file's conversation and Temporary Chat flag at create.
  if (isLargeFileRequest(request)) {
    return `${request.temporary ? 'temporary' : 'saved'}/${request.conversationId ?? ''}`;
  }
  return '';
}

function sessionFingerprint(request: ManagedCloudResumableUploadRequest): string {
  const scope = sessionScope(request);
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
  const partConcurrency =
    config.partConcurrency !== undefined &&
    Number.isInteger(config.partConcurrency) &&
    config.partConcurrency > 0
      ? config.partConcurrency
      : RESUMABLE_UPLOAD_PART_CONCURRENCY.web;
  const visibility = config.visibility === undefined ? documentVisibility() : config.visibility;
  const { statusPollMinMs, statusPollMaxMs } = CHAT_LARGE_FILE_POLICY.intake;

  async function readJson(response: Response): Promise<unknown> {
    const data: unknown = await response.json();
    config.assertCurrent?.();
    return data;
  }

  async function readPayload(response: Response, signal?: AbortSignal): Promise<unknown> {
    const data: unknown = await response.json().catch((error: unknown) => {
      if (signal?.aborted && isAbortError(error)) throw error;
      return undefined;
    });
    config.assertCurrent?.();
    return data;
  }

  function pause(milliseconds: number, signal?: AbortSignal): Promise<void> {
    assertNotAborted(signal);
    if (!signal) return sleep(milliseconds);
    return new Promise<void>((resolve, reject) => {
      const onAbort = () => reject(abortError());
      signal.addEventListener('abort', onAbort, { once: true });
      sleep(milliseconds).then(
        () => {
          signal.removeEventListener('abort', onAbort);
          resolve();
        },
        (error: unknown) => {
          signal.removeEventListener('abort', onAbort);
          reject(error instanceof Error ? error : new Error(String(error)));
        },
      );
    });
  }

  function whenVisible(signal?: AbortSignal): Promise<void> {
    assertNotAborted(signal);
    const watched = visibility;
    if (!watched || watched.isVisible()) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      let unsubscribe = (): void => undefined;
      const finish = (settle: () => void) => {
        unsubscribe();
        signal?.removeEventListener('abort', onAbort);
        settle();
      };
      const onAbort = () => finish(() => reject(abortError()));
      const onChange = () => {
        if (watched.isVisible()) finish(resolve);
      };
      unsubscribe = watched.subscribe(onChange);
      signal?.addEventListener('abort', onAbort, { once: true });
      if (signal?.aborted) onAbort();
      else onChange();
    });
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
    return fetchImpl(`${baseUrl}${path}`, { credentials: 'include', ...init });
  }

  async function forget(fingerprint: string): Promise<void> {
    await sessions?.remove(fingerprint);
  }

  async function openSession(
    createRequest: ManagedCloudResumableUploadRequest,
    signal?: AbortSignal,
  ): Promise<ManagedCloudResumableUploadSession> {
    const createHeaders = await headers(true, true);
    const body = isLargeFileRequest(createRequest)
      ? ManagedCloudChatLargeFileCreateRequestSchema.parse(createRequest)
      : ManagedCloudResumableUploadCreateRequestSchema.parse(createRequest);
    const response = await request(MANAGED_CLOUD_RESUMABLE_UPLOADS_PATH, {
      method: 'POST',
      headers: createHeaders,
      body: JSON.stringify(body),
      signal,
    });
    if (!response.ok) {
      throw await responseError(response, `Could not start uploading ${createRequest.fileName}.`);
    }
    return parseContract(
      ManagedCloudResumableUploadSessionSchema,
      await readJson(response),
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
    if (response.status === 404) return null;
    if (!response.ok) throw await responseError(response, 'Could not read the upload progress.');
    const progress = parseContract(
      ManagedCloudResumableUploadProgressSchema,
      await readJson(response),
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
      await readJson(response),
      'parts response',
    );
    return new Map(signed.parts.map((part) => [part.partNumber, part]));
  }

  async function transmitRange(
    file: ResumableUploadSource,
    target: ManagedCloudResumableUploadSignedPart,
    url: string,
    uploadOptions: ManagedUploadRequestOptions,
    range: ResumableUploadPartRange,
    signal?: AbortSignal,
  ): Promise<number> {
    if (config.sendPart) {
      return config.sendPart({
        partNumber: target.partNumber,
        start: range.start,
        end: range.end,
        url,
        method: target.method,
        headers: uploadOptions.headers,
        ...(signal ? { signal } : {}),
      });
    }
    if (typeof file.slice !== 'function') return UNREADABLE_SOURCE_STATUS;
    const response = await uploadFetchImpl(url, {
      ...uploadOptions,
      method: target.method,
      body: file.slice(range.start, range.end),
      signal,
    });
    return response.status;
  }

  async function transmitPart(
    file: ResumableUploadSource,
    target: ManagedCloudResumableUploadSignedPart,
    uploadOptions: ManagedUploadRequestOptions,
    range: ResumableUploadPartRange,
    signal?: AbortSignal,
  ): Promise<number> {
    const segmentBytes = target.segmentBytes;
    if (!segmentBytes || range.end - range.start <= segmentBytes) {
      return transmitRange(file, target, target.url, uploadOptions, range, signal);
    }
    let status = 0;
    for (let start = range.start; start < range.end; start += segmentBytes) {
      assertNotAborted(signal);
      const url = new URL(target.url);
      url.searchParams.set(RESUMABLE_UPLOAD_SEGMENT_OFFSET_PARAM, String(start - range.start));
      const segment = { start, end: Math.min(start + segmentBytes, range.end) };
      status = await transmitRange(file, target, url.toString(), uploadOptions, segment, signal);
      if (status < 200 || status >= 300) return status;
    }
    return status;
  }

  async function sendPart(
    session: ManagedCloudResumableUploadSession,
    signed: ManagedCloudResumableUploadSignedPart,
    file: ResumableUploadSource,
    range: ResumableUploadPartRange,
    signal?: AbortSignal,
  ): Promise<void> {
    let target = signed;
    for (let attempt = 1; ; attempt += 1) {
      assertNotAborted(signal);
      const uploadOptions = await managedUploadRequestOptions(target.url, target.headers, config);
      assertNotAborted(signal);
      let status: number;
      try {
        status = await transmitPart(file, target, uploadOptions, range, signal);
        if (status >= 200 && status < 300) return;
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

  async function cancelIntake(intakeId: string): Promise<void> {
    try {
      await request(managedCloudChatFileIntakePath(intakeId), {
        method: 'DELETE',
        headers: await headers(false, true),
      });
    } catch {
      return;
    }
  }

  async function complete(
    session: ManagedCloudResumableUploadSession,
    completion: ManagedCloudResumableUploadInput['completion'],
    createRequest: ManagedCloudResumableUploadRequest,
    signal?: AbortSignal,
  ): Promise<
    ManagedCloudResumableUploadCompleteResponse | ManagedCloudChatLargeFileCompleteResponse
  > {
    const response = await request(managedCloudResumableUploadPath(session.uploadId), {
      method: 'POST',
      headers: await headers(true, true),
      body: JSON.stringify({ ...completion, session: session.session }),
      signal,
    });
    const large = isLargeFileRequest(createRequest);
    if (!response.ok) {
      throw await responseError(
        response,
        'Could not finish the upload.',
        large ? signal : undefined,
      );
    }
    if (large) {
      const accepted = ManagedCloudChatLargeFileCompleteResponseSchema.safeParse(
        await readPayload(response, signal),
      );
      if (!accepted.success) throw unreadableIntake(createRequest.fileName);
      return accepted.data;
    }
    return parseContract(
      ManagedCloudResumableUploadCompleteResponseSchema,
      await readJson(response),
      'completion response',
    );
  }

  async function readIntake(
    intakeId: string,
    fileName: string,
    signal?: AbortSignal,
  ): Promise<ManagedCloudChatFileIntake | null> {
    const statusHeaders = await headers(false, false);
    let response: Response;
    try {
      response = await request(managedCloudChatFileIntakePath(intakeId), {
        method: 'GET',
        headers: statusHeaders,
        signal,
      });
    } catch (error) {
      if (error instanceof TypeError) return null;
      if (isAbortError(error) && !signal?.aborted) return null;
      throw error;
    }
    if (!response.ok) {
      if (RETRYABLE_STATUSES.has(response.status)) return null;
      throw await responseError(response, `Could not verify ${fileName}.`, signal);
    }
    const status = ManagedCloudChatFileIntakeStatusResponseSchema.safeParse(
      await readPayload(response, signal),
    );
    if (!status.success || status.data.intake.id !== intakeId) throw unreadableIntake(fileName);
    return status.data.intake;
  }

  async function awaitIntake(
    accepted: ManagedCloudChatFileIntake,
    fileName: string,
    signal?: AbortSignal,
  ): Promise<ManagedCloudResumableUploadCompleteResponse> {
    let intake = accepted;
    let delay = statusPollMinMs;
    let unanswered = 0;
    try {
      for (;;) {
        const settled = settledIntake(intake, fileName);
        if (settled) return settled;
        await pause(delay, signal);
        await whenVisible(signal);
        delay = Math.min(delay * 2, statusPollMaxMs);
        const next = await readIntake(intake.id, fileName, signal);
        if (next) {
          intake = next;
          unanswered = 0;
        } else if (++unanswered >= CHAT_FILE_INTAKE_STATUS_READ_ATTEMPTS) {
          throw new ManagedCloudResumableUploadError(`Could not verify ${fileName}.`, 0);
        }
      }
    } catch (error) {
      if (signal?.aborted && isAbortError(error)) await cancelIntake(intake.id);
      throw error;
    }
  }

  async function settle(
    completed:
      ManagedCloudResumableUploadCompleteResponse | ManagedCloudChatLargeFileCompleteResponse,
    fileName: string,
    signal?: AbortSignal,
  ): Promise<ManagedCloudResumableUploadCompleteResponse> {
    if (completed.kind !== 'chat-attachment-intake') return completed;
    return awaitIntake(completed.intake, fileName, signal);
  }

  async function sendConcurrently(
    partNumbers: readonly number[],
    send: (partNumber: number) => Promise<void>,
  ): Promise<void> {
    const queue = [...partNumbers];
    const failures: unknown[] = [];
    const worker = async () => {
      while (failures.length === 0) {
        const partNumber = queue.shift();
        if (partNumber === undefined) return;
        try {
          await send(partNumber);
        } catch (error) {
          failures.push(error);
        }
      }
    };
    const workers = Math.min(partConcurrency, partNumbers.length);
    await Promise.all(Array.from({ length: workers }, worker));
    if (failures.length > 0) throw failures[0];
  }

  return {
    async upload({ file, request: createRequest, completion, signal, onCompleting, onStored }) {
      assertNotAborted(signal);
      if (!config.sendPart && typeof file.slice !== 'function') {
        throw new ManagedCloudResumableUploadError(
          `${createRequest.fileName} cannot be read in parts on this device.`,
          UNREADABLE_SOURCE_STATUS,
        );
      }
      if (file.size !== createRequest.byteCount) {
        throw new ManagedCloudResumableUploadError(
          `${createRequest.fileName} changed while it was being prepared. Select it again.`,
          400,
        );
      }
      const fileName = createRequest.fileName;
      const fingerprint = sessionFingerprint(createRequest);
      let session = readStoredSession((await sessions?.read(fingerprint)) ?? null);
      let stored: Map<number, number> | null = null;
      if (session) {
        const recoverable = session;
        try {
          stored = await storedParts(recoverable, signal);
          if (!stored) assertNotAborted(signal);
        } catch (error) {
          if (isLargeFileRequest(createRequest) && signal?.aborted && isAbortError(error)) {
            await abort(recoverable);
            await forget(fingerprint);
          }
          throw error;
        }
      }
      if (session && !stored) {
        onCompleting?.();
        const recoveredSession = session;
        let recovered: Awaited<ReturnType<typeof complete>> | null = null;
        try {
          recovered = await complete(recoveredSession, completion, createRequest, signal);
          await forget(fingerprint);
        } catch (error) {
          if (isLargeFileRequest(createRequest) && signal?.aborted && isAbortError(error)) {
            await abort(recoveredSession);
            await forget(fingerprint);
            throw error;
          }
          if (!(error instanceof ManagedCloudResumableUploadError) || error.status !== 404) {
            throw error;
          }
          await forget(fingerprint);
          session = null;
        }
        if (recovered) return settle(recovered, fileName, signal);
      }
      if (!session) {
        session = await openSession(createRequest, signal);
        stored = new Map();
        await sessions?.write(fingerprint, JSON.stringify(session));
      }

      const openSessionHandle = session;
      let completed: Awaited<ReturnType<typeof complete>>;
      try {
        const pending: number[] = [];
        let storedBytes = 0;
        for (let partNumber = 1; partNumber <= openSessionHandle.partCount; partNumber += 1) {
          const range = resumableUploadPartRange(
            partNumber,
            createRequest.byteCount,
            openSessionHandle.partBytes,
          );
          if (stored?.get(partNumber) !== range.end - range.start) pending.push(partNumber);
          else storedBytes += range.end - range.start;
        }
        onStored?.(storedBytes, createRequest.byteCount);
        if (pending.length > 0) {
          const signed = await signParts(openSessionHandle, pending, signal);
          const send = async (partNumber: number) => {
            const part = signed.get(partNumber);
            if (!part) {
              throw new ManagedCloudResumableUploadError('Could not prepare the upload.', 502);
            }
            const range = resumableUploadPartRange(
              partNumber,
              createRequest.byteCount,
              openSessionHandle.partBytes,
            );
            await sendPart(openSessionHandle, part, file, range, signal);
            storedBytes += range.end - range.start;
            onStored?.(storedBytes, createRequest.byteCount);
          };
          if (isLargeFileRequest(createRequest)) await sendConcurrently(pending, send);
          else for (const partNumber of pending) await send(partNumber);
        }
        assertNotAborted(signal);
        onCompleting?.();
        completed = await complete(openSessionHandle, completion, createRequest, signal);
        await forget(fingerprint);
      } catch (error) {
        if (isAbortError(error)) {
          await abort(openSessionHandle);
          await forget(fingerprint);
        }
        throw error;
      }
      return settle(completed, fileName, signal);
    },
  };
}
