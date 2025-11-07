import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEmailStore } from '../emailStore';
import type { EmailMessage } from '../../types/email';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const invokeMock = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

const baseMessage: EmailMessage = {
  id: 'INBOX:10',
  uid: 10,
  account_id: 1,
  message_id: 'mid-10',
  subject: 'Quarterly Report',
  from: { email: 'finance@example.com', name: 'Finance Bot' },
  to: [],
  cc: [],
  bcc: [],
  reply_to: null,
  date: 1_700_000_000,
  body_text: 'Report attached',
  body_html: null,
  attachments: [
    {
      filename: 'report.pdf',
      content_type: 'application/pdf',
      size: 2048,
      content_id: null,
      file_path: null,
    },
  ],
  is_read: false,
  is_flagged: false,
  folder: 'INBOX',
  size: 2048,
};

beforeEach(() => {
  invokeMock.mockReset();
  useEmailStore.setState({
    accounts: [],
    selectedAccountId: 1,
    folders: [],
    selectedFolder: 'INBOX',
    emails: [JSON.parse(JSON.stringify(baseMessage))],
    selectedEmail: JSON.parse(JSON.stringify(baseMessage)),
    loading: false,
    error: null,
    filter: { unread_only: false },
    contacts: [],
  });
});

describe('emailStore downloadAttachment', () => {
  it('downloads an attachment and updates cached message', async () => {
    invokeMock.mockResolvedValueOnce('C:/tmp/report.pdf');

    const message = useEmailStore.getState().selectedEmail!;
    const path = await useEmailStore.getState().downloadAttachment(message, 0);

    expect(path).toBe('C:/tmp/report.pdf');
    expect(invokeMock).toHaveBeenCalledWith('email_download_attachment', {
      account_id: 1,
      folder: 'INBOX',
      uid: 10,
      attachment_index: 0,
    });

    const state = useEmailStore.getState();
    expect(state.selectedEmail?.attachments[0]!.file_path).toBe('C:/tmp/report.pdf');
    expect(state.emails[0]!.attachments[0]!.file_path).toBe('C:/tmp/report.pdf');
  });
});
