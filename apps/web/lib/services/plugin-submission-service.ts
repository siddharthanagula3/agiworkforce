import 'server-only';

import { createHash } from 'node:crypto';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { describePluginScan } from '@agiworkforce/client-runtime/plugins';
import type {
  CommunityPlugin,
  CommunityPluginPatch,
  PluginScanFindingSummary,
  PluginSubmissionDecision,
  PluginSubmissionFile,
  PluginSubmissionReview,
  PluginSubmissionStatus,
  PluginSubmissionSummary,
} from '@agiworkforce/cloud-contracts';

import { createError } from '@/lib/errors';
import {
  PluginPackageRefusedError,
  scanAndRecordPluginPackage,
} from '@/lib/services/plugin-marketplace-service';
import type {
  OwnedCompanionFile,
  OwnedEntryFile,
} from '@/lib/services/plugin-owned-source-service';

const HASH_ALGORITHM = 'sha256';
const SKILL_FILE_NAME = 'SKILL.md';
const PG_UNDEFINED_TABLE = '42P01';
const STATUS_PENDING = 'pending';
const STATUS_APPROVED = 'approved';
const STATUS_REJECTED = 'rejected';
const STATUS_WITHDRAWN = 'withdrawn';
const STATUS_SUSPENDED = 'suspended';
const OWNED_SOURCE_KINDS = ['upload', 'authored'];
const SUBMISSION_STATUSES: readonly PluginSubmissionStatus[] = [
  STATUS_PENDING,
  STATUS_APPROVED,
  STATUS_REJECTED,
  STATUS_WITHDRAWN,
  STATUS_SUSPENDED,
];

const SUBMISSION_COLUMNS = `s.id, s.user_id, s.source_entry_id, s.plugin_key, s.name, s.description,
  s.version, s.category, s.skills, s.publisher_name, s.content_hash, s.scan_verdict,
  s.scan_findings, s.status, s.review_note, s.reviewed_at, s.created_at`;

interface SubmissionRow {
  id: string;
  user_id: string;
  source_entry_id: string | null;
  plugin_key: string;
  name: string;
  description: string;
  version: string;
  category: string | null;
  skills: unknown;
  publisher_name: string;
  content_hash: string;
  scan_verdict: string;
  scan_findings: unknown;
  status: string;
  review_note: string | null;
  reviewed_at: string | Date | null;
  created_at: string | Date;
}

interface CommunityRow extends SubmissionRow {
  installed: boolean;
  enabled: boolean | null;
  enabled_skills: unknown;
}

export function isMissingPluginSubmissionSchema(error: unknown): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    (error as Record<string, unknown>)['code'] === PG_UNDEFINED_TABLE
  );
}

function iso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function scanFindings(value: unknown): PluginScanFindingSummary[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    const severity = record['severity'];
    if (severity !== 'block' && severity !== 'review') return [];
    return [
      {
        path: typeof record['path'] === 'string' ? record['path'] : '',
        line: typeof record['line'] === 'number' ? record['line'] : 0,
        message: typeof record['message'] === 'string' ? record['message'] : '',
        severity,
      },
    ];
  });
}

function submissionStatus(value: string): PluginSubmissionStatus {
  return (SUBMISSION_STATUSES as readonly string[]).includes(value)
    ? (value as PluginSubmissionStatus)
    : STATUS_PENDING;
}

function toSummary(row: SubmissionRow): PluginSubmissionSummary {
  return {
    id: row.id,
    entryId: row.source_entry_id,
    pluginKey: row.plugin_key,
    name: row.name,
    description: row.description,
    version: row.version,
    category: row.category,
    publisherName: row.publisher_name,
    skills: stringList(row.skills),
    status: submissionStatus(row.status),
    reviewNote: row.review_note,
    submittedAt: iso(row.created_at),
    reviewedAt: row.reviewed_at === null ? null : iso(row.reviewed_at),
    scanVerdict: row.scan_verdict === 'review' ? 'review' : 'pass',
    scanFindings: scanFindings(row.scan_findings),
  };
}

export async function listUserSubmissions(
  db: DatabaseAdapter,
  userId: string,
): Promise<PluginSubmissionSummary[]> {
  const rows = await db.query<SubmissionRow>(
    `select ${SUBMISSION_COLUMNS}
       from public.plugin_submissions s
      where s.user_id = $1
      order by s.created_at desc`,
    [userId],
  );
  return rows.map(toSummary);
}

interface OwnedEntryRow {
  id: string;
  plugin_key: string;
  name: string;
  description: string;
  version: string;
  declared_skills: unknown;
  content_hash: string;
}

