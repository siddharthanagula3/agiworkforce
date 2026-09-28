import 'server-only';

import { rateLimitConfigs, resolveTierRateLimit, type RateLimitKey } from '@/lib/rate-limit';
import type { DeveloperRateLimit } from '@/features/developers/types';

const DEVELOPER_ENDPOINTS: ReadonlyArray<{
  endpoint: string;
  key: RateLimitKey;
  perAccount: boolean;
}> = [
  { endpoint: 'POST /chat/completions', key: 'llm-completion', perAccount: true },
  { endpoint: 'GET /models', key: 'default', perAccount: false },
  { endpoint: 'POST /embeddings', key: 'chat-conversation', perAccount: false },
  { endpoint: 'POST /audio/transcriptions', key: 'audio-transcription', perAccount: false },
  { endpoint: 'GET /credits/balance', key: 'credits-balance', perAccount: false },
];

export function developerRateLimits(): DeveloperRateLimit[] {
  return DEVELOPER_ENDPOINTS.map(({ endpoint, key, perAccount }) => ({
    endpoint,
    limit: resolveTierRateLimit(key),
    window: rateLimitConfigs[key].window,
    perAccount,
  }));
}
