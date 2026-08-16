import type { TokenUsage } from './TokenUsage';

export type TokenUsageInfo = {
  total_token_usage: TokenUsage;
  last_token_usage: TokenUsage;
  model_context_window: number | null;
};
