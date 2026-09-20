// Every memory write resolves the member's switch and the workspace policy
// before it persists, so a fake database has to answer both reads. One stub so
// the answer is the same wherever it is needed.

export interface MemoryPolicyStubOptions {
  memoryEnabled?: boolean;
  generateFromHistory?: boolean;
  allowToolAssistedGeneration?: boolean;
  searchPastChats?: boolean;
  allowMemory?: boolean;
  retentionDays?: number | null;
  retentionEnforced?: boolean;
}

export function isMemoryCapabilitiesQuery(sql: unknown): boolean {
  return String(sql).includes("settings -> 'capabilities'");
}

export function isOrganizationMemoryPolicyQuery(sql: unknown): boolean {
  return String(sql).includes('organization_admin_policies');
}

export function isMemoryPolicyQuery(sql: unknown): boolean {
  return isMemoryCapabilitiesQuery(sql) || isOrganizationMemoryPolicyQuery(sql);
}

/**
 * The rows for whichever of the two policy reads this SQL is, or null when it
 * is neither, which is the caller's signal to answer it itself.
 */
export function answerMemoryPolicyQuery(
  sql: unknown,
  options: MemoryPolicyStubOptions = {},
): Record<string, unknown>[] | null {
  if (isMemoryCapabilitiesQuery(sql)) {
    return [
      {
        capabilities: {
          memory: options.memoryEnabled ?? true,
          generateFromHistory: options.generateFromHistory ?? true,
          allowToolAssistedGeneration: options.allowToolAssistedGeneration ?? true,
          searchPastChats: options.searchPastChats ?? true,
        },
      },
    ];
  }
  if (isOrganizationMemoryPolicyQuery(sql)) {
    return [
      {
        allow_memory: options.allowMemory ?? true,
        allow_connector_context: true,
        allow_web_result_context: true,
        retention_days: options.retentionDays ?? null,
        retention_enforced: options.retentionEnforced ?? false,
      },
    ];
  }
  return null;
}

type AdapterQuery = <T>(sql: string, params?: unknown[]) => Promise<T[]>;

// A typed fake answers rows of one shape; the adapter's query is generic, so the fake is widened here once.
export function asQuery<F extends (sql: string, params?: unknown[]) => Promise<unknown[]>>(
  fake: F,
): F & AdapterQuery {
  return fake as F & AdapterQuery;
}
