'use client';

import type { RequestAuthority } from '@/lib/identity/request-authority';
import { getCsrfToken } from '@/lib/client/csrf';
import {
  CHAT_FILE_INTAKE_STATUS_READ_ATTEMPTS,
  CHAT_LARGE_FILE_POLICY,
  CHAT_LARGE_FILE_UPLOAD_KIND,
  MANAGED_CLOUD_RESUMABLE_UPLOADS_PATH,
  MAX_CHAT_ATTACHMENT_BYTES,
  ManagedCloudChatAttachmentHttpError,
  ManagedCloudChatFileIntakeStatusResponseSchema,
  ManagedCloudChatLargeFileCompleteResponseSchema,
  ManagedCloudResumableUploadAbortResponseSchema,
  createManagedCloudChatAttachmentsClient,
  isRetryableAttachmentUploadError,
  managedCloudChatFileIntakePath,
} from '@agiworkforce/cloud-contracts';
import type {
  ChatAttachmentLimits,
  IncrementalSha256,
  ManagedCloudChatAttachment,
  ManagedCloudChatAttachmentUploadOptions,
  ManagedCloudChatAttachmentUploadStatus,
  ManagedCloudChatFileIntake,
  ResumableUploadSessionStore,
} from '@agiworkforce/cloud-contracts';
import { useBillingStore } from '@/shared/stores/web-auth-store';
import type { Attachment } from '@/shared/stores/web-chat-store';
import {
  pictureMetadataUploadRefusal,
  prepareChatAttachments,
} from '@features/chat/lib/attachment-metadata';

type Fetch = typeof globalThis.fetch;

export interface KeptAfterCancel {
  file: File;
  intakeId: string;
  attachment?: Attachment;
  /** How the kept copy ends: ready with its asset, or refused with the server's reason. */
  settle: (authority?: RequestAuthority) => Promise<KeptFileOutcome>;
  /** The person removed it: once its check ends, a ready copy goes to Recently deleted. */
  discard: (authority?: RequestAuthority) => Promise<void>;
}

export type KeptFileOutcome =
  { state: 'ready'; attachment: Attachment } | { state: 'refused'; message: string };

interface KeptFile {
  intakeId: string;
  ownerId: string | undefined;
  temporary: boolean;
  conversationId: string | undefined;
  attachment?: Attachment;
  outcome?: Promise<KeptFileOutcome>;
  copy?: KeptCopyState;
}

/** Whether the server still holds the copy: gone once its intake ends without one. */
type KeptCopyState = 'held' | 'gone' | 'unknown';

interface KeptIntakeRead {
  outcome: KeptFileOutcome;
  copy: KeptCopyState;
}

/**
 * Files whose copy the server kept after a cancel came too late. A later
 * upload of the same File reuses that copy, so it is never stored or counted
 * twice.
 */
const keptFiles = new WeakMap<File, KeptFile>();

export interface ChatAttachmentUploadOptions extends ManagedCloudChatAttachmentUploadOptions {
  /**
   * Large files a cancel reached after their copy could no longer be stopped.
   * The receiver shows each one and calls its discard when the person removes
   * it. Uploading the same File again reuses that copy instead of storing and
   * counting a second one.
   */
  onKeptAfterCancel?: (kept: readonly KeptAfterCancel[]) => void;
  /**
   * For a caller with no progress, cancel or kept-copy handling: a file over
   * the inline limit is refused as it is when large files are not offered,
   * whatever the account's handshake says.
   */
  declineLargeFiles?: boolean;
}

const LARGE_FILE_SESSION_PREFIX = 'agi.chat-large-file-upload.';

let largeFileCreateTurn: Promise<void> = Promise.resolve();

function uploadCancelled(): Error {
  return Object.assign(new Error('The upload was cancelled.'), { name: 'AbortError' });
}

