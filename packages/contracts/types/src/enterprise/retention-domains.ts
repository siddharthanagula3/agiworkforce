export const RETENTION_DOMAINS = [
  'projects',
  'work',
  'code_sessions',
  'files',
  'artifacts',
  'connector_data',
  'remote_sessions',
  'notifications',
] as const;

export type RetentionDomain = (typeof RETENTION_DOMAINS)[number];

export const RETENTION_DOMAIN_LABELS: Readonly<Record<RetentionDomain, string>> = Object.freeze({
  projects: 'Projects',
  work: 'Work runs',
  code_sessions: 'Code sessions',
  files: 'Files and generated media',
  artifacts: 'Artifacts',
  connector_data: 'Revoked connector grants',
  remote_sessions: 'Ended remote device pairings',
  notifications: 'Notifications',
});

export const RETENTION_DAYS_MIN = 1;
export const RETENTION_DAYS_MAX = 3650;

export interface DomainRetentionPolicy {
  domain: RetentionDomain;
  retentionDays: number;
  enforced: boolean;
  updatedAt: string | null;
}

export function isRetentionDomain(value: unknown): value is RetentionDomain {
  return typeof value === 'string' && (RETENTION_DOMAINS as readonly string[]).includes(value);
}
