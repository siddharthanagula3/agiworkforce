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

export interface DeveloperWebhookEndpoint {
  id: string;
  url: string;
  description: string | null;
  eventTypes: string[];
  secretPrefix: string;
  enabled: boolean;
  createdAt: string;
}

export interface DeveloperWebhookDelivery {
  id: string;
  eventId: string;
  eventType: string;
  status: 'pending' | 'delivered' | 'failed';
  attempts: number;
  responseStatus: number | null;
  error: string | null;
  redeliveryOf: string | null;
  lastAttemptAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
}
