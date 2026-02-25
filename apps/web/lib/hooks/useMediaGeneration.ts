'use client';

import { useCallback } from 'react';
import { useMediaStore } from '@/stores/mediaStore';

async function getAuthToken(): Promise<string> {
  const { getSupabaseClient } = await import('@/services/supabase');
  const supabase = getSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || '';
}

export interface GenerateImageOptions {
  size?: '1024x1024' | '1792x1024' | '1024x1792';
  provider?: 'google' | 'openai' | 'stability';
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
          }),
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({ error: 'Generation failed' }));
          throw new Error(err.error?.message || err.error || `Request failed: ${response.status}`);
        }

        const data = (await response.json()) as {
          url?: string;
          image_url?: string;
          b64_json?: string;
        };
        const resultUrl =
          data.url ||
          data.image_url ||
          (data.b64_json ? `data:image/png;base64,${data.b64_json}` : undefined);

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
