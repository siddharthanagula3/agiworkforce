/* eslint-disable @typescript-eslint/no-require-imports */
jest.mock('expo-file-system/legacy', () => ({ cacheDirectory: 'file:///caches/' }));

import type { AppStateStatus } from 'react-native';

type InboxApi = typeof import('@/src/features/share-preview/iosShareInbox');
type SettlementApi = typeof import('@/src/features/share-preview/shareReceiptSettlement');

const RECEIPT_A = '1757000000000-0F8E2C1A-1B2C-4D5E-8F90-123456789ABC';
const RECEIPT_B = '1757000000001-1F8E2C1A-1B2C-4D5E-8F90-123456789ABC';

interface Loaded {
  inbox: InboxApi;
  settlement: SettlementApi;
  setAppStateListener: () => { emit: (state: AppStateStatus) => void; remove: jest.Mock };
}

function load(os: 'ios' | 'android', native: Record<string, jest.Mock>): Loaded {
  jest.resetModules();
  const rn = require('react-native') as typeof import('react-native');
  Object.defineProperty(rn.Platform, 'OS', { get: () => os, configurable: true });
  rn.NativeModules.AGIShareInbox = native;
  return {
    inbox: require('@/src/features/share-preview/iosShareInbox') as InboxApi,
    settlement: require('@/src/features/share-preview/shareReceiptSettlement') as SettlementApi,
    setAppStateListener: () => {
      let listener: ((state: AppStateStatus) => void) | undefined;
      const remove = jest.fn();
      jest.spyOn(rn.AppState, 'addEventListener').mockImplementation((_event, next) => {
        listener = next as (state: AppStateStatus) => void;
        return { remove };
      });
      return { emit: (state) => listener?.(state), remove };
    },
  };
}

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

