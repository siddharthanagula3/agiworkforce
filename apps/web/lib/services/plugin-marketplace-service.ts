import 'server-only';

import {
  createHash,
  createPublicKey,
  timingSafeEqual,
  verify as verifySignature,
} from 'node:crypto';
import { ZodError } from 'zod';
import {
  parseClaudeMarketplaceManifest,
  type ClaudeMarketplacePlugin,
} from '@/features/plugins/server/directory/official-marketplace';
import {
  displayVersion,
  lastSegment,
  neutralizeCopy,
} from '@/features/plugins/server/directory/entries';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  PLUGIN_MARKETPLACE_MANIFEST_PATH,
  PLUGIN_MARKETPLACE_MANIFEST_PATHS,
  PLUGIN_MARKETPLACE_MAX_MANIFEST_BYTES,
  PLUGIN_MARKETPLACE_MAX_PLUGINS,
  PLUGIN_MARKETPLACE_STANDARD_MANIFEST_PATH,
  PluginMarketplaceManifestSchema,
  type PluginMarketplaceEntry,
  type PluginMarketplaceManifest,
  type PluginMarketplaceManifestPlugin,
  type PluginMarketplaceSourceKind,
  type PluginMarketplaceSourceSummary,
} from '@agiworkforce/cloud-contracts';

import {
  describePluginScan,
  diffPluginPermissions,
  isPluginSha256,
  isPluginSignatureAlgorithm,
  normalizePluginPermissions,
  pluginIntegrityVerdict,
  pluginSignaturePayload,
  scanPluginPackage,
  type PluginIntegrityVerdict,
  type PluginScanFile,
  type PluginScanResult,
} from '@agiworkforce/client-runtime/plugins';

import { AppError, ErrorCode } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { isKnownConnectorId } from '@/lib/connectors/catalog';

const GITHUB_REPOSITORY_URL_PATTERN =
  /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/;
const MANIFEST_TOO_LARGE_MESSAGE = `The marketplace manifest is larger than ${PLUGIN_MARKETPLACE_MAX_MANIFEST_BYTES} bytes.`;
const MANIFEST_TOO_MANY_PLUGINS_MESSAGE = `A marketplace manifest may declare at most ${PLUGIN_MARKETPLACE_MAX_PLUGINS} plugins.`;
const STANDARD_NAME_MAX_CHARS = 200;
const STANDARD_DESCRIPTION_MAX_CHARS = 2_000;
const STANDARD_LIST_MAX_ITEMS = 50;

const REF_PATTERN = /^[A-Za-z0-9._/-]{1,200}$/;
const GITHUB_API_USER_AGENT = 'agiworkforce-plugin-marketplace';
const MARKETPLACE_FETCH_TIMEOUT_MS = 10_000;

const PG_UNDEFINED_TABLE = '42P01';

export function isMissingPluginMarketplaceSchema(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  return (error as Record<string, unknown>)['code'] === PG_UNDEFINED_TABLE;
}

export const PLUGIN_SIGNING_PUBLIC_KEYS_ENV = 'PLUGIN_SIGNING_PUBLIC_KEYS';

/**
 * PUBLIC keys only; the private key lives with the release process, off this
 * system. No configured key means no trusted publisher, so verification refuses.
 */
export function trustedPluginPublisherKeys(): ReturnType<typeof createPublicKey>[] {
  const raw = process.env[PLUGIN_SIGNING_PUBLIC_KEYS_ENV]?.trim();
  if (!raw) return [];
  const blocks = raw
    .split(/(?=-----BEGIN )/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0);
  const keys: ReturnType<typeof createPublicKey>[] = [];
  for (const block of blocks) {
    try {
      keys.push(createPublicKey(block.replace(/\\n/g, '\n')));
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        '[plugin-signing] a configured publisher key could not be parsed and was ignored',
      );
    }
  }
  return keys;
}

export interface PluginPackageClaim {
  pluginId: string;
  version: string;
  sha256: string | null;
  signature: string | null;
  signatureAlgorithm: string | null;
}

