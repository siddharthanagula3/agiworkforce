import { describe, expect, it } from 'vitest';
import { GITHUB_RECONNECT_REQUIRED_REASON } from '../github-installation-access';
import { GitHubWriteAccessError, assertRepositoryIsWritable } from '../github-write-access';

describe('assertRepositoryIsWritable', () => {
  it('allows a repository the linking account can push to, whatever the case', () => {
    expect(() => assertRepositoryIsWritable(7, ['acme/app'], 'Acme/App')).not.toThrow();
  });

  it('refuses a link that never recorded the set instead of reading it as everything', () => {
    for (const unrecorded of [null, undefined]) {
      const failure = (() => {
        try {
          assertRepositoryIsWritable(7, unrecorded, 'acme/app');
        } catch (error) {
          return error;
        }
        return null;
      })();
      expect(failure).toBeInstanceOf(GitHubWriteAccessError);
      expect(failure).toMatchObject({
        recorded: false,
        reason: GITHUB_RECONNECT_REQUIRED_REASON,
        message: expect.stringMatching(/^Reconnect GitHub to push or open pull requests/),
      });
    }
  });

  it('refuses a repository outside the recorded set and names it', () => {
    expect(() => assertRepositoryIsWritable(7, ['acme/other'], 'Acme/App')).toThrow(
      /Your GitHub account cannot push to Acme\/App/,
    );
    expect(() => assertRepositoryIsWritable(7, [], 'acme/app')).toThrow(GitHubWriteAccessError);
  });
});