function untilSettledOrCancel<T>(
  settled: Promise<T>,
  signal: AbortSignal | null | undefined,
): Promise<T> {
  if (!signal) return settled;
  if (signal.aborted) return Promise.reject(uploadCancelled());
  return new Promise((resolve, reject) => {
    const leave = () => reject(uploadCancelled());
    signal.addEventListener('abort', leave, { once: true });
    settled.then(
      (value) => {
        signal.removeEventListener('abort', leave);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', leave);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

/** The server refuses overlapping large file creates past the plan's concurrent intake cap. */
function oneLargeFileCreateAtATime(
  send: () => Promise<Response>,
  signal: AbortSignal | null | undefined,
): Promise<Response> {
  const previous = largeFileCreateTurn;
  const turn = untilSettledOrCancel(previous, signal).then(send);
  largeFileCreateTurn = previous
    .then(() => turn)
    .then(
      () => undefined,
      () => undefined,
    );
  return turn;
}

function largeFileOffer(): ChatAttachmentLimits | null {
  const limits = useBillingStore.getState().attachmentLimits;
  return limits?.largeFilesAvailable === true ? limits : null;
}

async function largeFileHasher(): Promise<() => IncrementalSha256> {
  const { sha256 } = await import('@noble/hashes/sha2.js');
  return () => sha256.create();
}

function requestHref(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  return input instanceof URL ? input.href : input.url;
}

function isLargeFileCreate(input: RequestInfo | URL, init: RequestInit | undefined): boolean {
  if ((init?.method ?? 'GET').toUpperCase() !== 'POST' || typeof init?.body !== 'string') {
    return false;
  }
  const path = new URL(requestHref(input), globalThis.location.href).pathname;
  if (path !== MANAGED_CLOUD_RESUMABLE_UPLOADS_PATH) return false;
  try {
    return (JSON.parse(init.body) as { kind?: unknown }).kind === CHAT_LARGE_FILE_UPLOAD_KIND;
  } catch {
    return false;
  }
}

function isUploadSessionCancel(input: RequestInfo | URL, init: RequestInit | undefined): boolean {
  if ((init?.method ?? 'GET').toUpperCase() !== 'DELETE') return false;
  const path = new URL(requestHref(input), globalThis.location.href).pathname;
  return path.startsWith(`${MANAGED_CLOUD_RESUMABLE_UPLOADS_PATH}/`);
}

async function readBody(response: Response): Promise<unknown> {
  return response
    .clone()
    .json()
    .catch(() => null);
}

/**
 * Opens large file creates one at a time and notes each intake the server
 * accepts, whether a complete names it or a cancel that came too late does.
 */
function watchLargeFiles(
  send: Fetch,
  uploadingIndex: () => number,
  intakes: Map<number, string>,
): Fetch {
  return async (input, init) => {
    const response = await (isLargeFileCreate(input, init)
      ? oneLargeFileCreateAtATime(() => send(input, init), init?.signal)
      : send(input, init));
    if (response.status === 202) {
      const accepted = ManagedCloudChatLargeFileCompleteResponseSchema.safeParse(
        await readBody(response),
      );
      if (accepted.success) intakes.set(uploadingIndex(), accepted.data.intake.id);
    } else if (response.ok && isUploadSessionCancel(input, init)) {
      const cancelled = ManagedCloudResumableUploadAbortResponseSchema.safeParse(
        await readBody(response),
      );
      if (cancelled.success && cancelled.data.intake) {
        intakes.set(uploadingIndex(), cancelled.data.intake.id);
      }
    }
    return response;
  };
}

/**
 * Only large file sessions are kept, and under the account that opened them,
 * so a reload resumes the file and another account never reads the session.
 */
function largeFileSessions(ownerId: string): ResumableUploadSessionStore {
  const keyFor = (fingerprint: string) => `${LARGE_FILE_SESSION_PREFIX}${ownerId}.${fingerprint}`;
  const holds = (fingerprint: string) => fingerprint.startsWith(`${CHAT_LARGE_FILE_UPLOAD_KIND}:`);
  return {
    read(fingerprint) {
      if (!holds(fingerprint)) return null;
      try {
        return globalThis.localStorage.getItem(keyFor(fingerprint));
      } catch {
        return null;
      }
    },
    write(fingerprint, value) {
      if (!holds(fingerprint)) return;
      try {
        globalThis.localStorage.setItem(keyFor(fingerprint), value);
      } catch {
        return;
      }
    },
    remove(fingerprint) {
      if (!holds(fingerprint)) return;
      try {
        globalThis.localStorage.removeItem(keyFor(fingerprint));
      } catch {
        return;
      }
    },
  };
}

function toChatAttachment(attachment: ManagedCloudChatAttachment): Attachment {
  return {
    id: attachment.id,
    assetId: attachment.id,
    type: attachment.type,
    name: attachment.name,
    size: attachment.byteCount,
    mimeType: attachment.mimeType,
    url: attachment.url,
  };
}

async function intakeOutlivedCancel(
  send: Fetch,
  intakeId: string,
): Promise<ManagedCloudChatFileIntake | null> {
  const response = await send(managedCloudChatFileIntakePath(intakeId), {
    method: 'GET',
    credentials: 'include',
    signal: AbortSignal.timeout(CHAT_LARGE_FILE_POLICY.intake.statusPollMaxMs),
  }).catch(() => null);
  if (!response?.ok) return null;
  const status = ManagedCloudChatFileIntakeStatusResponseSchema.safeParse(
    await response.json().catch(() => null),
  );
  if (!status.success || status.data.intake.id !== intakeId) return null;
  const { intake } = status.data;
  return intake.state === 'checking' || intake.state === 'ready' ? intake : null;
}

interface MissedByCancel {
  file: File;
  intakeId: string;
  attachment?: Attachment;
}

async function filesTheCancelMissed(
  error: unknown,
  signal: AbortSignal | undefined,
  send: Fetch,
  intakes: ReadonlyMap<number, string>,
  files: readonly File[],
): Promise<MissedByCancel[]> {
  if (!(error instanceof Error) || error.name !== 'AbortError' || !signal?.aborted) return [];
  const kept: MissedByCancel[] = [];
  for (const [index, intakeId] of intakes) {
    const file = files[index];
    const intake = file ? await intakeOutlivedCancel(send, intakeId) : null;
    if (!file || !intake) continue;
    kept.push({
      file,
      intakeId,
      attachment: intake.attachment ? toChatAttachment(intake.attachment) : undefined,
    });
  }
  return kept;
}

function sendAs(authority: RequestAuthority | undefined): Fetch {
  return authority
    ? (input, init) => authority.fetch(input, { ...init, credentials: 'omit' })
    : (input, init) => globalThis.fetch(input, init);
}

function isCancellation(error: unknown): boolean {
  return (error as { name?: unknown } | null)?.name === 'AbortError';
}

function notAttached(file: File): string {
  return `"${file.name}" could not be attached.`;
}

/** Reads a kept intake on the rhythm the upload itself polls at, until it settles. */
async function readKeptIntake(file: File, intakeId: string, send: Fetch): Promise<KeptIntakeRead> {
  const unverifiedMessage = `Could not verify ${file.name}.`;
  const unverified: KeptFileOutcome = { state: 'refused', message: unverifiedMessage };
  const { statusPollMinMs, statusPollMaxMs } = CHAT_LARGE_FILE_POLICY.intake;
  let unanswered = 0;
  for (
    let delay = statusPollMinMs;
    unanswered < CHAT_FILE_INTAKE_STATUS_READ_ATTEMPTS;
    delay = Math.min(delay * 2, statusPollMaxMs)
  ) {
    await new Promise((resolve) => setTimeout(resolve, delay));
    let response: Response;
    try {
      response = await send(managedCloudChatFileIntakePath(intakeId), {
        method: 'GET',
        credentials: 'include',
      });
    } catch (error) {
      if (isCancellation(error)) throw error;
      unanswered += 1;
      continue;
    }
    if (!response.ok) {
      const answer = new ManagedCloudChatAttachmentHttpError(unverifiedMessage, response.status);
      if (isRetryableAttachmentUploadError(answer)) {
        unanswered += 1;
        continue;
      }
      return { outcome: unverified, copy: response.status === 404 ? 'gone' : 'unknown' };
    }
    const status = ManagedCloudChatFileIntakeStatusResponseSchema.safeParse(
      await response.json().catch(() => null),
    );
    if (!status.success || status.data.intake.id !== intakeId) {
      return { outcome: unverified, copy: 'unknown' };
    }
    unanswered = 0;
    const { intake } = status.data;
    if (intake.state === 'ready' && intake.attachment) {
      return {
        outcome: { state: 'ready', attachment: toChatAttachment(intake.attachment) },
        copy: 'held',
      };
    }
    if (intake.state === 'rejected' || intake.state === 'failed' || intake.state === 'cancelled') {
      return {
        outcome: { state: 'refused', message: intake.message ?? notAttached(file) },
        copy: 'gone',
      };
    }
  }
  return { outcome: unverified, copy: 'unknown' };
}

function keptFileFor(file: File, ownerId: string | undefined): KeptFile | null {
  const kept = keptFiles.get(file);
  return kept && kept.ownerId === ownerId ? kept : null;
}

function outcomeOf(file: File, kept: KeptFile, send: Fetch): Promise<KeptFileOutcome> {
  if (kept.outcome) return kept.outcome;
  const read = readKeptIntake(file, kept.intakeId, send);
  const outcome = read.then((settled) => settled.outcome);
  kept.outcome = outcome;
  read.then(
    (settled) => {
      kept.copy = settled.copy;
      if (settled.outcome.state === 'ready') kept.attachment = settled.outcome.attachment;
      if (settled.copy === 'gone' && keptFiles.get(file) === kept) keptFiles.delete(file);
      if (settled.copy === 'unknown' && kept.outcome === outcome) kept.outcome = undefined;
    },
    () => {
      if (kept.outcome === outcome) kept.outcome = undefined;
    },
  );
  return outcome;
}

/** A read another send started ends with that send, so the caller then reads on its own. */
function joinOutcome(
  file: File,
  kept: KeptFile,
  authority: RequestAuthority | undefined,
): Promise<KeptFileOutcome> {
  const send = sendAs(authority);
  return outcomeOf(file, kept, send).catch((error: unknown) => {
    if (isCancellation(error) && (!authority || authority.isCurrent())) {
      return outcomeOf(file, kept, send);
    }
    throw error;
  });
}

function settleKept(
  file: File,
  kept: KeptFile,
  authority: RequestAuthority | undefined,
): Promise<KeptFileOutcome> {
  if (keptFileFor(file, authority?.session.userId) !== kept) {
    return Promise.resolve({ state: 'refused', message: notAttached(file) });
  }
  return joinOutcome(file, kept, authority);
}

function notDeleted(file: File): Error {
  return new Error(`Could not delete ${file.name}. Delete it in your Library.`);
}

async function discardKept(
  file: File,
  kept: KeptFile,
  authority: RequestAuthority | undefined,
): Promise<void> {
  if (keptFileFor(file, authority?.session.userId) !== kept) return;
  keptFiles.delete(file);
  const send = sendAs(authority);
  const outcome = await joinOutcome(file, kept, authority).catch(() => null);
  if (!outcome) throw notDeleted(file);
  if (outcome.state !== 'ready') {
    if (kept.copy === 'gone') return;
    throw notDeleted(file);
  }
  const assetId = outcome.attachment.assetId ?? outcome.attachment.id;
  const csrfToken = await getCsrfToken();
  const response = await send(`/api/media?id=${encodeURIComponent(assetId)}`, {
    method: 'DELETE',
    credentials: 'same-origin',
    headers: { 'x-csrf-token': csrfToken },
  });
  const answer = response.ok ? await response.json().catch(() => null) : null;
  if ((answer as { success?: unknown } | null)?.success !== true) throw notDeleted(file);
}

type StatusReport = (status: ManagedCloudChatAttachmentUploadStatus) => void;

async function reuseKeptFiles(
  files: readonly File[],
  kept: readonly (KeptFile | null)[],
  authority: RequestAuthority | undefined,
  report: StatusReport,
  signal: AbortSignal | undefined,
): Promise<Map<number, Attachment>> {
  const reused = new Map<number, Attachment>();
  for (const [index, file] of files.entries()) {
    const entry = kept[index];
    if (!entry) continue;
    report({ index, fileName: file.name, phase: 'verifying' });
    const outcome = await untilSettledOrCancel(joinOutcome(file, entry, authority), signal);
    if (outcome.state === 'refused') {
      report({
        index,
        fileName: file.name,
        phase: 'failed',
        error: outcome.message,
        retryable: entry.copy === 'unknown',
      });
      throw new Error(outcome.message);
    }
    report({ index, fileName: file.name, phase: 'complete' });
    reused.set(index, outcome.attachment);
  }
  return reused;
}

function keptAfterCancel(file: File, kept: KeptFile): KeptAfterCancel {
  return {
    file,
    intakeId: kept.intakeId,
    ...(kept.attachment ? { attachment: kept.attachment } : {}),
    settle: (authority) => settleKept(file, kept, authority),
    discard: (authority) => discardKept(file, kept, authority),
  };
}

async function uploadFreshFiles(
  files: File[],
  options: ChatAttachmentUploadOptions,
  report: StatusReport,
  authority: RequestAuthority | undefined,
): Promise<Attachment[]> {
  const { onKeptAfterCancel: _receiver, declineLargeFiles, ...uploadOptions } = options;
  const offer = declineLargeFiles === true ? null : largeFileOffer();
  const createSha256 =
    offer && files.some((file) => file.size > MAX_CHAT_ATTACHMENT_BYTES)
      ? await largeFileHasher()
      : undefined;
  authority?.assertCurrent();

  const csrfToken = await getCsrfToken();
  authority?.assertCurrent();
  const apiFetch = sendAs(authority);
  const intakes = new Map<number, string>();
  let uploadingIndex = -1;
  const client = createManagedCloudChatAttachmentsClient({
    ...(authority
      ? {
          sessions: null,
          assertCurrent: authority.assertCurrent,
          getHeaders: async () => ({ Authorization: `Bearer ${await authority.getToken()}` }),
          fetchImpl: apiFetch,
          uploadFetchImpl: async (input, init) => {
            authority.assertCurrent();
            const response = await fetch(input, {
              ...init,
              credentials: 'omit',
              signal: init?.signal
                ? AbortSignal.any([authority.signal, init.signal])
                : authority.signal,
            });
            authority.assertCurrent();
            return response;
          },
        }
      : {}),
    decorateMutationHeaders: (headers) => {
      const decorated = new Headers(headers);
      decorated.set('x-csrf-token', csrfToken);
      return decorated;
    },
    ...(offer ? { limits: offer } : {}),
    ...(createSha256
      ? {
          createSha256,
          fetchImpl: watchLargeFiles(apiFetch, () => uploadingIndex, intakes),
          ...(authority ? { sessions: largeFileSessions(authority.session.userId) } : {}),
        }
      : {}),
  });
  let uploaded: Awaited<ReturnType<typeof client.upload>>;
  try {
    uploaded = await client.upload(files, {
      ...uploadOptions,
      largeFiles: offer !== null,
      onStatus: (status) => {
        uploadingIndex = status.index;
        if (status.phase === 'complete') intakes.delete(status.index);
        report(status);
      },
    });
  } catch (error) {
    const missed = await filesTheCancelMissed(error, options.signal, apiFetch, intakes, files);
    for (const { file, intakeId, attachment } of missed) {
      keptFiles.set(file, {
        intakeId,
        ownerId: authority?.session.userId,
        temporary: options.temporary === true,
        conversationId: options.conversationId,
        ...(attachment
          ? { attachment, outcome: Promise.resolve({ state: 'ready' as const, attachment }) }
          : {}),
      });
    }
    throw error;
  }
  authority?.assertCurrent();
  return uploaded.map(toChatAttachment);
}

export async function uploadChatAttachments(
  files: File[],
  options: ChatAttachmentUploadOptions = {},
  authority?: RequestAuthority,
): Promise<Attachment[]> {
  authority?.assertCurrent();
  const { accepted, refused } = await prepareChatAttachments(files);
  authority?.assertCurrent();
  const unreadable = refused[0];
  if (unreadable) throw new Error(pictureMetadataUploadRefusal(unreadable.filename));

  const report: StatusReport = (status) => {
    if (!authority || authority.isCurrent()) options.onStatus?.(status);
  };
  const ownerId = authority?.session.userId;
  const temporary = options.temporary === true;
  const registered = accepted.map((file) => keptFileFor(file, ownerId));
  const kept = registered.map((entry) =>
    entry && entry.temporary === temporary && entry.conversationId === options.conversationId
      ? entry
      : null,
  );
  const fresh = accepted.filter((_, index) => !kept[index]);
  const freshIndexes = accepted.flatMap((_, index) => (kept[index] ? [] : [index]));
  try {
    await untilSettledOrCancel(
      Promise.all(
        accepted.flatMap((file, index) => {
          const misplaced = kept[index] ? null : registered[index];
          return misplaced ? [discardKept(file, misplaced, authority)] : [];
        }),
      ),
      options.signal,
    );
    authority?.assertCurrent();
    const reused = await reuseKeptFiles(accepted, kept, authority, report, options.signal);
    authority?.assertCurrent();
    if (fresh.length === 0 && reused.size > 0) {
      return accepted.map((_, index) => reused.get(index)!);
    }
    const uploaded = await uploadFreshFiles(
      fresh,
      options,
      (status) => report({ ...status, index: freshIndexes[status.index] ?? status.index }),
      authority,
    );
    let next = 0;
    return accepted.map((_, index) => reused.get(index) ?? uploaded[next++]!);
  } catch (error) {
    if (isCancellation(error) && options.signal?.aborted) {
      const stillKept = accepted.flatMap((file) => {
        const entry = keptFileFor(file, ownerId);
        return entry ? [keptAfterCancel(file, entry)] : [];
      });
      if (stillKept.length > 0 && (!authority || authority.isCurrent())) {
        options.onKeptAfterCancel?.(stillKept);
      }
    }
    throw error;
  }
}