function hashesMatch(expected: string, actual: string): boolean {
  const left = Buffer.from(expected, 'utf8');
  const right = Buffer.from(actual, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Fails closed at every branch: a missing digest, a missing signature, an
 * unaccepted algorithm and an untrusted key all refuse. No "unsigned but allowed".
 */
export function verifyPluginPackage(
  claim: PluginPackageClaim,
  artifactSha256?: string | null,
): PluginIntegrityVerdict {
  if (!isPluginSha256(claim.sha256)) {
    return pluginIntegrityVerdict('hash_missing', claim.pluginId);
  }
  if (artifactSha256 !== undefined && artifactSha256 !== null) {
    if (!isPluginSha256(artifactSha256) || !hashesMatch(claim.sha256, artifactSha256)) {
      return pluginIntegrityVerdict('hash_mismatch', claim.pluginId);
    }
  }
  if (typeof claim.signature !== 'string' || claim.signature.trim().length === 0) {
    return pluginIntegrityVerdict('signature_missing', claim.pluginId);
  }
  if (!isPluginSignatureAlgorithm(claim.signatureAlgorithm)) {
    return pluginIntegrityVerdict('signature_algorithm_unsupported', claim.pluginId);
  }

  const payload = Buffer.from(
    pluginSignaturePayload({
      pluginId: claim.pluginId,
      version: claim.version,
      sha256: claim.sha256,
    }),
    'utf8',
  );
  let signature: Buffer;
  try {
    signature = Buffer.from(claim.signature, 'base64');
  } catch {
    return pluginIntegrityVerdict('signature_invalid', claim.pluginId);
  }
  if (signature.length === 0) return pluginIntegrityVerdict('signature_invalid', claim.pluginId);

  for (const key of trustedPluginPublisherKeys()) {
    try {
      if (verifySignature(null, payload, key, signature)) {
        return pluginIntegrityVerdict('verified', claim.pluginId);
      }
    } catch {
      continue;
    }
  }
  return pluginIntegrityVerdict('signature_invalid', claim.pluginId);
}

export function sha256OfText(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export interface PluginPackageScanRecord {
  contentHash: string;
  pluginKey: string;
  verdict: PluginScanResult['verdict'];
  rulesVersion: number;
  findings: PluginScanResult['findings'];
  scannedAt: string;
}

interface PluginPackageScanRow {
  content_hash: string;
  plugin_key: string;
  verdict: PluginScanResult['verdict'];
  rules_version: number;
  findings: unknown;
  scanned_at: string | Date;
}

export async function readPluginPackageScan(
  db: DatabaseAdapter,
  contentHash: string,
): Promise<PluginPackageScanRecord | null> {
  if (!isPluginSha256(contentHash)) return null;
  const rows = await db.query<PluginPackageScanRow>(
    `select content_hash, plugin_key, verdict, rules_version, findings, scanned_at
       from public.plugin_package_scans
      where content_hash = $1
      limit 1`,
    [contentHash],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    contentHash: row.content_hash,
    pluginKey: row.plugin_key,
    verdict: row.verdict,
    rulesVersion: row.rules_version,
    findings: Array.isArray(row.findings) ? (row.findings as PluginScanResult['findings']) : [],
    scannedAt: toIso(row.scanned_at) ?? new Date(0).toISOString(),
  };
}

/**
 * Keyed by content hash, not by plugin, so a republished artifact is a new row
 * and can never inherit the previous version's pass.
 */
export async function scanAndRecordPluginPackage(
  db: DatabaseAdapter,
  pluginKey: string,
  contentHash: string,
  files: readonly PluginScanFile[],
): Promise<PluginScanResult> {
  const result = scanPluginPackage(files);
  if (isPluginSha256(contentHash)) {
    await db.execute(
      `insert into public.plugin_package_scans
         (content_hash, plugin_key, verdict, rules_version, findings, scanned_files, scanned_at)
       values ($1, $2, $3, $4, $5::jsonb, $6, now())
       on conflict (content_hash) do update
         set plugin_key = excluded.plugin_key,
             verdict = excluded.verdict,
             rules_version = excluded.rules_version,
             findings = excluded.findings,
             scanned_files = excluded.scanned_files,
             scanned_at = now()`,
      [
        contentHash,
        pluginKey.slice(0, 200),
        result.verdict,
        result.rulesVersion,
        JSON.stringify(result.findings),
        result.scannedFiles,
      ],
    );
  }
  if (result.verdict !== 'pass') {
    logger.warn(
      { pluginKey, contentHash, verdict: result.verdict, findings: result.findings.length },
      '[plugin-scan] package did not pass the content scanner',
    );
  }
  return result;
}

/** An `AppError`, so the route boundary answers 409 rather than an opaque 500. */
export class PluginPackageRefusedError extends AppError {
  readonly refusal: string;

  constructor(refusal: string, message: string) {
    super(ErrorCode.CONFLICT, message, 409);
    Object.setPrototypeOf(this, PluginPackageRefusedError.prototype);
    this.name = 'PluginPackageRefusedError';
    this.refusal = refusal;
    this.asUserSafe();
  }
}

/**
 * A package with no recorded scan is refused, not installed: absence of a
 * verdict is not a pass.
 */
export async function assertPluginPackageInstallable(
  db: DatabaseAdapter,
  claim: PluginPackageClaim,
  artifactSha256?: string | null,
): Promise<void> {
  const integrity = verifyPluginPackage(claim, artifactSha256);
  if (!integrity.ok) throw new PluginPackageRefusedError(integrity.code, integrity.reason);

  const scan = await readPluginPackageScan(db, claim.sha256 ?? '');
  if (!scan) {
    throw new PluginPackageRefusedError(
      'scan_missing',
      `The ${claim.pluginId} package has not been scanned, so it cannot be installed yet.`,
    );
  }
  if (scan.verdict !== 'pass') {
    throw new PluginPackageRefusedError(
      scan.verdict === 'block' ? 'scan_blocked' : 'scan_review_required',
      describePluginScan({
        verdict: scan.verdict,
        findings: scan.findings,
        rulesVersion: scan.rulesVersion,
        scannedFiles: 0,
        scannedBytes: 0,
      }),
    );
  }
}

export class PluginMarketplaceValidationError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(issues[0] ?? 'The marketplace manifest is invalid.');
    this.name = 'PluginMarketplaceValidationError';
    this.issues = issues;
  }
}

export class PluginMarketplaceFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PluginMarketplaceFetchError';
  }
}

