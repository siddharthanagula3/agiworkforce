import 'server-only';

import { createHash } from 'node:crypto';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  AGENT_FILES_MAX,
  AGENT_USAGE_WINDOW_DAYS,
  AgentConfigSchema,
  type AgentActivityResponse,
  type AgentConfig,
  type AgentCreateRequest,
  type AgentFile,
  type AgentStatus,
  type AgentUpdateRequest,
  type AgentUsageResponse,
  type AgentVersion,
  type AgentVisibility,
  type ManagedCloudAgent,
} from '@agiworkforce/cloud-contracts';
import { getModelMetadataById, isAutoModeModelId } from '@agiworkforce/types';

import { createError } from '@/lib/errors';

const PG_UNIQUE_VIOLATION = '23505';
const ACTIVITY_LIMIT = 50;

export const DEFAULT_AGENT_ICON = 'sparkles';
export const DEFAULT_AGENT_ACCENT = 'zinc';

export const DEFAULT_AGENT_CONFIG: Omit<AgentConfig, 'name'> = {
  description: '',
  icon: DEFAULT_AGENT_ICON,
  accentColor: DEFAULT_AGENT_ACCENT,
  instructions: '',
  outputExamples: '',
  conversationStarters: [],
  model: null,
  webSearch: true,
  codeExecution: true,
  imageGeneration: true,
  connectorIds: null,
  skillNames: null,
  dailyTurnLimit: null,
  monthlyCreditLimit: null,
};

export interface AgentRow {
  id: string;
  user_id: string;
  organization_id: string | null;
  name: string;
  description: string;
  icon: string;
  accent_color: string;
  instructions: string;
  output_examples: string;
  conversation_starters: string[];
  model: string | null;
  web_search: boolean;
  code_execution: boolean;
  image_generation: boolean;
  connector_ids: string[] | null;
  skill_names: string[] | null;
  daily_turn_limit: number | null;
  monthly_credit_limit: number | null;
  status: AgentStatus;
  visibility: AgentVisibility;
  published_version: number | null;
  paused_at: string | Date | null;
  retired_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
  published_config?: unknown;
}

const AGENT_COLUMNS = `a.id, a.user_id, a.organization_id, a.name, a.description, a.icon,
  a.accent_color, a.instructions, a.output_examples, a.conversation_starters, a.model,
  a.web_search, a.code_execution, a.image_generation, a.connector_ids, a.skill_names,
  a.daily_turn_limit, a.monthly_credit_limit, a.status, a.visibility, a.published_version, a.paused_at,
  a.retired_at, a.created_at, a.updated_at`;

