import 'server-only';

import { mkdtemp, open, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { googleVideoOutputHostDisposition, providerApiUrl } from '@/lib/server/provider-endpoints';
import type { VideoGenerationJob } from '@/lib/server/video-generation-jobs';
import {
  OpenRouterVideoPollError,
  openRouterVideoContentRequest,
  pollOpenRouterVideo,
} from '@/lib/services/openrouter-video-provider-service';

const RUNWAY_API_BASE = 'https://api.dev.runwayml.com/v1';
const MAX_VIDEO_BYTES = 256 * 1024 * 1024;
const MAX_INLINE_VIDEO_BYTES = 32 * 1024 * 1024;
const VIDEO_MIME_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);

const GOOGLE_API_KEY_ENV_KEYS = ['GOOGLE_API_KEY', 'GOOGLE_AI_API_KEY', 'GEMINI_API_KEY'] as const;
// Google operation names include a dotted model resource segment. Permit dots
// inside an opaque segment, while still rejecting traversal, URL syntax,
// percent-encoding, and path separators.
const GOOGLE_RESOURCE_SEGMENT_PATTERN = /^[A-Za-z0-9_.-]{1,200}$/;

function isSafeGoogleResourceSegment(segment: string): boolean {
  return segment !== '.' && segment !== '..' && GOOGLE_RESOURCE_SEGMENT_PATTERN.test(segment);
}

function googleApiKey(): string | undefined {
  for (const name of GOOGLE_API_KEY_ENV_KEYS) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

export class VideoProviderOutputError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'VideoProviderOutputError';
  }
}

/**
 * Google long-running operation names are resource paths ending in
 * `operations/{id}`. Preserve safe provider path segments while rejecting URL
 * syntax, dot traversal, encoded separators, and arbitrary endpoint paths.
 */
export function normalizeGoogleVideoOperationName(
  value: string,
  allowLegacyRawId = true,
): string | null {
  if (value.length < 1 || value.length > 512) return null;
  if (allowLegacyRawId && isSafeGoogleResourceSegment(value)) {
    return `operations/${value}`;
  }
  const segments = value.split('/');
  if (
    segments.length < 2 ||
    segments.length > 8 ||
    segments.at(-2) !== 'operations' ||
    !segments.every(isSafeGoogleResourceSegment)
  ) {
    return null;
  }
  return segments.join('/');
}

interface RunwayTaskStatusResponse {
  id?: string;
  status?: 'PENDING' | 'THROTTLED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELED' | 'CANCELLED';
  progress?: number;
  output?: string[];
  failure?: string;
  failureCode?: string;
}

interface GoogleVideo {
  uri?: string;
  bytesBase64Encoded?: string;
}

interface GoogleOperationResponse {
  name?: string;
  metadata?: {
    state?: 'STATE_UNSPECIFIED' | 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
    progress?: number;
  };
  done?: boolean;
  error?: { code?: number; message?: string };
  response?: {
    generateVideoResponse?: { generatedSamples?: Array<{ video?: GoogleVideo }> };
    generatedSamples?: Array<{ video?: GoogleVideo }>;
    videos?: Array<{ video?: GoogleVideo }>;
  };
}

export type VideoProviderPollResult =
  | { status: 'queued' | 'processing'; progress?: number; retryAfterSeconds?: number }
  | {
      status: 'failed';
      error: string;
      providerFailureCode?: string;
      moderated?: boolean;
    }
  | {
      status: 'completed';
      output: { url: string } | { base64: string } | { openRouterContentIndex: number };
      actualCostCents?: number;
    };

function responseRetryAfterSeconds(response: Response): number | undefined {
  const value = response.headers.get('retry-after')?.trim();
  if (!value) return undefined;
  const numeric = Number(value);
  const seconds = Number.isFinite(numeric)
    ? Math.ceil(numeric)
    : Math.ceil((new Date(value).getTime() - Date.now()) / 1_000);
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
  return Math.max(5, Math.min(seconds, 600));
}

function retryAfterProjection(response: Response): { retryAfterSeconds?: number } {
  const retryAfterSeconds = responseRetryAfterSeconds(response);
  return retryAfterSeconds == null ? {} : { retryAfterSeconds };
}