function share(receiptId: string, text = 'Review me') {
  return { receiptId, text, truncated: false, count: 1, files: [], unavailableFileCount: 0 };
}

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('iOS share inbox payload', () => {
  const { inbox } = load('ios', {});

  it('keeps the receipt, the staged files and the count of files that could not be copied', () => {
    expect(
      inbox.normalizePendingShare({
        receiptId: RECEIPT_A,
        text: '',
        truncated: false,
        count: 3,
        unavailableFileCount: 1,
        files: [
          {
            uri: `file:///caches/AGISharedInbox/${RECEIPT_A}/0-photo.jpg`,
            fileName: 'photo.jpg',
            mimeType: 'image/jpeg',
            byteSize: 2048,
          },
        ],
      }),
    ).toEqual({
      receiptId: RECEIPT_A,
      text: '',
      truncated: false,
      count: 3,
      unavailableFileCount: 1,
      files: [
        {
          uri: `file:///caches/AGISharedInbox/${RECEIPT_A}/0-photo.jpg`,
          fileName: 'photo.jpg',
          mimeType: 'image/jpeg',
          byteSize: 2048,
        },
      ],
    });
  });

  it('refuses a receipt that is not a native receipt identifier', () => {
    expect(inbox.normalizePendingShare({ receiptId: '../../files', text: 'Hi' })?.receiptId).toBe(
      null,
    );
    expect(inbox.isShareReceiptId(RECEIPT_A)).toBe(true);
    expect(inbox.isShareReceiptId(`${RECEIPT_A}/..`)).toBe(false);
  });

  it('drops a file the native side could not describe as a readable local copy', () => {
    const pending = inbox.normalizePendingShare({
      text: 'Read this',
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
    expect(pending?.files).toEqual([
      {
        uri: 'file:///caches/AGISharedInbox/ok.pdf',
        fileName: 'ok.pdf',
        mimeType: 'application/octet-stream',
      },
    ]);
  });

  it('takes only copies inside the staging inbox and counts the rest as not added', () => {
    const staged = `file:///caches/AGISharedInbox/${RECEIPT_A}/0-plan%20v2.pdf`;
    const pending = inbox.normalizePendingShare({
      receiptId: RECEIPT_A,
      text: '',
      files: [
        { uri: staged, fileName: 'plan v2.pdf', mimeType: 'application/pdf' },
        { uri: 'file:///Documents/agi.db', fileName: 'agi.db', mimeType: '' },
        { uri: 'file:///caches/AGISharedInbox/../agi.db', fileName: 'agi.db', mimeType: '' },
        { uri: 'file:///caches/AGISharedInbox/%2e%2e/agi.db', fileName: 'agi.db', mimeType: '' },
        { uri: 'file:///caches/other/agi.db', fileName: 'agi.db', mimeType: '' },
      ],
      unavailableFileCount: 1,
    });
    expect(pending?.files).toEqual([
      { uri: staged, fileName: 'plan v2.pdf', mimeType: 'application/pdf' },
    ]);
    expect(pending?.unavailableFileCount).toBe(5);
  });

  it('still opens a review when every file failed to copy, so the loss is visible', () => {
    expect(inbox.normalizePendingShare({ text: ' ', files: [], unavailableFileCount: 2 })).toEqual(
      expect.objectContaining({ unavailableFileCount: 2, files: [] }),
    );
    expect(inbox.normalizePendingShare({ text: '   ', files: [] })).toBeNull();
    expect(inbox.normalizePendingShare(null)).toBeNull();
  });
});

describe('a file named on an App Intent link', () => {
  type Attachments = typeof import('@/src/features/share-preview/sharedAttachments');
  const STAGED = 'file:///caches/AGIIntentFiles/0F8E2C1A-1B2C-4D5E-8F90-123456789ABC.jpg';

  function attachmentsOn(os: 'ios' | 'android'): Attachments {
    load(os, {});
    return require('@/src/features/share-preview/sharedAttachments') as Attachments;
  }

  it('is passed on when an App Intent staged it', () => {
    expect(attachmentsOn('ios').stagedIntentFileUri(STAGED)).toBe(STAGED);
  });

  it.each([
    ['the app documents', 'file:///Documents/agi.db'],
    ['the share inbox', `file:///caches/AGISharedInbox/${RECEIPT_A}/0-plan.pdf`],
    ['the cache outside the folder', 'file:///caches/recording.m4a'],
    ['a sibling that only starts like the folder', 'file:///caches/AGIIntentFilesOld/a.jpg'],
    ['a .. segment', 'file:///caches/AGIIntentFiles/../agi.db'],
    ['an encoded .. segment', 'file:///caches/AGIIntentFiles/%2e%2e/agi.db'],
    ['a web address', 'https://example.com/a.jpg'],
  ])('is dropped when it points at %s', (_label, uri) => {
    expect(attachmentsOn('ios').stagedIntentFileUri(uri)).toBeUndefined();
  });

  it('is dropped when the link names none', () => {
    expect(attachmentsOn('ios').stagedIntentFileUri(undefined)).toBeUndefined();
  });

  it('is always dropped on Android, where no App Intent stages a file', () => {
    expect(attachmentsOn('android').stagedIntentFileUri(STAGED)).toBeUndefined();
  });
});

describe('iOS share inbox claims and receipts', () => {
  it('does nothing on Android', async () => {
    const claimPendingShares = jest.fn();
    const { inbox } = load('android', { claimPendingShares, acknowledgePendingShares: jest.fn() });
    await expect(inbox.claimIOSPendingShare()).resolves.toBeNull();
    expect(claimPendingShares).not.toHaveBeenCalled();
  });

  it('holds a claimed receipt so the same share is not opened twice in one session', async () => {
    const claimPendingShares = jest
      .fn()
      .mockResolvedValueOnce(share(RECEIPT_A))
      .mockResolvedValueOnce(null);
    const { inbox } = load('ios', { claimPendingShares, acknowledgePendingShares: jest.fn() });

    await inbox.claimIOSPendingShare();
    await inbox.claimIOSPendingShare();

    expect(claimPendingShares).toHaveBeenNthCalledWith(1, []);
    expect(claimPendingShares).toHaveBeenNthCalledWith(2, [RECEIPT_A]);
    expect(inbox.isIOSShareReceiptHeld(RECEIPT_A)).toBe(true);
  });

  it('acknowledges a receipt once, then claims the next pending batch', async () => {
    const claimPendingShares = jest
      .fn()
      .mockResolvedValueOnce(share(RECEIPT_A, 'first'))
      .mockResolvedValueOnce(share(RECEIPT_B, 'second'));
    const acknowledgePendingShares = jest.fn().mockResolvedValue(true);
    const { inbox, setAppStateListener } = load('ios', {
      claimPendingShares,
      acknowledgePendingShares,
    });
    setAppStateListener();
    const onShare = jest.fn();
    const unsubscribe = inbox.subscribeToIOSShareInbox(onShare, jest.fn());
    await flush();
    expect(onShare).toHaveBeenCalledWith(expect.objectContaining({ receiptId: RECEIPT_A }));

    const [first, again] = await Promise.all([
      inbox.acknowledgeIOSShareReceipt(RECEIPT_A, 'adopted'),
      inbox.acknowledgeIOSShareReceipt(RECEIPT_A, 'adopted'),
    ]);
    await flush();

    expect(first).toBe(true);
    expect(again).toBe(true);
    expect(acknowledgePendingShares).toHaveBeenCalledTimes(1);
    expect(acknowledgePendingShares).toHaveBeenCalledWith(RECEIPT_A, false);
    expect(inbox.isIOSShareReceiptHeld(RECEIPT_A)).toBe(false);
    expect(claimPendingShares).toHaveBeenLastCalledWith([]);
    expect(onShare).toHaveBeenLastCalledWith(expect.objectContaining({ receiptId: RECEIPT_B }));
    unsubscribe();
  });

  it('asks native to delete the reviewed copies only when the share is discarded', async () => {
    const acknowledgePendingShares = jest.fn().mockResolvedValue(true);
    const { inbox } = load('ios', {
      claimPendingShares: jest.fn().mockResolvedValue(share(RECEIPT_A)),
      acknowledgePendingShares,
    });
    await inbox.claimIOSPendingShare();
    await inbox.acknowledgeIOSShareReceipt(RECEIPT_A, 'discarded');
    expect(acknowledgePendingShares).toHaveBeenCalledWith(RECEIPT_A, true);
  });

  it('retries a failed acknowledgement before giving up', async () => {
    jest.useFakeTimers();
    const acknowledgePendingShares = jest
      .fn()
      .mockRejectedValueOnce(new Error('busy'))
      .mockRejectedValueOnce(new Error('busy'))
      .mockResolvedValueOnce(true);
    const { inbox } = load('ios', {
      claimPendingShares: jest.fn().mockResolvedValue(share(RECEIPT_A)),
      acknowledgePendingShares,
    });
    await inbox.claimIOSPendingShare();

    const result = inbox.acknowledgeIOSShareReceipt(RECEIPT_A, 'adopted');
    await jest.advanceTimersByTimeAsync(5_000);

    await expect(result).resolves.toBe(true);
    expect(acknowledgePendingShares).toHaveBeenCalledTimes(inbox.SHARE_RECEIPT_ACK_ATTEMPTS);
    expect(inbox.isIOSShareReceiptHeld(RECEIPT_A)).toBe(false);
  });

  it('keeps the receipt pending when every acknowledgement fails, so nothing is deleted', async () => {
    jest.useFakeTimers();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const acknowledgePendingShares = jest.fn().mockRejectedValue(new Error('disk'));
    const { inbox } = load('ios', {
      claimPendingShares: jest.fn().mockResolvedValue(share(RECEIPT_A)),
      acknowledgePendingShares,
    });
    await inbox.claimIOSPendingShare();

    const result = inbox.acknowledgeIOSShareReceipt(RECEIPT_A, 'discarded');
    await jest.advanceTimersByTimeAsync(5_000);

    await expect(result).resolves.toBe(false);
    expect(acknowledgePendingShares).toHaveBeenCalledTimes(inbox.SHARE_RECEIPT_ACK_ATTEMPTS);
    expect(inbox.isIOSShareReceiptHeld(RECEIPT_A)).toBe(true);
    expect(warn).toHaveBeenCalled();
  });

  it('never acknowledges a receipt this session did not claim', async () => {
    const acknowledgePendingShares = jest.fn();
    const { inbox } = load('ios', { claimPendingShares: jest.fn(), acknowledgePendingShares });
    await expect(inbox.acknowledgeIOSShareReceipt(RECEIPT_A, 'discarded')).resolves.toBe(false);
    expect(acknowledgePendingShares).not.toHaveBeenCalled();
  });

  it('releases, rather than drops, a share that arrives after the subscriber went away', async () => {
    let resolveClaim: ((value: unknown) => void) | undefined;
    const claimPendingShares = jest.fn().mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveClaim = resolve;
        }),
    );
    const acknowledgePendingShares = jest.fn();
    const { inbox, setAppStateListener } = load('ios', {
      claimPendingShares,
      acknowledgePendingShares,
    });
    const appState = setAppStateListener();
    const onShare = jest.fn();
    const unsubscribe = inbox.subscribeToIOSShareInbox(onShare, jest.fn());

    unsubscribe();
    resolveClaim?.(share(RECEIPT_A));
    await flush();

    expect(onShare).not.toHaveBeenCalled();
    expect(acknowledgePendingShares).not.toHaveBeenCalled();
    expect(inbox.isIOSShareReceiptHeld(RECEIPT_A)).toBe(false);
    expect(appState.remove).toHaveBeenCalledTimes(1);
  });

  it('claims again after a foreground that arrived while a claim was in flight', async () => {
    let resolveFirst: ((value: unknown) => void) | undefined;
    const claimPendingShares = jest
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce(share(RECEIPT_B, 'saved meanwhile'));
    const { inbox, setAppStateListener } = load('ios', {
      claimPendingShares,
      acknowledgePendingShares: jest.fn(),
    });
    const appState = setAppStateListener();
    const onShare = jest.fn();
    const onError = jest.fn();
    const unsubscribe = inbox.subscribeToIOSShareInbox(onShare, onError);

    appState.emit('active');
    await flush();
    expect(claimPendingShares).toHaveBeenCalledTimes(1);
    resolveFirst?.(share(RECEIPT_A));
    await flush();

    expect(claimPendingShares).toHaveBeenCalledTimes(2);
    expect(claimPendingShares).toHaveBeenLastCalledWith([RECEIPT_A]);
    expect(onShare.mock.calls.map(([pending]) => pending.receiptId)).toEqual([
      RECEIPT_A,
      RECEIPT_B,
    ]);
    expect(onError).not.toHaveBeenCalled();
    unsubscribe();
  });
});

