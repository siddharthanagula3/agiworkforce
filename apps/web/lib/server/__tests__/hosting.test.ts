import { describe, expect, it } from 'vitest';

import {
  HOSTING_ENV_VARS,
  deployEnvironment,
  deployRegion,
  deploymentId,
  isPlatformHosted,
  releaseSha,
} from '../hosting';

const COMMIT = 'a'.repeat(40);
const OTHER_COMMIT = 'b'.repeat(7);

describe('releaseSha', () => {
  it('prefers the neutral name over the platform names', () => {
    expect(
      releaseSha({
        AGI_RELEASE_SHA: COMMIT,
        VERCEL_GIT_COMMIT_SHA: OTHER_COMMIT,
        GITHUB_SHA: OTHER_COMMIT,
      }),
    ).toBe(COMMIT);
  });

  it('falls back through the platform names in order', () => {
    expect(releaseSha({ VERCEL_GIT_COMMIT_SHA: COMMIT, GITHUB_SHA: OTHER_COMMIT })).toBe(COMMIT);
    expect(releaseSha({ GITHUB_SHA: OTHER_COMMIT })).toBe(OTHER_COMMIT);
  });

  it('skips a value that is not a commit sha', () => {
    expect(releaseSha({ AGI_RELEASE_SHA: 'not-a-sha', GITHUB_SHA: COMMIT })).toBe(COMMIT);
    expect(releaseSha({})).toBeUndefined();
  });
});

describe('deployment facts', () => {
  it('prefers the neutral names', () => {
    const env = {
      AGI_DEPLOY_REGION: 'neutral-region',
      VERCEL_REGION: 'platform-region',
      AGI_DEPLOY_ENV: 'preview',
      VERCEL_ENV: 'production',
      AGI_DEPLOYMENT_ID: 'neutral-id',
      VERCEL_DEPLOYMENT_ID: 'platform-id',
    };

    expect(deployRegion(env)).toBe('neutral-region');
    expect(deployEnvironment(env)).toBe('preview');
    expect(deploymentId(env)).toBe('neutral-id');
  });

  it('falls back to the platform names', () => {
    const env = {
      VERCEL_REGION: 'platform-region',
      VERCEL_ENV: 'production',
      VERCEL_DEPLOYMENT_ID: 'platform-id',
    };

    expect(deployRegion(env)).toBe('platform-region');
    expect(deployEnvironment(env)).toBe('production');
    expect(deploymentId(env)).toBe('platform-id');
  });

  it('treats blank and unset alike', () => {
    expect(deployEnvironment({ AGI_DEPLOY_ENV: '   ', VERCEL_ENV: 'production' })).toBe(
      'production',
    );
    expect(deployRegion({})).toBeUndefined();
    expect(deploymentId({})).toBeUndefined();
  });
});

describe('isPlatformHosted', () => {
  it('is true when any platform marker is present', () => {
    for (const name of HOSTING_ENV_VARS.platformMarker) {
      expect(isPlatformHosted({ [name]: '1' })).toBe(true);
    }
  });

  it('is false in a container that sets only neutral names', () => {
    expect(
      isPlatformHosted({
        AGI_DEPLOY_ENV: 'preview',
        AGI_DEPLOY_REGION: 'local',
        AGI_RELEASE_SHA: COMMIT,
      }),
    ).toBe(false);
  });
});
