import * as vscode from 'vscode';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { isSensitiveFile } from '@agiworkforce/utils';
import { Config } from '../platform/config';

export type ContextWithholdReason = 'credential' | 'excluded' | 'gitignored';

const EXCLUDE_SECTIONS = ['files', 'search'] as const;
const GIT_CHECK_TIMEOUT_MS = 3000;
const GIT_PATHS_PER_CHECK = 200;
const CACHED_CHECK_TTL_MS = 10_000;
const CACHED_CHECK_LIMIT = 200;
const IGNORE_CASE = process.platform !== 'linux';

const cachedChecks = new Map<string, { at: number; ignored: Promise<boolean> }>();

function charClass(body: string): string {
  const negated = body.startsWith('!') || body.startsWith('^');
  const members = (negated ? body.slice(1) : body).replace(/\\/gu, '\\\\');
  return `[${negated ? '^' : ''}${members}]`;
}

export function globToRegExp(glob: string): RegExp | undefined {
  let source = '';
  let groupDepth = 0;
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index] ?? '';
    if (char === '*') {
      const double = glob[index + 1] === '*';
      const next = index + (double ? 2 : 1);
      const startsSegment = index === 0 || glob[index - 1] === '/';
      const endsSegment = next === glob.length || glob[next] === '/';
      if (double && startsSegment && endsSegment) {
        source += next === glob.length ? '.*' : '(?:[^/]*/)*';
        index = next === glob.length ? next - 1 : next;
        continue;
      }
      source += '[^/]*';
      index = next - 1;
    } else if (char === '?') {
      source += '[^/]';
    } else if (char === '{') {
      groupDepth += 1;
      source += '(?:';
    } else if (char === '}' && groupDepth > 0) {
      groupDepth -= 1;
      source += ')';
    } else if (char === ',' && groupDepth > 0) {
      source += '|';
    } else if (char === '[' && glob.indexOf(']', index + 2) !== -1) {
      const close = glob.indexOf(']', index + 2);
      source += charClass(glob.slice(index + 1, close));
      index = close;
    } else {
      source += char.replace(/[.+^$()|\\{}[\]]/gu, '\\$&');
    }
  }
  if (groupDepth !== 0) return undefined;
  try {
    return new RegExp(`^${source}$`, IGNORE_CASE ? 'iu' : 'u');
  } catch {
    return undefined;
  }
}

function toPosix(value: string): string {
  return value.replace(/\\/gu, '/');
}

function pathPrefixes(relativePath: string): string[] {
  const segments = relativePath.split('/');
  return segments.map((_, index) => segments.slice(0, index + 1).join('/'));
}

function whenSiblingExists(when: unknown, filePath: string): boolean {
  if (typeof when !== 'string' || when === '') return false;
  const stem = path.parse(filePath).name;
  return existsSync(path.join(path.dirname(filePath), when.split('$(basename)').join(stem)));
}

function matchesExcludeSetting(uri: vscode.Uri, folder: vscode.WorkspaceFolder): boolean {
  const relativePath = toPosix(path.relative(folder.uri.fsPath, uri.fsPath));
  if (relativePath === '' || relativePath.startsWith('../')) return false;
  const candidates = pathPrefixes(relativePath);
  const absolute = toPosix(uri.fsPath);
  for (const section of EXCLUDE_SECTIONS) {
    const setting = vscode.workspace
      .getConfiguration(section, uri)
      .get<Record<string, unknown>>('exclude');
    for (const [pattern, value] of Object.entries(setting ?? {})) {
      const conditional = typeof value === 'object' && value !== null && 'when' in value;
      if (value !== true && !conditional) continue;
      const matcher = globToRegExp(toPosix(pattern));
      if (matcher === undefined) continue;
      if (conditional) {
        const matches = matcher.test(relativePath) || matcher.test(absolute);
        if (matches && whenSiblingExists((value as { when: unknown }).when, uri.fsPath)) {
          return true;
        }
        continue;
      }
      if (
        path.isAbsolute(pattern) ? matcher.test(absolute) : candidates.some((c) => matcher.test(c))
      ) {
        return true;
      }
    }
  }
  return false;
}

export function settingsWithholdReason(filePath: string): ContextWithholdReason | undefined {
  if (isSensitiveFile(filePath)) return 'credential';
  const uri = vscode.Uri.file(filePath);
  const folder = vscode.workspace.getWorkspaceFolder(uri);
  if (folder === undefined) return undefined;
  return matchesExcludeSetting(uri, folder) ? 'excluded' : undefined;
}

function honoursGitIgnore(folder: vscode.WorkspaceFolder): boolean {
  return (
    Config.respectGitIgnore() &&
    vscode.workspace.getConfiguration('search', folder.uri).get<boolean>('useIgnoreFiles', true)
  );
}

function checkIgnore(cwd: string, paths: readonly string[]): Promise<Set<string> | undefined> {
  return new Promise((resolve) => {
    execFile(
      'git',
      ['check-ignore', '--no-index', '-z', '--', ...paths],
      { cwd, timeout: GIT_CHECK_TIMEOUT_MS, windowsHide: true },
      (error, stdout) => {
        if (error === null) {
          resolve(
            new Set(
              String(stdout)
                .split('\0')
                .filter((entry) => entry !== ''),
            ),
          );
          return;
        }
        const code = (error as { code?: unknown }).code;
        resolve(code === 1 || code === 128 || code === 'ENOENT' ? new Set() : undefined);
      },
    );
  });
}

export async function gitIgnoredPaths(uris: readonly vscode.Uri[]): Promise<Set<string>> {
  const ignored = new Set<string>();
  if (!vscode.workspace.isTrusted) return ignored;
  const byFolder = new Map<string, { root: string; files: Map<string, string> }>();
  for (const uri of uris) {
    if (uri.scheme !== 'file') continue;
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    if (folder === undefined || !honoursGitIgnore(folder)) continue;
    const relativePath = toPosix(path.relative(folder.uri.fsPath, uri.fsPath));
    if (relativePath === '' || relativePath.startsWith('../')) continue;
    const group = byFolder.get(folder.uri.fsPath) ?? {
      root: folder.uri.fsPath,
      files: new Map<string, string>(),
    };
    group.files.set(relativePath, uri.fsPath);
    byFolder.set(folder.uri.fsPath, group);
  }
  for (const { root, files } of byFolder.values()) {
    const relativePaths = [...files.keys()];
    for (let start = 0; start < relativePaths.length; start += GIT_PATHS_PER_CHECK) {
      const chunk = relativePaths.slice(start, start + GIT_PATHS_PER_CHECK);
      const matched = await checkIgnore(root, chunk);
      for (const relativePath of chunk) {
        if (matched === undefined || matched.has(relativePath)) {
          ignored.add(files.get(relativePath) ?? relativePath);
        }
      }
    }
  }
  return ignored;
}

export async function isGitIgnored(filePath: string): Promise<boolean> {
  const uri = vscode.Uri.file(filePath);
  return (await gitIgnoredPaths([uri])).has(uri.fsPath);
}

export function isGitIgnoredCached(filePath: string): Promise<boolean> {
  const now = Date.now();
  const cached = cachedChecks.get(filePath);
  if (cached !== undefined && now - cached.at < CACHED_CHECK_TTL_MS) return cached.ignored;
  const ignored = isGitIgnored(filePath);
  if (cachedChecks.size >= CACHED_CHECK_LIMIT) cachedChecks.clear();
  cachedChecks.set(filePath, { at: now, ignored });
  return ignored;
}

export function clearGitIgnoreCache(): void {
  cachedChecks.clear();
}
