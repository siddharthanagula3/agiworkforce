import { parseFrontmatter } from '@agiworkforce/skills';
import {
  GITHUB_API_USER_AGENT,
  PLUGIN_DIRECTORY_FETCH_TIMEOUT_MS,
  PLUGIN_DIRECTORY_MAX_SKILLS_PER_INSTALL,
  PLUGIN_DIRECTORY_SKILL_FETCH_CONCURRENCY,
} from './constants';
import { rawFileUrl } from './inspection';
import type { DirectoryFetch } from './official-marketplace';
import type { InstalledDirectorySkill, PluginSourceLocation } from './types';

const SKILL_FILE_SUFFIX = '/SKILL.md';

function skillNameFromPath(path: string): string {
  const withoutFile = path.endsWith(SKILL_FILE_SUFFIX)
    ? path.slice(0, -SKILL_FILE_SUFFIX.length)
    : path;
  const segments = withoutFile.split('/');
  return segments[segments.length - 1] ?? path;
}

function frontmatterString(data: Record<string, unknown>, key: string): string | null {
  const value = data[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function parseSkillFile(path: string, source: string): InstalledDirectorySkill | null {
  let parsed;
  try {
    parsed = parseFrontmatter(source);
  } catch {
    return null;
  }
  const body = parsed.body.trim();
  if (body.length === 0) return null;
  return {
    name: frontmatterString(parsed.data, 'name') ?? skillNameFromPath(path),
    description: frontmatterString(parsed.data, 'description') ?? '',
    body,
    path,
  };
}

async function fetchSkillFile(
  location: PluginSourceLocation,
  path: string,
  fetchImpl: DirectoryFetch,
): Promise<InstalledDirectorySkill | null> {
  const url = rawFileUrl(location, path);
  if (!url) return null;
  try {
    const response = await fetchImpl(url, {
      headers: { 'User-Agent': GITHUB_API_USER_AGENT },
      signal: AbortSignal.timeout(PLUGIN_DIRECTORY_FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return parseSkillFile(path, await response.text());
  } catch {
    return null;
  }
}

export async function fetchPluginSkillFiles(
  location: PluginSourceLocation,
  skillPaths: readonly string[],
  fetchImpl: DirectoryFetch = fetch,
): Promise<InstalledDirectorySkill[]> {
  const paths = skillPaths
    .filter((path) => path.length > 0)
    .slice(0, PLUGIN_DIRECTORY_MAX_SKILLS_PER_INSTALL);
  const results: Array<InstalledDirectorySkill | null> = new Array(paths.length).fill(null);
  let nextIndex = 0;
  const worker = async (): Promise<void> => {
    while (nextIndex < paths.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await fetchSkillFile(location, paths[index]!, fetchImpl);
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.min(PLUGIN_DIRECTORY_SKILL_FETCH_CONCURRENCY, paths.length) },
      worker,
    ),
  );
  const seen = new Set<string>();
  const skills: InstalledDirectorySkill[] = [];
  for (const skill of results) {
    if (!skill || seen.has(skill.name)) continue;
    seen.add(skill.name);
    skills.push(skill);
  }
  return skills;
}
