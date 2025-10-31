pub mod contacts;
pub mod email_parser;
/// Communications MCP (Modular Control Primitive)
///
/// Provides email and contact management capabilities including:
/// - IMAP client for receiving emails
/// - SMTP client for sending emails
/// - Email parsing (MIME multipart, attachments, HTML)
/// - Contact management with vCard import/export
pub mod imap_client;
pub mod smtp_client;

use serde::{Deserialize, Serialize};

/// Email account configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmailAccount {
    pub id: i64,
    pub provider: String,
    pub email: String,
    pub display_name: Option<String>,

    // IMAP settings
    pub imap_host: String,
    pub imap_port: u16,
    pub imap_use_tls: bool,

    // SMTP settings
    pub smtp_host: String,
    pub smtp_port: u16,
    pub smtp_use_tls: bool,

    pub created_at: i64,
    pub last_sync: Option<i64>,
}

/// Email message representation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Email {
    pub id: String,
    pub uid: u32,
    pub account_id: i64,
    pub message_id: String,
    pub subject: String,
    pub from: EmailAddress,
    pub to: Vec<EmailAddress>,
    pub cc: Vec<EmailAddress>,
    pub bcc: Vec<EmailAddress>,
    pub reply_to: Option<EmailAddress>,
    pub date: i64,
    pub body_text: Option<String>,
    pub body_html: Option<String>,
    pub attachments: Vec<EmailAttachment>,
    pub is_read: bool,
    pub is_flagged: bool,
    pub folder: String,
    pub size: usize,
}

/// Email address with optional display name
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmailAddress {
    pub email: String,
    pub name: Option<String>,
}

/// Email attachment metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmailAttachment {
    pub filename: String,
    pub content_type: String,
    pub size: usize,
    pub content_id: Option<String>,
    pub file_path: Option<String>, // Path where attachment is saved
}

/// Email filter for fetching emails
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmailFilter {
    pub unread_only: bool,
    pub date_from: Option<i64>,
    pub date_to: Option<i64>,
    pub from: Option<String>,
    pub to: Option<String>,
    pub subject_contains: Option<String>,
    pub body_contains: Option<String>,
    pub has_attachments: Option<bool>,
}

/// Contact representation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Contact {
    pub id: i64,
    pub email: String,
    pub display_name: Option<String>,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub phone: Option<String>,
    pub company: Option<String>,
    pub notes: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

impl EmailAddress {
    pub fn new(email: String, name: Option<String>) -> Self {
        Self { email, name }
    }

    pub fn format(&self) -> String {
        match &self.name {
            Some(name) => format!("{} <{}>", name, self.email),
            None => self.email.clone(),
        }
    }
}

impl Default for EmailFilter {
    fn default() -> Self {
        Self {
            unread_only: false,
            date_from: None,
            date_to: None,
            from: None,
            to: None,
            subject_contains: None,
            body_contains: None,
            has_attachments: None,
        }
    }
}