export interface RegisterMarketplaceSourceInput {
  repositoryUrl: string;
  ref?: string | null;
  name?: string | null;
}

interface PluginMarketplaceSourceRow {
  id: string;
  name: string;
  kind: PluginMarketplaceSourceKind;
  repository_url: string | null;
  ref: string | null;
  status: 'active' | 'error';
  last_error: string | null;
  content_hash: string | null;
  entry_count: string | number;
  last_synced_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
}

interface PluginMarketplaceEntryRow {
  id: string;
  source_id: string;
  plugin_key: string;
  name: string;
  description: string;
  version: string;
  declared_skills: unknown;
  required_connectors: unknown;
  agents: unknown;
  example_prompts: unknown;
  permissions: unknown;
  content_hash: string;
  created_at: string | Date;
  updated_at: string | Date;
}

function toIso(value: string | Date | null): string | null {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function mapSourceRow(row: PluginMarketplaceSourceRow): PluginMarketplaceSourceSummary {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    repositoryUrl: row.repository_url,
    ref: row.ref,
    status: row.status,
    lastError: row.last_error,
    contentHash: row.content_hash,
    entryCount: Number(row.entry_count) || 0,
    lastSyncedAt: toIso(row.last_synced_at),
    createdAt: toIso(row.created_at) ?? new Date(0).toISOString(),
    updatedAt: toIso(row.updated_at) ?? new Date(0).toISOString(),
  };
}

