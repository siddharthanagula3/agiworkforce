import { toast } from 'sonner';
import { create } from 'zustand';

import {
  contactCreate,
  contactDelete,
  contactExportVcard,
  contactImportVcard,
  contactList,
  contactSearch,
  contactUpdate,
  emailConnect,
  emailDelete,
  emailDownloadAttachment,
  emailFetchInbox,
  emailGetMessage,
  emailListAccounts,
  emailListFolders,
  emailMarkRead,
  emailMoveMessage,
  emailRemoveAccount,
  emailSearch,
  emailSend,
  type EmailSearchResult,
  type SendEmailRequest,
} from '../api/email';

import type {
  Contact,
  EmailAddress,
  EmailFilter,
  EmailMessage,
  EmailProviderConfig,
} from '../types/email';

const DEFAULT_FILTER: EmailFilter = {
  unread_only: false,
};

export interface ConnectAccountPayload {
  provider: string;
  email: string;
  password: string;
  display_name?: string;
  custom_config?: EmailProviderConfig;
}

export interface SendEmailPayload {
  account_id: number;
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  reply_to?: EmailAddress | null;
  subject: string;
  body_text?: string | null;
  body_html?: string | null;
  attachments?: string[];
}

interface EmailState {
  accounts: import('../types/email').EmailAccount[];
  selectedAccountId: number | null;
  folders: string[];
  selectedFolder: string;
  emails: EmailMessage[];
  selectedEmail: EmailMessage | null;
  loading: boolean;
  error: string | null;
  filter: EmailFilter;
  contacts: Contact[];

  refreshAccounts: () => Promise<void>;
  connectAccount: (payload: ConnectAccountPayload) => Promise<void>;
  removeAccount: (accountId: number) => Promise<void>;
  selectAccount: (accountId: number | null) => Promise<void>;
  refreshFolders: (accountId?: number) => Promise<void>;
  refreshEmails: (options?: {
    accountId?: number;
    folder?: string;
    filter?: Partial<EmailFilter>;
  }) => Promise<void>;
  selectEmail: (emailId: string | null) => void;
  markRead: (uid: number, read: boolean) => Promise<void>;
  deleteEmail: (uid: number) => Promise<void>;
  sendEmail: (payload: SendEmailPayload) => Promise<string>;
  searchEmails: (query: string, folder?: string, limit?: number) => Promise<EmailSearchResult>;
  getMessage: (folder: string, uid: number) => Promise<EmailMessage>;
  moveMessage: (uid: number, fromFolder: string, toFolder: string) => Promise<void>;
  setFilter: (partial: Partial<EmailFilter>) => void;
  downloadAttachment: (message: EmailMessage, attachmentIndex: number) => Promise<string>;
  clearError: () => void;

  refreshContacts: () => Promise<void>;
  saveContact: (contact: Partial<Contact> & { email: string }) => Promise<void>;
  deleteContact: (id: number) => Promise<void>;
  searchContacts: (query: string, limit?: number) => Promise<Contact[]>;
  importContacts: (filePath: string) => Promise<number>;
  exportContacts: (filePath: string) => Promise<number>;
}

export { type EmailSearchResult };

function mergeFilter(current: EmailFilter, partial?: Partial<EmailFilter>): EmailFilter {
  if (!partial) {
    return current;
  }
  return {
    ...current,
    ...partial,
    unread_only: partial.unread_only ?? current.unread_only,
  };
}

