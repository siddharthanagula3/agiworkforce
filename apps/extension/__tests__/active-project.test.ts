import { describe, expect, it } from 'vitest';
import { readStoredActiveProject } from '../src/features/side-panel/activeProject';

const owner = { accountId: 'account', authIncarnation: 'session' };
const project = { id: 'project', name: 'Owned project' };

describe('stored active project ownership', () => {
  it('restores the selection of the same authenticated session', () => {
    expect(readStoredActiveProject({ owner, project }, owner)).toEqual(project);
  });

  it.each([
    project,
    { owner: { ...owner, accountId: 'other' }, project },
    { owner: { ...owner, authIncarnation: 'other' }, project },
    { owner, project: null },
    { owner, project: { id: '', name: 'Invalid' } },
    { owner, project: { id: 'project', name: '' } },
    null,
    [],
  ])('ignores legacy, foreign and malformed preferences %#', (stored) => {
    expect(readStoredActiveProject(stored, owner)).toBeNull();
  });
});