function mapEntryRow(row: PluginMarketplaceEntryRow): PluginMarketplaceEntry {
  return {
    id: row.id,
    sourceId: row.source_id,
    pluginKey: row.plugin_key,
    name: row.name,
    description: row.description,
    version: row.version,
    declaredSkills: toStringArray(row.declared_skills),
    requiredConnectors: toStringArray(row.required_connectors),
    agents: toStringArray(row.agents),
    examplePrompts: toStringArray(row.example_prompts),
    permissions: toStringArray(row.permissions),
    contentHash: row.content_hash,
    createdAt: toIso(row.created_at) ?? new Date(0).toISOString(),
    updatedAt: toIso(row.updated_at) ?? new Date(0).toISOString(),
  };
}

export function parseGithubRepositoryUrl(
  repositoryUrl: string,
): { owner: string; repo: string } | null {
  const match = GITHUB_REPOSITORY_URL_PATTERN.exec(repositoryUrl.trim());
  if (!match) return null;
  const [, owner, repo] = match;
  if (!owner || !repo) return null;
  return { owner, repo };
}

async function resolveDefaultBranch(owner: string, repo: string): Promise<string> {
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: { 'User-Agent': GITHUB_API_USER_AGENT, Accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(MARKETPLACE_FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new PluginMarketplaceFetchError(
      `Could not resolve the default branch for ${owner}/${repo} (${response.status}).`,
    );
  }
  const body = (await response.json()) as { default_branch?: unknown };
  if (typeof body.default_branch !== 'string' || body.default_branch.trim().length === 0) {
    throw new PluginMarketplaceFetchError(`${owner}/${repo} has no resolvable default branch.`);
  }
  return body.default_branch;
}

export function buildManifestRawUrl(
  owner: string,
  repo: string,
  ref: string,
  manifestPath: string = PLUGIN_MARKETPLACE_MANIFEST_PATH,
): string {
  return `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${manifestPath}`;
}

function standardManifestPlugin(plugin: ClaudeMarketplacePlugin): PluginMarketplaceManifestPlugin {
  const description = neutralizeCopy(plugin.description ?? '').slice(
    0,
    STANDARD_DESCRIPTION_MAX_CHARS,
  );
  return {
    id: plugin.name,
    name: (plugin.displayName?.trim() || plugin.name).slice(0, STANDARD_NAME_MAX_CHARS),
    description: description.length > 0 ? description : plugin.name,
    version: displayVersion(plugin.version, null),
    skills: [...new Set((plugin.skills ?? []).map(lastSegment))].slice(0, STANDARD_LIST_MAX_ITEMS),
    connectors: [],
    agents: [],
    examplePrompts: [],
    permissions: [],
  };
}

export function declaredPluginCount(json: unknown): number {
  if (!json || typeof json !== 'object') return 0;
  const plugins = (json as { plugins?: unknown }).plugins;
  return Array.isArray(plugins) ? plugins.length : 0;
}

export function standardManifestToInternal(json: unknown): PluginMarketplaceManifest {
  const parsed = parseClaudeMarketplaceManifest(json);
  return PluginMarketplaceManifestSchema.parse({
    name: parsed.name,
    plugins: parsed.plugins.map(standardManifestPlugin),
  });
}

interface FetchedManifest {
  manifest: PluginMarketplaceManifest;
  contentHash: string;
  resolvedRef: string;
  manifestPath: string;
  rawText: string;
}

export async function fetchMarketplaceManifest(
  repositoryUrl: string,
  ref: string | null,
): Promise<FetchedManifest> {
  const parsed = parseGithubRepositoryUrl(repositoryUrl);
  if (!parsed) {
    throw new PluginMarketplaceValidationError([
      'Only public github.com repository URLs are supported.',
    ]);
  }
  if (ref !== null && !REF_PATTERN.test(ref)) {
    throw new PluginMarketplaceValidationError(['The branch, tag, or ref is not valid.']);
  }

  const resolvedRef = ref ?? (await resolveDefaultBranch(parsed.owner, parsed.repo));

  let found: { path: string; rawText: string } | null = null;
  for (const manifestPath of PLUGIN_MARKETPLACE_MANIFEST_PATHS) {
    const response = await fetch(
      buildManifestRawUrl(parsed.owner, parsed.repo, resolvedRef, manifestPath),
      {
        headers: { 'User-Agent': GITHUB_API_USER_AGENT },
        signal: AbortSignal.timeout(MARKETPLACE_FETCH_TIMEOUT_MS),
      },
    );
    if (response.ok) {
      const declaredLength = Number(response.headers.get('content-length'));
      if (
        Number.isFinite(declaredLength) &&
        declaredLength > PLUGIN_MARKETPLACE_MAX_MANIFEST_BYTES
      ) {
        throw new PluginMarketplaceValidationError([MANIFEST_TOO_LARGE_MESSAGE]);
      }
      const rawText = await response.text();
      if (rawText.length > PLUGIN_MARKETPLACE_MAX_MANIFEST_BYTES) {
        throw new PluginMarketplaceValidationError([MANIFEST_TOO_LARGE_MESSAGE]);
      }
      found = { path: manifestPath, rawText };
      break;
    }
  }
  if (!found) {
    throw new PluginMarketplaceFetchError(
      `No marketplace manifest found at ${PLUGIN_MARKETPLACE_MANIFEST_PATHS.join(' or ')} on ${parsed.owner}/${parsed.repo}@${resolvedRef}.`,
    );
  }

  const { path: manifestPath, rawText } = found;
  const standard = manifestPath === PLUGIN_MARKETPLACE_STANDARD_MANIFEST_PATH;

  let json: unknown;
  try {
    json = JSON.parse(rawText);
  } catch {
    throw new PluginMarketplaceValidationError(['The marketplace manifest is not valid JSON.']);
  }
  if (declaredPluginCount(json) > PLUGIN_MARKETPLACE_MAX_PLUGINS) {
    throw new PluginMarketplaceValidationError([MANIFEST_TOO_MANY_PLUGINS_MESSAGE]);
  }

  let manifest: PluginMarketplaceManifest;
  try {
    manifest = standard
      ? standardManifestToInternal(json)
      : PluginMarketplaceManifestSchema.parse(json);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new PluginMarketplaceValidationError(['The marketplace manifest is not valid JSON.']);
    }
    if (error instanceof ZodError) {
      throw new PluginMarketplaceValidationError(
        error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
      );
    }
    throw new PluginMarketplaceValidationError([
      error instanceof Error ? error.message : 'The marketplace manifest is not valid.',
    ]);
  }

  const contentHash = sha256OfText(rawText);
  return { manifest, contentHash, resolvedRef, manifestPath, rawText };
}