export const useEmailStore = create<EmailState>((set, get) => ({
  accounts: [],
  selectedAccountId: null,
  folders: [],
  selectedFolder: 'INBOX',
  emails: [],
  selectedEmail: null,
  loading: false,
  error: null,
  filter: DEFAULT_FILTER,
  contacts: [],

  refreshAccounts: async () => {
    try {
      const accounts = await emailListAccounts();
      set({ accounts });

      const { selectedAccountId } = get();
      const firstAccount = accounts[0];

      if (!selectedAccountId && firstAccount) {
        await get().selectAccount(firstAccount.id);
      } else if (
        selectedAccountId &&
        !accounts.some((account) => account.id === selectedAccountId)
      ) {
        const fallbackAccount = accounts[0];
        if (fallbackAccount) {
          await get().selectAccount(fallbackAccount.id);
        }
      } else if (selectedAccountId) {
        await get().refreshFolders(selectedAccountId);
        await get().refreshEmails();
      }
    } catch (error) {
      console.error('[email] failed to load accounts', error);
      set({ error: (error as Error).message });
    }
  },

  connectAccount: async ({ provider, email, password, display_name, custom_config }) => {
    set({ loading: true, error: null });
    try {
      const account = await emailConnect(
        provider,
        email,
        password,
        display_name,
        custom_config,
      );

      toast.success(`Connected ${email}`);
      set((state) => ({
        accounts: [...state.accounts.filter((acc) => acc.id !== account.id), account],
        loading: false,
      }));
      await get().selectAccount(account.id);
    } catch (error) {
      console.error('[email] connect failed', error);
      set({ error: (error as Error).message, loading: false });
      throw error;
    }
  },

  removeAccount: async (accountId) => {
    try {
      await emailRemoveAccount(accountId);
      set((state) => ({
        accounts: state.accounts.filter((acc) => acc.id !== accountId),
        selectedAccountId: state.selectedAccountId === accountId ? null : state.selectedAccountId,
        emails: state.selectedAccountId === accountId ? [] : state.emails,
        folders: state.selectedAccountId === accountId ? [] : state.folders,
      }));
      const remainingAccounts = get().accounts;
      const nextAccount = remainingAccounts[0];
      if (nextAccount) {
        await get().selectAccount(nextAccount.id);
      }
    } catch (error) {
      console.error('[email] remove failed', error);
      set({ error: (error as Error).message });
      throw error;
    }
  },

  selectAccount: async (accountId) => {
    set({ selectedAccountId: accountId, selectedEmail: null });
    if (accountId) {
      await get().refreshFolders(accountId);
      await get().refreshEmails({ accountId });
    } else {
      set({ folders: [], emails: [] });
    }
  },

  refreshFolders: async (accountId) => {
    const id = accountId ?? get().selectedAccountId;
    if (!id) {
      return;
    }
    try {
      const folders = await emailListFolders(id);
      set({ folders });

      if (!folders.includes(get().selectedFolder)) {
        const fallback = folders.includes('INBOX') ? 'INBOX' : (folders[0] ?? 'INBOX');
        set({ selectedFolder: fallback });
      }
    } catch (error) {
      console.error('[email] failed to fetch folders', error);
      set({ error: (error as Error).message });
    }
  },

  refreshEmails: async (options) => {
    const accountId = options?.accountId ?? get().selectedAccountId;
    if (!accountId) {
      return;
    }

    const folder = options?.folder ?? get().selectedFolder;
    const filter = mergeFilter(get().filter, options?.filter);

    set({ loading: true, error: null, filter });
    try {
      const emails = await emailFetchInbox(accountId, folder, 100, filter);

      set({
        emails,
        loading: false,
        selectedFolder: folder,
      });

      const firstEmail = emails[0];
      if (firstEmail) {
        const currentSelected = get().selectedEmail;
        if (!currentSelected || currentSelected.id !== firstEmail.id) {
          set({ selectedEmail: firstEmail ?? null });
        }
      }
    } catch (error) {
      console.error('[email] fetch failed', error);
      set({ error: (error as Error).message, loading: false });
    }
  },

  selectEmail: (emailId) => {
    if (!emailId) {
      set({ selectedEmail: null });
      return;
    }
    const email = get().emails.find((message) => message.id === emailId) ?? null;
    set({ selectedEmail: email });
  },

  markRead: async (uid, read) => {
    const { selectedAccountId } = get();
    if (!selectedAccountId) {
      return;
    }
    try {
      await emailMarkRead(selectedAccountId, uid, read);
      set((state) => {
        const updatedEmails = state.emails.map((message) =>
          message.uid === uid ? { ...message, is_read: read } : message,
        );
        const currentSelected = state.selectedEmail;
        const nextSelected =
          currentSelected && currentSelected.uid === uid
            ? { ...currentSelected, is_read: read }
            : currentSelected;

        return {
          emails: updatedEmails,
          selectedEmail: nextSelected,
        };
      });
    } catch (error) {
      console.error('[email] mark read failed', error);
      set({ error: (error as Error).message });
      throw error;
    }
  },

  deleteEmail: async (uid) => {
    const { selectedAccountId } = get();
    if (!selectedAccountId) {
      return;
    }

    try {
      await emailDelete(selectedAccountId, uid);
      set((state) => ({
        emails: state.emails.filter((message) => message.uid != uid),
        selectedEmail:
          state.selectedEmail && state.selectedEmail.uid === uid ? null : state.selectedEmail,
      }));
    } catch (error) {
      console.error('[email] delete failed', error);
      set({ error: (error as Error).message });
      throw error;
    }
  },

  sendEmail: async (payload) => {
    try {
      const request: SendEmailRequest = {
        accountId: payload.account_id,
        to: payload.to,
        cc: payload.cc ?? [],
        bcc: payload.bcc ?? [],
        replyTo: payload.reply_to ?? null,
        subject: payload.subject,
        bodyText: payload.body_text ?? null,
        bodyHtml: payload.body_html ?? null,
        attachments: payload.attachments ?? [],
      };

      const messageId = await emailSend(request);

      toast.success('Email sent');
      return messageId;
    } catch (error) {
      console.error('[email] send failed', error);
      set({ error: (error as Error).message });
      throw error;
    }
  },

  setFilter: (partial) => {
    const filter = mergeFilter(get().filter, partial);
    set({ filter });
  },

  downloadAttachment: async (message, attachmentIndex) => {
    const accountId = get().selectedAccountId ?? message.account_id;
    if (!accountId) {
      toast.error('Select an account before downloading attachments.');
      throw new Error('No account selected');
    }

    try {
      const filePath = await emailDownloadAttachment(
        accountId,
        message.folder,
        message.uid,
        attachmentIndex,
      );

      const applyAttachmentUpdate = (email: EmailMessage): EmailMessage => {
        if (email.id !== message.id) {
          return email;
        }
        return {
          ...email,
          attachments: email.attachments.map((attachment, index) =>
            index === attachmentIndex ? { ...attachment, file_path: filePath } : attachment,
          ),
        };
      };

      set((state) => ({
        emails: state.emails.map(applyAttachmentUpdate),
        selectedEmail:
          state.selectedEmail && state.selectedEmail.id === message.id
            ? applyAttachmentUpdate(state.selectedEmail)
            : state.selectedEmail,
      }));

      toast.success('Attachment saved');
      return filePath;
    } catch (error) {
      console.error('[email] download attachment failed', error);
      const messageText = (error as Error).message ?? 'Failed to download attachment';
      set({ error: messageText });
      toast.error(messageText);
      throw error;
    }
  },

  clearError: () => set({ error: null }),

  refreshContacts: async () => {
    try {
      const contacts = await contactList(500, 0);
      set({ contacts });
    } catch (error) {
      console.error('[email] failed to load contacts', error);
      set({ error: (error as Error).message });
    }
  },

  saveContact: async (contact) => {
    const { contacts } = get();
    const existing = contacts.find((c) => c.email === contact.email);
    try {
      if (existing) {
        await contactUpdate({
          ...existing,
          ...contact,
        } as Contact);
      } else {
        await contactCreate({
          id: 0,
          email: contact.email,
          display_name: contact.display_name ?? null,
          first_name: contact.first_name ?? null,
          last_name: contact.last_name ?? null,
          phone: contact.phone ?? null,
          company: contact.company ?? null,
          notes: contact.notes ?? null,
          created_at: Math.floor(Date.now() / 1000),
          updated_at: Math.floor(Date.now() / 1000),
        });
      }
      await get().refreshContacts();
    } catch (error) {
      console.error('[email] save contact failed', error);
      set({ error: (error as Error).message });
      throw error;
    }
  },

  deleteContact: async (id) => {
    try {
      await contactDelete(id);
      set((state) => ({
        contacts: state.contacts.filter((contact) => contact.id !== id),
      }));
    } catch (error) {
      console.error('[email] delete contact failed', error);
      set({ error: (error as Error).message });
      throw error;
    }
  },

  searchEmails: async (query, folder, limit) => {
    const { selectedAccountId } = get();
    if (!selectedAccountId) {
      throw new Error('No email account selected');
    }

    try {
      set({ loading: true, error: null });
      const result = await emailSearch(
        selectedAccountId,
        query,
        folder ?? null,
        limit ?? 50,
      );
      set({ loading: false });
      return result;
    } catch (error) {
      console.error('[email] search failed', error);
      set({ error: (error as Error).message, loading: false });
      throw error;
    }
  },

  getMessage: async (folder, uid) => {
    const { selectedAccountId } = get();
    if (!selectedAccountId) {
      throw new Error('No email account selected');
    }

    try {
      set({ loading: true, error: null });
      const message = await emailGetMessage(selectedAccountId, folder, uid);
      set({ loading: false });
      return message;
    } catch (error) {
      console.error('[email] get message failed', error);
      set({ error: (error as Error).message, loading: false });
      throw error;
    }
  },

  moveMessage: async (uid, fromFolder, toFolder) => {
    const { selectedAccountId } = get();
    if (!selectedAccountId) {
      throw new Error('No email account selected');
    }

    try {
      set({ loading: true, error: null });
      await emailMoveMessage(selectedAccountId, uid, fromFolder, toFolder);

      set((state) => ({
        emails: state.emails.filter((message) => message.uid !== uid),
        selectedEmail:
          state.selectedEmail && state.selectedEmail.uid === uid ? null : state.selectedEmail,
        loading: false,
      }));
      toast.success(`Moved to ${toFolder}`);
    } catch (error) {
      console.error('[email] move message failed', error);
      set({ error: (error as Error).message, loading: false });
      throw error;
    }
  },

  searchContacts: async (query, limit) => {
    try {
      const contacts = await contactSearch(query, limit ?? 20);
      return contacts;
    } catch (error) {
      console.error('[email] search contacts failed', error);
      set({ error: (error as Error).message });
      throw error;
    }
  },

  importContacts: async (filePath) => {
    try {
      set({ loading: true, error: null });
      const count = await contactImportVcard(filePath);
      await get().refreshContacts();
      set({ loading: false });
      toast.success(`Imported ${count} contacts`);
      return count;
    } catch (error) {
      console.error('[email] import contacts failed', error);
      set({ error: (error as Error).message, loading: false });
      throw error;
    }
  },

  exportContacts: async (filePath) => {
    try {
      set({ loading: true, error: null });
      const count = await contactExportVcard(filePath);
      set({ loading: false });
      toast.success(`Exported ${count} contacts`);
      return count;
    } catch (error) {
      console.error('[email] export contacts failed', error);
      set({ error: (error as Error).message, loading: false });
      throw error;
    }
  },
}));
