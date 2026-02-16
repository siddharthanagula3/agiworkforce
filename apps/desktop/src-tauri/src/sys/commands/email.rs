use chrono::Utc;
use rusqlite::{params, Connection, Row};
use serde::{Deserialize, Serialize};
use tauri::{command, AppHandle, Manager};
use tracing::{debug, error, info, warn};

use crate::features::communications::{
    contacts::ContactManager,
    email_parser,
    imap_client::ImapClient,
    smtp_client::{OutgoingEmail, SmtpClient},
    Contact, Email, EmailAccount, EmailAddress, EmailFilter,
};
use crate::sys::error::{Error, Result};
use crate::sys::security::{
    encryption::{decrypt_secret, encrypt_secret, EncryptedSecret},
    machine_key::{self, KeyPurpose},
};
use mailparse::parse_mail;

const DEFAULT_FOLDER: &str = "INBOX";

// =============================================================================
// OS Keyring Email Credential Storage
// =============================================================================

/// Service name for OS keyring storage
const KEYRING_SERVICE: &str = "agiworkforce-email";

/// Marker value stored in database to indicate password is in keyring
const KEYRING_MARKER: &str = "__KEYRING__";

/// Store an email password in the OS keyring
///
/// Uses the platform's secure credential storage:
/// - macOS: Keychain
/// - Windows: Credential Manager
/// - Linux: Secret Service (via D-Bus)
fn store_email_credential(email: &str, password: &str) -> Result<()> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, email)
        .map_err(|e| Error::Generic(format!("Failed to create keyring entry: {}", e)))?;

    entry
        .set_password(password)
        .map_err(|e| Error::Generic(format!("Failed to store password in keyring: {}", e)))?;

    debug!("Stored password in OS keyring for email: {}", email);
    Ok(())
}

/// Retrieve an email password from the OS keyring
fn get_email_credential(email: &str) -> Result<String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, email)
        .map_err(|e| Error::Generic(format!("Failed to create keyring entry: {}", e)))?;

    entry
        .get_password()
        .map_err(|e| Error::Generic(format!("Failed to retrieve password from keyring: {}", e)))
}

/// Delete an email password from the OS keyring
fn delete_email_credential(email: &str) -> Result<()> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, email)
        .map_err(|e| Error::Generic(format!("Failed to create keyring entry: {}", e)))?;

    // Ignore error if credential doesn't exist
    match entry.delete_credential() {
        Ok(_) => {
            debug!("Deleted password from OS keyring for email: {}", email);
            Ok(())
        }
        Err(keyring::Error::NoEntry) => {
            debug!(
                "No keyring entry found for email: {} (already deleted)",
                email
            );
            Ok(())
        }
        Err(e) => Err(Error::Generic(format!(
            "Failed to delete password from keyring: {}",
            e
        ))),
    }
}

/// Check if OS keyring is available on this system
fn is_keyring_available() -> bool {
    // Try to create a test entry to verify keyring is accessible
    match keyring::Entry::new(KEYRING_SERVICE, "__keyring_test__") {
        Ok(_) => true,
        Err(e) => {
            warn!("OS keyring not available: {}", e);
            false
        }
    }
}

// =============================================================================
// Fallback Encrypted Storage (SQLite + AES-256-GCM)
// =============================================================================

/// Get the encryption key for email credentials (fallback storage)
fn get_email_encryption_key() -> Vec<u8> {
    machine_key::derive_key(KeyPurpose::EmailCredentials)
}

/// Store an email password using AES-256-GCM encryption (fallback)
///
/// The password is encrypted with a machine-derived key and stored in the database
/// as a JSON-serialized `EncryptedSecret` struct in the `password_encrypted` column.
fn store_email_password_encrypted(
    conn: &Connection,
    account_id: i64,
    password: &str,
) -> Result<()> {
    let key = get_email_encryption_key();

    let encrypted = encrypt_secret(&key, password)
        .map_err(|e| Error::Generic(format!("Failed to encrypt email password: {}", e)))?;

    let encrypted_json = serde_json::to_string(&encrypted)
        .map_err(|e| Error::Generic(format!("Failed to serialize encrypted password: {}", e)))?;

    conn.execute(
        "UPDATE email_accounts SET password_encrypted = ?1 WHERE id = ?2",
        params![encrypted_json, account_id],
    )
    .map_err(|e| Error::Generic(format!("Failed to store encrypted password: {}", e)))?;

    debug!(
        "Stored encrypted password (fallback) for email account {}",
        account_id
    );
    Ok(())
}

