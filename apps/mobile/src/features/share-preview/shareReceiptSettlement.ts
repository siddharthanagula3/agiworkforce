import {
  acknowledgeIOSShareReceipt,
  isShareReceiptId,
  releaseIOSShareReceipt,
  type ShareReceiptOutcome,
} from './iosShareInbox';
import type { SharePreviewStatus } from './sharePreviewAdmission';

export function createShareReceiptSettlement(rawReceiptId: unknown) {
  const receiptId = isShareReceiptId(rawReceiptId) ? rawReceiptId : null;
  let settled = false;

  const settle = (outcome: ShareReceiptOutcome) => {
    if (!receiptId || settled) return;
    settled = true;
    void acknowledgeIOSShareReceipt(receiptId, outcome);
  };

  return {
    reoffers: receiptId !== null,
    settle,
    release() {
      if (!receiptId || settled) return;
      settled = true;
      releaseIOSShareReceipt(receiptId);
    },
    observe(status: SharePreviewStatus) {
      if (status === 'accepted' || status === 'uncertain') settle('adopted');
    },
  };
}

export function omittedSharedFilesNotice(raw: unknown): string | null {
  const count = typeof raw === 'string' && /^[0-9]{1,4}$/.test(raw) ? Number(raw) : 0;
  if (count <= 0) return null;
  return count === 1
    ? '1 shared file could not be added. Share it again from the original app.'
    : `${count} shared files could not be added. Share them again from the original app.`;
}
