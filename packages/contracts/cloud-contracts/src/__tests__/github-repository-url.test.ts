import { describe, expect, it } from 'vitest';
import {
  canonicalGitHubRepositoryBranch,
  canonicalGitHubRepositoryUrl,
} from '../github-repository-url';

describe('canonicalGitHubRepositoryUrl', () => {
  it('accepts an https GitHub repository and stores the clone form', () => {
    expect(canonicalGitHubRepositoryUrl('https://github.com/owner/repository')).toEqual({
      ok: true,
      url: 'https://github.com/owner/repository.git',
    });
  });

  it('accepts a trailing slash and a .git suffix, including both together', () => {
    expect(canonicalGitHubRepositoryUrl('https://github.com/owner/repository/')).toEqual({
      ok: true,
      url: 'https://github.com/owner/repository.git',
    });
    expect(canonicalGitHubRepositoryUrl('https://github.com/owner/repository.git')).toEqual({
      ok: true,
      url: 'https://github.com/owner/repository.git',
    });
    expect(canonicalGitHubRepositoryUrl('https://github.com/owner/repository.git/')).toEqual({
      ok: true,
      url: 'https://github.com/owner/repository.git',
    });
  });

  it('rejects an empty string, a non-GitHub site, and a URL that is not owner/name', () => {
    expect(canonicalGitHubRepositoryUrl('')).toEqual({ ok: false, reason: 'invalid' });
    expect(canonicalGitHubRepositoryUrl('https://example.com/owner/repository')).toEqual({
      ok: false,
      reason: 'unsupported',
    });
    expect(canonicalGitHubRepositoryUrl('https://github.com/owner/repository/tree/main')).toEqual({
      ok: false,
      reason: 'unsupported',
    });
    expect(canonicalGitHubRepositoryUrl('not a url')).toEqual({ ok: false, reason: 'invalid' });
  });

  it('rejects credentials, a query, and a URL past the length ceiling', () => {
    expect(canonicalGitHubRepositoryUrl('https://user:token@github.com/owner/repository')).toEqual({
      ok: false,
      reason: 'unsupported',
    });
    expect(canonicalGitHubRepositoryUrl('https://github.com/owner/repository?ref=main')).toEqual({
      ok: false,
      reason: 'unsupported',
    });
    expect(canonicalGitHubRepositoryUrl(`https://github.com/${'a'.repeat(500)}`)).toEqual({
      ok: false,
      reason: 'length',
    });
  });
});

describe('canonicalGitHubRepositoryBranch', () => {
  it('treats an empty branch as the repository default', () => {
    expect(canonicalGitHubRepositoryBranch('  ')).toEqual({ ok: true, branch: null });
  });

  it('keeps a plain ref and rejects one git could read as an option', () => {
    expect(canonicalGitHubRepositoryBranch('release/1.2')).toEqual({
      ok: true,
      branch: 'release/1.2',
    });
    expect(canonicalGitHubRepositoryBranch('--upload-pack=touch')).toEqual({ ok: false });
    expect(canonicalGitHubRepositoryBranch('feature..lock')).toEqual({ ok: false });
  });
});
