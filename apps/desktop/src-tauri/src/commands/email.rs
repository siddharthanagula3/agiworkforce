use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use chrono::Utc;
use rusqlite::{params, Connection, Row};
use serde::{Deserialize, Serialize};
use tauri::{command, AppHandle, Manager};
use tracing::info;

use crate::communications::{
    contacts::ContactManager,
    email_parser,
    imap_client::ImapClient,
    smtp_client::{OutgoingEmail, SmtpClient},
    Contact, Email, EmailAccount, EmailAddress, EmailFilter,
};
use crate::error::{Error, Result};
use mailparse::parse_mail;

const DEFAULT_FOLDER: &str = "INBOX";

/// Email provider configuration used when connecting accounts.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmailProvider {
    pub name: String,
    pub imap_host: String,
    pub imap_port: u16,
    #[serde(default = "default_true")]
    pub imap_use_tls: bool,
    pub smtp_host: String,
    pub smtp_port: u16,
    #[serde(default = "default_true")]
    pub smtp_use_tls: bool,
}

const fn default_true() -> bool {
    true
}

/// Built-in provider presets.
pub fn get_provider_config(provider: &str) -> Option<EmailProvider> {
    match provider.to_lowercase().as_str() {
        "gmail" => Some(EmailProvider {
            name: "Gmail".to_string(),
            imap_host: "imap.gmail.com".to_string(),
            imap_port: 993,
            imap_use_tls: true,
            smtp_host: "smtp.gmail.com".to_string(),
            smtp_port: 587,
            smtp_use_tls: true,
        }),
        "outlook" | "hotmail" => Some(EmailProvider {
            name: "Outlook".to_string(),
            imap_host: "outlook.office365.com".to_string(),
            imap_port: 993,
            imap_use_tls: true,
            smtp_host: "smtp.office365.com".to_string(),
            smtp_port: 587,
            smtp_use_tls: true,
        }),
        "yahoo" => Some(EmailProvider {
            name: "Yahoo".to_string(),
            imap_host: "imap.mail.yahoo.com".to_string(),
            imap_port: 993,
            imap_use_tls: true,
            smtp_host: "smtp.mail.yahoo.com".to_string(),
            smtp_port: 587,
            smtp_use_tls: true,
        }),
        _ => None,
    }
}

#[derive(Debug)]
struct EmailAccountRecord {
    id: i64,
    provider: String,
    email: String,
    display_name: Option<String>,
    imap_host: String,
    imap_port: u16,
    imap_use_tls: bool,
    smtp_host: String,
    smtp_port: u16,
    smtp_use_tls: bool,
    password: String,
    created_at: i64,
    last_sync: Option<i64>,
}

impl EmailAccountRecord {
    fn into_account(self) -> EmailAccount {
        EmailAccount {
            id: self.id,
            provider: self.provider,
            email: self.email,
            display_name: self.display_name,
            imap_host: self.imap_host,
            imap_port: self.imap_port,
            imap_use_tls: self.imap_use_tls,
            smtp_host: self.smtp_host,
            smtp_port: self.smtp_port,
            smtp_use_tls: self.smtp_use_tls,
            created_at: self.created_at,
            last_sync: self.last_sync,
        }
    }
}

/// Request payload for sending email.
#[derive(Debug, Deserialize)]
pub struct SendEmailRequest {
    pub account_id: i64,
    pub to: Vec<EmailAddress>,
    #[serde(default)]
    pub cc: Vec<EmailAddress>,
    #[serde(default)]
    pub bcc: Vec<EmailAddress>,
    pub reply_to: Option<EmailAddress>,
    pub subject: String,
    pub body_text: Option<String>,
    pub body_html: Option<String>,
    #[serde(default)]
    pub attachments: Vec<String>,
}

/// Connect to an email account and persist configuration.
#[command]
pub async fn email_connect(
    app_handle: AppHandle,
    provider: String,
    email: String,
    password: String,
    display_name: Option<String>,
    custom_config: Option<EmailProvider>,
) -> Result<EmailAccount> {
    info!("Connecting email account {}", email);

    let config = custom_config
        .or_else(|| get_provider_config(&provider))
        .ok_or_else(|| Error::Generic(format!("Unknown provider: {}", provider)))?;

    // Validate IMAP credentials
    let mut imap = ImapClient::connect(
        &config.imap_host,
        config.imap_port,
        &email,
        &password,
        config.imap_use_tls,
    )
    .await?;
    imap.list_folders().await?;
    imap.logout().await?;

    // Validate SMTP credentials
    let _smtp = SmtpClient::new(
        &config.smtp_host,
        config.smtp_port,
        &email,
        &password,
        config.smtp_use_tls,
    )
    .await?;

    let conn = open_connection(&app_handle)?;

    let account_id = upsert_email_account(
        &conn,
        &config,
        &provider,
        &email,
        display_name.clone(),
        &password,
    )?;

    let record = fetch_account(&conn, account_id)?;

    info!("Email account {} stored with id {}", email, account_id);

    Ok(record.into_account())
}