export async function validateManifestAgainstCatalog(
  manifest: PluginMarketplaceManifest,
): Promise<string[]> {
  const issues: string[] = [];

  for (const plugin of manifest.plugins) {
    for (const connector of plugin.connectors) {
      if (!isKnownConnectorId(connector)) {
        issues.push(`${plugin.id} references unknown connector "${connector}"`);
      }
    }
  }
  return issues;
}

async function replaceSourceEntries(
  tx: DatabaseAdapter,
  sourceId: string,
  plugins: readonly PluginMarketplaceManifestPlugin[],
  contentHash: string,
): Promise<void> {
  const keys = plugins.map((plugin) => plugin.id);
  for (const plugin of plugins) {
    await tx.execute(
      `insert into public.plugin_marketplace_entries
         (source_id, plugin_key, name, description, version,
          declared_skills, required_connectors, agents, example_prompts, permissions,
          content_hash, updated_at)
       values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb, $11, now())
       on conflict (source_id, plugin_key) do update
         set name = excluded.name,
             description = excluded.description,
             version = excluded.version,
             declared_skills = excluded.declared_skills,
             required_connectors = excluded.required_connectors,
             agents = excluded.agents,
             example_prompts = excluded.example_prompts,
             permissions = excluded.permissions,
             content_hash = excluded.content_hash,
             updated_at = now()`,
      [
        sourceId,
        plugin.id,
        plugin.name,
        plugin.description,
        plugin.version,
        JSON.stringify(plugin.skills),
        JSON.stringify(plugin.connectors),
        JSON.stringify(plugin.agents),
        JSON.stringify(plugin.examplePrompts),
        JSON.stringify(plugin.permissions),
        contentHash,
      ],
    );
  }

  if (keys.length > 0) {
    await tx.execute(
      `delete from public.plugin_marketplace_entries
        where source_id = $1 and plugin_key <> all($2::text[])`,
      [sourceId, keys],
    );
  } else {
    await tx.execute(`delete from public.plugin_marketplace_entries where source_id = $1`, [
      sourceId,
    ]);
  }
}