function iso(value: string | Date | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function uniqueSorted(values: readonly string[] | null): string[] | null {
  if (values === null) return null;
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
}

export function agentConfigOf(row: AgentRow): AgentConfig {
  return {
    name: row.name,
    description: row.description,
    icon: row.icon,
    accentColor: row.accent_color,
    instructions: row.instructions,
    outputExamples: row.output_examples,
    conversationStarters: [...row.conversation_starters],
    model: row.model,
    webSearch: row.web_search,
    codeExecution: row.code_execution,
    imageGeneration: row.image_generation,
    connectorIds: row.connector_ids ? [...row.connector_ids] : null,
    skillNames: row.skill_names ? [...row.skill_names] : null,
    dailyTurnLimit: row.daily_turn_limit,
    monthlyCreditLimit: row.monthly_credit_limit,
  };
}

export function parsePublishedConfig(value: unknown): AgentConfig | null {
  const parsed = AgentConfigSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function sameAgentConfig(left: AgentConfig, right: AgentConfig): boolean {
  return (
    JSON.stringify({
      ...left,
      connectorIds: uniqueSorted(left.connectorIds),
      skillNames: uniqueSorted(left.skillNames),
    }) ===
    JSON.stringify({
      ...right,
      connectorIds: uniqueSorted(right.connectorIds),
      skillNames: uniqueSorted(right.skillNames),
    })
  );
}

export function effectiveAgentConfig(row: AgentRow, viewerId: string): AgentConfig | null {
  if (row.user_id === viewerId) return agentConfigOf(row);
  return parsePublishedConfig(row.published_config);
}

export function toManagedCloudAgent(
  row: AgentRow,
  viewerId: string,
  ownerName: string | null,
): ManagedCloudAgent | null {
  const isOwner = row.user_id === viewerId;
  const config = effectiveAgentConfig(row, viewerId);
  if (!config) return null;
  const published = parsePublishedConfig(row.published_config);
  return {
    ...config,
    id: row.id,
    isOwner,
    ownerName: isOwner ? null : ownerName,
    ownerUserId: isOwner ? null : row.user_id,
    organizationId: row.organization_id,
    status: row.status,
    visibility: row.visibility,
    publishedVersion: row.published_version,
    hasUnpublishedChanges: isOwner
      ? published === null || !sameAgentConfig(agentConfigOf(row), published)
      : false,
    pausedAt: iso(row.paused_at),
    retiredAt: iso(row.retired_at),
    createdAt: iso(row.created_at) ?? '',
    updatedAt: iso(row.updated_at) ?? '',
  };
}

export function validateAgentModel(model: string | null | undefined): string | null {
  const selection = model?.trim();
  if (!selection) return null;
  if (isAutoModeModelId(selection)) return selection;
  const metadata = getModelMetadataById(selection);
  if (!metadata) throw createError.validation('Pick a model from the list.');
  return metadata.id;
}

function normalizedConfig(patch: AgentUpdateRequest): AgentUpdateRequest {
  return {
    ...patch,
    ...(patch.model !== undefined ? { model: validateAgentModel(patch.model) } : {}),
    ...(patch.connectorIds !== undefined ? { connectorIds: uniqueSorted(patch.connectorIds) } : {}),
    ...(patch.skillNames !== undefined ? { skillNames: uniqueSorted(patch.skillNames) } : {}),
  };
}

const COLUMN_FOR: Record<keyof AgentConfig, string> = {
  name: 'name',
  description: 'description',
  icon: 'icon',
  accentColor: 'accent_color',
  instructions: 'instructions',
  outputExamples: 'output_examples',
  conversationStarters: 'conversation_starters',
  model: 'model',
  webSearch: 'web_search',
  codeExecution: 'code_execution',
  imageGeneration: 'image_generation',
  connectorIds: 'connector_ids',
  skillNames: 'skill_names',
  dailyTurnLimit: 'daily_turn_limit',
  monthlyCreditLimit: 'monthly_credit_limit',
};

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === PG_UNIQUE_VIOLATION
  );
}

export async function readOwnerNames(
  serviceDb: DatabaseAdapter,
  ownerIds: readonly string[],
): Promise<Map<string, string>> {
  if (ownerIds.length === 0) return new Map();
  const rows = await serviceDb.query<{
    id: string;
    display_name: string | null;
    email: string | null;
  }>(`select id, display_name, email from public.profiles where id = any($1::text[])`, [
    [...new Set(ownerIds)],
  ]);
  return new Map(
    rows.map((row) => [row.id, row.display_name?.trim() || row.email?.trim() || 'A teammate']),
  );
}

export async function listAgentRows(
  db: DatabaseAdapter,
  userId: string,
  organizationId: string | null,
): Promise<AgentRow[]> {
  return db.query<AgentRow>(
    `select ${AGENT_COLUMNS}, v.config as published_config
       from public.user_agents a
       left join public.user_agent_versions v
         on v.agent_id = a.id and v.version = a.published_version
      where (a.user_id = $1 and a.organization_id is not distinct from $2::uuid)
         or (a.user_id <> $1 and a.organization_id = $2::uuid)
      order by (a.user_id = $1) desc, a.status = 'retired', a.updated_at desc
      limit 500`,
    [userId, organizationId],
  );
}

export async function readAgentRow(db: DatabaseAdapter, agentId: string): Promise<AgentRow | null> {
  const [row] = await db.query<AgentRow>(
    `select ${AGENT_COLUMNS}, v.config as published_config
       from public.user_agents a
       left join public.user_agent_versions v
         on v.agent_id = a.id and v.version = a.published_version
      where a.id = $1
      limit 1`,
    [agentId],
  );
  return row ?? null;
}

