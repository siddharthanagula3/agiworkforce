import { afterEach, describe, expect, it } from 'vitest';

import {
  OBSERVABILITY_ATTRIBUTE,
  deploymentAttributes,
  resetDeploymentAttributesCache,
} from './attributes';

afterEach(() => {
  resetDeploymentAttributesCache();
});

describe('deployment attributes', () => {
  it('names the build, the deployment, the environment and the region', () => {
    expect(
      deploymentAttributes({
        VERCEL_GIT_COMMIT_SHA: 'c0ffee1234567890abcdef0123456789abcdef01',
        VERCEL_DEPLOYMENT_ID: 'dpl_123',
        VERCEL_ENV: 'production',
        VERCEL_REGION: 'iad1',
      }),
    ).toEqual({
      [OBSERVABILITY_ATTRIBUTE.serviceVersion]: 'c0ffee1234567890abcdef0123456789abcdef01',
      [OBSERVABILITY_ATTRIBUTE.deploymentId]: 'dpl_123',
      [OBSERVABILITY_ATTRIBUTE.deploymentEnvironment]: 'production',
      [OBSERVABILITY_ATTRIBUTE.cloudRegion]: 'iad1',
    });
  });

  it('omits what the host does not set rather than inventing a version', () => {
    expect(deploymentAttributes({ VERCEL_ENV: 'preview' })).toEqual({
      [OBSERVABILITY_ATTRIBUTE.deploymentEnvironment]: 'preview',
    });
  });

  it('rejects a release value that is not a commit', () => {
    const attributes = deploymentAttributes({ AGI_RELEASE_SHA: 'latest' });
    expect(attributes[OBSERVABILITY_ATTRIBUTE.serviceVersion]).toBeUndefined();
  });

  it('cannot be mutated by a caller that merges it into its own attributes', () => {
    const attributes = deploymentAttributes({ VERCEL_ENV: 'production' });
    expect(Object.isFrozen(attributes)).toBe(true);
  });
});
