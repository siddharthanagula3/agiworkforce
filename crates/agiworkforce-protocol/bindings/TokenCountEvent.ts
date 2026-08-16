import type { RateLimitSnapshot } from './RateLimitSnapshot';
import type { TokenUsageInfo } from './TokenUsageInfo';

export type TokenCountEvent = {
  info: TokenUsageInfo | null;
  rate_limits: RateLimitSnapshot | null;
};
