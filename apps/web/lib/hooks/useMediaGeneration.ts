'use client';

import { useCallback } from 'react';
import { createManagedMediaIdempotencyKey } from '@agiworkforce/utils';
import { useMediaStore } from '@shared/stores/media-store';

async function getAuthToken(): Promise<string> {
  const { getAuthToken: getClerkToken } = await import('@shared/lib/get-auth-token');
  return (await getClerkToken()) || '';
}

export interface GenerateImageOptions {
  size?: '1024x1024' | '1792x1024' | '1024x1792';
  provider?: 'google' | 'openai' | 'stability';
  /** Catalog model id (e.g. 'gemini-3.1-flash-image'). The route resolves it to the real API id. */
  model?: string;
}

/** Error codes/types the media-generation API uses to signal a paywall (upgrade-required) failure. */
const PAYWALL_ERROR_CODES = new Set([
  'insufficient_credits',
  'plan_upgrade_required',
  'subscription_required',
]);
const PAYWALL_ERROR_TYPES = new Set(['insufficient_quota', 'plan_upgrade_required']);

/**
 * Structured error thrown by media-generation requests. Preserves the API's
 * error shape (status/code/type + a resolved `isPaywall` flag) instead of
 * collapsing everything into a plain Error message, so callers can render a
 * PaywallCard / upgrade prompt instead of a raw error bubble.
 */
export class MediaGenerationApiError extends Error {
  status: number | undefined;
  code: string | undefined;
  type: string | undefined;
  isPaywall: boolean;

  constructor(
    message: string,
    options: {
      status?: number;
      code?: string;
      type?: string;
    } = {},
  ) {
    super(message);
    this.name = 'MediaGenerationApiError';
    this.status = options.status;
    this.code = options.code;
    this.type = options.type;
    this.isPaywall =
      options.status === 402 ||
      options.status === 403 ||
      (options.code ? PAYWALL_ERROR_CODES.has(options.code) : false) ||
      (options.type ? PAYWALL_ERROR_TYPES.has(options.type) : false);
  }
}

/**
 * PER-4 — the client half of "never a data URL".
 *
 * This hook used to build `data:image/png;base64,${b64_json}` whenever the
 * route returned inline bytes. That 1.4-4 MB string went into
 * `metadata.imageUrl` and was POSTed inside the message metadata, blowing the
 * request body cap: `saveMessageToDb` threw, the "Couldn't save this response"
 * toast fired, and the message was never persisted.
 *
 * The route now returns an authenticated `/api/files/{id}` URL whenever object
 * storage is configured, which is every real deployment. Inline bytes only
 * occur on a dev branch without R2 credentials; there we mint a short-lived
 * `blob:` object URL so the image still renders, the metadata written to the
 * database stays a few dozen characters, and nothing multi-megabyte can reach
 * the message body. A `blob:` URL does not survive a reload — that is an
 * honest consequence of running without durable storage, and the warning below
 * says so.
 */
function objectUrlFromBase64(b64: string | undefined): string | undefined {
  if (!b64) return undefined;
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return undefined;
  try {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    console.warn(
      '[media] Object storage is not configured on this deployment, so the generated image was returned inline. It is shown from an in-memory blob: URL and will not survive a reload. Configure CLOUDFLARE_R2_* to persist generated media.',
    );
    return URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
  } catch {
    return undefined;
  }
}

export function useMediaGeneration() {
  const { addJob, updateJob } = useMediaStore();

  const generateImage = useCallback(
    async (prompt: string, options: GenerateImageOptions = {}) => {
      const jobId = crypto.randomUUID();
      const idempotencyKey = createManagedMediaIdempotencyKey({
        surface: 'web',
        operation: 'image',
        operationId: jobId,
      });
      const authToken = await getAuthToken();

      addJob({
        id: jobId,
        type: 'image',
        prompt,
        status: 'generating',
        size: options.size || '1024x1024',
        provider: options.provider,
        createdAt: new Date().toISOString(),
      });

      try {
        const response = await fetch('/api/media/image/generate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
            'Idempotency-Key': idempotencyKey,
          },
          body: JSON.stringify({
            prompt,
            size: options.size || '1024x1024',
            provider: options.provider,
            model: options.model,
          }),
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({ error: 'Generation failed' }));
          const errorField = err?.error;
          const message =
            (typeof errorField === 'object' && errorField?.message) ||
            (typeof errorField === 'string' ? errorField : undefined) ||
            `Request failed: ${response.status}`;
          const code = typeof errorField === 'object' ? errorField?.code : undefined;
          const type = typeof errorField === 'object' ? errorField?.type : undefined;
          throw new MediaGenerationApiError(message, {
            status: response.status,
            code,
            type,
          });
        }

        const data = (await response.json()) as {
          images?: Array<{ url?: string; b64_json?: string }>;
          persisted?: boolean;
        };
        const first = data.images?.[0];
        const resultUrl = first?.url ?? objectUrlFromBase64(first?.b64_json);

        if (!resultUrl) throw new Error('No image URL in response');

        updateJob(jobId, {
          status: 'completed',
          resultUrl,
          completedAt: new Date().toISOString(),
        });

        return resultUrl;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        updateJob(jobId, { status: 'failed', errorMessage: message });
        throw err;
      }
    },
    [addJob, updateJob],
  );

  return { generateImage };
}
