import {
  AppState,
  NativeModules,
  Platform,
  type AppStateStatus,
  type NativeEventSubscription,
} from 'react-native';
import { normalizeSharedFile, type SharedFile } from './sharedAttachments';

export interface IOSPendingShare {
  receiptId: string | null;
  text: string;
  truncated: boolean;
  count: number;
  files: SharedFile[];
  unavailableFileCount: number;
}

export type ShareReceiptOutcome = 'adopted' | 'discarded';

interface AGIShareInboxModule {
  claimPendingShares(heldReceipts: string[]): Promise<unknown>;
  acknowledgePendingShares(receiptId: string, discardStagedCopies: boolean): Promise<unknown>;
}

const RECEIPT_ID = /^[0-9]{1,16}-[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/;
export const SHARE_RECEIPT_ACK_ATTEMPTS = 3;
const SHARE_RECEIPT_RETRY_DELAY_MS = 500;

const heldReceipts = new Set<string>();
const acknowledging = new Map<string, Promise<boolean>>();
const consumers = new Set<() => void>();
let claimQueue: Promise<unknown> = Promise.resolve();

function getShareInboxModule(): AGIShareInboxModule {
  const module = NativeModules.AGIShareInbox as AGIShareInboxModule | undefined;
  if (!module?.claimPendingShares || !module.acknowledgePendingShares) {
    throw new Error('AGIShareInbox native module not linked, rebuild the iOS app');
  }
  return module;
}

export function isShareReceiptId(value: unknown): value is string {
  return typeof value === 'string' && RECEIPT_ID.test(value);
}

export function normalizePendingShare(raw: unknown): IOSPendingShare | null {
  if (!raw || typeof raw !== 'object') return null;
  const pending = raw as Record<string, unknown>;
  const text = typeof pending.text === 'string' ? pending.text : '';
  const files = Array.isArray(pending.files)
    ? pending.files.map(normalizeSharedFile).filter((file): file is SharedFile => file !== null)
    : [];
  const unavailableFileCount =
    typeof pending.unavailableFileCount === 'number' &&
    Number.isInteger(pending.unavailableFileCount) &&
    pending.unavailableFileCount > 0
      ? pending.unavailableFileCount
      : 0;
  if (!text.trim() && files.length === 0 && unavailableFileCount === 0) return null;
  const count = typeof pending.count === 'number' && pending.count > 0 ? pending.count : 1;
  return {
    receiptId: isShareReceiptId(pending.receiptId) ? pending.receiptId : null,
    text,
    truncated: pending.truncated === true,
    count,
    files,
    unavailableFileCount,
  };
}

export function claimIOSPendingShare(): Promise<IOSPendingShare | null> {
  if (Platform.OS !== 'ios') return Promise.resolve(null);
  const claim = claimQueue.then(async () => {
    const share = normalizePendingShare(
      await getShareInboxModule().claimPendingShares([...heldReceipts]),
    );
    if (share?.receiptId) heldReceipts.add(share.receiptId);
    return share;
  });
  claimQueue = claim.catch(() => undefined);
  return claim;
}

export function isIOSShareReceiptHeld(receiptId: string): boolean {
  return heldReceipts.has(receiptId);
}

export function releaseIOSShareReceipt(receiptId: string): void {
  heldReceipts.delete(receiptId);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function acknowledgeIOSShareReceipt(
  receiptId: string,
  outcome: ShareReceiptOutcome,
): Promise<boolean> {
  if (Platform.OS !== 'ios' || !heldReceipts.has(receiptId)) return Promise.resolve(false);
  const inFlight = acknowledging.get(receiptId);
  if (inFlight) return inFlight;

  const acknowledgement = (async () => {
    const module = getShareInboxModule();
    for (let attempt = 1; attempt <= SHARE_RECEIPT_ACK_ATTEMPTS; attempt += 1) {
      try {
        await module.acknowledgePendingShares(receiptId, outcome === 'discarded');
        heldReceipts.delete(receiptId);
        for (const consume of [...consumers]) consume();
        return true;
      } catch (error) {
        if (attempt === SHARE_RECEIPT_ACK_ATTEMPTS) {
          console.warn('[share-inbox] Shared content stays pending until the next launch:', error);
          return false;
        }
        await wait(SHARE_RECEIPT_RETRY_DELAY_MS * attempt);
      }
    }
    return false;
  })();
  acknowledging.set(receiptId, acknowledgement);
  void acknowledgement.finally(() => acknowledging.delete(receiptId));
  return acknowledgement;
}

export function subscribeToIOSShareInbox(
  onShare: (share: IOSPendingShare) => void,
  onError: (error: unknown) => void,
): () => void {
  if (Platform.OS !== 'ios') return () => undefined;

  let disposed = false;
  let consuming = false;
  let requested = false;
  const consume = async () => {
    if (disposed) return;
    if (consuming) {
      requested = true;
      return;
    }
    consuming = true;
    try {
      do {
        requested = false;
        const pending = await claimIOSPendingShare();
        if (!pending) continue;
        if (disposed) {
          if (pending.receiptId) releaseIOSShareReceipt(pending.receiptId);
          return;
        }
        onShare(pending);
      } while (requested && !disposed);
    } catch (error) {
      if (!disposed) onError(error);
    } finally {
      consuming = false;
    }
  };
  const request = () => void consume();

  consumers.add(request);
  request();
  const subscription: NativeEventSubscription = AppState.addEventListener(
    'change',
    (state: AppStateStatus) => {
      if (state === 'active') request();
    },
  );

  return () => {
    disposed = true;
    consumers.delete(request);
    subscription.remove();
  };
}