/**
 * The entry still moves to the published version; the installation is disabled
 * and marked for review, so an expanded permission is never exercised unapproved.
 */
async function reviewPermissionChanges(
  tx: DatabaseAdapter,
  userId: string,
  sourceId: string,
  plugins: readonly PluginMarketplaceManifestPlugin[],
): Promise<void> {
  for (const plugin of plugins) {
    const permissions = normalizePluginPermissions(plugin.permissions);
    await tx.execute(
      `update public.plugin_marketplace_installations installation
          set review_required = true,
              enabled = false,
              pending_permissions = $4::jsonb,
              updated_at = now()
         from public.plugin_marketplace_entries entries
        where entries.id = installation.entry_id
          and installation.user_id = $1
          and entries.source_id = $2
          and entries.plugin_key = $3
          and exists (
            select 1
              from jsonb_array_elements_text($4::jsonb) as required(permission)
             where not (installation.approved_permissions @> to_jsonb(required.permission))
          )`,
      [userId, sourceId, plugin.id, JSON.stringify(permissions)],
    );
    await tx.execute(
      `update public.plugin_marketplace_installations installation
          set review_required = false,
              pending_permissions = null,
              updated_at = now()
         from public.plugin_marketplace_entries entries
        where entries.id = installation.entry_id
          and installation.user_id = $1
          and entries.source_id = $2
          and entries.plugin_key = $3
          and installation.review_required = true
          and not exists (
            select 1
              from jsonb_array_elements_text($4::jsonb) as required(permission)
             where not (installation.approved_permissions @> to_jsonb(required.permission))
          )`,
      [userId, sourceId, plugin.id, JSON.stringify(permissions)],
    );
  }
}

/**
 * Called at install; without it every declared permission reads as new on the
 * next refresh.
 */
export async function approveMarketplaceInstallationPermissions(
  db: DatabaseAdapter,
  userId: string,
  installationId: string,
  permissions: readonly string[],
): Promise<string[]> {
  const approved = normalizePluginPermissions(permissions);
  await db.execute(
    `update public.plugin_marketplace_installations
        set approved_permissions = $3::jsonb,
            pending_permissions = null,
            review_required = false,
            updated_at = now()
      where id = $1 and user_id = $2`,
    [installationId, userId, JSON.stringify(approved)],
  );
  return approved;
}

export function marketplacePermissionReview(
  approved: readonly string[] | null | undefined,
  declared: readonly string[] | null | undefined,
): { reviewRequired: boolean; added: string[]; removed: string[] } {
  const diff = diffPluginPermissions(approved, declared);
  return { reviewRequired: diff.expands, added: diff.added, removed: diff.removed };
}

export function canonicalRepositoryUrl(repositoryUrl: string): string {
  const parsed = parseGithubRepositoryUrl(repositoryUrl);
  return parsed ? `https://github.com/${parsed.owner}/${parsed.repo}` : repositoryUrl.trim();
}

