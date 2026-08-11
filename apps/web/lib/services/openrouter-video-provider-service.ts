import 'server-only';

import { z } from 'zod';
import { providerApiUrl } from '@/lib/server/provider-endpoints';

const PROVIDER_TASK_ID_PATTERN = /^[A-Za-z0-9._~-]{1,512}$/u;
const MAX_DATABASE_COST_CENTS = 2_147_483_647;
const VIDEO_STATUSES = [
  'pending',
  'in_progress',
  'completed',
  'failed',
  'cancelled',
  'expired',
] as const;

const SubmissionResponseSchema = z
  .object({
    id: z.string().regex(PROVIDER_TASK_ID_PATTERN),
    polling_url: z.string().min(1),
    status: z.enum(VIDEO_STATUSES),
  })
  .passthrough();

const PollResponseSchema = z
  .object({
    id: z.string().regex(PROVIDER_TASK_ID_PATTERN),
    status: z.enum(VIDEO_STATUSES),
    error: z.string().optional(),
    usage: z
      .object({
        cost: z.number().finite().nonnegative().nullable(),
        is_byok: z.boolean().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export class OpenRouterVideoSubmissionOutcomeUnknownError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'OpenRouterVideoSubmissionOutcomeUnknownError';
  }
}

export class OpenRouterVideoSubmissionError extends Error {
  constructor(
    message: string,
    readonly kind: 'authentication' | 'rate_limit' | 'quota' | 'invalid_request' | 'unavailable',
  ) {
    super(message);
    this.name = 'OpenRouterVideoSubmissionError';
  }
}

export class OpenRouterVideoPollError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'OpenRouterVideoPollError';
  }
}

function apiKey(): string | undefined {
  return process.env['OPENROUTER_API_KEY']?.trim() || undefined;
}

export function isOpenRouterVideoConfigured(): boolean {
  return Boolean(apiKey());
}