export interface CreateSubmissionInput {
  entryId: string;
  category: string | null;
  publisherName: string;
}

export async function createSubmission(
  db: DatabaseAdapter,
  userId: string,
  input: CreateSubmissionInput,
): Promise<PluginSubmissionSummary | null> {
  const [entry] = await db.query<OwnedEntryRow>(
    `select entries.id, entries.plugin_key, entries.name, entries.description, entries.version,
            entries.declared_skills, entries.content_hash
       from public.plugin_marketplace_entries entries
       join public.plugin_marketplace_sources sources on sources.id = entries.source_id
      where entries.id = $1 and sources.user_id = $2 and sources.kind = any($3::text[])
      limit 1`,
    [input.entryId, userId, OWNED_SOURCE_KINDS],
  );
  if (!entry) return null;
  const files = await db.query<OwnedEntryFile>(
    `select files.path, files.content
       from public.plugin_marketplace_entry_files files
       join public.plugin_marketplace_entries entries on entries.id = files.entry_id
       join public.plugin_marketplace_sources sources on sources.id = entries.source_id
      where files.entry_id = $1 and sources.user_id = $2
      order by files.path asc`,
    [entry.id, userId],
  );
  if (files.length === 0) {
    throw createError
      .validation('This plugin has no files stored with it, so it cannot be reviewed.')
      .asUserSafe();
  }
  const scan = await scanAndRecordPluginPackage(db, entry.plugin_key, entry.content_hash, files);
  if (scan.verdict === 'block') {
    throw new PluginPackageRefusedError('scan_blocked', describePluginScan(scan), {
      findings: scan.findings,
    });
  }

  const id = await db.transaction(async (tx) => {
    await tx.execute(
      `update public.plugin_submissions
          set status = '${STATUS_WITHDRAWN}'
        where user_id = $1 and plugin_key = $2 and status = '${STATUS_PENDING}'`,
      [userId, entry.plugin_key],
    );
    const [row] = await tx.query<{ id: string }>(
      `insert into public.plugin_submissions
         (user_id, source_entry_id, plugin_key, name, description, version, category, skills,
          publisher_name, content_hash, scan_verdict, scan_findings, status, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12::jsonb, $13, $1)
       returning id`,
      [
        userId,
        entry.id,
        entry.plugin_key,
        entry.name,
        entry.description,
        entry.version,
        input.category,
        JSON.stringify(stringList(entry.declared_skills)),
        input.publisherName,
        entry.content_hash,
        scan.verdict === 'review' ? 'review' : 'pass',
        JSON.stringify(
          scan.findings.map(({ path, line, message, severity }) => ({
            path,
            line,
            message,
            severity,
          })),
        ),
        STATUS_PENDING,
      ],
    );
    if (!row) throw new Error('Could not record the submission.');
    for (const file of files) {
      await tx.execute(
        `insert into public.plugin_submission_files
           (submission_id, user_id, path, content, content_hash, byte_size, created_by)
         values ($1, $2, $3, $4, $5, $6, $2)`,
        [
          row.id,
          userId,
          file.path,
          file.content,
          createHash(HASH_ALGORITHM).update(file.content, 'utf8').digest('hex'),
          Buffer.byteLength(file.content, 'utf8'),
        ],
      );
    }
    return row.id;
  });
  const [created] = await db.query<SubmissionRow>(
    `select ${SUBMISSION_COLUMNS}
       from public.plugin_submissions s
      where s.id = $1 and s.user_id = $2`,
    [id, userId],
  );
  return created ? toSummary(created) : null;
}

export async function withdrawSubmission(
  db: DatabaseAdapter,
  userId: string,
  submissionId: string,
): Promise<boolean> {
  const rows = await db.query<{ id: string }>(
    `update public.plugin_submissions
        set status = '${STATUS_WITHDRAWN}'
      where id = $1 and user_id = $2
        and status in ('${STATUS_PENDING}', '${STATUS_APPROVED}')
      returning id`,
    [submissionId, userId],
  );
  return rows.length > 0;
}

export interface SubmissionForReview extends PluginSubmissionSummary {
  submitterId: string;
}

function toReviewSummary(row: SubmissionRow): SubmissionForReview {
  return { ...toSummary(row), submitterId: row.user_id };
}

export async function listSubmissionsForReview(
  db: DatabaseAdapter,
  status: PluginSubmissionStatus | null,
): Promise<SubmissionForReview[]> {
  const rows = await db.query<SubmissionRow>(
    `select ${SUBMISSION_COLUMNS}
       from public.plugin_submissions s
      where ($1::text is null or s.status = $1)
        and s.user_id is not null
      order by (s.status = '${STATUS_PENDING}') desc, s.created_at desc
      limit 200`,
    [status],
  );
  return rows.map(toReviewSummary);
}