async function findExistingSource(
  db: DatabaseAdapter,
  userId: string,
  repositoryUrl: string,
): Promise<{ id: string } | null> {
  const rows = await db.query<{ id: string }>(
    `select id from public.plugin_marketplace_sources
      where user_id = $1 and lower(repository_url) = lower($2)
      order by created_at asc
      limit 1`,
    [userId, repositoryUrl],
  );
  return rows[0] ?? null;
}

export async function registerMarketplaceSource(
  db: DatabaseAdapter,
  userId: string,
  input: RegisterMarketplaceSourceInput,
): Promise<PluginMarketplaceSourceSummary> {
  const parsedRepository = parseGithubRepositoryUrl(input.repositoryUrl);
  if (!parsedRepository) {
    throw new PluginMarketplaceValidationError([
      'Only public github.com repository URLs are supported.',
    ]);
  }
  const requestedRef = input.ref?.trim() || null;

  const { manifest, contentHash, resolvedRef, manifestPath, rawText } =
    await fetchMarketplaceManifest(input.repositoryUrl, requestedRef);
  const catalogIssues = await validateManifestAgainstCatalog(manifest);
  if (catalogIssues.length > 0) {
    throw new PluginMarketplaceValidationError(catalogIssues);
  }
  const scan = await scanAndRecordPluginPackage(db, manifest.name, contentHash, [
    { path: manifestPath, content: rawText },
  ]);
  if (scan.verdict === 'block') {
    throw new PluginMarketplaceValidationError([describePluginScan(scan)]);
  }

  const sourceName = input.name?.trim() || manifest.name;
  const canonicalUrl = canonicalRepositoryUrl(input.repositoryUrl);
  const existing = await findExistingSource(db, userId, canonicalUrl);

  const sourceId = await db.transaction(async (tx) => {
    let id: string;
    if (existing) {
      id = existing.id;
      await tx.execute(
        `update public.plugin_marketplace_sources
            set name = $2, repository_url = $3, ref = $4, status = 'active', last_error = null,
                content_hash = $5, last_synced_at = now(), updated_at = now()
          where id = $1`,
        [id, sourceName, canonicalUrl, requestedRef, contentHash],
      );
    } else {
      const rows = await tx.query<{ id: string }>(
        `insert into public.plugin_marketplace_sources
           (user_id, name, repository_url, ref, status, content_hash, last_synced_at)
         values ($1, $2, $3, $4, 'active', $5, now())
         returning id`,
        [userId, sourceName, canonicalUrl, requestedRef, contentHash],
      );
      const inserted = rows[0];
      if (!inserted)
        throw new PluginMarketplaceFetchError('Could not register the marketplace source.');
      id = inserted.id;
    }
    await replaceSourceEntries(tx, id, manifest.plugins, contentHash);
    await reviewPermissionChanges(tx, userId, id, manifest.plugins);
    return id;
  });

  logger.info(
    { userId, sourceId, repositoryUrl: input.repositoryUrl, ref: resolvedRef },
    'Plugin marketplace source registered',
  );

  const summary = await getMarketplaceSource(db, userId, sourceId);
  if (!summary) throw new PluginMarketplaceFetchError('Could not load the registered source.');
  return summary;
}

