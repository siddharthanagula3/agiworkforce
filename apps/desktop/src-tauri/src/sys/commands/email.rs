use chrono::Utc;
use rusqlite::{params, Connection, Row};
use serde::{Deserialize, Serialize};
use tauri::{command, AppHandle, Manager};
use tracing::{debug, info, warn};

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
// Secure Email Credential Storage
// =============================================================================

/// Get the encryption key for email credentials
fn get_email_encryption_key() -> Vec<u8> {
    machine_key::derive_key(KeyPurpose::EmailCredentials)
}

/// Store an email password securely using AES-256-GCM encryption
///
/// The password is encrypted with a machine-derived key and stored in the database
/// as a JSON-serialized `EncryptedSecret` struct in the `password_encrypted` column.
fn store_email_password(conn: &Connection, account_id: i64, password: &str) -> Result<()> {
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

    debug!("Stored encrypted password for email account {}", account_id);
    Ok(())
}

/// Retrieve and decrypt an email password
///
/// First attempts to decrypt the `password_encrypted` field as an `EncryptedSecret`.
/// If that fails (legacy Base64 data), falls back to Base64 decoding and migrates
/// the password to the new encrypted format.
fn get_email_password(conn: &Connection, account_id: i64) -> Result<String> {
    let encrypted_value: String = conn
        .query_row(
            "SELECT password_encrypted FROM email_accounts WHERE id = ?1",
            params![account_id],
            |row| row.get(0),
        )
        .map_err(|e| Error::Database(format!("Failed to retrieve password: {}", e)))?;

    // Try to parse as EncryptedSecret (new format)
    if let Ok(encrypted) = serde_json::from_str::<EncryptedSecret>(&encrypted_value) {
        let key = get_email_encryption_key();
        return decrypt_secret(&key, &encrypted)
            .map_err(|e| Error::Generic(format!("Failed to decrypt email password: {}", e)));
    }

    // Fallback: Legacy Base64 format - decode and migrate
    debug!(
        "Migrating legacy Base64 password for account {} to secure storage",
        account_id
    );
    let password = decode_legacy_password(&encrypted_value)?;

    // Migrate to new encrypted format
    if let Err(e) = store_email_password(conn, account_id, &password) {
        warn!(
            "Failed to migrate password to secure storage for account {}: {}",
            account_id, e
        );
        // Still return the password even if migration fails
    } else {
        info!(
            "Successfully migrated password to secure storage for account {}",
            account_id
        );
    }

    Ok(password)
}

/// Delete the stored password for an email account
///
/// This is called when removing an email account to ensure credentials are cleaned up.
fn delete_email_password(conn: &Connection, account_id: i64) -> Result<()> {
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
/// insecure Base64 storage to the new AES-256-GCM encrypted storage.
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
/// The password is stored separately using secure AES-256-GCM encryption.
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

    // Store the password securely with AES-256-GCM encryption
    store_email_password(conn, id, password)?;

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

        // Store the password securely
        store_email_password(&conn, account_id, original_password).unwrap();

        // Verify the password is NOT stored as plain Base64
        let stored_value: String = conn
            .query_row(
                "SELECT password_encrypted FROM email_accounts WHERE id = ?1",
                params![account_id],
                |row| row.get(0),
            )
            .unwrap();

        // The stored value should be JSON (starts with '{')
        assert!(
            stored_value.starts_with('{'),
            "Password should be stored as JSON EncryptedSecret"
        );

        // Retrieve and verify the password
        let retrieved = get_email_password(&conn, account_id).unwrap();
        assert_eq!(original_password, retrieved);
    }

    #[test]
    fn test_legacy_base64_migration() {
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

        // Get password - should trigger migration
        let retrieved = get_email_password(&conn, account_id).unwrap();
        assert_eq!(original_password, retrieved);

        // Verify the password was migrated to new format
        let stored_value: String = conn
            .query_row(
                "SELECT password_encrypted FROM email_accounts WHERE id = ?1",
                params![account_id],
                |row| row.get(0),
            )
            .unwrap();

        // After migration, should be JSON format
        assert!(
            stored_value.starts_with('{'),
            "Password should have been migrated to JSON EncryptedSecret"
        );

        // Verify we can still retrieve the password after migration
        let retrieved_again = get_email_password(&conn, account_id).unwrap();
        assert_eq!(original_password, retrieved_again);
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

        // Store a password
        store_email_password(&conn, account_id, "to-be-deleted").unwrap();

        // Verify it's stored
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

        // Verify it's cleared
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
    fn test_password_with_special_characters() {
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
            conn.execute(
                "INSERT INTO email_accounts (provider, email, imap_host, imap_port, imap_use_tls,
                                             smtp_host, smtp_port, smtp_use_tls, password_encrypted, created_at)
                 VALUES ('gmail', ?1, 'imap.gmail.com', 993, 1,
                         'smtp.gmail.com', 587, 1, '', 1234567890)",
                params![format!("test{}@example.com", i)],
            )
            .unwrap();

            let account_id = conn.last_insert_rowid();

            store_email_password(&conn, account_id, original_password).unwrap();
            let retrieved = get_email_password(&conn, account_id).unwrap();
            assert_eq!(
                *original_password, retrieved,
                "Failed for password: {:?}",
                original_password
            );
        }
    }
}