/// Retrieve and decrypt an email password from fallback storage
fn get_email_password_encrypted(encrypted_value: &str) -> Result<String> {
    // Try to parse as EncryptedSecret (new format)
    if let Ok(encrypted) = serde_json::from_str::<EncryptedSecret>(encrypted_value) {
        let key = get_email_encryption_key();
        return decrypt_secret(&key, &encrypted)
            .map_err(|e| Error::Generic(format!("Failed to decrypt email password: {}", e)));
    }

    // Fallback: Legacy Base64 format - decode
    decode_legacy_password(encrypted_value)
}

// =============================================================================
// Unified Credential Storage (Keyring with Fallback)
// =============================================================================

/// Store an email password securely
///
/// Attempts to store in OS keyring first. If keyring is unavailable,
/// falls back to AES-256-GCM encrypted storage in SQLite.
fn store_email_password(
    conn: &Connection,
    account_id: i64,
    email: &str,
    password: &str,
) -> Result<()> {
    // Try keyring first
    if is_keyring_available() {
        match store_email_credential(email, password) {
            Ok(_) => {
                // Mark database record to indicate password is in keyring
                conn.execute(
                    "UPDATE email_accounts SET password_encrypted = ?1 WHERE id = ?2",
                    params![KEYRING_MARKER, account_id],
                )
                .map_err(|e| Error::Generic(format!("Failed to update password marker: {}", e)))?;

                info!(
                    "Stored password in OS keyring for account {} ({})",
                    account_id, email
                );
                return Ok(());
            }
            Err(e) => {
                warn!(
                    "Failed to store in keyring, falling back to encrypted storage: {}",
                    e
                );
            }
        }
    }

    // Fallback to encrypted SQLite storage
    store_email_password_encrypted(conn, account_id, password)
}

