const mockStorage = new Map<string, string>();
const mockApiPost = jest.fn();
const mockSignedAppTransaction = jest.fn();
const mockPlatform = { OS: 'ios' };

jest.mock('@/lib/mmkv', () => ({
  storage: {
    getString: (key: string) => mockStorage.get(key) ?? undefined,
    set: (key: string, value: string) => mockStorage.set(key, value),
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

const SIGNED = 'signed-app-transaction-jws';

beforeEach(() => {
  mockStorage.clear();
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
    expect(mockApiPost).toHaveBeenCalledWith('/api/mobile/age-assurance/app-transaction', {
      signedAppTransaction: SIGNED,
    });
  });

  it('sends it again for a different account on the same install', async () => {
    await registerAppTransactionForAccount('user_1');
    await registerAppTransactionForAccount('user_2');

    expect(mockApiPost).toHaveBeenCalledTimes(2);
  });

  it('retries on the next sign-in when the server did not record it', async () => {
    mockApiPost.mockRejectedValueOnce(new Error('network down'));

    await registerAppTransactionForAccount('user_1');
    await registerAppTransactionForAccount('user_1');

    expect(mockApiPost).toHaveBeenCalledTimes(2);
  });

  it('sends nothing on Android, which has no consent-withdrawal notice to match', async () => {
    mockPlatform.OS = 'android';

    await registerAppTransactionForAccount('user_1');

    expect(mockSignedAppTransaction).not.toHaveBeenCalled();
    expect(mockApiPost).not.toHaveBeenCalled();
  });
});
