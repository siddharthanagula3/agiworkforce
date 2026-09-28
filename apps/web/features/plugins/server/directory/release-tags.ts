import 'server-only';

import { rcompare, satisfies, valid } from 'semver';

import type { PluginVersionConstraint } from '@/lib/services/plugin-dependencies';

import {
  GITHUB_API_ACCEPT,
  GITHUB_API_BASE_URL,
  GITHUB_API_USER_AGENT,
  GITHUB_TOKEN_ENV_VAR,
  PLUGIN_DIRECTORY_FETCH_TIMEOUT_MS,
} from './constants';
import { parseGithubRepository, type DirectoryFetch } from './official-marketplace';

const TAG_REF_PREFIX = 'refs/tags/';
const RELEASE_TAG_VERSION_SEPARATOR = '--v';

export type ReleaseTagLookup =
  { status: 'found'; tag: string } | { status: 'none' } | { status: 'unavailable' };

export async function releaseTagSatisfying(
  repositoryUrl: string,
  pluginName: string,
  constraints: readonly PluginVersionConstraint[],
  fetchImpl: DirectoryFetch,
): Promise<ReleaseTagLookup> {
  const repository = parseGithubRepository(repositoryUrl);
  if (!repository) return { status: 'unavailable' };
  const tagPrefix = `${pluginName}${RELEASE_TAG_VERSION_SEPARATOR}`;
  const token = process.env[GITHUB_TOKEN_ENV_VAR];
  let refs: unknown;
  try {
    const response = await fetchImpl(
      `${GITHUB_API_BASE_URL}/repos/${repository.owner}/${repository.repo}/git/matching-refs/tags/${encodeURIComponent(tagPrefix)}`,
      {
        headers: {
          'User-Agent': GITHUB_API_USER_AGENT,
          Accept: GITHUB_API_ACCEPT,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal: AbortSignal.timeout(PLUGIN_DIRECTORY_FETCH_TIMEOUT_MS),
      },
    );
    if (!response.ok) return { status: 'unavailable' };
    refs = await response.json();
  } catch {
    return { status: 'unavailable' };
  }
  if (!Array.isArray(refs)) return { status: 'unavailable' };

  const prefix = `${TAG_REF_PREFIX}${tagPrefix}`;
  const versions = refs.flatMap((entry: unknown) => {
    const ref = (entry as { ref?: unknown } | null)?.ref;
    if (typeof ref !== 'string' || !ref.startsWith(prefix)) return [];
    const version = valid(ref.slice(prefix.length));
    if (!version) return [];
    return constraints.every((constraint) => satisfies(version, constraint.range)) ? [version] : [];
  });
  const [highest] = versions.sort(rcompare);
  return highest ? { status: 'found', tag: `${tagPrefix}${highest}` } : { status: 'none' };
}
