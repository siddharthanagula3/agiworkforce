import type { ModelAccessPolicy } from '@/lib/services/model-policy-evaluator';
import type { ManagedCloudPolicySource } from '../policy-source';

export interface InMemoryPolicy {
  trainingOptOut?: boolean;
  conversationKeepsOutOfTraining?: boolean;
  zeroDataRetentionRequired?: boolean | Error;
  workspaceModelPolicy?: ModelAccessPolicy | null | Error;
  workspaceRegion?: string | null | Error;
  usOnly?: boolean;
  deploymentRegion?: string | null;
  availableProviderIds: ReadonlySet<string>;
  zeroDataRetentionProviders?: ReadonlySet<string>;
}

function answer<T>(value: T | Error): Promise<T> {
  return value instanceof Error ? Promise.reject(value) : Promise.resolve(value);
}

export function inMemoryPolicySource(policy: InMemoryPolicy): ManagedCloudPolicySource {
  return {
    trainingOptOut: () => answer(policy.trainingOptOut ?? false),
    conversationKeepsOutOfTraining: (account) =>
      answer(account.conversationId ? (policy.conversationKeepsOutOfTraining ?? false) : false),
    zeroDataRetentionRequired: () => answer(policy.zeroDataRetentionRequired ?? false),
    workspaceModelPolicy: (account) =>
      account.organizationId ? answer(policy.workspaceModelPolicy ?? null) : answer(null),
    workspaceRegion: (account) =>
      account.organizationId ? answer(policy.workspaceRegion ?? null) : answer(null),
    usOnly: () => answer(policy.usOnly ?? false),
    deploymentRegion: () => policy.deploymentRegion ?? null,
    availableProviderIds: () => policy.availableProviderIds,
    zeroDataRetentionProviders: () => policy.zeroDataRetentionProviders ?? new Set(),
  };
}
