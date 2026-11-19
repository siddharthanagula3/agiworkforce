import { describe, expect, it } from 'vitest';
import {
  createOwnedProjectCatalog,
  readStoredActiveProject,
} from '../src/features/side-panel/activeProject';

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

describe('owned project catalog', () => {
  const successor = { accountId: 'successor', authIncarnation: 'session' };

  it('serves the catalog only to the owner that produced it', () => {
    const catalog = createOwnedProjectCatalog();
    catalog.set(owner, [project]);
    expect(catalog.read(owner)).toEqual([project]);
    expect(catalog.read(successor)).toEqual([]);
    expect(catalog.read({ ...owner, authIncarnation: 'other' })).toEqual([]);
    expect(catalog.read(null)).toEqual([]);
  });

  it('replaces the previous owner catalog instead of merging it', () => {
    const catalog = createOwnedProjectCatalog();
    catalog.set(owner, [project]);
    catalog.set(successor, []);
    expect(catalog.read(owner)).toEqual([]);
    expect(catalog.read(successor)).toEqual([]);
  });

  it('retains nothing for a missing owner and nothing after clear', () => {
    const catalog = createOwnedProjectCatalog();
    catalog.set(null, [project]);
    expect(catalog.read(null)).toEqual([]);
    catalog.set(owner, [project]);
    catalog.clear();
    expect(catalog.read(owner)).toEqual([]);
  });
});
