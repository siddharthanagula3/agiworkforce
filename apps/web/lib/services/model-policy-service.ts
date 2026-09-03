import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type { Provider } from '@agiworkforce/types';

import type { ModelAccessPolicy } from './model-policy-evaluator';

export interface OrganizationModelPolicy extends ModelAccessPolicy {
  organizationId: string;
  updatedByUserId: string | null;
  updatedAt: string;
}

export interface ModelPolicyInput {
  allowedProviders: Provider[];
  blockedProviders: Provider[];
  allowedModels: string[];
  blockedModels: string[];
}

/** Mirrors the CHECK in 0139 so an over-long list fails with a message. */
export const MODEL_POLICY_LIMITS = {
  providers: 64,
  models: 512,
} as const;

interface ModelPolicyRow {
  organization_id: string;
  allowed_providers: string[];
  blocked_providers: string[];
  allowed_models: string[];
  blocked_models: string[];
  updated_by_user_id: string | null;
  updated_at: string | Date;
}

const COLUMNS = `organization_id, allowed_providers, blocked_providers,
  allowed_models, blocked_models, updated_by_user_id, updated_at`;

function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function format(row: ModelPolicyRow): OrganizationModelPolicy {
  return {
    organizationId: row.organization_id,
    allowedProviders: [...row.allowed_providers] as Provider[],
    blockedProviders: [...row.blocked_providers] as Provider[],
    allowedModels: [...row.allowed_models],
    blockedModels: [...row.blocked_models],
    updatedByUserId: row.updated_by_user_id,
    updatedAt: toIso(row.updated_at),
  };
}

export async function readModelPolicy(
  db: DatabaseAdapter,
  organizationId: string,
): Promise<OrganizationModelPolicy | null> {
  const [row] = await db.query<ModelPolicyRow>(
    `select ${COLUMNS}
       from public.organization_model_policies
      where organization_id = $1
      limit 1`,
    [organizationId],
  );
  return row ? format(row) : null;
}

export async function upsertModelPolicy(
  db: DatabaseAdapter,
  organizationId: string,
  input: ModelPolicyInput,
  updatedByUserId: string,
): Promise<OrganizationModelPolicy> {
  const [row] = await db.query<ModelPolicyRow>(
    `insert into public.organization_model_policies
       (organization_id, allowed_providers, blocked_providers, allowed_models,
        blocked_models, updated_by_user_id)
     values ($1, $2::text[], $3::text[], $4::text[], $5::text[], $6)
     on conflict (organization_id) do update set
       allowed_providers  = excluded.allowed_providers,
       blocked_providers  = excluded.blocked_providers,
       allowed_models     = excluded.allowed_models,
       blocked_models     = excluded.blocked_models,
       updated_by_user_id = excluded.updated_by_user_id
     returning ${COLUMNS}`,
    [
      organizationId,
      input.allowedProviders,
      input.blockedProviders,
      input.allowedModels,
      input.blockedModels,
      updatedByUserId,
    ],
  );

  if (!row) {
    throw new Error(`organization_model_policies upsert returned no row for ${organizationId}`);
  }
  return format(row);
}

export function diffModelPolicy(
  before: OrganizationModelPolicy | null,
  after: OrganizationModelPolicy,
): string[] {
  const keys: (keyof ModelPolicyInput)[] = [
    'allowedProviders',
    'blockedProviders',
    'allowedModels',
    'blockedModels',
  ];
  if (!before) return keys.filter((key) => after[key].length > 0);

  return keys.filter(
    (key) => JSON.stringify([...before[key]].sort()) !== JSON.stringify([...after[key]].sort()),
  );
}