/// List all configured email accounts.
#[command]
pub async fn email_list_accounts(app_handle: AppHandle) -> Result<Vec<EmailAccount>> {
    let conn = open_connection(&app_handle)?;
    let mut stmt = conn
        .prepare(
            "SELECT id, provider, email, display_name, imap_host, imap_port, imap_use_tls,
                    smtp_host, smtp_port, smtp_use_tls, password_encrypted, created_at, last_sync
             FROM email_accounts
             ORDER BY email",
        )
        .map_err(|e| Error::Generic(format!("Database error: {}", e)))?;

    let accounts = stmt
        .query_map([], map_account_row)
        .map_err(|e| Error::Generic(format!("Database error: {}", e)))?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| Error::Generic(format!("Database error: {}", e)))?
        .into_iter()
        .map(EmailAccountRecord::into_account)
        .collect();

    Ok(accounts)
}

/// Remove an email account and associated cached data.
#[command]
pub async fn email_remove_account(app_handle: AppHandle, account_id: i64) -> Result<()> {
    info!("Removing email account {}", account_id);
    let conn = open_connection(&app_handle)?;
    conn.execute(
        "DELETE FROM email_accounts WHERE id = ?1",
        params![account_id],
    )
    .map_err(|e| Error::Generic(format!("Database error: {}", e)))?;
    Ok(())
}

/// Retrieve folders for a configured account.
#[command]
pub async fn email_list_folders(app_handle: AppHandle, account_id: i64) -> Result<Vec<String>> {
    let conn = open_connection(&app_handle)?;
    let record = fetch_account(&conn, account_id)?;
    let password = decode_password(&record.password)?;

    let mut imap = ImapClient::connect(
        &record.imap_host,
        record.imap_port,
        &record.email,
        &password,
        record.imap_use_tls,
    )
    .await?;

    let folders = imap.list_folders().await?;
    imap.logout().await?;

    Ok(folders)
}

/// Fetch emails from the specified folder (defaults to INBOX).
#[command]
pub async fn email_fetch_inbox(
    app_handle: AppHandle,
    account_id: i64,
    folder: Option<String>,
    limit: Option<usize>,
    filter: Option<EmailFilter>,
) -> Result<Vec<Email>> {
    let conn = open_connection(&app_handle)?;
    let record = fetch_account(&conn, account_id)?;
    let password = decode_password(&record.password)?;

    let mut imap = ImapClient::connect(
        &record.imap_host,
        record.imap_port,
        &record.email,
        &password,
        record.imap_use_tls,
    )
    .await?;

    let folder_name = folder.unwrap_or_else(|| DEFAULT_FOLDER.to_string());
    let max_messages = limit.unwrap_or(50);

    let emails = imap
        .fetch_emails(account_id, &folder_name, max_messages, filter)
        .await?;
    imap.logout().await?;

    info!(
        "Fetched {} messages for account {} folder {}",
        emails.len(),
        record.email,
        folder_name
    );

    Ok(emails)
}

/// Mark a message as read/unread.
#[command]
pub async fn email_mark_read(
    app_handle: AppHandle,
    account_id: i64,
    uid: u32,
    read: bool,
) -> Result<()> {
    let conn = open_connection(&app_handle)?;
    let record = fetch_account(&conn, account_id)?;
    let password = decode_password(&record.password)?;

    let mut imap = ImapClient::connect(
        &record.imap_host,
        record.imap_port,
        &record.email,
        &password,
        record.imap_use_tls,
    )
    .await?;

    imap.mark_as_read(uid, read).await?;
    imap.logout().await?;

    Ok(())
}

