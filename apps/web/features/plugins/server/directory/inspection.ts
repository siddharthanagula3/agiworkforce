import {
  CLAUDE_PLUGIN_AGENTS_DIRECTORY,
  CLAUDE_PLUGIN_COMMANDS_DIRECTORY,
  CLAUDE_PLUGIN_HOOKS_PATH,
  CLAUDE_PLUGIN_MCP_PATH,
  CLAUDE_PLUGIN_METADATA_PATH,
  CLAUDE_PLUGIN_SKILLS_DIRECTORY,
  CLAUDE_SKILL_FILE_NAME,
  GITHUB_API_ACCEPT,
  GITHUB_API_BASE_URL,
  GITHUB_API_USER_AGENT,
  GITHUB_DEFAULT_TREE_REF,
  GITHUB_RAW_BASE_URL,
  PLUGIN_DIRECTORY_FETCH_TIMEOUT_MS,
  RUNTIME_NOTE_COWORK_ONLY,
  RUNTIME_NOTE_HOOKS,
  RUNTIME_NOTE_LSP,
  RUNTIME_NOTE_NOT_INSPECTED,
  RUNTIME_NOTE_NO_SKILLS,
  RUNTIME_NOTE_SOURCE_UNKNOWN,
  RUNTIME_NOTE_STDIO_MCP,
} from './constants';
import { parseGithubRepository, type DirectoryFetch } from './official-marketplace';
import type {
  PluginInspectionRecord,
  PluginMcpServerSummary,
  PluginMcpTransportKind,
  PluginRuntimeComponents,
  PluginRuntimeFit,
  PluginSourceLocation,
} from './types';

const TREE_BLOB_TYPE = 'blob';
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_NOT_FOUND = 404;
const RATE_LIMIT_REMAINING_HEADER = 'x-ratelimit-remaining';
const MARKDOWN_SUFFIX = '.md';
const RELATIVE_PREFIX = /^\.\//;
const TRAILING_SLASH = /\/+$/;
const MCP_TRANSPORT_SSE = 'sse';
const MCP_TRANSPORT_HTTP = 'http';
const MCP_TRANSPORT_STDIO = 'stdio';

export interface GithubTreeEntry {
  path: string;
  type: string;
}

export interface RepositoryTree {
  sha: string;
  entries: GithubTreeEntry[];
  truncated: boolean;
}

export type TreeFetchResult =
  | { status: 'ok'; tree: RepositoryTree }
  | { status: 'rate-limited' }
  | { status: 'unauthorized' }
  | { status: 'missing' }
  | { status: 'failed'; reason: string };

export const EMPTY_COMPONENTS: PluginRuntimeComponents = {
  skills: [],
  skillPaths: [],
  commands: 0,
  agents: 0,
  hooks: false,
  mcpServers: [],
  lspServers: [],
};

export function treeRef(location: PluginSourceLocation): string {
  return location.sha ?? location.ref ?? GITHUB_DEFAULT_TREE_REF;
}

