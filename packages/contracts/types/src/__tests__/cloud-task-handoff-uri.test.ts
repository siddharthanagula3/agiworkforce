import { describe, expect, it } from 'vitest';
import {
  cloudTaskRepositoryName,
  encodeCloudTaskHandoffQuery,
  parseCloudTaskHandoffQuery,
  type CloudTaskHandoff,
} from '../cloud-task-handoff-uri';

const HANDOFF: CloudTaskHandoff = {
  runId: 'run_12345678',
  goal: 'fix the clock',
  plan: [],
  branch: 'agi/fix-clock',
  repository: 'acme/widgets',
};

describe('cloud task handoff links', () => {
  it('carries the repository the task ran on through the link', () => {
    expect(parseCloudTaskHandoffQuery(encodeCloudTaskHandoffQuery(HANDOFF))).toEqual(HANDOFF);
  });

  it('reads a link without a repository as naming none', () => {
    expect(parseCloudTaskHandoffQuery('runId=run_1&branch=agi%2Ffix')?.repository).toBeNull();
  });

  it('drops a repository that is not owner/name and refuses to encode one', () => {
    expect(parseCloudTaskHandoffQuery('runId=run_1&repo=not-a-repo')?.repository).toBeNull();
    expect(parseCloudTaskHandoffQuery('runId=run_1&repo=a%2Fb%2Fc')?.repository).toBeNull();
    expect(() => encodeCloudTaskHandoffQuery({ ...HANDOFF, repository: 'a/b/c' })).toThrow();
  });

  it('names a repository from its clone URL in lower case', () => {
    expect(cloudTaskRepositoryName('https://github.com/Acme/Widgets.git')).toBe('acme/widgets');
    expect(cloudTaskRepositoryName(null)).toBeNull();
    expect(cloudTaskRepositoryName('widgets')).toBeNull();
  });
});
