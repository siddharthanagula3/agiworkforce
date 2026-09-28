export interface DeveloperRateLimit {
  endpoint: string;
  limit: number;
  window: string;
  perAccount: boolean;
}

export interface DeveloperProject {
  id: string;
  name: string;
  archivedAt: string | null;
  createdAt: string;
}