function callbackUrl(): string | undefined {
  if (!process.env['OPENROUTER_WEBHOOK_SECRET']?.trim()) return undefined;
  const appUrl = process.env['NEXT_PUBLIC_APP_URL']?.trim();
  if (!appUrl) return undefined;
  try {
    const url = new URL('/api/media/video/openrouter-webhook', appUrl);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function retryAfterSeconds(response: Response): number | undefined {
  const value = response.headers.get('retry-after')?.trim();
  if (!value) return undefined;
  const numeric = Number(value);
  const seconds = Number.isFinite(numeric)
    ? Math.ceil(numeric)
    : Math.ceil((new Date(value).getTime() - Date.now()) / 1_000);
  return Number.isFinite(seconds) && seconds > 0 ? Math.max(5, Math.min(seconds, 600)) : undefined;
}

/** Submit one exact catalog-validated output tuple. */
export async function submitOpenRouterVideo(input: {
  providerModelId: string;
  prompt: string;
  durationSecs: number;
  width: number;
  height: number;
  generateAudio: boolean;
}): Promise<{ taskId: string }> {
  const key = apiKey();
  if (!key) {
    throw new OpenRouterVideoSubmissionError('OpenRouter is not configured.', 'unavailable');
  }

  let response: Response;
  try {
    const configuredCallbackUrl = callbackUrl();
    response = await fetch(providerApiUrl('openrouter', 'videos'), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: input.providerModelId,
        prompt: input.prompt,
        duration: input.durationSecs,
        size: `${input.width}x${input.height}`,
        generate_audio: input.generateAudio,
        ...(configuredCallbackUrl ? { callback_url: configuredCallbackUrl } : {}),
      }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (cause) {
    throw new OpenRouterVideoSubmissionOutcomeUnknownError(
      'OpenRouter may have accepted the request before the connection failed.',
      { cause },
    );
  }

  if (!response.ok) {
    if (response.status === 408 || response.status >= 500) {
      throw new OpenRouterVideoSubmissionOutcomeUnknownError(
        `OpenRouter returned ${response.status} after the request crossed the provider boundary.`,
      );
    }
    if (response.status === 401 || response.status === 403) {
      throw new OpenRouterVideoSubmissionError(
        'OpenRouter video authentication failed.',
        'authentication',
      );
    }
    if (response.status === 429) {
      throw new OpenRouterVideoSubmissionError(
        'OpenRouter video generation is rate limited.',
        'rate_limit',
      );
    }
    if (response.status === 402) {
      throw new OpenRouterVideoSubmissionError('OpenRouter video quota is unavailable.', 'quota');
    }
    throw new OpenRouterVideoSubmissionError(
      'OpenRouter rejected the video generation request.',
      'invalid_request',
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (cause) {
    throw new OpenRouterVideoSubmissionOutcomeUnknownError(
      'OpenRouter accepted the request but returned an unreadable task identity.',
      { cause },
    );
  }
  const parsed = SubmissionResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new OpenRouterVideoSubmissionOutcomeUnknownError(
      'OpenRouter accepted the request but returned no usable task identity.',
    );
  }
  return { taskId: parsed.data.id };
}

export type OpenRouterVideoPollResult =
  | { status: 'queued' | 'processing'; retryAfterSeconds?: number }
  | { status: 'failed'; error: string }
  | { status: 'completed'; contentIndex: number; actualCostCents: number };

/** Poll provider truth without trusting its unsigned output URLs. */
export async function pollOpenRouterVideo(
  providerTaskId: string,
): Promise<OpenRouterVideoPollResult> {
  const key = apiKey();
  if (!key) throw new OpenRouterVideoPollError('OpenRouter is not configured.', true);
  if (!PROVIDER_TASK_ID_PATTERN.test(providerTaskId)) {
    throw new OpenRouterVideoPollError('OpenRouter returned an invalid task identity.', false);
  }

  let response: Response;
  try {
    response = await fetch(
      providerApiUrl('openrouter', `videos/${encodeURIComponent(providerTaskId)}`),
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(20_000),
      },
    );
  } catch {
    throw new OpenRouterVideoPollError('OpenRouter status could not be verified.', true);
  }
  const retryAfter = retryAfterSeconds(response);
  if (!response.ok) {
    if (response.status === 404) {
      throw new OpenRouterVideoPollError('OpenRouter no longer has this video task.', false);
    }
    if (response.status === 401 || response.status === 403) {
      throw new OpenRouterVideoPollError('OpenRouter authentication failed.', true);
    }
    if (response.status === 429 || response.status >= 500) {
      throw new OpenRouterVideoPollError(
        'OpenRouter is temporarily unavailable.',
        true,
        retryAfter,
      );
    }
    throw new OpenRouterVideoPollError('OpenRouter rejected the video status request.', false);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new OpenRouterVideoPollError('OpenRouter returned an unreadable task state.', true);
  }
  const parsed = PollResponseSchema.safeParse(payload);
  if (!parsed.success || parsed.data.id !== providerTaskId) {
    throw new OpenRouterVideoPollError('OpenRouter returned an invalid task state.', true);
  }
  switch (parsed.data.status) {
    case 'pending':
      return { status: 'queued', ...(retryAfter ? { retryAfterSeconds: retryAfter } : {}) };
    case 'in_progress':
      return { status: 'processing', ...(retryAfter ? { retryAfterSeconds: retryAfter } : {}) };
    case 'failed':
    case 'cancelled':
    case 'expired':
      return { status: 'failed', error: 'OpenRouter could not generate this video.' };
    case 'completed': {
      const cost = parsed.data.usage?.cost;
      if (cost == null) {
        throw new OpenRouterVideoPollError(
          'OpenRouter completed without authoritative usage cost.',
          true,
        );
      }
      const actualCostCents = Math.ceil(Number((cost * 100).toFixed(8)));
      if (!Number.isSafeInteger(actualCostCents) || actualCostCents > MAX_DATABASE_COST_CENTS) {
        throw new OpenRouterVideoPollError(
          'OpenRouter returned usage cost outside the durable billing range.',
          false,
        );
      }
      return {
        status: 'completed',
        contentIndex: 0,
        actualCostCents,
      };
    }
  }
}

/** Authenticated content URL consumed only by the server-side private-storage path. */
export function openRouterVideoContentRequest(
  providerTaskId: string,
  index: number,
): {
  url: string;
  headers: Record<string, string>;
} {
  const key = apiKey();
  if (!key) throw new OpenRouterVideoPollError('OpenRouter is not configured.', true);
  if (!PROVIDER_TASK_ID_PATTERN.test(providerTaskId) || !Number.isInteger(index) || index < 0) {
    throw new OpenRouterVideoPollError('OpenRouter returned an invalid video identity.', false);
  }
  return {
    url: providerApiUrl(
      'openrouter',
      `videos/${encodeURIComponent(providerTaskId)}/content?index=${index}`,
    ),
    headers: { Authorization: `Bearer ${key}` },
  };
}
