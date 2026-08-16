
export type RateLimitWindow = {
  used_percent: number;
  window_minutes: number | null;
  resets_at: number | null;
};