function githubHeaders(token: string | undefined): Record<string, string> {
  return {
    'User-Agent': GITHUB_API_USER_AGENT,
    Accept: GITHUB_API_ACCEPT,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function fetchRepositoryTree(
  location: PluginSourceLocation,
  fetchImpl: DirectoryFetch = fetch,
  token?: string,
): Promise<TreeFetchResult> {
  const repository = parseGithubRepository(location.repositoryUrl);
  if (!repository) return { status: 'failed', reason: 'not a github.com repository' };
  const url = `${GITHUB_API_BASE_URL}/repos/${repository.owner}/${repository.repo}/git/trees/${encodeURIComponent(treeRef(location))}?recursive=1`;
  let response: Response;
  try {
    response = await fetchImpl(url, {
      headers: githubHeaders(token),
      signal: AbortSignal.timeout(PLUGIN_DIRECTORY_FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    return { status: 'failed', reason: error instanceof Error ? error.message : String(error) };
  }
  if (
    (response.status === HTTP_FORBIDDEN || response.status === HTTP_TOO_MANY_REQUESTS) &&
    response.headers.get(RATE_LIMIT_REMAINING_HEADER) === '0'
  ) {
    return { status: 'rate-limited' };
  }
  if (response.status === HTTP_UNAUTHORIZED && token) return { status: 'unauthorized' };
  if (response.status === HTTP_NOT_FOUND) return { status: 'missing' };
  if (!response.ok) return { status: 'failed', reason: `tree fetch failed (${response.status})` };
  let body: { sha?: unknown; tree?: unknown; truncated?: unknown };
  try {
    body = (await response.json()) as typeof body;
  } catch {
    return { status: 'failed', reason: 'tree response is not json' };
  }
  if (typeof body.sha !== 'string' || !Array.isArray(body.tree)) {
    return { status: 'failed', reason: 'tree response is malformed' };
  }
  const entries: GithubTreeEntry[] = [];
  for (const item of body.tree as unknown[]) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    if (typeof record['path'] === 'string' && typeof record['type'] === 'string') {
      entries.push({ path: record['path'], type: record['type'] });
    }
  }
  return { status: 'ok', tree: { sha: body.sha, entries, truncated: body.truncated === true } };
}

export function rawFileUrl(location: PluginSourceLocation, relativePath: string): string | null {
  const repository = parseGithubRepository(location.repositoryUrl);
  if (!repository) return null;
  const prefix = location.path ? `${location.path}/` : '';
  return `${GITHUB_RAW_BASE_URL}/${repository.owner}/${repository.repo}/${encodeURIComponent(treeRef(location))}/${prefix}${relativePath}`;
}

function normalizeRelative(path: string): string {
  return path.trim().replace(RELATIVE_PREFIX, '').replace(TRAILING_SLASH, '');
}

function lastSegment(path: string): string {
  const segments = normalizeRelative(path).split('/');
  return segments[segments.length - 1] ?? path;
}

export interface TreeClassification {
  components: PluginRuntimeComponents;
  hasMetadata: boolean;
  hasMcpFile: boolean;
}

export function classifyPluginTree(
  entries: readonly GithubTreeEntry[],
  base: string | null,
  declaredSkills: readonly string[] = [],
): TreeClassification {
  const prefix = base ? `${normalizeRelative(base)}/` : '';
  const blobs = new Set<string>();
  for (const entry of entries) {
    if (entry.type !== TREE_BLOB_TYPE) continue;
    if (prefix && !entry.path.startsWith(prefix)) continue;
    blobs.add(entry.path.slice(prefix.length));
  }
  const skills = new Map<string, string>();
  let commands = 0;
  let agents = 0;
  const skillPattern = new RegExp(
    `^${CLAUDE_PLUGIN_SKILLS_DIRECTORY}/([^/]+)/${CLAUDE_SKILL_FILE_NAME.replace('.', '\\.')}$`,
  );
  for (const relative of blobs) {
    const skill = skillPattern.exec(relative);
    if (skill?.[1]) {
      skills.set(skill[1], relative);
      continue;
    }
    if (
      relative.startsWith(`${CLAUDE_PLUGIN_COMMANDS_DIRECTORY}/`) &&
      relative.endsWith(MARKDOWN_SUFFIX)
    ) {
      commands += 1;
    } else if (
      relative.startsWith(`${CLAUDE_PLUGIN_AGENTS_DIRECTORY}/`) &&
      relative.endsWith(MARKDOWN_SUFFIX)
    ) {
      agents += 1;
    }
  }
  for (const declared of declaredSkills) {
    const relative = `${normalizeRelative(declared)}/${CLAUDE_SKILL_FILE_NAME}`;
    if (blobs.has(relative)) skills.set(lastSegment(declared), relative);
  }
  const names = [...skills.keys()].sort();
  return {
    components: {
      ...EMPTY_COMPONENTS,
      skills: names,
      skillPaths: names.map((name) => skills.get(name) ?? ''),
      commands,
      agents,
      hooks: blobs.has(CLAUDE_PLUGIN_HOOKS_PATH),
    },
    hasMetadata: blobs.has(CLAUDE_PLUGIN_METADATA_PATH),
    hasMcpFile: blobs.has(CLAUDE_PLUGIN_MCP_PATH),
  };
}

function mcpTransport(server: Record<string, unknown>): PluginMcpTransportKind {
  const type = typeof server['type'] === 'string' ? server['type'].toLowerCase() : null;
  const transport =
    typeof server['transport'] === 'string' ? server['transport'].toLowerCase() : null;
  const declared = type ?? transport;
  if (declared === MCP_TRANSPORT_STDIO || typeof server['command'] === 'string') {
    return MCP_TRANSPORT_STDIO;
  }
  if (declared === MCP_TRANSPORT_SSE) return MCP_TRANSPORT_SSE;
  if (declared === MCP_TRANSPORT_HTTP || typeof server['url'] === 'string') {
    return MCP_TRANSPORT_HTTP;
  }
  return 'unknown';
}

export function parseMcpServers(json: unknown): PluginMcpServerSummary[] {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return [];
  const root = json as Record<string, unknown>;
  const servers =
    root['mcpServers'] && typeof root['mcpServers'] === 'object' ? root['mcpServers'] : root;
  const out: PluginMcpServerSummary[] = [];
  for (const [name, server] of Object.entries(servers as Record<string, unknown>)) {
    if (!server || typeof server !== 'object' || Array.isArray(server)) continue;
    out.push({ name, transport: mcpTransport(server as Record<string, unknown>) });
  }
  return out;
}

export interface PluginMetadata {
  version: string | null;
  description: string | null;
  skills: string[];
  hooks: boolean;
  mcpServers: PluginMcpServerSummary[];
  lspServers: string[];
}

function stringList(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

export function parsePluginMetadata(json: unknown): PluginMetadata {
  const empty: PluginMetadata = {
    version: null,
    description: null,
    skills: [],
    hooks: false,
    mcpServers: [],
    lspServers: [],
  };
  if (!json || typeof json !== 'object' || Array.isArray(json)) return empty;
  const record = json as Record<string, unknown>;
  const hooks = record['hooks'];
  const lsp = record['lspServers'];
  return {
    version: typeof record['version'] === 'string' ? record['version'].trim() : null,
    description: typeof record['description'] === 'string' ? record['description'].trim() : null,
    skills: stringList(record['skills']),
    hooks:
      typeof hooks === 'string' ||
      (!!hooks && typeof hooks === 'object' && Object.keys(hooks as object).length > 0),
    mcpServers: parseMcpServers(record['mcpServers']),
    lspServers: lsp && typeof lsp === 'object' && !Array.isArray(lsp) ? Object.keys(lsp) : [],
  };
}

async function fetchRawJson(url: string, fetchImpl: DirectoryFetch): Promise<unknown | null> {
  try {
    const response = await fetchImpl(url, {
      headers: { 'User-Agent': GITHUB_API_USER_AGENT },
      signal: AbortSignal.timeout(PLUGIN_DIRECTORY_FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

export function inspectionKey(location: PluginSourceLocation): string {
  return `${location.repositoryUrl.toLowerCase()}@${treeRef(location)}#${location.path ?? ''}`;
}

export interface InspectOptions {
  fetchImpl?: DirectoryFetch;
  token?: string;
  declaredSkills?: readonly string[];
  declaredLspServers?: readonly string[];
  tree?: RepositoryTree;
  now?: () => number;
}

export type InspectionResult =
  | { status: 'ok'; record: PluginInspectionRecord }
  | { status: 'rate-limited' }
  | { status: 'unauthorized' }
  | { status: 'failed'; reason: string };

function mergeServers(
  first: readonly PluginMcpServerSummary[],
  second: readonly PluginMcpServerSummary[],
): PluginMcpServerSummary[] {
  const byName = new Map<string, PluginMcpServerSummary>();
  for (const server of [...first, ...second]) byName.set(server.name, server);
  return [...byName.values()];
}

export async function inspectPluginSource(
  location: PluginSourceLocation,
  options: InspectOptions = {},
): Promise<InspectionResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  let tree = options.tree;
  if (!tree) {
    const fetched = await fetchRepositoryTree(location, fetchImpl, options.token);
    if (fetched.status === 'rate-limited') return { status: 'rate-limited' };
    if (fetched.status === 'unauthorized') return { status: 'unauthorized' };
    if (fetched.status === 'missing')
      return { status: 'failed', reason: 'repository or ref not found' };
    if (fetched.status === 'failed') return { status: 'failed', reason: fetched.reason };
    tree = fetched.tree;
  }
  const pinned: PluginSourceLocation = { ...location, sha: location.sha ?? tree.sha };
  const classified = classifyPluginTree(tree.entries, location.path, options.declaredSkills);
  let metadata = parsePluginMetadata(null);
  if (classified.hasMetadata) {
    const url = rawFileUrl(pinned, CLAUDE_PLUGIN_METADATA_PATH);
    if (url) metadata = parsePluginMetadata(await fetchRawJson(url, fetchImpl));
  }
  let fileServers: PluginMcpServerSummary[] = [];
  if (classified.hasMcpFile) {
    const url = rawFileUrl(pinned, CLAUDE_PLUGIN_MCP_PATH);
    const json = url ? await fetchRawJson(url, fetchImpl) : null;
    fileServers =
      json === null
        ? [{ name: CLAUDE_PLUGIN_MCP_PATH, transport: 'unknown' }]
        : parseMcpServers(json);
  }
  const metadataSkills = classifyPluginTree(
    tree.entries,
    location.path,
    metadata.skills,
  ).components;
  const skillNames = new Map<string, string>();
  classified.components.skills.forEach((name, index) => {
    skillNames.set(name, classified.components.skillPaths[index] ?? '');
  });
  metadataSkills.skills.forEach((name, index) => {
    skillNames.set(name, metadataSkills.skillPaths[index] ?? '');
  });
  const skills = [...skillNames.keys()].sort();
  const components: PluginRuntimeComponents = {
    skills,
    skillPaths: skills.map((name) => skillNames.get(name) ?? ''),
    commands: classified.components.commands,
    agents: classified.components.agents,
    hooks: classified.components.hooks || metadata.hooks,
    mcpServers: mergeServers(fileServers, metadata.mcpServers),
    lspServers: [...new Set([...(options.declaredLspServers ?? []), ...metadata.lspServers])],
  };
  return {
    status: 'ok',
    record: {
      key: inspectionKey(location),
      treeSha: tree.sha,
      inspectedAt: new Date((options.now ?? Date.now)()).toISOString(),
      version: metadata.version,
      description: metadata.description,
      components,
    },
  };
}

export interface RuntimeContext {
  inspected: boolean;
  coworkOnly: boolean;
  sourceKnown: boolean;
}

export function runtimeFitFor(
  components: PluginRuntimeComponents,
  context: RuntimeContext,
): PluginRuntimeFit {
  const blocked = (note: string): PluginRuntimeFit => ({
    webInstallable: false,
    inspected: context.inspected,
    components,
    note,
  });
  if (context.coworkOnly) return blocked(RUNTIME_NOTE_COWORK_ONLY);
  if (!context.sourceKnown) return blocked(RUNTIME_NOTE_SOURCE_UNKNOWN);
  if (!context.inspected) return blocked(RUNTIME_NOTE_NOT_INSPECTED);
  if (components.hooks) return blocked(RUNTIME_NOTE_HOOKS);
  if (components.lspServers.length > 0) return blocked(RUNTIME_NOTE_LSP);
  if (
    components.mcpServers.some(
      (server) => server.transport !== MCP_TRANSPORT_HTTP && server.transport !== MCP_TRANSPORT_SSE,
    )
  ) {
    return blocked(RUNTIME_NOTE_STDIO_MCP);
  }
  if (components.skills.length === 0) return blocked(RUNTIME_NOTE_NO_SKILLS);
  return { webInstallable: true, inspected: true, components, note: null };
}