describe('Share Preview receipt settlement', () => {
  it('acknowledges once when a sent share is accepted or uncertain', async () => {
    const acknowledgePendingShares = jest.fn().mockResolvedValue(true);
    const { inbox, settlement } = load('ios', {
      claimPendingShares: jest.fn().mockResolvedValue(share(RECEIPT_A)),
      acknowledgePendingShares,
    });
    await inbox.claimIOSPendingShare();
    const receipt = settlement.createShareReceiptSettlement(RECEIPT_A);

    receipt.observe('pending');
    receipt.observe('refused');
    expect(acknowledgePendingShares).not.toHaveBeenCalled();
    receipt.observe('uncertain');
    receipt.settle('discarded');
    await flush();

    expect(acknowledgePendingShares).toHaveBeenCalledTimes(1);
    expect(acknowledgePendingShares).toHaveBeenCalledWith(RECEIPT_A, false);
  });

  it('releases an invalidated preview so the share is offered again', async () => {
    const acknowledgePendingShares = jest.fn();
    const { inbox, settlement } = load('ios', {
      claimPendingShares: jest.fn().mockResolvedValue(share(RECEIPT_A)),
      acknowledgePendingShares,
    });
    await inbox.claimIOSPendingShare();
    const receipt = settlement.createShareReceiptSettlement(RECEIPT_A);

    expect(receipt.reoffers).toBe(true);
    receipt.release();
    receipt.settle('discarded');
    await flush();

    expect(inbox.isIOSShareReceiptHeld(RECEIPT_A)).toBe(false);
    expect(acknowledgePendingShares).not.toHaveBeenCalled();
  });

  it('is inert for an Android share, which carries no receipt', () => {
    const { settlement } = load('android', {});
    const receipt = settlement.createShareReceiptSettlement(undefined);
    expect(receipt.reoffers).toBe(false);
    expect(() => receipt.settle('discarded')).not.toThrow();
  });

  it('tells the user how many shared files did not arrive', () => {
    const { settlement } = load('ios', {});
    expect(settlement.omittedSharedFilesNotice('1')).toBe(
      '1 shared file could not be added. Share it again from the original app.',
    );
    expect(settlement.omittedSharedFilesNotice('3')).toMatch(/^3 shared files could not be added/);
    expect(settlement.omittedSharedFilesNotice('0')).toBeNull();
    expect(settlement.omittedSharedFilesNotice('-2')).toBeNull();
    expect(settlement.omittedSharedFilesNotice(undefined)).toBeNull();
  });
});