function providerErrorFromHttp(
  provider: 'Google Veo' | 'Runway' | 'OpenRouter',
  response: Response,
): never {
  const { status } = response;
  const retryAfterSeconds = responseRetryAfterSeconds(response);
  if (status === 404) {
    throw new VideoProviderOutputError(`${provider} no longer has this video task.`, false);
  }
  if (status === 401 || status === 403) {
    throw new VideoProviderOutputError(`${provider} authentication failed.`, true);
  }
  if (status === 429 || status >= 500) {
    throw new VideoProviderOutputError(
      `${provider} is temporarily unavailable.`,
      true,
      retryAfterSeconds,
    );
  }
  throw new VideoProviderOutputError(`${provider} rejected the video status request.`, false);
}

function boundedProgress(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  // Runway commonly reports 0..1; Google commonly reports 0..100.
  const normalized = value <= 1 ? value * 100 : value;
  return Math.max(0, Math.min(Math.trunc(normalized), 99));
}

async function pollRunway(providerTaskId: string): Promise<VideoProviderPollResult> {
  const apiKey = process.env['RUNWAY_API_KEY']?.trim();
  if (!apiKey) throw new VideoProviderOutputError('Runway is not configured.', true);
  if (!/^[A-Za-z0-9_-]{1,512}$/.test(providerTaskId)) {
    throw new VideoProviderOutputError('Runway returned an invalid task identity.', false);
  }

  let response: Response;
  try {
    response = await fetch(`${RUNWAY_API_BASE}/tasks/${providerTaskId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'X-Runway-Version': '2024-11-06',
      },
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new VideoProviderOutputError('Runway status could not be verified.', true);
  }
  if (!response.ok) providerErrorFromHttp('Runway', response);

  let result: RunwayTaskStatusResponse;
  try {
    result = (await response.json()) as RunwayTaskStatusResponse;
  } catch {
    throw new VideoProviderOutputError('Runway returned an unreadable task state.', true);
  }
  switch (result.status) {
    case 'PENDING':
      return {
        status: 'queued',
        progress: boundedProgress(result.progress),
        ...retryAfterProjection(response),
      };
    case 'THROTTLED':
      return {
        status: 'queued',
        progress: boundedProgress(result.progress),
        retryAfterSeconds: responseRetryAfterSeconds(response) ?? 15,
      };
    case 'RUNNING':
      return {
        status: 'processing',
        progress: boundedProgress(result.progress),
        ...retryAfterProjection(response),
      };
    case 'FAILED': {
      const providerFailureCode =
        typeof result.failureCode === 'string' && /^[A-Z0-9_.-]{1,128}$/.test(result.failureCode)
          ? result.failureCode
          : undefined;
      const moderated =
        providerFailureCode?.startsWith('SAFETY.') === true ||
        providerFailureCode === 'INPUT_PREPROCESSING.SAFETY.TEXT';
      return {
        status: 'failed',
        error: moderated
          ? 'Runway safety checks could not deliver this video.'
          : 'Runway could not generate this video.',
        ...(providerFailureCode ? { providerFailureCode } : {}),
        ...(moderated ? { moderated: true } : {}),
      };
    }
    case 'CANCELED':
    case 'CANCELLED':
      return {
        status: 'failed',
        error: 'Runway could not generate this video.',
      };
    case 'SUCCEEDED': {
      const url = result.output?.[0];
      if (!url) {
        throw new VideoProviderOutputError(
          'Runway completed without returning a downloadable video.',
          true,
        );
      }
      return { status: 'completed', output: { url } };
    }
    default:
      throw new VideoProviderOutputError('Runway returned an unknown task state.', true);
  }
}

async function pollGoogle(providerTaskId: string): Promise<VideoProviderPollResult> {
  const apiKey = googleApiKey();
  if (!apiKey) throw new VideoProviderOutputError('Google Veo is not configured.', true);
  const operationName = normalizeGoogleVideoOperationName(providerTaskId);
  if (!operationName) {
    throw new VideoProviderOutputError('Google Veo returned an invalid operation identity.', false);
  }

  let response: Response;
  try {
    response = await fetch(providerApiUrl('google', operationName), {
      method: 'GET',
      headers: { 'x-goog-api-key': apiKey },
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new VideoProviderOutputError('Google Veo status could not be verified.', true);
  }
  if (!response.ok) providerErrorFromHttp('Google Veo', response);

  let result: GoogleOperationResponse;
  try {
    result = (await response.json()) as GoogleOperationResponse;
  } catch {
    throw new VideoProviderOutputError('Google Veo returned an unreadable task state.', true);
  }
  if (
    result.error ||
    result.metadata?.state === 'FAILED' ||
    result.metadata?.state === 'CANCELLED'
  ) {
    return {
      status: 'failed',
      // Provider diagnostics can contain internal URLs or request details.
      // Persist only stable product copy; operator evidence stays in provider
      // logs and the durable task identity, never the client response.
      error: 'Google Veo could not generate this video.',
    };
  }
  if (!result.done && result.metadata?.state !== 'SUCCEEDED') {
    return {
      status: result.metadata?.state === 'PENDING' ? 'queued' : 'processing',
      progress: boundedProgress(result.metadata?.progress),
      ...retryAfterProjection(response),
    };
  }

  const samples =
    result.response?.generateVideoResponse?.generatedSamples ??
    result.response?.generatedSamples ??
    result.response?.videos ??
    [];
  const video = samples[0]?.video;
  if (video?.uri) return { status: 'completed', output: { url: video.uri } };
  if (video?.bytesBase64Encoded) {
    return { status: 'completed', output: { base64: video.bytesBase64Encoded } };
  }
  throw new VideoProviderOutputError(
    'Google Veo completed without returning a downloadable video.',
    true,
  );
}

async function pollOpenRouter(providerTaskId: string): Promise<VideoProviderPollResult> {
  try {
    const result = await pollOpenRouterVideo(providerTaskId);
    if (result.status !== 'completed') return result;
    return {
      status: 'completed',
      output: { openRouterContentIndex: result.contentIndex },
      actualCostCents: result.actualCostCents,
    };
  } catch (error) {
    if (error instanceof OpenRouterVideoPollError) {
      throw new VideoProviderOutputError(error.message, error.retryable, error.retryAfterSeconds);
    }
    throw error;
  }
}

export function pollVideoProvider(job: VideoGenerationJob): Promise<VideoProviderPollResult> {
  if (!job.providerTaskId) {
    throw new VideoProviderOutputError(
      'The provider task was not durably attached to this video job.',
      true,
    );
  }
  if (job.provider === 'google') return pollGoogle(job.providerTaskId);
  if (job.provider === 'openrouter') return pollOpenRouter(job.providerTaskId);
  return pollRunway(job.providerTaskId);
}

/**
 * Ask Runway to cancel an active task. A 204 only acknowledges the task
 * management request; the reconciler still polls for CANCELED/FAILED before
 * releasing the user's reservation. Google Veo has no documented equivalent
 * on the models.operations surface, so callers must not route Google here.
 */
export async function requestRunwayVideoCancellation(job: VideoGenerationJob): Promise<void> {
  if (job.provider !== 'runway') {
    throw new VideoProviderOutputError(
      'This video provider does not expose a verified cancellation operation.',
      false,
    );
  }
  const apiKey = process.env['RUNWAY_API_KEY']?.trim();
  if (!apiKey) throw new VideoProviderOutputError('Runway is not configured.', true);
  const providerTaskId = job.providerTaskId;
  if (!providerTaskId || !/^[A-Za-z0-9_-]{1,512}$/.test(providerTaskId)) {
    throw new VideoProviderOutputError('Runway returned an invalid task identity.', false);
  }

  let response: Response;
  try {
    response = await fetch(`${RUNWAY_API_BASE}/tasks/${providerTaskId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'X-Runway-Version': '2024-11-06',
      },
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new VideoProviderOutputError('Runway cancellation is temporarily unavailable.', true);
  }
  if (response.status === 204) return;
  providerErrorFromHttp('Runway', response);
}

function validateProviderUrl(
  provider: VideoGenerationJob['provider'],
  value: string,
  redirect = false,
): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new VideoProviderOutputError('The video provider returned an invalid URL.', false);
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.hash ||
    value.length > 8_192
  ) {
    throw new VideoProviderOutputError('The video provider returned an unsafe URL.', false);
  }

  const hostname = url.hostname.toLowerCase();
  const allowed =
    provider === 'google'
      ? googleVideoOutputHostDisposition(hostname, redirect) !== null
      : hostname === 'dnznrvs05pmza.cloudfront.net' || hostname.endsWith('.runwayml.com');
  if (!allowed) {
    throw new VideoProviderOutputError('The video provider returned an untrusted host.', false);
  }
  return url;
}