/// Delete a message from the mailbox.
#[command]
pub async fn email_delete(app_handle: AppHandle, account_id: i64, uid: u32) -> Result<()> {
    let conn = open_connection(&app_handle)?;
    let record = fetch_account(&conn, account_id)?;
    let password = decode_password(&record.password)?;

    let mut imap = ImapClient::connect(
        &record.imap_host,
        record.imap_port,
        &record.email,
        &password,
        record.imap_use_tls,
    )
    .await?;

    imap.delete_email(uid).await?;
    imap.logout().await?;

    Ok(())
}

/// Download a specific attachment to the local temp directory and return its path.
#[command]
pub async fn email_download_attachment(
    app_handle: AppHandle,
    account_id: i64,
    folder: String,
    uid: u32,
    attachment_index: usize,
) -> Result<String> {
    let conn = open_connection(&app_handle)?;
    let record = fetch_account(&conn, account_id)?;
    let password = decode_password(&record.password)?;

    let mut imap = ImapClient::connect(
        &record.imap_host,
        record.imap_port,
        &record.email,
        &password,
        record.imap_use_tls,
    )
    .await?;

    imap.select_folder(&folder).await?;
    let raw = imap.fetch_raw_selected(uid).await?;
    imap.logout().await?;

    let parsed = parse_mail(&raw)
        .map_err(|err| Error::Generic(format!("Failed to parse email: {}", err)))?;
    let file_path = email_parser::save_attachment(&parsed, attachment_index).await?;

    Ok(file_path)
}

/// Send an email using the configured SMTP account.
#[command]
pub async fn email_send(app_handle: AppHandle, request: SendEmailRequest) -> Result<String> {
    let conn = open_connection(&app_handle)?;
    let record = fetch_account(&conn, request.account_id)?;
    let password = decode_password(&record.password)?;

    let smtp = SmtpClient::new(
        &record.smtp_host,
        record.smtp_port,
        &record.email,
        &password,
        record.smtp_use_tls,
    )
    .await?;

    let outgoing = OutgoingEmail {
        from: EmailAddress::new(record.email.clone(), record.display_name.clone()),
        to: request.to,
        cc: request.cc,
        bcc: request.bcc,
        reply_to: request.reply_to,
        subject: request.subject,
        body_text: request.body_text,
        body_html: request.body_html,
        attachments: request.attachments,
    };

    smtp.send(outgoing).await
}

/// Retrieve a contact manager bound to the application database.
async fn contact_manager(app_handle: &AppHandle) -> Result<ContactManager> {
    let db_path = app_handle
        .path()
        .app_data_dir()
        .map_err(|err| Error::Generic(format!("Failed to resolve data dir: {}", err)))?
        .join("agiworkforce.db");

    ContactManager::new(db_path.to_string_lossy().as_ref()).await
}

/// Create a new contact.
#[command]
pub async fn contact_create(app_handle: AppHandle, contact: Contact) -> Result<i64> {
    let manager = contact_manager(&app_handle).await?;
    manager.create_contact(&contact).await
}

/// Retrieve a single contact.
#[command]
pub async fn contact_get(app_handle: AppHandle, id: i64) -> Result<Option<Contact>> {
    let manager = contact_manager(&app_handle).await?;
    manager.get_contact(id).await
}

/// List contacts with pagination.
#[command]
pub async fn contact_list(
    app_handle: AppHandle,
    limit: Option<usize>,
    offset: Option<usize>,
) -> Result<Vec<Contact>> {
    let manager = contact_manager(&app_handle).await?;
    manager.list_contacts(limit, offset).await
}

/// Search contacts by email or name.
#[command]
pub async fn contact_search(
    app_handle: AppHandle,
    query: String,
    limit: usize,
) -> Result<Vec<Contact>> {
    let manager = contact_manager(&app_handle).await?;
    manager.search_contacts(&query, limit).await
}

/// Update an existing contact.
#[command]
pub async fn contact_update(app_handle: AppHandle, contact: Contact) -> Result<()> {
    info!("Updating contact {}", contact.id);
    let manager = contact_manager(&app_handle).await?;
    manager.update_contact(&contact).await
}

/// Delete a contact.
#[command]
pub async fn contact_delete(app_handle: AppHandle, id: i64) -> Result<()> {
    info!("Deleting contact {}", id);
    let manager = contact_manager(&app_handle).await?;
    manager.delete_contact(id).await
}

/// Import contacts from a vCard file.
#[command]
pub async fn contact_import_vcard(app_handle: AppHandle, file_path: String) -> Result<usize> {
    info!("Importing contacts from {}", file_path);
    let manager = contact_manager(&app_handle).await?;
    manager.import_vcard(&file_path).await
}

