const mockStorage = new Map<string, string>();
const mockApiPost = jest.fn();
const mockSignedAppTransaction = jest.fn();
const mockPlatform = { OS: 'ios' };

jest.mock('@/lib/mmkv', () => ({
  storage: {
    getString: (key: string) => mockStorage.get(key) ?? undefined,
    set: (key: string, value: string) => mockStorage.set(key, value),
    delete: (key: string) => mockStorage.delete(key),
  },
}));

jest.mock('@/services/api', () => ({
  api: { post: (...args: unknown[]) => mockApiPost(...args) },
}));

jest.mock('react-native', () => ({
  get Platform() {
    return mockPlatform;
  },
  NativeModules: {
    AGIAppTransaction: { signedAppTransaction: () => mockSignedAppTransaction() },
  },
}));

import { registerAppTransactionForAccount } from '../appTransaction';
import {
  activateCloudAccount,
  captureCloudAccountEpoch,
  invalidateCloudAccount,
  __resetCloudAccountSessionForTests,
} from '@/src/features/auth/services/cloudAccountSession';

const SIGNED = 'signed-app-transaction-jws';
const MARKER_PREFIX = 'age-assurance:app-transaction:v2:';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  mockStorage.clear();
  __resetCloudAccountSessionForTests();
  activateCloudAccount('user_1');
  mockApiPost.mockReset().mockResolvedValue({ registered: true, consentWithdrawn: false });
  mockSignedAppTransaction.mockReset().mockResolvedValue(SIGNED);
  mockPlatform.OS = 'ios';
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('registerAppTransactionForAccount', () => {
  it('sends the signed app transaction once per account on this install', async () => {
    await registerAppTransactionForAccount('user_1');
    await registerAppTransactionForAccount('user_1');

    expect(mockApiPost).toHaveBeenCalledTimes(1);
    expect(mockApiPost).toHaveBeenCalledWith(
      '/api/mobile/age-assurance/app-transaction',
      { signedAppTransaction: SIGNED },
      { accountEpoch: captureCloudAccountEpoch() },
    );
    expect(mockStorage.has(`${MARKER_PREFIX}user_1`)).toBe(true);
  });

  it('sends it again for a different account on the same install', async () => {
    await registerAppTransactionForAccount('user_1');
    activateCloudAccount('user_2');
    await registerAppTransactionForAccount('user_2');

    expect(mockApiPost).toHaveBeenCalledTimes(2);
  });

  it('retries on the next sign-in when the server did not record it', async () => {
    mockApiPost.mockRejectedValueOnce(new Error('network down'));

    await registerAppTransactionForAccount('user_1');
    await registerAppTransactionForAccount('user_1');

    expect(mockApiPost).toHaveBeenCalledTimes(2);
  });

  it('re-registers an old marker once instead of trusting prior ownership', async () => {
    mockStorage.set('age-assurance:app-transaction:v1:user_1', 'old-marker');

    await registerAppTransactionForAccount('user_1');
    await registerAppTransactionForAccount('user_1');

    expect(mockApiPost).toHaveBeenCalledTimes(1);
    expect(mockStorage.has(`${MARKER_PREFIX}user_1`)).toBe(true);
    expect(mockStorage.get('age-assurance:app-transaction:v1:user_1')).toBe('old-marker');
  });

  it('does not start native preparation for a different or absent account', async () => {
    await registerAppTransactionForAccount('user_2');
    invalidateCloudAccount();
    await registerAppTransactionForAccount('user_1');

    expect(mockSignedAppTransaction).not.toHaveBeenCalled();
    expect(mockApiPost).not.toHaveBeenCalled();
  });

  it.each(['switch', 'round-trip', 'sign-out'])(
    'discards delayed native preparation after an account %s and permits a later retry',
    async (transition) => {
      const native = deferred<string>();
      mockSignedAppTransaction.mockReturnValueOnce(native.promise);
      const pending = registerAppTransactionForAccount('user_1');
      if (transition === 'sign-out') invalidateCloudAccount();
      else {
        activateCloudAccount('user_2');
        if (transition === 'round-trip') activateCloudAccount('user_1');
      }
      native.resolve(SIGNED);
      await pending;

      expect(mockApiPost).not.toHaveBeenCalled();
      expect(mockStorage.has(`${MARKER_PREFIX}user_1`)).toBe(false);
      expect(mockStorage.has(`${MARKER_PREFIX}user_2`)).toBe(false);
      activateCloudAccount('user_1');
      await registerAppTransactionForAccount('user_1');
      expect(mockApiPost).toHaveBeenCalledTimes(1);
      expect(mockStorage.has(`${MARKER_PREFIX}user_1`)).toBe(true);
    },
  );

  it('does not persist a late request receipt even after the same account returns', async () => {
    const entered = deferred<void>();
    const receipt = deferred<{ registered: boolean; consentWithdrawn: boolean }>();
    mockApiPost.mockImplementationOnce(() => { entered.resolve(); return receipt.promise; });
    const account = captureCloudAccountEpoch();
    const pending = registerAppTransactionForAccount('user_1');
    await entered.promise;
    activateCloudAccount('user_2');
    activateCloudAccount('user_1');
    receipt.resolve({ registered: true, consentWithdrawn: false });
    await pending;

    expect(mockApiPost).toHaveBeenCalledWith(
      '/api/mobile/age-assurance/app-transaction',
      { signedAppTransaction: SIGNED },
      { accountEpoch: account },
    );
    expect(mockStorage.has(`${MARKER_PREFIX}user_1`)).toBe(false);
    await registerAppTransactionForAccount('user_1');
    expect(mockApiPost).toHaveBeenCalledTimes(2);
    expect(mockStorage.has(`${MARKER_PREFIX}user_1`)).toBe(true);
  });

  it('sends nothing on Android, which has no consent-withdrawal notice to match', async () => {
    mockPlatform.OS = 'android';

    await registerAppTransactionForAccount('user_1');

    expect(mockSignedAppTransaction).not.toHaveBeenCalled();
    expect(mockApiPost).not.toHaveBeenCalled();
  });
});