export async function requireReadableAgent(
  db: DatabaseAdapter,
  agentId: string,
): Promise<AgentRow> {
  const row = await readAgentRow(db, agentId);
  if (!row) throw createError.notFound('Agent not found');
  return row;
}

export async function requireOwnedAgent(
  db: DatabaseAdapter,
  userId: string,
  agentId: string,
): Promise<AgentRow> {
  const row = await requireReadableAgent(db, agentId);
  if (row.user_id !== userId) {
    throw createError.forbidden('Only the agent’s owner can change it.');
  }
  return row;
}

function assertEditable(row: AgentRow): void {
  if (row.status === 'retired') {
    throw createError.conflict('This agent is retired. Bring it back before changing it.');
  }
}

export async function createAgent(
  db: DatabaseAdapter,
  userId: string,
  organizationId: string | null,
  input: AgentCreateRequest,
): Promise<AgentRow> {
  const config: AgentConfig = {
    ...DEFAULT_AGENT_CONFIG,
    ...normalizedConfig(input),
    name: input.name,
  };
  const [row] = await db.query<{ id: string }>(
    `insert into public.user_agents (
       user_id, organization_id, name, description, icon, accent_color, instructions,
       output_examples, conversation_starters, model, web_search, code_execution,
       image_generation, connector_ids, skill_names, daily_turn_limit, monthly_credit_limit
     ) values ($1, $2::uuid, $3, $4, $5, $6, $7, $8, $9::text[], $10, $11, $12, $13,
       $14::text[], $15::text[], $16, $17)
     returning id`,
    [
      userId,
      organizationId,
      config.name,
      config.description,
      config.icon,
      config.accentColor,
      config.instructions,
      config.outputExamples,
      config.conversationStarters,
      config.model,
      config.webSearch,
      config.codeExecution,
      config.imageGeneration,
      config.connectorIds,
      config.skillNames,
      config.dailyTurnLimit,
      config.monthlyCreditLimit,
    ],
  );
  if (!row) throw createError.internal('The agent could not be saved.');
  return requireReadableAgent(db, row.id);
}

export async function updateAgentDraft(
  db: DatabaseAdapter,
  userId: string,
  agentId: string,
  patch: AgentUpdateRequest,
): Promise<AgentRow> {
  const current = await requireOwnedAgent(db, userId, agentId);
  assertEditable(current);
  const normalized = normalizedConfig(patch);
  const entries = (Object.keys(COLUMN_FOR) as (keyof AgentConfig)[]).filter(
    (key) => normalized[key] !== undefined,
  );
  if (entries.length === 0) return current;
  const assignments = entries.map((key, index) => {
    const cast =
      key === 'conversationStarters' || key === 'connectorIds' || key === 'skillNames'
        ? '::text[]'
        : '';
    return `${COLUMN_FOR[key]} = $${index + 2}${cast}`;
  });
  await db.execute(
    `update public.user_agents set ${assignments.join(', ')}
      where id = $1 and user_id = $${entries.length + 2}`,
    [agentId, ...entries.map((key) => normalized[key]), userId],
  );
  return requireReadableAgent(db, agentId);
}

export async function setAgentStatus(
  db: DatabaseAdapter,
  userId: string,
  agentId: string,
  status: AgentStatus,
): Promise<AgentRow> {
  const current = await requireOwnedAgent(db, userId, agentId);
  if (current.status === status) return current;
  await db.execute(
    `update public.user_agents
        set status = $2,
            paused_at = case when $2 = 'paused' then now() else null end,
            retired_at = case when $2 = 'retired' then now() else null end
      where id = $1 and user_id = $3`,
    [agentId, status, userId],
  );
  return requireReadableAgent(db, agentId);
}

export async function deleteAgent(
  db: DatabaseAdapter,
  userId: string,
  agentId: string,
): Promise<void> {
  await requireOwnedAgent(db, userId, agentId);
  await db.execute(`delete from public.user_agents where id = $1 and user_id = $2`, [
    agentId,
    userId,
  ]);
}

