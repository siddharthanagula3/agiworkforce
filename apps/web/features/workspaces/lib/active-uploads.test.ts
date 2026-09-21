import { beforeEach, describe, expect, it } from 'vitest';
import { beginActiveUpload, useActiveUploadStore } from './active-uploads';

beforeEach(() => useActiveUploadStore.setState({ uploads: [] }));

describe('active uploads', () => {
  it('reports an upload while it runs and forgets it once released', () => {
    const release = beginActiveUpload('quarterly-report.pdf');

    expect(useActiveUploadStore.getState().uploads).toEqual([
      { id: expect.any(String), label: 'quarterly-report.pdf' },
    ]);

    release();

    expect(useActiveUploadStore.getState().uploads).toEqual([]);
  });

  it('tracks concurrent uploads separately so one release cannot clear the rest', () => {
    const releaseFirst = beginActiveUpload('one.pdf');
    beginActiveUpload('two.pdf');

    releaseFirst();

    expect(useActiveUploadStore.getState().uploads.map((upload) => upload.label)).toEqual([
      'two.pdf',
    ]);
  });

  it('ignores a release called twice', () => {
    const release = beginActiveUpload('one.pdf');
    beginActiveUpload('two.pdf');

    release();
    release();

    expect(useActiveUploadStore.getState().uploads).toHaveLength(1);
  });
});
