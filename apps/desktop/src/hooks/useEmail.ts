/**
 * Email operations hook for AGI Workforce.
 *
 * Provides a convenient interface to email operations via Tauri commands.
 * Handles loading states, error handling, and automatic data refresh.
 *
 * @module useEmail
 */

import { invoke } from '@tauri-apps/api/core';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import type { EmailAccount, EmailAddress, EmailFilter, EmailMessage } from '../types/email';

/**
 * Email search query parameters.
 */
export interface EmailSearchQuery {
  /** Search query string */
  query: string;
  /** Optional folder to search in */
  folder?: string;
  /** Maximum results to return */
  limit?: number;
}

/**
 * Email search result.
 */
export interface EmailSearchResult {
  /** Matching messages */
  messages: EmailMessage[];
  /** Total matches found */
  total: number;
  /** Query that was searched */
  query: string;
}

/**
 * Send email request payload.
 */
export interface SendEmailRequest {
  /** Account ID to send from */
  accountId: number;
  /** To recipients */
  to: EmailAddress[];
  /** CC recipients (optional) */
  cc?: EmailAddress[];
  /** BCC recipients (optional) */
  bcc?: EmailAddress[];
  /** Reply-to address (optional) */
  replyTo?: EmailAddress | null;
  /** Email subject */
  subject: string;
  /** Plain text body (optional) */
  bodyText?: string | null;
  /** HTML body (optional) */
  bodyHtml?: string | null;
  /** Attachment file paths (optional) */
  attachments?: string[];
}

/**
 * Hook state and operations for Email.
 */
export interface UseEmailReturn {
  /** Whether an email operation is in progress */
  loading: boolean;
  /** Last error message */
  error: string | null;

  /** List all connected email accounts */
  listAccounts: () => Promise<EmailAccount[]>;
  /** List messages in a folder */
  listMessages: (
    accountId: number,
    folder?: string,
    limit?: number,
    filter?: Partial<EmailFilter>,
  ) => Promise<EmailMessage[]>;
  /** Get a single message by UID */
  getMessage: (accountId: number, folder: string, uid: number) => Promise<EmailMessage>;
  /** Send an email */
  sendMessage: (request: SendEmailRequest) => Promise<string>;
  /** Search emails */
  searchEmails: (accountId: number, query: EmailSearchQuery) => Promise<EmailSearchResult>;
  /** Move a message to another folder */
  moveMessage: (
    accountId: number,
    uid: number,
    fromFolder: string,
    toFolder: string,
  ) => Promise<void>;
  /** Delete a message */
  deleteMessage: (accountId: number, uid: number) => Promise<void>;
  /** Mark a message as read/unread */
  markRead: (accountId: number, uid: number, read: boolean) => Promise<void>;
  /** List folders for an account */
  listFolders: (accountId: number) => Promise<string[]>;
  /** Clear the current error */
  clearError: () => void;
}

/**
 * Hook for managing email operations.
 *
 * @returns Email operations and state
 *
 * @example
 * ```tsx
 * const { listAccounts, listMessages, sendMessage, searchEmails, loading, error } = useEmail();
 *
 * // List accounts
 * const accounts = await listAccounts();
 *
 * // List messages
 * const messages = await listMessages(accountId, 'INBOX', 50);
 *
 * // Send email
 * await sendMessage({
 *   accountId: 1,
 *   to: [{ email: 'recipient@example.com' }],
 *   subject: 'Hello',
 *   bodyText: 'This is a test email',
 * });
 *
 * // Search emails
 * const results = await searchEmails(accountId, { query: 'invoice', limit: 20 });
 * ```
 */