export async function readSubmissionForReview(
  db: DatabaseAdapter,
  submissionId: string,
): Promise<PluginSubmissionReview | null> {
  const [row] = await db.query<SubmissionRow>(
    `select ${SUBMISSION_COLUMNS}
       from public.plugin_submissions s
      where s.id = $1 and s.user_id is not null`,
    [submissionId],
  );
  if (!row) return null;
  const files = await db.query<PluginSubmissionFile>(
    `select files.path, files.content
       from public.plugin_submission_files files
      where files.submission_id = $1 and files.user_id = $2
      order by files.path asc`,
    [submissionId, row.user_id],
  );
  return { ...toReviewSummary(row), files };
}

export async function decideSubmission(
  db: DatabaseAdapter,
  submissionId: string,
  decision: PluginSubmissionDecision,
  reviewerId: string,
): Promise<SubmissionForReview | null> {
  const decided = await db.transaction(async (tx) => {
    const [current] = await tx.query<{ user_id: string; plugin_key: string; status: string }>(
      `select user_id, plugin_key, status
         from public.plugin_submissions
        where id = $1 and user_id is not null
        for update`,
      [submissionId],
    );
    if (!current) return false;
    const expected = decision.action === 'suspend' ? STATUS_APPROVED : STATUS_PENDING;
    if (current.status !== expected) {
      throw createError
        .conflict(
          decision.action === 'suspend'
            ? 'Only an approved plugin can be suspended.'
            : 'Only a submission waiting for review can be approved or rejected.',
        )
        .asUserSafe();
    }
    if (decision.action === 'approve') {
      const replaced = await tx.query<{ id: string }>(
        `update public.plugin_submissions
            set status = '${STATUS_WITHDRAWN}'
          where user_id = $1 and plugin_key = $2 and status = '${STATUS_APPROVED}'
          returning id`,
        [current.user_id, current.plugin_key],
      );
      for (const previous of replaced) {
        await tx.execute(
          `update public.plugin_submission_installs
              set submission_id = $1
            where submission_id = $2 and user_id is not null`,
          [submissionId, previous.id],
        );
      }
    }
    const status =
      decision.action === 'approve'
        ? STATUS_APPROVED
        : decision.action === 'reject'
          ? STATUS_REJECTED
          : STATUS_SUSPENDED;
    await tx.execute(
      `update public.plugin_submissions
          set status = $2, review_note = $3, reviewed_by = $4, reviewed_at = now()
        where id = $1 and user_id = $5`,
      [
        submissionId,
        status,
        decision.action === 'approve' ? null : decision.note,
        reviewerId,
        current.user_id,
      ],
    );
    return true;
  });
  if (!decided) return null;
  const [row] = await db.query<SubmissionRow>(
    `select ${SUBMISSION_COLUMNS}
       from public.plugin_submissions s
      where s.id = $1 and s.user_id is not null`,
    [submissionId],
  );
  return row ? toReviewSummary(row) : null;
}

function toCommunityPlugin(row: CommunityRow): CommunityPlugin {
  return {
    id: row.id,
    pluginKey: row.plugin_key,
    name: row.name,
    description: row.description,
    version: row.version,
    category: row.category,
    publisherName: row.publisher_name,
    skills: stringList(row.skills),
    approvedAt: row.reviewed_at === null ? null : iso(row.reviewed_at),
    scanVerdict: row.scan_verdict === 'review' ? 'review' : 'pass',
    scanFindings: scanFindings(row.scan_findings),
    installed: row.installed,
    enabled: row.installed && row.enabled !== false,
    enabledSkills: Array.isArray(row.enabled_skills) ? stringList(row.enabled_skills) : null,
  };
}

export async function listCommunityPlugins(
  db: DatabaseAdapter,
  userId: string,
): Promise<CommunityPlugin[]> {
  const rows = await db.query<CommunityRow>(
    `select ${SUBMISSION_COLUMNS},
            (installs.user_id is not null) as installed,
            installs.enabled, installs.enabled_skills
       from public.plugin_submissions s
       left join public.plugin_submission_installs installs
         on installs.submission_id = s.id and installs.user_id = $1
      where s.status = '${STATUS_APPROVED}'
      order by lower(s.name) asc`,
    [userId],
  );
  return rows.map(toCommunityPlugin);
}

