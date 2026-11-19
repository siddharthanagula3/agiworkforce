import { API_URL } from '@/lib/constants';
import {
  SENT_FILE_UNAVAILABLE_MESSAGE,
  sentAttachmentDetail,
  sentAttachmentKind,
  sentAttachmentSource,
  sentAttachmentViewerSource,
  sharedAttachmentsNotCopied,
} from '@/src/features/chat/utils/sentAttachment';

const ASSET_ID = '0b1c2d3e-4f50-6172-8394-a5b6c7d8e9f0';
const ORIGIN = API_URL.replace(/\/+$/, '');

describe('a file a person sent', () => {
  it('names its type and size in KB and MB', () => {
    expect(sentAttachmentDetail({ fileName: 'lease.pdf', fileSize: 245_760 })).toBe('PDF · 240 KB');
    expect(sentAttachmentDetail({ fileName: 'deck.pptx', fileSize: 3_355_443 })).toBe(
      'PowerPoint · 3.2 MB',
    );
    expect(sentAttachmentDetail({ fileName: 'brief.docx' })).toBe('Word');
    expect(sentAttachmentDetail({ fileName: 'budget.xlsx' })).toBe('Excel');
    expect(sentAttachmentDetail({ fileName: 'figures.csv' })).toBe('CSV');
    expect(sentAttachmentDetail({ fileName: 'notes' })).toBeNull();
  });

  it('tells spreadsheets and slides apart from other documents', () => {
    expect(sentAttachmentKind({ fileName: 'figures.CSV' })).toBe('spreadsheet');
    expect(sentAttachmentKind({ fileName: 'budget.xlsx' })).toBe('spreadsheet');
    expect(sentAttachmentKind({ fileName: 'pitch.pptx' })).toBe('presentation');
    expect(sentAttachmentKind({ fileName: 'brief.docx' })).toBe('document');
  });

  it('reads a stored file through the signed-in files route and a device file in place', () => {
    expect(sentAttachmentSource({ url: `/api/files/${ASSET_ID}` })).toEqual({
      kind: 'remote',
      url: `${ORIGIN}/api/files/${ASSET_ID}`,
    });
    expect(sentAttachmentSource({ url: 'blob:gone', assetId: ASSET_ID })).toEqual({
      kind: 'remote',
      url: `${ORIGIN}/api/files/${ASSET_ID}`,
    });
    expect(sentAttachmentSource({ url: 'file:///var/mobile/lease.pdf' })).toEqual({
      kind: 'local',
      uri: 'file:///var/mobile/lease.pdf',
    });
    expect(sentAttachmentSource({ url: 'http://insecure.example/x.pdf' })).toBeNull();
  });

  it('opens a stored file in the viewer through the signed-in files route, with its size', () => {
    expect(
      sentAttachmentViewerSource({
        url: `/api/files/${ASSET_ID}`,
        fileName: 'lease.pdf',
        mimeType: 'application/pdf',
        fileSize: 245_760,
      }),
    ).toEqual({
      title: 'lease.pdf',
      fileName: 'lease.pdf',
      mimeType: 'application/pdf',
      url: `${ORIGIN}/api/files/${ASSET_ID}`,
      byteCount: 245_760,
    });
  });

  it('opens a file still on the device in place', () => {
    expect(
      sentAttachmentViewerSource({
        url: 'file:///var/mobile/figures.csv',
        fileName: 'figures.csv',
        mimeType: 'text/csv',
      }),
    ).toEqual({
      title: 'figures.csv',
      fileName: 'figures.csv',
      mimeType: 'text/csv',
      url: 'file:///var/mobile/figures.csv',
    });
  });

  it('has nothing to open when the file is gone', () => {
    expect(
      sentAttachmentViewerSource({
        url: 'blob:gone',
        fileName: 'x.pdf',
        mimeType: 'application/pdf',
      }),
    ).toBeNull();
    expect(SENT_FILE_UNAVAILABLE_MESSAGE).toBe('This file is no longer available on this device.');
  });
});

describe('files a shared chat did not copy', () => {
  it('lists the names it was given and skips anything else', () => {
    expect(
      sharedAttachmentsNotCopied({
        sharedAttachments: [
          { name: 'plan.pdf' },
          { name: '  ' },
          { title: 'x' },
          'y',
          { name: 'q3.xlsx' },
        ],
      }),
    ).toEqual([{ name: 'plan.pdf' }, { name: 'q3.xlsx' }]);
    expect(sharedAttachmentsNotCopied({ sharedAttachments: 'plan.pdf' })).toEqual([]);
    expect(sharedAttachmentsNotCopied(undefined)).toEqual([]);
  });
});