export function useEmail(): UseEmailReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleError = useCallback((err: unknown, operation: string) => {
    const message = err instanceof Error ? err.message : String(err);
    setError(message);
    toast.error(`Email ${operation} failed: ${message}`);
    throw err;
  }, []);

  const listAccounts = useCallback(async (): Promise<EmailAccount[]> => {
    setLoading(true);
    setError(null);

    try {
      const accounts = await invoke<EmailAccount[]>('email_list_accounts');
      return accounts;
    } catch (err) {
      handleError(err, 'list accounts');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [handleError]);

  const listMessages = useCallback(
    async (
      accountId: number,
      folder: string = 'INBOX',
      limit: number = 100,
      filter?: Partial<EmailFilter>,
    ): Promise<EmailMessage[]> => {
      setLoading(true);
      setError(null);

      try {
        const messages = await invoke<EmailMessage[]>('email_list_messages', {
          account_id: accountId,
          folder,
          limit,
          filter: filter ?? null,
        });
        return messages;
      } catch (err) {
        handleError(err, 'list messages');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [handleError],
  );

  const getMessage = useCallback(
    async (accountId: number, folder: string, uid: number): Promise<EmailMessage> => {
      setLoading(true);
      setError(null);

      try {
        const message = await invoke<EmailMessage>('email_get_message', {
          account_id: accountId,
          folder,
          uid,
        });
        return message;
      } catch (err) {
        handleError(err, 'get message');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [handleError],
  );

  const sendMessage = useCallback(
    async (request: SendEmailRequest): Promise<string> => {
      setLoading(true);
      setError(null);

      try {
        const messageId = await invoke<string>('email_send_message', {
          request: {
            account_id: request.accountId,
            to: request.to,
            cc: request.cc ?? [],
            bcc: request.bcc ?? [],
            reply_to: request.replyTo ?? null,
            subject: request.subject,
            body_text: request.bodyText ?? null,
            body_html: request.bodyHtml ?? null,
            attachments: request.attachments ?? [],
          },
        });
        toast.success('Email sent successfully');
        return messageId;
      } catch (err) {
        handleError(err, 'send');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [handleError],
  );

  const searchEmails = useCallback(
    async (accountId: number, query: EmailSearchQuery): Promise<EmailSearchResult> => {
      setLoading(true);
      setError(null);

      try {
        const result = await invoke<EmailSearchResult>('email_search', {
          account_id: accountId,
          query: query.query,
          folder: query.folder ?? null,
          limit: query.limit ?? 50,
        });
        return result;
      } catch (err) {
        handleError(err, 'search');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [handleError],
  );

  const moveMessage = useCallback(
    async (accountId: number, uid: number, fromFolder: string, toFolder: string): Promise<void> => {
      setLoading(true);
      setError(null);

      try {
        await invoke('email_move_message', {
          account_id: accountId,
          uid,
          from_folder: fromFolder,
          to_folder: toFolder,
        });
        toast.success(`Message moved to ${toFolder}`);
      } catch (err) {
        handleError(err, 'move message');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [handleError],
  );

  const deleteMessage = useCallback(
    async (accountId: number, uid: number): Promise<void> => {
      setLoading(true);
      setError(null);

      try {
        await invoke('email_delete_message', {
          account_id: accountId,
          uid,
        });
        toast.success('Message deleted');
      } catch (err) {
        handleError(err, 'delete message');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [handleError],
  );

  const markRead = useCallback(
    async (accountId: number, uid: number, read: boolean): Promise<void> => {
      setLoading(true);
      setError(null);

      try {
        await invoke('email_mark_read', {
          account_id: accountId,
          uid,
          read,
        });
      } catch (err) {
        handleError(err, 'mark read');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [handleError],
  );

  const listFolders = useCallback(
    async (accountId: number): Promise<string[]> => {
      setLoading(true);
      setError(null);

      try {
        const folders = await invoke<string[]>('email_list_folders', {
          account_id: accountId,
        });
        return folders;
      } catch (err) {
        handleError(err, 'list folders');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [handleError],
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    loading,
    error,
    listAccounts,
    listMessages,
    getMessage,
    sendMessage,
    searchEmails,
    moveMessage,
    deleteMessage,
    markRead,
    listFolders,
    clearError,
  };
}

export type UseEmailReturn_Type = ReturnType<typeof useEmail>;