export async function publishAgent(
  db: DatabaseAdapter,
  userId: string,
  agentId: string,
  note: string | null,
): Promise<AgentRow> {
  return db.transaction(async (tx) => {
    const current = await requireOwnedAgent(tx, userId, agentId);
    assertEditable(current);
    const config = agentConfigOf(current);
    const published = parsePublishedConfig(current.published_config);
    if (published && sameAgentConfig(config, published)) {
      throw createError.conflict('There are no changes to publish.');
    }
    const [next] = await tx.query<{ version: number }>(
      `select coalesce(max(v.version), 0) + 1 as version
         from public.user_agent_versions v
         join public.user_agents a on a.id = v.agent_id and a.user_id = $2
        where v.agent_id = $1`,
      [agentId, userId],
    );
    const version = Number(next?.version ?? 1);
    try {
      await tx.execute(
        `insert into public.user_agent_versions (agent_id, version, config, note, published_by)
         select a.id, $2, $3::jsonb, $4, a.user_id
           from public.user_agents a
          where a.id = $1 and a.user_id = $5`,
        [agentId, version, JSON.stringify(config), note?.trim() || null, userId],
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw createError.conflict('Another publish of this agent just finished. Try again.');
      }
      throw error;
    }
    await tx.execute(
      `update public.user_agents set published_version = $2 where id = $1 and user_id = $3`,
      [agentId, version, userId],
    );
    return requireReadableAgent(tx, agentId);
  });
}

export async function listAgentVersions(
  db: DatabaseAdapter,
  serviceDb: DatabaseAdapter,
  userId: string,
  agentId: string,
): Promise<AgentVersion[]> {
  const rows = await db.query<{
    version: number;
    note: string | null;
    published_at: string | Date;
    published_by: string | null;
    config: unknown;
  }>(
    `select v.version, v.note, v.published_at, v.published_by, v.config
       from public.user_agent_versions v
       join public.user_agents a on a.id = v.agent_id and a.user_id = $2
      where v.agent_id = $1
      order by v.version desc
      limit 200`,
    [agentId, userId],
  );
  const names = await readOwnerNames(
    serviceDb,
    rows.map((row) => row.published_by).filter((id): id is string => Boolean(id)),
  );
  return rows.flatMap((row) => {
    const config = parsePublishedConfig(row.config);
    if (!config) return [];
    return [
      {
        version: Number(row.version),
        note: row.note,
        publishedAt: iso(row.published_at) ?? '',
        publishedByName: row.published_by ? (names.get(row.published_by) ?? null) : null,
        config,
      },
    ];
  });
}

export async function restoreAgentVersion(
  db: DatabaseAdapter,
  userId: string,
  agentId: string,
  version: number,
): Promise<AgentRow> {
  const current = await requireOwnedAgent(db, userId, agentId);
  assertEditable(current);
  const [row] = await db.query<{ config: unknown }>(
    `select v.config
       from public.user_agent_versions v
       join public.user_agents a on a.id = v.agent_id and a.user_id = $3
      where v.agent_id = $1 and v.version = $2`,
    [agentId, version, userId],
  );
  const config = row ? parsePublishedConfig(row.config) : null;
  if (!config) throw createError.notFound('That version no longer exists.');
  return updateAgentDraft(db, userId, agentId, config);
}

export async function readAgentAccess(db: DatabaseAdapter, agentId: string): Promise<Set<string>> {
  const rows = await db.query<{ user_id: string }>(
    `select user_id from public.user_agent_access where agent_id = $1`,
    [agentId],
  );
  return new Set(rows.map((row) => row.user_id));
}