export async function listInstalledCommunityPlugins(
  db: DatabaseAdapter,
  userId: string,
): Promise<CommunityPlugin[]> {
  const rows = await db.query<CommunityRow>(
    `select ${SUBMISSION_COLUMNS},
            true as installed, installs.enabled, installs.enabled_skills
       from public.plugin_submission_installs installs
       join public.plugin_submissions s on s.id = installs.submission_id
      where installs.user_id = $1
        and s.status = '${STATUS_APPROVED}'
        and installs.enabled
      order by installs.created_at asc`,
    [userId],
  );
  return rows.map(toCommunityPlugin);
}

export async function updateCommunityInstall(
  db: DatabaseAdapter,
  userId: string,
  submissionId: string,
  patch: CommunityPluginPatch,
): Promise<CommunityPlugin | null> {
  const current = (await listCommunityPlugins(db, userId)).find(
    (plugin) => plugin.id === submissionId,
  );
  if (!current) return null;
  const unknownSkill = patch.enabledSkills?.find((skill) => !current.skills.includes(skill));
  if (unknownSkill) {
    throw createError.validation(`"${unknownSkill}" is not a skill of this plugin.`).asUserSafe();
  }
  if (patch.installed === false) {
    await db.execute(
      `delete from public.plugin_submission_installs
        where submission_id = $1 and user_id = $2`,
      [submissionId, userId],
    );
  } else if (patch.installed === true || current.installed) {
    await db.execute(
      `insert into public.plugin_submission_installs
         (submission_id, user_id, enabled, enabled_skills, created_by)
       values ($1, $2, coalesce($3, true), $4::jsonb, $2)
       on conflict (submission_id, user_id) do update
         set enabled = coalesce($3, plugin_submission_installs.enabled),
             enabled_skills = case
               when $5 then $4::jsonb
               else plugin_submission_installs.enabled_skills
             end`,
      [
        submissionId,
        userId,
        patch.enabled ?? null,
        patch.enabledSkills === undefined || patch.enabledSkills === null
          ? null
          : JSON.stringify(patch.enabledSkills),
        patch.enabledSkills !== undefined,
      ],
    );
  } else {
    throw createError.validation('Install this plugin first.').asUserSafe();
  }
  const updated = await listCommunityPlugins(db, userId);
  return updated.find((plugin) => plugin.id === submissionId) ?? null;
}

export interface CommunitySkillFile extends OwnedEntryFile {
  submissionId: string;
}

export async function listCommunitySkillFiles(
  db: DatabaseAdapter,
  submissionIds: readonly string[],
): Promise<CommunitySkillFile[]> {
  if (submissionIds.length === 0) return [];
  const rows = await db.query<{ submission_id: string; path: string; content: string }>(
    `select files.submission_id, files.path, files.content
       from public.plugin_submission_files files
       join public.plugin_submissions s
         on s.id = files.submission_id and s.user_id = files.user_id
      where s.status = '${STATUS_APPROVED}'
        and files.submission_id = any($1::uuid[])
        and (files.path = $2 or files.path like $3)
      order by files.path asc`,
    [submissionIds, SKILL_FILE_NAME, `%/${SKILL_FILE_NAME}`],
  );
  return rows.map((row) => ({
    submissionId: row.submission_id,
    path: row.path,
    content: row.content,
  }));
}

export async function listCommunitySkillCompanions(
  db: DatabaseAdapter,
  submissionId: string,
  skillDirectory: string,
  limit: number,
): Promise<OwnedCompanionFile[]> {
  const prefix = `${skillDirectory}/`;
  const rows = await db.query<{ path: string; byte_size: number | string }>(
    `select files.path, files.byte_size
       from public.plugin_submission_files files
       join public.plugin_submissions s
         on s.id = files.submission_id and s.user_id = files.user_id
      where s.status = '${STATUS_APPROVED}' and files.submission_id = $1
        and starts_with(files.path, $2) and files.path <> $3
      order by files.path asc
      limit $4`,
    [submissionId, prefix, `${prefix}${SKILL_FILE_NAME}`, limit],
  );
  return rows.map((row) => ({ path: row.path.slice(prefix.length), size: Number(row.byte_size) }));
}

export async function readCommunityPluginFile(
  db: DatabaseAdapter,
  submissionId: string,
  path: string,
): Promise<string | null> {
  const rows = await db.query<{ content: string }>(
    `select files.content
       from public.plugin_submission_files files
       join public.plugin_submissions s
         on s.id = files.submission_id and s.user_id = files.user_id
      where s.status = '${STATUS_APPROVED}' and files.submission_id = $1 and files.path = $2`,
    [submissionId, path],
  );
  return rows[0]?.content ?? null;
}
