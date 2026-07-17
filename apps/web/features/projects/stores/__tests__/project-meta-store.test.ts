import { beforeEach, describe, expect, it } from 'vitest';
import { useProjectMetaStore } from '../project-meta-store';

describe('Web project metadata boundary', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useProjectMetaStore.setState({ meta: {} });
  });

  it('does not persist account-owned project preferences in an unscoped browser key', () => {
    useProjectMetaStore.getState().setProjectModel('project-account-a', 'provider-model-id');

    expect(window.localStorage.getItem('agi-project-meta-web')).toBeNull();
  });
});
