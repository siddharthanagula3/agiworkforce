export interface DeveloperRateLimit {
  endpoint: string;
  limit: number;
  window: string;
  perAccount: boolean;
}