function normalizedVideoMime(value: string | null): 'video/mp4' | 'video/webm' | 'video/quicktime' {
  const mime = value?.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  if (!VIDEO_MIME_TYPES.has(mime)) {
    throw new VideoProviderOutputError('The provider result is not a supported video.', false);
  }
  return mime as 'video/mp4' | 'video/webm' | 'video/quicktime';
}

function validateVideoSignature(
  prefix: Buffer,
  byteSize: number,
  contentType: 'video/mp4' | 'video/webm' | 'video/quicktime',
): void {
  if (byteSize === 0 || byteSize > MAX_VIDEO_BYTES) {
    throw new VideoProviderOutputError('The provider video has an invalid size.', false);
  }
  const isIsoMedia =
    byteSize >= 12 && prefix.subarray(4, 8).toString('ascii').toLowerCase() === 'ftyp';
  const isWebm =
    byteSize >= 4 &&
    prefix[0] === 0x1a &&
    prefix[1] === 0x45 &&
    prefix[2] === 0xdf &&
    prefix[3] === 0xa3;
  if (contentType === 'video/webm' ? !isWebm : !isIsoMedia) {
    throw new VideoProviderOutputError(
      'The provider result did not match its declared video format.',
      false,
    );
  }
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

async function fetchProviderVideo(job: VideoGenerationJob, initialUrl: string): Promise<Response> {
  let url = validateProviderUrl(job.provider, initialUrl);
  for (let redirects = 0; redirects <= 4; redirects += 1) {
    const headers: Record<string, string> = {};
    if (job.provider === 'google' && googleVideoOutputHostDisposition(url.hostname) === 'api') {
      const apiKey = googleApiKey();
      if (!apiKey) throw new VideoProviderOutputError('Google Veo is not configured.', true);
      // Never forward the API key to a redirected download host. Signed Google
      // storage redirects authorize themselves.
      headers['x-goog-api-key'] = apiKey;
    }
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers,
        redirect: 'manual',
        signal: AbortSignal.timeout(60_000),
      });
    } catch {
      throw new VideoProviderOutputError('The provider video download was interrupted.', true);
    }
    if (!REDIRECT_STATUSES.has(response.status)) return response;
    if (redirects === 4) {
      throw new VideoProviderOutputError('The provider video redirected too many times.', true);
    }
    const location = response.headers.get('location');
    if (!location) {
      throw new VideoProviderOutputError('The provider returned an invalid video redirect.', false);
    }
    url = validateProviderUrl(job.provider, new URL(location, url).toString(), true);
  }
  throw new VideoProviderOutputError('The provider video could not be downloaded.', true);
}

