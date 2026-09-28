export interface DeveloperRateLimit {
  endpoint: string;
  limit: number;
  window: string;
  perAccount: boolean;
}

export interface DeveloperProject {
  id: string;
  name: string;
  monthlyCreditLimit: number | null;
  archivedAt: string | null;
  createdAt: string;
}

export interface DeveloperUsageFigures {
  requests: number;
  credits: number;
  unsettledRequests: number;
}

export interface DeveloperUsage {
  from: string;
  to: string;
  keys: Array<DeveloperUsageFigures & { apiKeyId: string }>;
  projects: Array<DeveloperUsageFigures & { projectId: string | null }>;
}
