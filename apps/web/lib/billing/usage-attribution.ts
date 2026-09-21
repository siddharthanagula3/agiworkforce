export const USAGE_WORKLOADS = ['chat', 'work', 'research', 'code', 'browser'] as const;
export type UsageWorkload = (typeof USAGE_WORKLOADS)[number];

export interface UsageAttribution {
  workload?: UsageWorkload | null;
  projectId?: string | null;
  sessionId?: string | null;
}

const WORKLOAD_LABELS: Readonly<Record<string, string>> = {
  chat: 'Chat',
  work: 'AGI Work',
  research: 'Deep Research',
  code: 'AGI Code',
  browser: 'Browser',
  unknown: 'Not attributed',
};

/**
 * What a product area is called wherever spend is broken down by it. A surface
 * that spells its own labels renames the same bucket between the workspace
 * console and the account's own usage page.
 */
export function usageWorkloadLabel(key: string): string {
  return WORKLOAD_LABELS[key] ?? key;
}

const USAGE_ATTRIBUTION_ID = /^[A-Za-z0-9_.:-]{1,200}$/u;

function attributionId(value: unknown): string | null {
  return typeof value === 'string' && USAGE_ATTRIBUTION_ID.test(value) ? value : null;
}

export function normalizeUsageAttribution(value: unknown): Required<UsageAttribution> {
  const source = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const workload = source['workload'];
  return {
    workload: USAGE_WORKLOADS.includes(workload as UsageWorkload)
      ? (workload as UsageWorkload)
      : null,
    projectId: attributionId(source['projectId']),
    sessionId: attributionId(source['sessionId']),
  };
}

export function resolveChatWorkload(input: {
  workMode?: string | null;
  quotaFeature?: string | null;
}): UsageWorkload {
  if (input.workMode === 'agiwork') return 'work';
  if (input.workMode === 'research') return 'research';
  if (input.quotaFeature === 'computer_use') return 'browser';
  return 'chat';
}