export async function refreshMarketplaceSource(
  db: DatabaseAdapter,
  userId: string,
  sourceId: string,
): Promise<PluginMarketplaceSourceSummary | null> {
  const rows = await db.query<PluginMarketplaceSourceRow & { entry_count: number }>(
    `select sources.*, (select count(*) from public.plugin_marketplace_entries where source_id = sources.id) as entry_count
       from public.plugin_marketplace_sources sources
      where sources.id = $1 and sources.user_id = $2
      limit 1`,
    [sourceId, userId],
  );
  const row = rows[0];
  if (!row) return null;
  if (!row.repository_url) return mapSourceRow(row);

  try {
    const { manifest, contentHash, manifestPath, rawText } = await fetchMarketplaceManifest(
      row.repository_url,
      row.ref,
    );
    const catalogIssues = await validateManifestAgainstCatalog(manifest);
    if (catalogIssues.length > 0) {
      throw new PluginMarketplaceValidationError(catalogIssues);
    }
    const scan = await scanAndRecordPluginPackage(db, manifest.name, contentHash, [
      { path: manifestPath, content: rawText },
    ]);
    if (scan.verdict === 'block') {
      throw new PluginMarketplaceValidationError([describePluginScan(scan)]);
    }

    if (contentHash === row.content_hash) {
      await db.execute(
        `update public.plugin_marketplace_sources
            set status = 'active', last_error = null, last_synced_at = now(), updated_at = now()
          where id = $1`,
        [sourceId],
      );
    } else {
      await db.transaction(async (tx) => {
        await tx.execute(
          `update public.plugin_marketplace_sources
              set status = 'active', last_error = null, content_hash = $2,
                  last_synced_at = now(), updated_at = now()
            where id = $1`,
          [sourceId, contentHash],
        );
        await replaceSourceEntries(tx, sourceId, manifest.plugins, contentHash);
        await reviewPermissionChanges(tx, userId, sourceId, manifest.plugins);
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Marketplace refresh failed.';
    logger.warn(
      { userId, sourceId, error },
      'Plugin marketplace refresh failed; keeping last-known-good cache',
    );
    await db.execute(
      `update public.plugin_marketplace_sources
          set status = 'error', last_error = $2, updated_at = now()
        where id = $1`,
      [sourceId, message.slice(0, 1_000)],
    );
  }

  return getMarketplaceSource(db, userId, sourceId);
}

export async function listMarketplaceSources(
  db: DatabaseAdapter,
  userId: string,
): Promise<PluginMarketplaceSourceSummary[]> {
  const rows = await db.query<PluginMarketplaceSourceRow>(
    `select sources.*, (select count(*) from public.plugin_marketplace_entries where source_id = sources.id) as entry_count
       from public.plugin_marketplace_sources sources
      where sources.user_id = $1
      order by sources.created_at asc`,
    [userId],
  );
  return rows.map(mapSourceRow);
}

export async function getMarketplaceSource(
  db: DatabaseAdapter,
  userId: string,
  sourceId: string,
): Promise<PluginMarketplaceSourceSummary | null> {
  const rows = await db.query<PluginMarketplaceSourceRow>(
    `select sources.*, (select count(*) from public.plugin_marketplace_entries where source_id = sources.id) as entry_count
       from public.plugin_marketplace_sources sources
      where sources.id = $1 and sources.user_id = $2
      limit 1`,
    [sourceId, userId],
  );
  const row = rows[0];
  return row ? mapSourceRow(row) : null;
}

export async function deleteMarketplaceSource(
  db: DatabaseAdapter,
  userId: string,
  sourceId: string,
): Promise<boolean> {
  const rows = await db.query<{ id: string }>(
    `delete from public.plugin_marketplace_sources
      where id = $1 and user_id = $2
      returning id`,
    [sourceId, userId],
  );
  return rows.length > 0;
}

export async function listMarketplaceEntriesForUser(
  db: DatabaseAdapter,
  userId: string,
): Promise<PluginMarketplaceEntry[]> {
  const rows = await db.query<PluginMarketplaceEntryRow>(
    `select entries.*
       from public.plugin_marketplace_entries entries
       join public.plugin_marketplace_sources sources on sources.id = entries.source_id
      where sources.user_id = $1
      order by entries.name asc`,
    [userId],
  );
  return rows.map(mapEntryRow);
}

export async function getMarketplaceEntryForUser(
  db: DatabaseAdapter,
  userId: string,
  entryId: string,
): Promise<PluginMarketplaceEntry | null> {
  const rows = await db.query<PluginMarketplaceEntryRow>(
    `select entries.*
       from public.plugin_marketplace_entries entries
       join public.plugin_marketplace_sources sources on sources.id = entries.source_id
      where entries.id = $1 and sources.user_id = $2
      limit 1`,
    [entryId, userId],
  );
  const row = rows[0];
  return row ? mapEntryRow(row) : null;
}