export async function shareAgent(
  db: DatabaseAdapter,
  userId: string,
  agentId: string,
  input: { visibility: AgentVisibility; userIds: readonly string[] },
): Promise<AgentRow> {
  return db.transaction(async (tx) => {
    const current = await requireOwnedAgent(tx, userId, agentId);
    if (input.visibility !== 'private' && current.organization_id === null) {
      throw createError.validation(
        'Agents in your personal space stay private. Create it in a workspace to share it.',
      );
    }
    if (input.visibility !== 'private' && current.published_version === null) {
      throw createError.conflict('Publish the agent before you share it.');
    }
    const people = input.visibility === 'people' ? [...new Set(input.userIds)] : [];
    if (input.visibility === 'people' && people.length === 0) {
      throw createError.validation('Choose at least one person to share with.');
    }
    await tx.execute(
      `update public.user_agents set visibility = $2 where id = $1 and user_id = $3`,
      [agentId, input.visibility, userId],
    );
    await tx.execute(
      `delete from public.user_agent_access
        where agent_id = $1 and not (user_id = any($2::text[]))`,
      [agentId, people],
    );
    for (const person of people.filter((id) => id !== userId)) {
      await tx.execute(
        `insert into public.user_agent_access (agent_id, user_id, granted_by)
         values ($1, $2, $3)
         on conflict (agent_id, user_id) do nothing`,
        [agentId, person, userId],
      );
    }
    return requireReadableAgent(tx, agentId);
  });
}

export async function transferAgent(
  db: DatabaseAdapter,
  userId: string,
  agentId: string,
  newOwnerId: string,
): Promise<void> {
  await requireOwnedAgent(db, userId, agentId);
  const [row] = await db.query<{ transferred: boolean }>(
    `select public.app_transfer_user_agent($1::uuid, $2) as transferred`,
    [agentId, newOwnerId],
  );
  if (!row?.transferred) {
    throw createError.validation(
      'The agent can only move to another member of the workspace it belongs to.',
    );
  }
}

export async function readAgentUsage(
  db: DatabaseAdapter,
  userId: string,
  agentId: string,
  now: Date = new Date(),
): Promise<AgentUsageResponse> {
  await requireOwnedAgent(db, userId, agentId);
  const since = new Date(now.getTime() - AGENT_USAGE_WINDOW_DAYS * 86_400_000);
  const [row] = await db.query<{ conversations: string; people: string; turns: string }>(
    `select conversations, people, turns from public.app_user_agent_usage($1::uuid, $2::timestamptz)`,
    [agentId, since.toISOString()],
  );
  return {
    windowDays: AGENT_USAGE_WINDOW_DAYS,
    conversations: Number(row?.conversations ?? 0),
    people: Number(row?.people ?? 0),
    turns: Number(row?.turns ?? 0),
  };
}

export async function readAgentActivity(
  db: DatabaseAdapter,
  userId: string,
  organizationId: string | null,
  agentId: string,
): Promise<AgentActivityResponse> {
  await requireReadableAgent(db, agentId);
  const [conversations, routines] = await Promise.all([
    db.query<{ id: string; title: string; updated_at: string | Date }>(
      `select id, title, updated_at
         from public.web_conversations
        where agent_id = $1 and user_id = $2
          and organization_id is not distinct from $3::uuid
          and deleted_at is null
        order by updated_at desc
        limit ${ACTIVITY_LIMIT}`,
      [agentId, userId, organizationId],
    ),
    db.query<{
      id: string;
      name: string;
      status: string;
      last_executed_at: string | Date | null;
      next_execution_at: string | Date | null;
    }>(
      `select id, name, status, last_executed_at, next_execution_at
         from public.scheduled_tasks
        where agent_id = $1 and user_id = $2
          and organization_id is not distinct from $3::uuid
        order by created_at desc
        limit ${ACTIVITY_LIMIT}`,
      [agentId, userId, organizationId],
    ),
  ]);
  return {
    conversations: conversations.map((row) => ({
      id: row.id,
      title: row.title,
      updatedAt: iso(row.updated_at) ?? '',
    })),
    routines: routines.map((row) => ({
      id: row.id,
      name: row.name,
      status: row.status,
      lastExecutedAt: iso(row.last_executed_at),
      nextExecutionAt: iso(row.next_execution_at),
    })),
  };
}

export async function readAgentMonthSpendMicrousd(
  db: DatabaseAdapter,
  agentId: string,
): Promise<number> {
  const [row] = await db.query<{ spent: string | number | null }>(
    `select public.app_user_agent_month_spend($1::uuid) as spent`,
    [agentId],
  );
  return Number(row?.spent ?? 0);
}

