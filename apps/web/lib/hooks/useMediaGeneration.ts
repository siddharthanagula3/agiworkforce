'use client';

import { useCallback } from 'react';
import { useMediaStore } from '@/stores/mediaStore';

async function getAuthToken(): Promise<string> {
  const { getAuthToken: getClerkToken } = await import('@shared/lib/get-auth-token');
  return (await getClerkToken()) || '';
}

export interface GenerateImageOptions {
  size?: '1024x1024' | '1792x1024' | '1024x1792';
  provider?: 'google' | 'openai' | 'stability';
  /** Catalog model id (e.g. 'imagen-4-ultra'). The route resolves it to the real API id. */
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
  creditsRequired: number | undefined;
  creditsRemaining: number | undefined;

  constructor(
    message: string,
    options: {
      status?: number;
      code?: string;
      type?: string;
      creditsRequired?: number;
      creditsRemaining?: number;
    } = {},
  ) {
    super(message);
    this.name = 'MediaGenerationApiError';
    this.status = options.status;
    this.code = options.code;
    this.type = options.type;
    this.creditsRequired = options.creditsRequired;
    this.creditsRemaining = options.creditsRemaining;
    this.isPaywall =
      options.status === 402 ||
      options.status === 403 ||
      (options.code ? PAYWALL_ERROR_CODES.has(options.code) : false) ||
      (options.type ? PAYWALL_ERROR_TYPES.has(options.type) : false);
  }
}

export function useMediaGeneration() {
  const { addJob, updateJob } = useMediaStore();

  const generateImage = useCallback(
    async (prompt: string, options: GenerateImageOptions = {}) => {
      const jobId = crypto.randomUUID();
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
          const creditsRequired =
            typeof errorField === 'object' ? errorField?.credits_required : undefined;
          const creditsRemaining =
            typeof errorField === 'object' ? errorField?.credits_remaining : undefined;
          throw new MediaGenerationApiError(message, {
            status: response.status,
            code,
            type,
            creditsRequired,
            creditsRemaining,
          });
        }

        const data = (await response.json()) as {
          images?: Array<{ url?: string; b64_json?: string }>;
        };
        const first = data.images?.[0];
        const resultUrl =
          first?.url || (first?.b64_json ? `data:image/png;base64,${first.b64_json}` : undefined);

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