/// Export contacts into a vCard file.
#[command]
pub async fn contact_export_vcard(app_handle: AppHandle, file_path: String) -> Result<usize> {
    info!("Exporting contacts to {}", file_path);
    let manager = contact_manager(&app_handle).await?;
    manager.export_vcard(&file_path).await
}

fn open_connection(app_handle: &AppHandle) -> Result<Connection> {
    let db_path = app_handle
        .path()
        .app_data_dir()
        .map_err(|err| Error::Generic(format!("Failed to resolve data dir: {}", err)))?
        .join("agiworkforce.db");

    Connection::open(db_path).map_err(|e| Error::Generic(format!("Database error: {}", e)))
}

fn upsert_email_account(
    conn: &Connection,
    provider: &EmailProvider,
    provider_key: &str,
    email: &str,
    display_name: Option<String>,
    password: &str,
) -> Result<i64> {
    let encoded_password = BASE64.encode(password.as_bytes());
    let created_at = Utc::now().timestamp();

    conn.execute(
        "INSERT INTO email_accounts (provider, email, display_name, imap_host, imap_port, imap_use_tls,
                                     smtp_host, smtp_port, smtp_use_tls, password_encrypted, created_at, last_sync)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, NULL)
         ON CONFLICT(email) DO UPDATE SET
            provider = excluded.provider,
            display_name = excluded.display_name,
            imap_host = excluded.imap_host,
            imap_port = excluded.imap_port,
            imap_use_tls = excluded.imap_use_tls,
            smtp_host = excluded.smtp_host,
            smtp_port = excluded.smtp_port,
            smtp_use_tls = excluded.smtp_use_tls,
            password_encrypted = excluded.password_encrypted",
        params![
            provider_key,
            email,
            display_name,
            provider.imap_host,
            provider.imap_port,
            bool_to_int(provider.imap_use_tls),
            provider.smtp_host,
            provider.smtp_port,
            bool_to_int(provider.smtp_use_tls),
            encoded_password,
            created_at
        ],
    )
    .map_err(|e| Error::Generic(format!("Database error: {}", e)))?;

    let id = conn
        .query_row(
            "SELECT id FROM email_accounts WHERE email = ?1",
            params![email],
            |row| row.get(0),
        )
        .map_err(|e| Error::Generic(format!("Database error: {}", e)))?;

    Ok(id)
}

fn fetch_account(conn: &Connection, account_id: i64) -> Result<EmailAccountRecord> {
    conn.query_row(
        "SELECT id, provider, email, display_name, imap_host, imap_port, imap_use_tls,
                smtp_host, smtp_port, smtp_use_tls, password_encrypted, created_at, last_sync
         FROM email_accounts
         WHERE id = ?1",
        params![account_id],
        map_account_row,
    )
    .map_err(Error::Database)
}

fn map_account_row(row: &Row<'_>) -> rusqlite::Result<EmailAccountRecord> {
    Ok(EmailAccountRecord {
        id: row.get(0)?,
        provider: row.get(1)?,
        email: row.get(2)?,
        display_name: row.get(3)?,
        imap_host: row.get(4)?,
        imap_port: row.get::<_, i64>(5)? as u16,
        imap_use_tls: int_to_bool(row.get::<_, i64>(6)?),
        smtp_host: row.get(7)?,
        smtp_port: row.get::<_, i64>(8)? as u16,
        smtp_use_tls: int_to_bool(row.get::<_, i64>(9)?),
        password: row.get(10)?,
        created_at: row.get(11)?,
        last_sync: row.get(12)?,
    })
}

fn decode_password(encoded: &str) -> Result<String> {
    let bytes = BASE64
        .decode(encoded)
        .map_err(|err| Error::Generic(format!("Failed to decode stored credentials: {}", err)))?;
    String::from_utf8(bytes)
        .map_err(|err| Error::Generic(format!("Stored credentials invalid UTF-8: {}", err)))
}

const fn bool_to_int(value: bool) -> i64 {
    if value {
        1
    } else {
        0
    }
}

const fn int_to_bool(value: i64) -> bool {
    value != 0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn password_round_trip() {
        let original = "super-secret";
        let encoded = BASE64.encode(original.as_bytes());
        let decoded = decode_password(&encoded).expect("Should decode");
        assert_eq!(original, decoded);
    }
}
