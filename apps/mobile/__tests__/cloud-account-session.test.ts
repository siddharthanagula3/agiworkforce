jest.mock('../lib/mmkv', () => ({
  storage: {
    getString: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { storage: mockStorage } = require('../lib/mmkv') as {
  storage: {
    getString: jest.Mock;
    set: jest.Mock;
    delete: jest.Mock;
  };
};

import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
  captureCloudAccountEpoch,
  invalidateCloudAccount,
  isCloudAccountEpochCurrent,
} from '../src/features/auth/services/cloudAccountSession';

describe('Cloud account owner and epoch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStorage.getString.mockReturnValue(undefined);
    __resetCloudAccountSessionForTests();
  });

  it('preserves same-owner cache but invalidates account A before account B', () => {
    mockStorage.getString.mockReturnValue('user-a');

    expect(activateCloudAccount('user-a')).toEqual({
      ownerId: 'user-a',
      previousOwnerId: 'user-a',
      changed: false,
    });
    const accountAEpoch = captureCloudAccountEpoch();
    expect(accountAEpoch).not.toBeNull();
    expect(isCloudAccountEpochCurrent(accountAEpoch)).toBe(true);

    expect(activateCloudAccount('user-b')).toEqual({
      ownerId: 'user-b',
      previousOwnerId: 'user-a',
      changed: true,
    });
    expect(isCloudAccountEpochCurrent(accountAEpoch)).toBe(false);
    expect(mockStorage.set).toHaveBeenLastCalledWith('cloud-cache-owner-id', 'user-b');
  });

  it('fails closed when legacy persisted Cloud caches have no owner key', () => {
    mockStorage.getString.mockReturnValue(undefined);

    expect(activateCloudAccount('user-a')).toEqual({
      ownerId: 'user-a',
      previousOwnerId: null,
      changed: true,
    });
    expect(mockStorage.set).toHaveBeenCalledWith('cloud-cache-owner-id', 'user-a');
  });

  it('invalidates in-flight work and removes the persisted owner on expiry', () => {
    mockStorage.getString.mockReturnValue('user-a');
    activateCloudAccount('user-a');
    const accountAEpoch = captureCloudAccountEpoch();

    invalidateCloudAccount();

    expect(captureCloudAccountEpoch()).toBeNull();
    expect(isCloudAccountEpochCurrent(accountAEpoch)).toBe(false);
    expect(mockStorage.delete).toHaveBeenCalledWith('cloud-cache-owner-id');
  });

  it('rejects an empty Clerk user id instead of creating an ownerless session', () => {
    expect(() => activateCloudAccount('   ')).toThrow('non-empty Clerk user id');
    expect(mockStorage.set).not.toHaveBeenCalled();
  });
});