async function writeResponseToTemporaryFile(
  response: Response,
  contentType: 'video/mp4' | 'video/webm' | 'video/quicktime',
): Promise<DownloadedVideoProviderOutput> {
  if (!response.body) {
    throw new VideoProviderOutputError('The provider returned an empty video response.', true);
  }
  const directory = await mkdtemp(path.join(tmpdir(), 'agi-video-'));
  const filePath = path.join(directory, 'provider-output');
  const file = await open(filePath, 'wx');
  const reader = response.body.getReader();
  const prefix = Buffer.alloc(12);
  let prefixLength = 0;
  let byteSize = 0;
  try {
    while (true) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch {
        throw new VideoProviderOutputError('The provider video download was interrupted.', true);
      }
      const { done, value } = chunk;
      if (done) break;
      if (!value || value.byteLength === 0) continue;
      byteSize += value.byteLength;
      if (byteSize > MAX_VIDEO_BYTES) {
        await reader.cancel();
        throw new VideoProviderOutputError('The provider video exceeds the storage limit.', false);
      }
      if (prefixLength < prefix.byteLength) {
        const copyLength = Math.min(prefix.byteLength - prefixLength, value.byteLength);
        Buffer.from(value.buffer, value.byteOffset, copyLength).copy(prefix, prefixLength);
        prefixLength += copyLength;
      }
      let offset = 0;
      while (offset < value.byteLength) {
        const { bytesWritten } = await file.write(value, offset, value.byteLength - offset);
        if (bytesWritten <= 0) {
          throw new VideoProviderOutputError('The provider video could not be staged.', true);
        }
        offset += bytesWritten;
      }
    }
    await file.close();
    validateVideoSignature(prefix, byteSize, contentType);
    return {
      filePath,
      byteSize,
      contentType,
      cleanup: () => rm(directory, { recursive: true, force: true }),
    };
  } catch (error) {
    await file.close().catch(() => undefined);
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

export interface DownloadedVideoProviderOutput {
  filePath: string;
  byteSize: number;
  contentType: 'video/mp4' | 'video/webm' | 'video/quicktime';
  cleanup: () => Promise<void>;
}

export async function downloadVideoProviderOutput(
  job: VideoGenerationJob,
  output: { url: string } | { base64: string } | { openRouterContentIndex: number },
): Promise<{
  filePath: string;
  byteSize: number;
  contentType: 'video/mp4' | 'video/webm' | 'video/quicktime';
  cleanup: () => Promise<void>;
}> {
  if ('openRouterContentIndex' in output) {
    if (job.provider !== 'openrouter' || !job.providerTaskId) {
      throw new VideoProviderOutputError('The OpenRouter video identity is unavailable.', false);
    }
    const request = openRouterVideoContentRequest(
      job.providerTaskId,
      output.openRouterContentIndex,
    );
    let response: Response;
    try {
      response = await fetch(request.url, {
        method: 'GET',
        headers: request.headers,
        redirect: 'error',
        signal: AbortSignal.timeout(60_000),
      });
    } catch {
      throw new VideoProviderOutputError('The OpenRouter video download was interrupted.', true);
    }
    if (!response.ok) providerErrorFromHttp('OpenRouter', response);
    const declaredLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_VIDEO_BYTES) {
      throw new VideoProviderOutputError('The provider video exceeds the storage limit.', false);
    }
    const contentType = normalizedVideoMime(response.headers.get('content-type'));
    return writeResponseToTemporaryFile(response, contentType);
  }

  if ('base64' in output) {
    const estimatedBytes = Math.floor((output.base64.length * 3) / 4);
    if (estimatedBytes <= 0 || estimatedBytes > MAX_INLINE_VIDEO_BYTES) {
      throw new VideoProviderOutputError('The provider video has an invalid size.', false);
    }
    const data = Buffer.from(output.base64, 'base64');
    validateVideoSignature(data.subarray(0, 12), data.byteLength, 'video/mp4');
    const directory = await mkdtemp(path.join(tmpdir(), 'agi-video-'));
    const filePath = path.join(directory, 'provider-output');
    await writeFile(filePath, data, { flag: 'wx' });
    return {
      filePath,
      byteSize: data.byteLength,
      contentType: 'video/mp4',
      cleanup: () => rm(directory, { recursive: true, force: true }),
    };
  }

  if (job.provider === 'openrouter') {
    throw new VideoProviderOutputError(
      'OpenRouter output must use the authenticated content endpoint.',
      false,
    );
  }

  const response = await fetchProviderVideo(job, output.url);
  if (!response.ok)
    providerErrorFromHttp(job.provider === 'google' ? 'Google Veo' : 'Runway', response);

  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_VIDEO_BYTES) {
    throw new VideoProviderOutputError('The provider video exceeds the storage limit.', false);
  }
  const contentType = normalizedVideoMime(response.headers.get('content-type'));
  return writeResponseToTemporaryFile(response, contentType);
}
