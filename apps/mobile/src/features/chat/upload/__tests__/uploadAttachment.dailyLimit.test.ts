const mockUploadFile = jest.fn();
jest.mock('@/services/api', () => ({
  api: { uploadFile: (...args: unknown[]) => mockUploadFile(...args) },
}));

jest.mock('@/services/llmGate', () => ({
  ensureCloudSendConsent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/src/features/auth/services/cloudAccountSession', () => ({
  captureCloudAccountEpoch: () => ({ ownerId: 'account-a', epoch: 1 }),
  isCloudAccountEpochCurrent: () => true,
}));

import { ApiHttpError } from '@/services/apiErrors';
import { DAILY_UPLOAD_LIMIT_CODE, DAILY_UPLOAD_LIMIT_MESSAGE } from '@/services/failureCopy';
import { uploadWithRetry } from '../uploadAttachment';
import { useUploadLifecycleStore } from '../uploadLifecycle';

const SERVER_MESSAGE =
  'Free accounts can upload 5 files a day, and today’s are used. Upload more after midnight UTC, or upgrade for more.';

const FILE = { uri: 'file:///cache/notes.txt', name: 'notes.txt', type: 'text/plain' };

function dailyLimitRefusal(message = SERVER_MESSAGE): ApiHttpError {
  return new ApiHttpError(message, 429, null, {
    body: {
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message,
        details: { code: DAILY_UPLOAD_LIMIT_CODE },
      },
    },
  });
}

describe('uploadWithRetry when the day’s uploads are spent', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    useUploadLifecycleStore.getState().reset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('settles at once with the server’s message and without its upgrade sentence', async () => {
    mockUploadFile.mockRejectedValue(dailyLimitRefusal());

    const result = await uploadWithRetry(FILE, 'notes.txt', 'a-1');

    expect(result).toBeNull();
    expect(mockUploadFile).toHaveBeenCalledTimes(1);
    const entry = useUploadLifecycleStore.getState().uploads['a-1'];
    expect(entry?.phase).toBe('failed');
    expect(entry?.error).toBe(
      'Free accounts can upload 5 files a day, and today’s are used. Upload more after midnight UTC.',
    );
    expect(entry?.error).not.toMatch(/upgrade|connection/i);
  });

  it('reads the code from the top level of the refusal too', async () => {
    mockUploadFile.mockRejectedValue(
      new ApiHttpError(SERVER_MESSAGE, 429, DAILY_UPLOAD_LIMIT_CODE),
    );

    await uploadWithRetry(FILE, 'notes.txt', 'a-2');

    expect(mockUploadFile).toHaveBeenCalledTimes(1);
    expect(useUploadLifecycleStore.getState().uploads['a-2']?.phase).toBe('failed');
  });

  it('says when uploads open again if the server’s whole message was about buying more', async () => {
    mockUploadFile.mockRejectedValue(dailyLimitRefusal('Upgrade your plan to upload more files.'));

    await uploadWithRetry(FILE, 'notes.txt', 'a-3');

    expect(useUploadLifecycleStore.getState().uploads['a-3']?.error).toBe(
      DAILY_UPLOAD_LIMIT_MESSAGE,
    );
  });

  it('still retries a 429 that is only a rate limit', async () => {
    mockUploadFile.mockRejectedValue(new ApiHttpError('Too many requests', 429));

    const pending = uploadWithRetry(FILE, 'notes.txt', 'a-4');
    await jest.runAllTimersAsync();
    await pending;

    expect(mockUploadFile).toHaveBeenCalledTimes(3);
    expect(useUploadLifecycleStore.getState().uploads['a-4']?.error).toMatch(/connection/i);
  });
});