export async function countAgentTurnsToday(
  db: DatabaseAdapter,
  userId: string,
  agentId: string,
  now: Date = new Date(),
): Promise<number> {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const [row] = await db.query<{ turns: string }>(
    `select count(*) as turns
       from public.web_messages m
       join public.web_conversations c on c.id = m.conversation_id
       join public.user_agents a on a.id = c.agent_id
      where c.agent_id = $1 and c.user_id = $2
        and c.organization_id is not distinct from a.organization_id
        and m.role = 'user' and m.created_at >= $3`,
    [agentId, userId, start.toISOString()],
  );
  return Number(row?.turns ?? 0);
}

export async function createAgentConversation(
  db: DatabaseAdapter,
  userId: string,
  organizationId: string | null,
  agent: AgentRow,
): Promise<string> {
  const [row] = await db.query<{ id: string }>(
    `insert into public.web_conversations (user_id, organization_id, title, agent_id)
     values ($1, $2::uuid, $3, $4)
     returning id`,
    [userId, organizationId, agent.name, agent.id],
  );
  if (!row) throw createError.internal('The chat could not be started.');
  return row.id;
}

interface AgentFileRow {
  id: string;
  name: string;
  mime_type: string;
  byte_size: number;
  created_at: string | Date;
}

function toAgentFile(row: AgentFileRow): AgentFile {
  return {
    id: row.id,
    name: row.name,
    mimeType: row.mime_type,
    byteSize: Number(row.byte_size),
    createdAt: iso(row.created_at) ?? '',
  };
}

export async function listAgentFiles(db: DatabaseAdapter, agentId: string): Promise<AgentFile[]> {
  const rows = await db.query<AgentFileRow>(
    `select f.id, f.name, f.mime_type, f.byte_size, f.created_at
       from public.user_agent_files f
       join public.user_agents a on a.id = f.agent_id and a.user_id = f.user_id
      where f.agent_id = $1
      order by f.name`,
    [agentId],
  );
  return rows.map(toAgentFile);
}

export async function addAgentFile(
  db: DatabaseAdapter,
  userId: string,
  agentId: string,
  file: { name: string; mimeType: string; content: string },
): Promise<AgentFile> {
  const agent = await requireOwnedAgent(db, userId, agentId);
  assertEditable(agent);
  const [count] = await db.query<{ total: string }>(
    `select count(*) as total from public.user_agent_files where agent_id = $1 and user_id = $2`,
    [agentId, userId],
  );
  if (Number(count?.total ?? 0) >= AGENT_FILES_MAX) {
    throw createError.validation(`An agent holds up to ${AGENT_FILES_MAX} files.`);
  }
  const hash = createHash('sha256').update(file.content, 'utf8').digest('hex');
  try {
    const [row] = await db.query<AgentFileRow>(
      `insert into public.user_agent_files (agent_id, user_id, name, mime_type, content, content_hash, byte_size)
       values ($1, $2, $3, $4, $5, $6, octet_length($5))
       returning id, name, mime_type, byte_size, created_at`,
      [agentId, userId, file.name, file.mimeType, file.content, hash],
    );
    if (!row) throw createError.internal('The file could not be saved.');
    return toAgentFile(row);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw createError.conflict(`The agent already has a file named ${file.name}.`);
    }
    throw error;
  }
}

export async function deleteAgentFile(
  db: DatabaseAdapter,
  userId: string,
  agentId: string,
  fileId: string,
): Promise<void> {
  await requireOwnedAgent(db, userId, agentId);
  const removed = await db.execute(
    `delete from public.user_agent_files where agent_id = $1 and id = $2 and user_id = $3`,
    [agentId, fileId, userId],
  );
  if (removed === 0) throw createError.notFound('File not found');
}

export async function readAgentFileTexts(
  db: DatabaseAdapter,
  agentId: string,
): Promise<{ name: string; content: string }[]> {
  return db.query<{ name: string; content: string }>(
    `select f.name, f.content
       from public.user_agent_files f
       join public.user_agents a on a.id = f.agent_id and a.user_id = f.user_id
      where f.agent_id = $1
      order by f.name`,
    [agentId],
  );
}
