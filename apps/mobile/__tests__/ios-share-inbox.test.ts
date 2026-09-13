import { AppState, NativeModules, Platform, type AppStateStatus } from 'react-native';
import {
  consumeIOSPendingShares,
  normalizePendingShare,
  subscribeToIOSShareInbox,
  type IOSPendingShare,
} from '../src/features/share-preview/iosShareInbox';

const originalOS = Platform.OS;
const originalModule = NativeModules.AGIShareInbox;

function setPlatform(os: 'ios' | 'android') {
  Object.defineProperty(Platform, 'OS', { get: () => os, configurable: true });
}

afterEach(() => {
  Object.defineProperty(Platform, 'OS', { get: () => originalOS, configurable: true });
  NativeModules.AGIShareInbox = originalModule;
  jest.restoreAllMocks();
});

describe('iOS Share App Group inbox', () => {
  it('is a no-op on Android', async () => {
    setPlatform('android');
    const consumePendingShares = jest.fn();
    NativeModules.AGIShareInbox = { consumePendingShares };

    await expect(consumeIOSPendingShares()).resolves.toBeNull();
    expect(consumePendingShares).not.toHaveBeenCalled();
  });

  it('normalizes a native aggregate for the in-app review screen', async () => {
    setPlatform('ios');
    NativeModules.AGIShareInbox = {
      consumePendingShares: jest.fn().mockResolvedValue({
        text: 'Shared draft',
        truncated: true,
        count: 2,
      }),
    };

    await expect(consumeIOSPendingShares()).resolves.toEqual({
      text: 'Shared draft',
      truncated: true,
      count: 2,
      files: [],
    });
  });

  it('keeps the shared files the native payload staged', () => {
    expect(
      normalizePendingShare({
        text: '',
        truncated: false,
        count: 1,
        files: [
          {
            uri: 'file:///caches/AGISharedInbox/abc-photo.jpg',
            fileName: 'photo.jpg',
            mimeType: 'image/jpeg',
            byteSize: 2048,
          },
        ],
      }),
    ).toEqual({
      text: '',
      truncated: false,
      count: 1,
      files: [
        {
          uri: 'file:///caches/AGISharedInbox/abc-photo.jpg',
          fileName: 'photo.jpg',
          mimeType: 'image/jpeg',
          byteSize: 2048,
        },
      ],
    });
  });

  it('drops a file the native side could not describe as a readable local copy', () => {
    const share = normalizePendingShare({
      text: 'Read this',
      truncated: false,
      count: 1,
      files: [
        {
          uri: 'https://example.com/remote.pdf',
          fileName: 'remote.pdf',
          mimeType: 'application/pdf',
        },
        { uri: 'file:///caches/AGISharedInbox/doc.pdf', fileName: '', mimeType: 'application/pdf' },
        { uri: 'file:///caches/AGISharedInbox/ok.pdf', fileName: 'ok.pdf', mimeType: '' },
      ],
    });

    expect(share?.files).toEqual([
      {
        uri: 'file:///caches/AGISharedInbox/ok.pdf',
        fileName: 'ok.pdf',
        mimeType: 'application/octet-stream',
      },
    ]);
  });

  it('is nothing to review when neither text nor a file survived', () => {
    expect(
      normalizePendingShare({ text: '   ', truncated: false, count: 1, files: [] }),
    ).toBeNull();
    expect(normalizePendingShare(null)).toBeNull();
  });

  it('consumes on subscription and each active foreground without overlap', async () => {
    setPlatform('ios');
    const payload: IOSPendingShare = { text: 'Review me', truncated: false, count: 1, files: [] };
    let resolveFirst: ((value: IOSPendingShare) => void) | undefined;
    const consumePendingShares = jest
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<IOSPendingShare>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce(payload);
    NativeModules.AGIShareInbox = { consumePendingShares };

    let appStateListener: ((state: AppStateStatus) => void) | undefined;
    const remove = jest.fn();
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
      appStateListener = listener;
      return { remove };
    });
    const onShare = jest.fn();
    const onError = jest.fn();

    const unsubscribe = subscribeToIOSShareInbox(onShare, onError);
    appStateListener?.('active');
    expect(consumePendingShares).toHaveBeenCalledTimes(1);

    resolveFirst?.(payload);
    await Promise.resolve();
    await Promise.resolve();
    expect(onShare).toHaveBeenCalledWith(payload);

    appStateListener?.('active');
    await Promise.resolve();
    await Promise.resolve();
    expect(consumePendingShares).toHaveBeenCalledTimes(2);
    expect(onError).not.toHaveBeenCalled();

    unsubscribe();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
