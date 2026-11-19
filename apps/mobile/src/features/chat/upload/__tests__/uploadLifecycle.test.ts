import {
  isResumable,
  isUploadInFlight,
  uploadStatusLabel,
  useUploadLifecycleStore,
} from '@/src/features/chat/upload/uploadLifecycle';

const ID = 'att-1';

function entry() {
  return useUploadLifecycleStore.getState().uploads[ID];
}

beforeEach(() => {
  useUploadLifecycleStore.getState().reset();
});

describe('the verifying phase', () => {
  it('starts when every byte is sent and holds the bar at 100 percent', () => {
    const store = useUploadLifecycleStore.getState();
    store.begin(ID);
    store.reportProgress(ID, 50, 100);
    expect(entry()).toMatchObject({ phase: 'uploading', progress: 0.5 });
    expect(uploadStatusLabel(entry())).toBe('Uploading 50%');

    store.reportProgress(ID, 100, 100);

    expect(entry()).toMatchObject({ phase: 'verifying', progress: 1 });
    expect(uploadStatusLabel(entry())).toBe('Verifying');
    expect(isUploadInFlight(entry())).toBe(true);
    expect(isResumable(entry())).toBe(false);
  });

  it('ignores progress readings that arrive while the server confirms', () => {
    const store = useUploadLifecycleStore.getState();
    store.begin(ID);
    store.reportProgress(ID, 100, 100);
    store.reportProgress(ID, 10, 100);

    expect(entry()).toMatchObject({ phase: 'verifying', progress: 1 });
  });

  it('can still be canceled, and is marked interrupted when the app leaves the foreground', () => {
    const store = useUploadLifecycleStore.getState();
    store.begin(ID);
    store.reportProgress(ID, 100, 100);
    store.markBackgrounded();
    expect(entry()?.interrupted).toBe(true);

    store.cancel(ID);

    expect(entry()?.phase).toBe('canceled');
    expect(isResumable(entry())).toBe(true);
  });

  it('settles done or failed after verifying', () => {
    const store = useUploadLifecycleStore.getState();
    store.begin(ID);
    store.reportProgress(ID, 100, 100);
    store.settle(ID, 'failed', 'The server did not confirm the file.');
    expect(entry()).toMatchObject({
      phase: 'failed',
      error: 'The server did not confirm the file.',
    });

    store.begin(ID);
    store.reportProgress(ID, 100, 100);
    store.settle(ID, 'done');
    expect(entry()).toMatchObject({ phase: 'done', progress: 1 });
  });
});
