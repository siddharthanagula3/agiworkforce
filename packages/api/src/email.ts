/**
 * Email API — typed wrappers for email_*, gmail_oauth_*, and contact_* Tauri commands.
 */

import { command } from '@agiworkforce/runtime';

// ---- Types ----

export interface EmailProvider {
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  useSsl: boolean;
}
export interface EmailAccount {
  id: number;
  provider: string;
  email: string;
  displayName?: string;
}
export interface EmailFilter {
  unread?: boolean;
  from?: string;
  subject?: string;
  since?: string;
  [key: string]: unknown;
}
export interface Email {
  uid: number;
  from: string;
  to: string[];
  subject: string;
  body: string;
  date: string;
  read: boolean;
  attachments: { name: string; size: number }[];
}
export interface SendEmailRequest {
  accountId: number;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  isHtml?: boolean;
  attachments?: string[];
}
export interface EmailSearchResult {
  messages: Email[];
  total: number;
}
export interface Contact {
  id?: number;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  notes?: string;
}
export interface KeyringStatus {
  available: boolean;
  error?: string;
}
export interface MigrationResult {
  account: string;
  success: boolean;
  error?: string;
}
export interface GmailOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri?: string;
}
export interface GmailAuthUrlResponse {
  url: string;
  state: string;
}
export interface GmailOAuthCompleteRequest {
  code: string;
  state: string;
}
export interface GmailAccountIdResponse {
  accountId: string;
}
export interface GmailAccount {
  id: string;
  email: string;
  displayName?: string;
  connected: boolean;
}

// ---- Email ----

export async function emailConnect(
  provider: string,
  email: string,
  password: string,
  displayName?: string,
  customConfig?: EmailProvider,
): Promise<EmailAccount> {
  return command<EmailAccount>('email_connect', {
    provider,
    email,
    password,
    displayName,
    customConfig,
  });
}
export async function emailListAccounts(): Promise<EmailAccount[]> {
  return command<EmailAccount[]>('email_list_accounts');
}
export async function emailRemoveAccount(accountId: number): Promise<void> {
  return command<void>('email_remove_account', { accountId });
}
export async function emailListFolders(accountId: number): Promise<string[]> {
  return command<string[]>('email_list_folders', { accountId });
}
export async function emailFetchInbox(
  accountId: number,
  folder?: string,
  limit?: number,
  filter?: EmailFilter,
): Promise<Email[]> {
  return command<Email[]>('email_fetch_inbox', { accountId, folder, limit, filter });
}
export async function emailMarkRead(accountId: number, uid: number, read: boolean): Promise<void> {
  return command<void>('email_mark_read', { accountId, uid, read });
}
export async function emailDelete(accountId: number, uid: number): Promise<void> {
  return command<void>('email_delete', { accountId, uid });
}
export async function emailMoveMessage(
  accountId: number,
  uid: number,
  fromFolder: string,
  toFolder: string,
): Promise<void> {
  return command<void>('email_move_message', { accountId, uid, fromFolder, toFolder });
}
export async function emailDownloadAttachment(
  accountId: number,
  folder: string,
  uid: number,
  attachmentIndex: number,
): Promise<string> {
  return command<string>('email_download_attachment', { accountId, folder, uid, attachmentIndex });
}
export async function emailSend(request: SendEmailRequest): Promise<string> {
  return command<string>('email_send', { request });
}
export async function emailListMessages(
  accountId: number,
  folder?: string,
  limit?: number,
  filter?: EmailFilter,
): Promise<Email[]> {
  return command<Email[]>('email_list_messages', { accountId, folder, limit, filter });
}
export async function emailSendMessage(request: SendEmailRequest): Promise<string> {
  return command<string>('email_send_message', { request });
}
export async function emailGetMessage(
  accountId: number,
  folder: string,
  uid: number,
): Promise<Email> {
  return command<Email>('email_get_message', { accountId, folder, uid });
}
export async function emailSearch(
  accountId: number,
  query: string,
  folder?: string,
  limit?: number,
): Promise<EmailSearchResult> {
  return command<EmailSearchResult>('email_search', { accountId, query, folder, limit });
}
export async function emailCheckKeyringStatus(): Promise<KeyringStatus> {
  return command<KeyringStatus>('email_check_keyring_status');
}
export async function emailMigrateCredentials(): Promise<MigrationResult[]> {
  return command<MigrationResult[]>('email_migrate_credentials');
}

// ---- Contacts ----

export async function contactCreate(contact: Contact): Promise<number> {
  return command<number>('contact_create', { contact });
}
export async function contactGet(id: number): Promise<Contact | null> {
  return command<Contact | null>('contact_get', { id });
}
export async function contactList(limit?: number, offset?: number): Promise<Contact[]> {
  return command<Contact[]>('contact_list', { limit, offset });
}
export async function contactSearch(query: string, limit: number): Promise<Contact[]> {
  return command<Contact[]>('contact_search', { query, limit });
}
export async function contactUpdate(contact: Contact): Promise<void> {
  return command<void>('contact_update', { contact });
}
export async function contactDelete(id: number): Promise<void> {
  return command<void>('contact_delete', { id });
}
export async function contactImportVcard(filePath: string): Promise<number> {
  return command<number>('contact_import_vcard', { filePath });
}
export async function contactExportVcard(filePath: string): Promise<number> {
  return command<number>('contact_export_vcard', { filePath });
}

// ---- Gmail OAuth ----

export async function gmailOauthStart(config: GmailOAuthConfig): Promise<GmailAuthUrlResponse> {
  return command<GmailAuthUrlResponse>('gmail_oauth_start', { config });
}
export async function gmailOauthComplete(
  request: GmailOAuthCompleteRequest,
): Promise<GmailAccountIdResponse> {
  return command<GmailAccountIdResponse>('gmail_oauth_complete', { request });
}
export async function gmailOauthRefresh(accountId: string): Promise<boolean> {
  return command<boolean>('gmail_oauth_refresh', { accountId });
}
export async function gmailOauthListAccounts(): Promise<GmailAccount[]> {
  return command<GmailAccount[]>('gmail_oauth_list_accounts');
}
export async function gmailOauthDisconnect(accountId: string): Promise<void> {
  return command<void>('gmail_oauth_disconnect', { accountId });
}
export async function gmailOauthGetAccount(accountId: string): Promise<GmailAccount | null> {
  return command<GmailAccount | null>('gmail_oauth_get_account', { accountId });
}
