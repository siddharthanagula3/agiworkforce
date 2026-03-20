/**
 * Email & Contacts API — Tauri IPC wrappers
 *
 * Wraps all 24 Rust commands from sys/commands/email.rs.
 * invoke() params use camelCase; command names use snake_case.
 */

import { invoke } from '../lib/tauri-mock';
import type {
  Contact,
  EmailAccount,
  EmailAddress,
  EmailFilter,
  EmailMessage,
  EmailProviderConfig,
} from '../types/email';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface SendEmailRequest {
  accountId: number;
  to: EmailAddress[];
  cc: EmailAddress[];
  bcc: EmailAddress[];
  replyTo: EmailAddress | null;
  subject: string;
  bodyText: string | null;
  bodyHtml: string | null;
  attachments: string[];
}

export interface EmailSearchResult {
  messages: EmailMessage[];
  total: number;
  query: string;
}

export interface KeyringStatus {
  keyringAvailable: boolean;
  totalAccounts: number;
  accountsInKeyring: number;
  accountsInSqlite: number;
  accountsLegacy: number;
}

export interface MigrationResult {
  email: string;
  success: boolean;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Email Account Commands
// ---------------------------------------------------------------------------

export async function emailConnect(
  provider: string,
  email: string,
  password: string,
  displayName?: string | null,
  customConfig?: EmailProviderConfig | null,
): Promise<EmailAccount> {
  try {
    return await invoke<EmailAccount>('email_connect', {
      provider,
      email,
      password,
      displayName: displayName ?? null,
      customConfig: customConfig ?? null,
    });
  } catch (error) {
    throw new Error(`Failed to connect email account: ${(error as Error).message}`);
  }
}

export async function emailListAccounts(): Promise<EmailAccount[]> {
  try {
    return await invoke<EmailAccount[]>('email_list_accounts');
  } catch (error) {
    throw new Error(`Failed to list email accounts: ${(error as Error).message}`);
  }
}

export async function emailRemoveAccount(accountId: number): Promise<void> {
  try {
    await invoke('email_remove_account', { accountId });
  } catch (error) {
    throw new Error(`Failed to remove email account: ${(error as Error).message}`);
  }
}

// ---------------------------------------------------------------------------
// Folder Commands
// ---------------------------------------------------------------------------

export async function emailListFolders(accountId: number): Promise<string[]> {
  try {
    return await invoke<string[]>('email_list_folders', { accountId });
  } catch (error) {
    throw new Error(`Failed to list email folders: ${(error as Error).message}`);
  }
}

// ---------------------------------------------------------------------------
// Message Commands
// ---------------------------------------------------------------------------

export async function emailFetchInbox(
  accountId: number,
  folder?: string | null,
  limit?: number | null,
  filter?: EmailFilter | null,
): Promise<EmailMessage[]> {
  try {
    return await invoke<EmailMessage[]>('email_fetch_inbox', {
      accountId,
      folder: folder ?? null,
      limit: limit ?? null,
      filter: filter ?? null,
    });
  } catch (error) {
    throw new Error(`Failed to fetch emails: ${(error as Error).message}`);
  }
}

export async function emailListMessages(
  accountId: number,
  folder?: string | null,
  limit?: number | null,
  filter?: EmailFilter | null,
): Promise<EmailMessage[]> {
  try {
    return await invoke<EmailMessage[]>('email_list_messages', {
      accountId,
      folder: folder ?? null,
      limit: limit ?? null,
      filter: filter ?? null,
    });
  } catch (error) {
    throw new Error(`Failed to list messages: ${(error as Error).message}`);
  }
}

export async function emailGetMessage(
  accountId: number,
  folder: string,
  uid: number,
): Promise<EmailMessage> {
  try {
    return await invoke<EmailMessage>('email_get_message', {
      accountId,
      folder,
      uid,
    });
  } catch (error) {
    throw new Error(`Failed to get message: ${(error as Error).message}`);
  }
}

export async function emailMarkRead(accountId: number, uid: number, read: boolean): Promise<void> {
  try {
    await invoke('email_mark_read', { accountId, uid, read });
  } catch (error) {
    throw new Error(`Failed to mark email: ${(error as Error).message}`);
  }
}

export async function emailDelete(accountId: number, uid: number): Promise<void> {
  try {
    await invoke('email_delete', { accountId, uid });
  } catch (error) {
    throw new Error(`Failed to delete email: ${(error as Error).message}`);
  }
}

export async function emailMoveMessage(
  accountId: number,
  uid: number,
  fromFolder: string,
  toFolder: string,
): Promise<void> {
  try {
    await invoke('email_move_message', { accountId, uid, fromFolder, toFolder });
  } catch (error) {
    throw new Error(`Failed to move message: ${(error as Error).message}`);
  }
}

export async function emailDownloadAttachment(
  accountId: number,
  folder: string,
  uid: number,
  attachmentIndex: number,
): Promise<string> {
  try {
    return await invoke<string>('email_download_attachment', {
      accountId,
      folder,
      uid,
      attachmentIndex,
    });
  } catch (error) {
    throw new Error(`Failed to download attachment: ${(error as Error).message}`);
  }
}

// ---------------------------------------------------------------------------
// Send Commands
// ---------------------------------------------------------------------------

export async function emailSend(request: SendEmailRequest): Promise<string> {
  try {
    return await invoke<string>('email_send', { request });
  } catch (error) {
    throw new Error(`Failed to send email: ${(error as Error).message}`);
  }
}

export async function emailSendMessage(request: SendEmailRequest): Promise<string> {
  try {
    return await invoke<string>('email_send_message', { request });
  } catch (error) {
    throw new Error(`Failed to send message: ${(error as Error).message}`);
  }
}

// ---------------------------------------------------------------------------
// Search Commands
// ---------------------------------------------------------------------------

export async function emailSearch(
  accountId: number,
  query: string,
  folder?: string | null,
  limit?: number | null,
): Promise<EmailSearchResult> {
  try {
    return await invoke<EmailSearchResult>('email_search', {
      accountId,
      query,
      folder: folder ?? null,
      limit: limit ?? null,
    });
  } catch (error) {
    throw new Error(`Failed to search emails: ${(error as Error).message}`);
  }
}

// ---------------------------------------------------------------------------
// Keyring / Credential Migration Commands
// ---------------------------------------------------------------------------

export async function emailCheckKeyringStatus(): Promise<KeyringStatus> {
  try {
    return await invoke<KeyringStatus>('email_check_keyring_status');
  } catch (error) {
    throw new Error(`Failed to check keyring status: ${(error as Error).message}`);
  }
}

export async function emailMigrateCredentials(): Promise<MigrationResult[]> {
  try {
    return await invoke<MigrationResult[]>('email_migrate_credentials');
  } catch (error) {
    throw new Error(`Failed to migrate credentials: ${(error as Error).message}`);
  }
}

// ---------------------------------------------------------------------------
// Contact Commands
// ---------------------------------------------------------------------------

export async function contactCreate(contact: Contact): Promise<number> {
  try {
    return await invoke<number>('contact_create', { contact });
  } catch (error) {
    throw new Error(`Failed to create contact: ${(error as Error).message}`);
  }
}

export async function contactGet(id: number): Promise<Contact | null> {
  try {
    return await invoke<Contact | null>('contact_get', { id });
  } catch (error) {
    throw new Error(`Failed to get contact: ${(error as Error).message}`);
  }
}

export async function contactList(
  limit?: number | null,
  offset?: number | null,
): Promise<Contact[]> {
  try {
    return await invoke<Contact[]>('contact_list', {
      limit: limit ?? null,
      offset: offset ?? null,
    });
  } catch (error) {
    throw new Error(`Failed to list contacts: ${(error as Error).message}`);
  }
}

export async function contactSearch(query: string, limit: number): Promise<Contact[]> {
  try {
    return await invoke<Contact[]>('contact_search', { query, limit });
  } catch (error) {
    throw new Error(`Failed to search contacts: ${(error as Error).message}`);
  }
}

export async function contactUpdate(contact: Contact): Promise<void> {
  try {
    await invoke('contact_update', { contact });
  } catch (error) {
    throw new Error(`Failed to update contact: ${(error as Error).message}`);
  }
}

export async function contactDelete(id: number): Promise<void> {
  try {
    await invoke('contact_delete', { id });
  } catch (error) {
    throw new Error(`Failed to delete contact: ${(error as Error).message}`);
  }
}

export async function contactImportVcard(filePath: string): Promise<number> {
  try {
    return await invoke<number>('contact_import_vcard', { filePath });
  } catch (error) {
    throw new Error(`Failed to import contacts: ${(error as Error).message}`);
  }
}

export async function contactExportVcard(filePath: string): Promise<number> {
  try {
    return await invoke<number>('contact_export_vcard', { filePath });
  } catch (error) {
    throw new Error(`Failed to export contacts: ${(error as Error).message}`);
  }
}

// ---------------------------------------------------------------------------
// Convenience Client Object
// ---------------------------------------------------------------------------

export const EmailClient = {
  // Accounts
  connect: emailConnect,
  listAccounts: emailListAccounts,
  removeAccount: emailRemoveAccount,

  // Folders
  listFolders: emailListFolders,

  // Messages
  fetchInbox: emailFetchInbox,
  listMessages: emailListMessages,
  getMessage: emailGetMessage,
  markRead: emailMarkRead,
  deleteMessage: emailDelete,
  moveMessage: emailMoveMessage,
  downloadAttachment: emailDownloadAttachment,

  // Send
  send: emailSend,
  sendMessage: emailSendMessage,

  // Search
  search: emailSearch,

  // Keyring
  checkKeyringStatus: emailCheckKeyringStatus,
  migrateCredentials: emailMigrateCredentials,
} as const;

export const ContactClient = {
  create: contactCreate,
  get: contactGet,
  list: contactList,
  search: contactSearch,
  update: contactUpdate,
  delete: contactDelete,
  importVcard: contactImportVcard,
  exportVcard: contactExportVcard,
} as const;
