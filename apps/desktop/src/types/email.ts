export interface EmailProviderConfig {
  name: string;
  imap_host: string;
  imap_port: number;
  imap_use_tls: boolean;
  smtp_host: string;
  smtp_port: number;
  smtp_use_tls: boolean;
}

export interface EmailAccount {
  id: number;
  provider: string;
  email: string;
  display_name?: string | null;
  imap_host: string;
  imap_port: number;
  imap_use_tls: boolean;
  smtp_host: string;
  smtp_port: number;
  smtp_use_tls: boolean;
  created_at: number;
  last_sync?: number | null;
}

export interface EmailAddress {
  email: string;
  name?: string | null;
}

export interface EmailAttachment {
  filename: string;
  content_type: string;
  size: number;
  content_id?: string | null;
  file_path?: string | null;
}

export interface EmailFilter {
  unread_only: boolean;
  date_from?: number | null;
  date_to?: number | null;
  from?: string | null;
  to?: string | null;
  subject_contains?: string | null;
  body_contains?: string | null;
  has_attachments?: boolean | null;
}

export interface EmailMessage {
  id: string;
  uid: number;
  account_id: number;
  message_id: string;
  subject: string;
  from: EmailAddress;
  to: EmailAddress[];
  cc: EmailAddress[];
  bcc: EmailAddress[];
  reply_to?: EmailAddress | null;
  date: number;
  body_text?: string | null;
  body_html?: string | null;
  attachments: EmailAttachment[];
  is_read: boolean;
  is_flagged: boolean;
  folder: string;
  size: number;
}

export interface Contact {
  id: number;
  email: string;
  display_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  company?: string | null;
  notes?: string | null;
  created_at: number;
  updated_at: number;
}