/// Retrieve an email password securely
///
/// Checks if password is stored in keyring (marker present) or fallback storage.
/// Handles migration from legacy formats automatically.
fn get_email_password(conn: &Connection, account_id: i64) -> Result<String> {
    // First get the email address and stored value
    let (email, encrypted_value): (String, String) = conn
        .query_row(
            "SELECT email, password_encrypted FROM email_accounts WHERE id = ?1",
            params![account_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| Error::Database(format!("Failed to retrieve password: {}", e)))?;

    // Check if password is in keyring
    if encrypted_value == KEYRING_MARKER {
        return get_email_credential(&email);
    }

    // Handle empty value (shouldn't happen but be defensive)
    if encrypted_value.is_empty() {
        return Err(Error::Generic(
            "No password stored for this account".to_string(),
        ));
    }

    // Get password from encrypted storage
    let password = get_email_password_encrypted(&encrypted_value)?;

    // Attempt to migrate to keyring if available
    if is_keyring_available() {
        debug!(
            "Migrating password for account {} ({}) to OS keyring",
            account_id, email
        );
        if let Err(e) = migrate_password_to_keyring(conn, account_id, &email, &password) {
            warn!("Failed to migrate password to keyring: {}", e);
            // Continue with the password we already have
        } else {
            info!(
                "Successfully migrated password to OS keyring for account {}",
                account_id
            );
        }
    }

    Ok(password)
}

/// Migrate a password from SQLite storage to OS keyring
fn migrate_password_to_keyring(
    conn: &Connection,
    account_id: i64,
    email: &str,
    password: &str,
) -> Result<()> {
    // Store in keyring
    store_email_credential(email, password)?;

    // Update database marker
    conn.execute(
        "UPDATE email_accounts SET password_encrypted = ?1 WHERE id = ?2",
        params![KEYRING_MARKER, account_id],
    )
    .map_err(|e| Error::Generic(format!("Failed to update password marker: {}", e)))?;

    Ok(())
}

/// Delete the stored password for an email account
///
/// Cleans up both keyring and database storage.
fn delete_email_password(conn: &Connection, account_id: i64) -> Result<()> {
    // Get the email address first to delete from keyring
    let email: std::result::Result<String, _> = conn.query_row(
        "SELECT email FROM email_accounts WHERE id = ?1",
        params![account_id],
        |row| row.get(0),
    );

    // Delete from keyring if we have the email
    if let Ok(email) = email {
        if let Err(e) = delete_email_credential(&email) {
            warn!("Failed to delete keyring credential for {}: {}", email, e);
        }
    }

    // Clear the database record
    conn.execute(
        "UPDATE email_accounts SET password_encrypted = '' WHERE id = ?1",
        params![account_id],
    )
    .map_err(|e| Error::Generic(format!("Failed to clear password: {}", e)))?;

    debug!("Cleared password for email account {}", account_id);
    Ok(())
}

/// Decode a legacy Base64-encoded password
///
/// This is kept for backward compatibility during migration from the old
/// insecure Base64 storage to the new secure storage.
fn decode_legacy_password(encoded: &str) -> Result<String> {
    use base64::{engine::general_purpose::STANDARD as BASE64, Engine};

    let bytes = BASE64
        .decode(encoded)
        .map_err(|e| Error::Generic(format!("Failed to decode legacy password: {}", e)))?;

    String::from_utf8(bytes)
        .map_err(|e| Error::Generic(format!("Legacy password invalid UTF-8: {}", e)))
}

// =============================================================================
// Email Provider Configuration
// =============================================================================

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
    #[allow(dead_code)]
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

#[command]
pub async fn email_remove_account(app_handle: AppHandle, account_id: i64) -> Result<()> {
    info!("Removing email account {}", account_id);
    let conn = open_connection(&app_handle)?;

    // Clear the password before deleting the account
    // This ensures credentials are cleaned up even if the delete fails
    if let Err(e) = delete_email_password(&conn, account_id) {
        warn!("Failed to clear password for account {}: {}", account_id, e);
    }

    conn.execute(
        "DELETE FROM email_accounts WHERE id = ?1",
        params![account_id],
    )
    .map_err(|e| Error::Generic(format!("Database error: {}", e)))?;
    Ok(())
}

#[command]
pub async fn email_list_folders(app_handle: AppHandle, account_id: i64) -> Result<Vec<String>> {
    let conn = open_connection(&app_handle)?;
    let record = fetch_account(&conn, account_id)?;
    let password = get_email_password(&conn, account_id)?;

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
    let password = get_email_password(&conn, account_id)?;

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

#[command]
pub async fn email_mark_read(
    app_handle: AppHandle,
    account_id: i64,
    uid: u32,
    read: bool,
) -> Result<()> {
    let conn = open_connection(&app_handle)?;
    let record = fetch_account(&conn, account_id)?;
    let password = get_email_password(&conn, account_id)?;

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

#[command]
pub async fn email_delete(app_handle: AppHandle, account_id: i64, uid: u32) -> Result<()> {
    let conn = open_connection(&app_handle)?;
    let record = fetch_account(&conn, account_id)?;
    let password = get_email_password(&conn, account_id)?;

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

#[command]
pub async fn email_move_message(
    app_handle: AppHandle,
    account_id: i64,
    uid: u32,
    from_folder: String,
    to_folder: String,
) -> Result<()> {
    info!(
        "Moving message UID {} from {} to {} for account {}",
        uid, from_folder, to_folder, account_id
    );

    let conn = open_connection(&app_handle)?;
    let record = fetch_account(&conn, account_id)?;
    let password = get_email_password(&conn, account_id)?;

    let mut imap = ImapClient::connect(
        &record.imap_host,
        record.imap_port,
        &record.email,
        &password,
        record.imap_use_tls,
    )
    .await?;

    imap.move_email(uid, &from_folder, &to_folder).await?;
    imap.logout().await?;

    info!(
        "Successfully moved message UID {} from {} to {}",
        uid, from_folder, to_folder
    );

    Ok(())
}

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
    let password = get_email_password(&conn, account_id)?;

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

#[command]
pub async fn email_send(app_handle: AppHandle, request: SendEmailRequest) -> Result<String> {
    let conn = open_connection(&app_handle)?;
    let record = fetch_account(&conn, request.account_id)?;
    let password = get_email_password(&conn, request.account_id)?;

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

// AUDIT-EMAIL-077 fix: Alias for email_fetch_inbox for frontend compatibility
#[command]
pub async fn email_list_messages(
    app_handle: AppHandle,
    account_id: i64,
    folder: Option<String>,
    limit: Option<usize>,
    filter: Option<EmailFilter>,
) -> Result<Vec<Email>> {
    email_fetch_inbox(app_handle, account_id, folder, limit, filter).await
}

// AUDIT-EMAIL-077 fix: Alias for email_send for frontend compatibility
#[command]
pub async fn email_send_message(app_handle: AppHandle, request: SendEmailRequest) -> Result<String> {
    email_send(app_handle, request).await
}

// AUDIT-EMAIL-077 fix: New command to get a single message
#[command]
pub async fn email_get_message(
    app_handle: AppHandle,
    account_id: i64,
    folder: String,
    uid: u32,
) -> Result<Email> {
    let conn = open_connection(&app_handle)?;
    let record = fetch_account(&conn, account_id)?;
    let password = get_email_password(&conn, account_id)?;

    let mut imap = ImapClient::connect(
        &record.imap_host,
        record.imap_port,
        &record.email,
        &password,
        record.imap_use_tls,
    )
    .await?;

    // Fetch emails from the folder and find the one with matching UID
    let emails = imap.fetch_emails(account_id, &folder, 100, None).await?;
    imap.logout().await?;

    emails.into_iter()
        .find(|e| e.uid == uid)
        .ok_or_else(|| Error::Generic("Message not found".to_string()))
}

// AUDIT-EMAIL-077 fix: New command to search emails
#[command]
pub async fn email_search(
    app_handle: AppHandle,
    account_id: i64,
    query: String,
    folder: Option<String>,
    limit: Option<usize>,
) -> Result<EmailSearchResult> {
    let conn = open_connection(&app_handle)?;
    let record = fetch_account(&conn, account_id)?;
    let password = get_email_password(&conn, account_id)?;

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

    // Use fetch_emails with subject filter to simulate search
    let filter = EmailFilter {
        subject_contains: Some(query.clone()),
        ..Default::default()
    };
    
    let emails = imap.fetch_emails(account_id, &folder_name, max_messages, Some(filter)).await?;
    let total = emails.len();
    imap.logout().await?;

    Ok(EmailSearchResult {
        messages: emails,
        total,
        query,
    })
}

#[derive(Debug, Serialize)]
pub struct EmailSearchResult {
    pub messages: Vec<Email>,
    pub total: usize,
    pub query: String,
}

async fn contact_manager(app_handle: &AppHandle) -> Result<ContactManager> {
    let db_path = app_handle
        .path()
        .app_data_dir()
        .map_err(|err| Error::Generic(format!("Failed to resolve data dir: {}", err)))?
        .join("agiworkforce.db");

    ContactManager::new(db_path.to_string_lossy().as_ref()).await
}

#[command]
pub async fn contact_create(app_handle: AppHandle, contact: Contact) -> Result<i64> {
    let manager = contact_manager(&app_handle).await?;
    manager.create_contact(&contact).await
}

#[command]
pub async fn contact_get(app_handle: AppHandle, id: i64) -> Result<Option<Contact>> {
    let manager = contact_manager(&app_handle).await?;
    manager.get_contact(id).await
}

#[command]
pub async fn contact_list(
    app_handle: AppHandle,
    limit: Option<usize>,
    offset: Option<usize>,
) -> Result<Vec<Contact>> {
    let manager = contact_manager(&app_handle).await?;
    manager.list_contacts(limit, offset).await
}

#[command]
pub async fn contact_search(
    app_handle: AppHandle,
    query: String,
    limit: usize,
) -> Result<Vec<Contact>> {
    let manager = contact_manager(&app_handle).await?;
    manager.search_contacts(&query, limit).await
}

#[command]
pub async fn contact_update(app_handle: AppHandle, contact: Contact) -> Result<()> {
    info!("Updating contact {}", contact.id);
    let manager = contact_manager(&app_handle).await?;
    manager.update_contact(&contact).await
}

#[command]
pub async fn contact_delete(app_handle: AppHandle, id: i64) -> Result<()> {
    info!("Deleting contact {}", id);
    let manager = contact_manager(&app_handle).await?;
    manager.delete_contact(id).await
}

#[command]
pub async fn contact_import_vcard(app_handle: AppHandle, file_path: String) -> Result<usize> {
    info!("Importing contacts from {}", file_path);
    let manager = contact_manager(&app_handle).await?;
    manager.import_vcard(&file_path).await
}

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

/// Insert or update an email account in the database
///
/// The password is stored securely using OS keyring (with SQLite+AES fallback).
/// We first insert/update the account metadata with an empty password placeholder,
/// then store the password securely using `store_email_password`.
fn upsert_email_account(
    conn: &Connection,
    provider: &EmailProvider,
    provider_key: &str,
    email: &str,
    display_name: Option<String>,
    password: &str,
) -> Result<i64> {
    let created_at = Utc::now().timestamp();

    // Insert/update the account with an empty password placeholder
    // The actual password will be stored securely after we have the account ID
    conn.execute(
        "INSERT INTO email_accounts (provider, email, display_name, imap_host, imap_port, imap_use_tls,
                                     smtp_host, smtp_port, smtp_use_tls, password_encrypted, created_at, last_sync)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, '', ?10, NULL)
         ON CONFLICT(email) DO UPDATE SET
            provider = excluded.provider,
            display_name = excluded.display_name,
            imap_host = excluded.imap_host,
            imap_port = excluded.imap_port,
            imap_use_tls = excluded.imap_use_tls,
            smtp_host = excluded.smtp_host,
            smtp_port = excluded.smtp_port,
            smtp_use_tls = excluded.smtp_use_tls",
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
            created_at
        ],
    )
    .map_err(|e| Error::Generic(format!("Database error: {}", e)))?;

    let id: i64 = conn
        .query_row(
            "SELECT id FROM email_accounts WHERE email = ?1",
            params![email],
            |row| row.get(0),
        )
        .map_err(|e| Error::Generic(format!("Database error: {}", e)))?;

    // Store the password securely (OS keyring preferred, SQLite+AES fallback)
    store_email_password(conn, id, email, password)?;

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
    .map_err(|e| Error::Database(e.to_string()))
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

// =============================================================================
// Keyring Migration Tauri Commands
// =============================================================================

/// Response for keyring status check
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyringStatus {
    /// Whether OS keyring is available on this system
    pub keyring_available: bool,
    /// Total number of email accounts
    pub total_accounts: usize,
    /// Number of accounts with credentials in keyring
    pub accounts_in_keyring: usize,
    /// Number of accounts with credentials in encrypted SQLite storage
    pub accounts_in_sqlite: usize,
    /// Number of accounts with legacy Base64 storage (needs migration)
    pub accounts_legacy: usize,
}

/// Migration result for a single account
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrationResult {
    /// Email address of the account
    pub email: String,
    /// Whether migration was successful
    pub success: bool,
    /// Error message if migration failed
    pub error: Option<String>,
}

/// Check the keyring status for all email accounts
///
/// Returns information about:
/// - Whether OS keyring is available
/// - How many accounts have credentials in keyring
/// - How many accounts have credentials in SQLite (encrypted)
/// - How many accounts have legacy Base64 storage
#[command]
pub async fn email_check_keyring_status(app_handle: AppHandle) -> Result<KeyringStatus> {
    let conn = open_connection(&app_handle)?;

    let keyring_available = is_keyring_available();

    let mut total_accounts = 0;
    let mut accounts_in_keyring = 0;
    let mut accounts_in_sqlite = 0;
    let mut accounts_legacy = 0;

    let mut stmt = conn
        .prepare("SELECT email, password_encrypted FROM email_accounts")
        .map_err(|e| Error::Database(format!("Failed to query accounts: {}", e)))?;

    let accounts = stmt
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| Error::Database(format!("Failed to query accounts: {}", e)))?;

    for account in accounts {
        let (email, password_encrypted) =
            account.map_err(|e| Error::Database(format!("Failed to read account: {}", e)))?;

        total_accounts += 1;

        if password_encrypted == KEYRING_MARKER {
            accounts_in_keyring += 1;
        } else if password_encrypted.is_empty() {
            // No password stored
            continue;
        } else if password_encrypted.starts_with('{') {
            // JSON EncryptedSecret format
            accounts_in_sqlite += 1;
        } else {
            // Likely legacy Base64 format
            accounts_legacy += 1;
        }

        debug!(
            "Account {}: storage={}",
            email,
            if password_encrypted == KEYRING_MARKER {
                "keyring"
            } else if password_encrypted.starts_with('{') {
                "sqlite_encrypted"
            } else {
                "legacy_base64"
            }
        );
    }

    Ok(KeyringStatus {
        keyring_available,
        total_accounts,
        accounts_in_keyring,
        accounts_in_sqlite,
        accounts_legacy,
    })
}

/// Migrate all email credentials to OS keyring
///
/// This command will:
/// 1. Check if keyring is available
/// 2. For each account with credentials in SQLite or legacy storage:
///    - Decrypt/decode the password
///    - Store it in the OS keyring
///    - Update the database marker
///
/// Returns a list of migration results for each account.
#[command]
pub async fn email_migrate_credentials(app_handle: AppHandle) -> Result<Vec<MigrationResult>> {
    info!("Starting email credential migration to OS keyring");

    if !is_keyring_available() {
        return Err(Error::Generic(
            "OS keyring is not available on this system".to_string(),
        ));
    }

    let conn = open_connection(&app_handle)?;
    let mut results = Vec::new();

    // Get all accounts that are NOT in keyring
    let mut stmt = conn
        .prepare(
            "SELECT id, email, password_encrypted FROM email_accounts
             WHERE password_encrypted != '' AND password_encrypted != ?1",
        )
        .map_err(|e| Error::Database(format!("Failed to query accounts: {}", e)))?;

    let accounts: Vec<(i64, String, String)> = stmt
        .query_map(params![KEYRING_MARKER], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(|e| Error::Database(format!("Failed to query accounts: {}", e)))?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| Error::Database(format!("Failed to read accounts: {}", e)))?;

    for (account_id, email, password_encrypted) in accounts {
        let result = migrate_single_account(&conn, account_id, &email, &password_encrypted);

        match &result {
            Ok(_) => {
                info!("Successfully migrated credentials for {}", email);
                results.push(MigrationResult {
                    email,
                    success: true,
                    error: None,
                });
            }
            Err(e) => {
                error!("Failed to migrate credentials for {}: {}", email, e);
                results.push(MigrationResult {
                    email,
                    success: false,
                    error: Some(e.to_string()),
                });
            }
        }
    }

    info!(
        "Migration complete: {} successful, {} failed",
        results.iter().filter(|r| r.success).count(),
        results.iter().filter(|r| !r.success).count()
    );

    Ok(results)
}

/// Migrate a single account's credentials to keyring
fn migrate_single_account(
    conn: &Connection,
    account_id: i64,
    email: &str,
    password_encrypted: &str,
) -> Result<()> {
    // Decrypt/decode the password from current storage
    let password = get_email_password_encrypted(password_encrypted)?;

    // Store in keyring and update database marker
    migrate_password_to_keyring(conn, account_id, email, &password)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn create_test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute(
            "CREATE TABLE email_accounts (
                id INTEGER PRIMARY KEY,
                provider TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                display_name TEXT,
                imap_host TEXT NOT NULL,
                imap_port INTEGER NOT NULL,
                imap_use_tls INTEGER NOT NULL,
                smtp_host TEXT NOT NULL,
                smtp_port INTEGER NOT NULL,
                smtp_use_tls INTEGER NOT NULL,
                password_encrypted TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                last_sync INTEGER
            )",
            [],
        )
        .unwrap();
        conn
    }

    #[test]
    fn test_secure_password_storage_and_retrieval() {
        // This test uses the encrypted fallback storage directly since keyring
        // may not be available in test/CI environments (requires signed app, permissions, etc.)
        let conn = create_test_db();
        let original_password = "super-secret-password-123!@#";

        // Insert a test account
        conn.execute(
            "INSERT INTO email_accounts (provider, email, imap_host, imap_port, imap_use_tls,
                                         smtp_host, smtp_port, smtp_use_tls, password_encrypted, created_at)
             VALUES ('gmail', 'test@example.com', 'imap.gmail.com', 993, 1,
                     'smtp.gmail.com', 587, 1, '', 1234567890)",
            [],
        )
        .unwrap();

        let account_id = conn.last_insert_rowid();

        // Test the fallback encrypted storage (works reliably in all environments)
        store_email_password_encrypted(&conn, account_id, original_password).unwrap();

        // Verify the password can be retrieved
        let retrieved = get_email_password(&conn, account_id).unwrap();
        assert_eq!(original_password, retrieved);
    }

    #[test]
    fn test_legacy_base64_migration() {
        // Tests migration from legacy Base64 to encrypted storage
        // Note: Migration to keyring may not work in test environments, but the
        // encrypted storage fallback ensures passwords remain accessible
        use base64::{engine::general_purpose::STANDARD as BASE64, Engine};

        let conn = create_test_db();
        let original_password = "legacy-password";
        let legacy_base64 = BASE64.encode(original_password.as_bytes());

        // Insert account with legacy Base64 password
        conn.execute(
            "INSERT INTO email_accounts (provider, email, imap_host, imap_port, imap_use_tls,
                                         smtp_host, smtp_port, smtp_use_tls, password_encrypted, created_at)
             VALUES ('gmail', 'legacy@example.com', 'imap.gmail.com', 993, 1,
                     'smtp.gmail.com', 587, 1, ?1, 1234567890)",
            params![legacy_base64],
        )
        .unwrap();

        let account_id = conn.last_insert_rowid();

        // First retrieval should work (decodes legacy Base64)
        let retrieved = get_email_password(&conn, account_id).unwrap();
        assert_eq!(original_password, retrieved);

        // Check what storage format is used after migration attempt
        let stored_value: String = conn
            .query_row(
                "SELECT password_encrypted FROM email_accounts WHERE id = ?1",
                params![account_id],
                |row| row.get(0),
            )
            .unwrap();

        // Should have been migrated to either keyring marker or encrypted JSON
        // (keyring migration may fail in test environments, that's OK)
        assert!(
            stored_value == KEYRING_MARKER || stored_value.starts_with('{'),
            "Password should have been migrated from legacy Base64"
        );
    }

    #[test]
    fn test_password_deletion() {
        let conn = create_test_db();

        conn.execute(
            "INSERT INTO email_accounts (provider, email, imap_host, imap_port, imap_use_tls,
                                         smtp_host, smtp_port, smtp_use_tls, password_encrypted, created_at)
             VALUES ('gmail', 'delete@example.com', 'imap.gmail.com', 993, 1,
                     'smtp.gmail.com', 587, 1, '', 1234567890)",
            [],
        )
        .unwrap();

        let account_id = conn.last_insert_rowid();

        // Store a password using encrypted fallback
        store_email_password_encrypted(&conn, account_id, "to-be-deleted").unwrap();

        // Verify it's stored (either in keyring or database)
        let stored: String = conn
            .query_row(
                "SELECT password_encrypted FROM email_accounts WHERE id = ?1",
                params![account_id],
                |row| row.get(0),
            )
            .unwrap();
        assert!(!stored.is_empty());

        // Delete the password
        delete_email_password(&conn, account_id).unwrap();

        // Verify database record is cleared
        let after_delete: String = conn
            .query_row(
                "SELECT password_encrypted FROM email_accounts WHERE id = ?1",
                params![account_id],
                |row| row.get(0),
            )
            .unwrap();
        assert!(after_delete.is_empty());
    }

    #[test]
    fn test_decode_legacy_password() {
        use base64::{engine::general_purpose::STANDARD as BASE64, Engine};

        let original = "super-secret";
        let encoded = BASE64.encode(original.as_bytes());
        let decoded = decode_legacy_password(&encoded).expect("Should decode");
        assert_eq!(original, decoded);
    }

    #[test]
    fn test_encrypted_fallback_storage() {
        // Test the encrypted fallback storage directly
        let conn = create_test_db();
        let original_password = "fallback-test-password";

        conn.execute(
            "INSERT INTO email_accounts (provider, email, imap_host, imap_port, imap_use_tls,
                                         smtp_host, smtp_port, smtp_use_tls, password_encrypted, created_at)
             VALUES ('gmail', 'fallback@example.com', 'imap.gmail.com', 993, 1,
                     'smtp.gmail.com', 587, 1, '', 1234567890)",
            [],
        )
        .unwrap();

        let account_id = conn.last_insert_rowid();

        // Test the encrypted storage directly (bypassing keyring)
        store_email_password_encrypted(&conn, account_id, original_password).unwrap();

        // Verify the password is stored as JSON EncryptedSecret
        let stored_value: String = conn
            .query_row(
                "SELECT password_encrypted FROM email_accounts WHERE id = ?1",
                params![account_id],
                |row| row.get(0),
            )
            .unwrap();

        assert!(
            stored_value.starts_with('{'),
            "Password should be stored as JSON EncryptedSecret"
        );

        // Verify decryption works
        let retrieved = get_email_password_encrypted(&stored_value).unwrap();
        assert_eq!(original_password, retrieved);
    }

    #[test]
    fn test_password_with_special_characters() {
        // Test various special characters using encrypted fallback storage
        // (keyring may not be available in test environments)
        let conn = create_test_db();

        // Test with various special characters that might cause issues
        let passwords = [
            "p@ssw0rd!#$%^&*()",
            "password with spaces",
            "unicode: \u{1F600}\u{1F389}",
            r#"quotes "and' backslash\"#,
            "newline\nand\ttab",
        ];

        for (i, original_password) in passwords.iter().enumerate() {
            let email = format!("test{}@example.com", i);
            conn.execute(
                "INSERT INTO email_accounts (provider, email, imap_host, imap_port, imap_use_tls,
                                             smtp_host, smtp_port, smtp_use_tls, password_encrypted, created_at)
                 VALUES ('gmail', ?1, 'imap.gmail.com', 993, 1,
                         'smtp.gmail.com', 587, 1, '', 1234567890)",
                params![&email],
            )
            .unwrap();

            let account_id = conn.last_insert_rowid();

            // Use encrypted fallback storage directly to ensure test reliability
            store_email_password_encrypted(&conn, account_id, original_password).unwrap();
            let retrieved = get_email_password(&conn, account_id).unwrap();
            assert_eq!(
                *original_password, retrieved,
                "Password storage/retrieval failed for test case"
            );
        }
    }

    #[test]
    fn test_keyring_helper_functions() {
        // Test the keyring helper functions directly
        // Note: These may fail in test environments without proper keychain access

        let test_email = "keyring-test@example.com";
        let test_password = "keyring-test-password";

        // Try to store - may fail if keyring not available
        let store_result = store_email_credential(test_email, test_password);

        if store_result.is_ok() {
            // If store succeeded, verify we can retrieve
            let retrieve_result = get_email_credential(test_email);
            if let Ok(retrieved) = retrieve_result {
                assert_eq!(test_password, retrieved);
            }
            // Clean up
            let _ = delete_email_credential(test_email);
        }
        // If keyring operations fail, that's OK - fallback storage is tested separately
    }

    #[test]
    fn test_keyring_availability_check() {
        // Test that the keyring availability check doesn't panic
        // Just verify it runs without panicking and returns a boolean
        let _available: bool = is_keyring_available();
    }
}
