//! Gmail OAuth 2.0 Tauri Commands
//!
//! This module provides Tauri commands for Gmail OAuth 2.0 authentication.
//! Tokens are stored securely using machine-derived encryption keys in SQLite.
//!
//! # Commands
//! - `gmail_oauth_start` - Start OAuth flow, returns authorization URL
//! - `gmail_oauth_complete` - Complete OAuth flow with authorization code
//! - `gmail_oauth_refresh` - Refresh access token for an account
//! - `gmail_oauth_list_accounts` - List connected Gmail accounts
//! - `gmail_oauth_disconnect` - Disconnect a Gmail account

use std::sync::Arc;

use chrono::{TimeZone, Utc};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use tauri::{command, AppHandle, Emitter, Manager, State};
use uuid::Uuid;

use crate::features::communications::gmail_oauth::{
    GmailAccount, GmailAccountInfo, GmailOAuthManager, GmailOAuthSettings,
};
use crate::sys::api::oauth::TokenResponse;
use crate::sys::error::{Error, Result};
use crate::sys::security::{
    encryption::{decrypt_secret, encrypt_secret, EncryptedSecret},
    machine_key::{self, KeyPurpose},
};

/// State for Gmail OAuth manager
pub struct GmailOAuthState {
    pub manager: Arc<GmailOAuthManager>,
}

impl Default for GmailOAuthState {
    fn default() -> Self {
        Self::new()
    }
}

impl GmailOAuthState {
    pub fn new() -> Self {
        Self {
            manager: Arc::new(GmailOAuthManager::new()),
        }
    }
}

/// OAuth configuration request
#[derive(Debug, Deserialize)]
pub struct GmailOAuthConfig {
    pub client_id: String,
    pub client_secret: String,
    pub redirect_uri: String,
}

/// Authorization URL response
#[derive(Debug, Serialize)]
pub struct GmailAuthUrlResponse {
    pub auth_url: String,
    pub state: String,
}

/// OAuth completion request
#[derive(Debug, Deserialize)]
pub struct GmailOAuthCompleteRequest {
    pub state: String,
    pub code: String,
}

/// Account ID response
#[derive(Debug, Serialize)]
pub struct GmailAccountIdResponse {
    pub account_id: String,
}

// =============================================================================
// Secure Token Storage
// =============================================================================

/// Get the encryption key for Gmail OAuth tokens
fn get_gmail_encryption_key() -> Vec<u8> {
    // Use EmailCredentials purpose since this is related to email authentication
    machine_key::derive_key(KeyPurpose::EmailCredentials)
}

/// Store Gmail OAuth tokens securely
fn store_gmail_tokens(conn: &Connection, account_id: &str, token: &TokenResponse) -> Result<()> {
    let key = get_gmail_encryption_key();

    let token_json = serde_json::to_string(token)
        .map_err(|e| Error::Generic(format!("Failed to serialize token: {}", e)))?;

    let encrypted = encrypt_secret(&key, &token_json)
        .map_err(|e| Error::Generic(format!("Failed to encrypt Gmail token: {}", e)))?;

    let encrypted_json = serde_json::to_string(&encrypted)
        .map_err(|e| Error::Generic(format!("Failed to serialize encrypted token: {}", e)))?;

    conn.execute(
        "UPDATE gmail_accounts SET token_encrypted = ?1, updated_at = ?2 WHERE id = ?3",
        params![encrypted_json, Utc::now().timestamp(), account_id],
    )
    .map_err(|e| Error::Generic(format!("Failed to store Gmail token: {}", e)))?;

    tracing::debug!("Stored encrypted Gmail token for account {}", account_id);
    Ok(())
}

/// Retrieve and decrypt Gmail OAuth tokens
#[allow(dead_code)]
fn get_gmail_tokens(conn: &Connection, account_id: &str) -> Result<TokenResponse> {
    let encrypted_json: String = conn
        .query_row(
            "SELECT token_encrypted FROM gmail_accounts WHERE id = ?1",
            params![account_id],
            |row| row.get(0),
        )
        .map_err(|e| Error::Database(format!("Failed to retrieve Gmail token: {}", e)))?;

    let encrypted: EncryptedSecret = serde_json::from_str(&encrypted_json)
        .map_err(|e| Error::Generic(format!("Failed to parse encrypted token: {}", e)))?;

    let key = get_gmail_encryption_key();
    let token_json = decrypt_secret(&key, &encrypted)
        .map_err(|e| Error::Generic(format!("Failed to decrypt Gmail token: {}", e)))?;

    let token: TokenResponse = serde_json::from_str(&token_json)
        .map_err(|e| Error::Generic(format!("Failed to parse Gmail token: {}", e)))?;

    Ok(token)
}

// =============================================================================
// Tauri Commands
// =============================================================================

/// Start Gmail OAuth 2.0 flow
///
/// Returns an authorization URL that the user should be redirected to.
/// The state parameter should be saved and verified when completing the OAuth flow.
#[command]
pub async fn gmail_oauth_start(
    config: GmailOAuthConfig,
    state: State<'_, GmailOAuthState>,
    app: AppHandle,
) -> Result<GmailAuthUrlResponse> {
    tracing::info!("Starting Gmail OAuth flow");

    let (auth_url, oauth_state) =
        state
            .manager
            .start_oauth(config.client_id, config.client_secret, config.redirect_uri)?;

    app.emit("gmail:auth_started", &oauth_state)
        .map_err(|e| Error::Other(format!("Failed to emit event: {}", e)))?;

    Ok(GmailAuthUrlResponse {
        auth_url,
        state: oauth_state,
    })
}

/// Complete Gmail OAuth 2.0 flow
///
/// Called after the user has authorized the application and been redirected back.
/// Returns the account ID of the newly connected account.
#[command]
pub async fn gmail_oauth_complete(
    request: GmailOAuthCompleteRequest,
    state: State<'_, GmailOAuthState>,
    app: AppHandle,
) -> Result<GmailAccountIdResponse> {
    tracing::info!("Completing Gmail OAuth flow");

    let (settings, pkce) = state.manager.take_pending(&request.state)?;

    let (account_info, client) =
        GmailOAuthManager::complete_oauth(settings, pkce, &request.code).await?;

    let account_id = Uuid::new_v4().to_string();
    let now = Utc::now().timestamp();

    // Store in database
    let conn = open_connection(&app)?;
    ensure_gmail_table(&conn)?;
    insert_gmail_account(&conn, &account_id, &account_info, now)?;

    // Store tokens securely (encrypted)
    store_gmail_tokens(&conn, &account_id, &account_info.token)?;

    // Add to manager
    state
        .manager
        .upsert_account(account_id.clone(), account_info.clone(), Some(client));

    app.emit("gmail:connected", &account_id)
        .map_err(|e| Error::Other(format!("Failed to emit event: {}", e)))?;

    tracing::info!(
        "Gmail account connected: {} ({})",
        account_info.email.as_deref().unwrap_or("unknown"),
        account_id
    );

    Ok(GmailAccountIdResponse { account_id })
}

/// Refresh Gmail OAuth token for an account
///
/// Returns true if refresh was successful, false otherwise.
#[command]
pub async fn gmail_oauth_refresh(
    account_id: String,
    state: State<'_, GmailOAuthState>,
    app: AppHandle,
) -> Result<bool> {
    tracing::info!("Refreshing Gmail token for account: {}", account_id);

    // Load account info from database if not in memory
    let conn = open_connection(&app)?;
    let (info, _) = fetch_gmail_account(&conn, &account_id)?;
    state.manager.upsert_account(account_id.clone(), info, None);

    // Refresh the token
    let success = state.manager.refresh_account_token(&account_id).await?;

    if success {
        // Persist the updated token
        if let Some(updated_info) = state.manager.account_info(&account_id) {
            store_gmail_tokens(&conn, &account_id, &updated_info.token)?;
        }

        app.emit("gmail:token_refreshed", &account_id)
            .map_err(|e| Error::Other(format!("Failed to emit event: {}", e)))?;
    }

    Ok(success)
}

/// List all connected Gmail accounts
#[command]
pub async fn gmail_oauth_list_accounts(
    state: State<'_, GmailOAuthState>,
    app: AppHandle,
) -> Result<Vec<GmailAccount>> {
    let conn = open_connection(&app)?;
    ensure_gmail_table(&conn)?;

    let records = list_gmail_accounts(&conn)?;

    // Load accounts into manager
    for (account_id, info, _) in &records {
        state
            .manager
            .upsert_account(account_id.clone(), info.clone(), None);
    }

    let accounts = records
        .into_iter()
        .map(|(account_id, info, created_at)| GmailAccount {
            account_id,
            email: info.email,
            display_name: info.display_name,
            picture_url: info.picture_url,
            connected_at: created_at,
        })
        .collect();

    Ok(accounts)
}

/// Disconnect a Gmail account
#[command]
pub async fn gmail_oauth_disconnect(
    account_id: String,
    state: State<'_, GmailOAuthState>,
    app: AppHandle,
) -> Result<()> {
    tracing::info!("Disconnecting Gmail account: {}", account_id);

    let conn = open_connection(&app)?;
    delete_gmail_account(&conn, &account_id)?;
    state.manager.remove_account(&account_id);

    app.emit("gmail:disconnected", &account_id)
        .map_err(|e| Error::Other(format!("Failed to emit event: {}", e)))?;

    Ok(())
}

/// Get account info for a specific Gmail account
#[command]
pub async fn gmail_oauth_get_account(
    account_id: String,
    state: State<'_, GmailOAuthState>,
    app: AppHandle,
) -> Result<Option<GmailAccount>> {
    let conn = open_connection(&app)?;

    match fetch_gmail_account(&conn, &account_id) {
        Ok((info, created_at)) => {
            state
                .manager
                .upsert_account(account_id.clone(), info.clone(), None);

            Ok(Some(GmailAccount {
                account_id,
                email: info.email,
                display_name: info.display_name,
                picture_url: info.picture_url,
                connected_at: created_at,
            }))
        }
        Err(_) => Ok(None),
    }
}

// =============================================================================
// Database Operations
// =============================================================================

fn open_connection(app_handle: &AppHandle) -> Result<Connection> {
    let db_path = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| Error::Generic(format!("Failed to get app data dir: {}", e)))?
        .join("agiworkforce.db");

    Connection::open(db_path).map_err(|e| Error::Generic(format!("Database error: {}", e)))
}

fn ensure_gmail_table(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS gmail_accounts (
            id TEXT PRIMARY KEY,
            email TEXT,
            display_name TEXT,
            picture_url TEXT,
            client_id TEXT NOT NULL,
            client_secret_encrypted TEXT NOT NULL,
            redirect_uri TEXT NOT NULL,
            token_encrypted TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )",
        [],
    )
    .map_err(|e| Error::Generic(format!("Failed to create gmail_accounts table: {}", e)))?;

    Ok(())
}

fn insert_gmail_account(
    conn: &Connection,
    account_id: &str,
    info: &GmailAccountInfo,
    created_at: i64,
) -> Result<()> {
    // Encrypt the client secret for storage
    let key = get_gmail_encryption_key();
    let encrypted_secret = encrypt_secret(&key, &info.settings.client_secret)
        .map_err(|e| Error::Generic(format!("Failed to encrypt client secret: {}", e)))?;
    let encrypted_secret_json = serde_json::to_string(&encrypted_secret)
        .map_err(|e| Error::Generic(format!("Failed to serialize encrypted secret: {}", e)))?;

    // Encrypt the token for storage
    let token_json = serde_json::to_string(&info.token)
        .map_err(|e| Error::Generic(format!("Failed to serialize token: {}", e)))?;
    let encrypted_token = encrypt_secret(&key, &token_json)
        .map_err(|e| Error::Generic(format!("Failed to encrypt token: {}", e)))?;
    let encrypted_token_json = serde_json::to_string(&encrypted_token)
        .map_err(|e| Error::Generic(format!("Failed to serialize encrypted token: {}", e)))?;

    conn.execute(
        "INSERT INTO gmail_accounts (id, email, display_name, picture_url, client_id,
                                     client_secret_encrypted, redirect_uri, token_encrypted,
                                     created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)
         ON CONFLICT(id) DO UPDATE SET
            email = excluded.email,
            display_name = excluded.display_name,
            picture_url = excluded.picture_url,
            client_id = excluded.client_id,
            client_secret_encrypted = excluded.client_secret_encrypted,
            redirect_uri = excluded.redirect_uri,
            token_encrypted = excluded.token_encrypted,
            updated_at = excluded.updated_at",
        params![
            account_id,
            info.email,
            info.display_name,
            info.picture_url,
            info.settings.client_id,
            encrypted_secret_json,
            info.settings.redirect_uri,
            encrypted_token_json,
            created_at
        ],
    )
    .map_err(|e| Error::Generic(format!("Database error: {}", e)))?;

    Ok(())
}

fn fetch_gmail_account(
    conn: &Connection,
    account_id: &str,
) -> Result<(GmailAccountInfo, chrono::DateTime<Utc>)> {
    let key = get_gmail_encryption_key();

    conn.query_row(
        "SELECT email, display_name, picture_url, client_id, client_secret_encrypted,
                redirect_uri, token_encrypted, created_at
         FROM gmail_accounts WHERE id = ?1",
        params![account_id],
        |row| {
            let email: Option<String> = row.get(0)?;
            let display_name: Option<String> = row.get(1)?;
            let picture_url: Option<String> = row.get(2)?;
            let client_id: String = row.get(3)?;
            let client_secret_encrypted: String = row.get(4)?;
            let redirect_uri: String = row.get(5)?;
            let token_encrypted: String = row.get(6)?;
            let created_at: i64 = row.get(7)?;

            // Decrypt client secret
            let encrypted_secret: EncryptedSecret = serde_json::from_str(&client_secret_encrypted)
                .map_err(|e| {
                    rusqlite::Error::FromSqlConversionFailure(
                        4,
                        rusqlite::types::Type::Text,
                        Box::new(Error::Generic(format!(
                            "Failed to parse encrypted secret: {}",
                            e
                        ))),
                    )
                })?;
            let client_secret = decrypt_secret(&key, &encrypted_secret).map_err(|e| {
                rusqlite::Error::FromSqlConversionFailure(
                    4,
                    rusqlite::types::Type::Text,
                    Box::new(Error::Generic(format!(
                        "Failed to decrypt client secret: {}",
                        e
                    ))),
                )
            })?;

            // Decrypt token
            let encrypted_token: EncryptedSecret =
                serde_json::from_str(&token_encrypted).map_err(|e| {
                    rusqlite::Error::FromSqlConversionFailure(
                        6,
                        rusqlite::types::Type::Text,
                        Box::new(Error::Generic(format!(
                            "Failed to parse encrypted token: {}",
                            e
                        ))),
                    )
                })?;
            let token_json = decrypt_secret(&key, &encrypted_token).map_err(|e| {
                rusqlite::Error::FromSqlConversionFailure(
                    6,
                    rusqlite::types::Type::Text,
                    Box::new(Error::Generic(format!("Failed to decrypt token: {}", e))),
                )
            })?;
            let token: TokenResponse = serde_json::from_str(&token_json).map_err(|e| {
                rusqlite::Error::FromSqlConversionFailure(
                    6,
                    rusqlite::types::Type::Text,
                    Box::new(Error::Generic(format!("Failed to parse token: {}", e))),
                )
            })?;

            let connected_at = Utc
                .timestamp_opt(created_at, 0)
                .single()
                .unwrap_or_else(Utc::now);

            Ok((
                GmailAccountInfo {
                    settings: GmailOAuthSettings {
                        client_id,
                        client_secret,
                        redirect_uri,
                    },
                    token,
                    email,
                    display_name,
                    picture_url,
                },
                connected_at,
            ))
        },
    )
    .map_err(|e| Error::Generic(format!("Database error: {}", e)))
}

fn list_gmail_accounts(
    conn: &Connection,
) -> Result<Vec<(String, GmailAccountInfo, chrono::DateTime<Utc>)>> {
    let key = get_gmail_encryption_key();

    let mut stmt = conn
        .prepare(
            "SELECT id, email, display_name, picture_url, client_id, client_secret_encrypted,
                    redirect_uri, token_encrypted, created_at
             FROM gmail_accounts
             ORDER BY created_at DESC",
        )
        .map_err(|e| Error::Generic(format!("Database error: {}", e)))?;

    let accounts = stmt
        .query_map([], |row| {
            let id: String = row.get(0)?;
            let email: Option<String> = row.get(1)?;
            let display_name: Option<String> = row.get(2)?;
            let picture_url: Option<String> = row.get(3)?;
            let client_id: String = row.get(4)?;
            let client_secret_encrypted: String = row.get(5)?;
            let redirect_uri: String = row.get(6)?;
            let token_encrypted: String = row.get(7)?;
            let created_at: i64 = row.get(8)?;

            // Decrypt client secret
            let encrypted_secret: EncryptedSecret = serde_json::from_str(&client_secret_encrypted)
                .map_err(|e| {
                    rusqlite::Error::FromSqlConversionFailure(
                        5,
                        rusqlite::types::Type::Text,
                        Box::new(Error::Generic(format!(
                            "Failed to parse encrypted secret: {}",
                            e
                        ))),
                    )
                })?;
            let client_secret = decrypt_secret(&key, &encrypted_secret).map_err(|e| {
                rusqlite::Error::FromSqlConversionFailure(
                    5,
                    rusqlite::types::Type::Text,
                    Box::new(Error::Generic(format!(
                        "Failed to decrypt client secret: {}",
                        e
                    ))),
                )
            })?;

            // Decrypt token
            let encrypted_token: EncryptedSecret =
                serde_json::from_str(&token_encrypted).map_err(|e| {
                    rusqlite::Error::FromSqlConversionFailure(
                        7,
                        rusqlite::types::Type::Text,
                        Box::new(Error::Generic(format!(
                            "Failed to parse encrypted token: {}",
                            e
                        ))),
                    )
                })?;
            let token_json = decrypt_secret(&key, &encrypted_token).map_err(|e| {
                rusqlite::Error::FromSqlConversionFailure(
                    7,
                    rusqlite::types::Type::Text,
                    Box::new(Error::Generic(format!("Failed to decrypt token: {}", e))),
                )
            })?;
            let token: TokenResponse = serde_json::from_str(&token_json).map_err(|e| {
                rusqlite::Error::FromSqlConversionFailure(
                    7,
                    rusqlite::types::Type::Text,
                    Box::new(Error::Generic(format!("Failed to parse token: {}", e))),
                )
            })?;

            let connected_at = Utc
                .timestamp_opt(created_at, 0)
                .single()
                .unwrap_or_else(Utc::now);

            Ok((
                id,
                GmailAccountInfo {
                    settings: GmailOAuthSettings {
                        client_id,
                        client_secret,
                        redirect_uri,
                    },
                    token,
                    email,
                    display_name,
                    picture_url,
                },
                connected_at,
            ))
        })
        .map_err(|e| Error::Generic(format!("Database error: {}", e)))?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| Error::Generic(format!("Database error: {}", e)))?;

    Ok(accounts)
}

fn delete_gmail_account(conn: &Connection, account_id: &str) -> Result<()> {
    conn.execute(
        "DELETE FROM gmail_accounts WHERE id = ?1",
        params![account_id],
    )
    .map_err(|e| Error::Generic(format!("Database error: {}", e)))?;

    tracing::info!("Deleted Gmail account: {}", account_id);
    Ok(())
}

/// Load persisted Gmail accounts (called during app initialization)
pub fn load_persisted_gmail_accounts(
    conn: &Connection,
) -> Result<Vec<(String, GmailAccountInfo, chrono::DateTime<Utc>)>> {
    // Ensure table exists before querying
    if let Err(e) = ensure_gmail_table(conn) {
        tracing::warn!("Failed to ensure gmail_accounts table: {}", e);
        return Ok(vec![]);
    }

    list_gmail_accounts(conn)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn create_test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        ensure_gmail_table(&conn).unwrap();
        conn
    }

    #[test]
    fn test_gmail_oauth_state_creation() {
        let state = GmailOAuthState::new();
        assert_eq!(state.manager.list_accounts().len(), 0);
    }

    #[test]
    fn test_ensure_gmail_table() {
        let conn = Connection::open_in_memory().unwrap();
        ensure_gmail_table(&conn).unwrap();

        // Verify table exists by querying it
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM gmail_accounts", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn test_insert_and_fetch_gmail_account() {
        let conn = create_test_db();

        let settings = GmailOAuthSettings {
            client_id: "test_client_id".to_string(),
            client_secret: "test_client_secret".to_string(),
            redirect_uri: "http://localhost:3000/callback".to_string(),
        };

        let token = TokenResponse {
            access_token: "test_access_token".to_string(),
            token_type: "Bearer".to_string(),
            expires_in: Some(3600),
            refresh_token: Some("test_refresh_token".to_string()),
            scope: Some("gmail.readonly".to_string()),
            expires_at: None,
        };

        let info = GmailAccountInfo {
            settings,
            token,
            email: Some("test@gmail.com".to_string()),
            display_name: Some("Test User".to_string()),
            picture_url: Some("https://example.com/photo.jpg".to_string()),
        };

        let account_id = "test_account_123";
        let now = Utc::now().timestamp();

        // Insert account
        insert_gmail_account(&conn, account_id, &info, now).unwrap();

        // Fetch and verify
        let (fetched_info, _) = fetch_gmail_account(&conn, account_id).unwrap();

        assert_eq!(fetched_info.email, Some("test@gmail.com".to_string()));
        assert_eq!(fetched_info.display_name, Some("Test User".to_string()));
        assert_eq!(fetched_info.settings.client_id, "test_client_id");
        assert_eq!(fetched_info.token.access_token, "test_access_token");
        assert_eq!(
            fetched_info.token.refresh_token,
            Some("test_refresh_token".to_string())
        );
    }

    #[test]
    fn test_list_gmail_accounts() {
        let conn = create_test_db();

        // Insert multiple accounts
        for i in 0..3 {
            let settings = GmailOAuthSettings {
                client_id: format!("client_{}", i),
                client_secret: format!("secret_{}", i),
                redirect_uri: "http://localhost:3000".to_string(),
            };

            let token = TokenResponse {
                access_token: format!("token_{}", i),
                token_type: "Bearer".to_string(),
                expires_in: Some(3600),
                refresh_token: Some(format!("refresh_{}", i)),
                scope: None,
                expires_at: None,
            };

            let info = GmailAccountInfo {
                settings,
                token,
                email: Some(format!("user{}@gmail.com", i)),
                display_name: None,
                picture_url: None,
            };

            insert_gmail_account(
                &conn,
                &format!("account_{}", i),
                &info,
                Utc::now().timestamp(),
            )
            .unwrap();
        }

        let accounts = list_gmail_accounts(&conn).unwrap();
        assert_eq!(accounts.len(), 3);
    }

    #[test]
    fn test_delete_gmail_account() {
        let conn = create_test_db();

        let settings = GmailOAuthSettings {
            client_id: "test_client".to_string(),
            client_secret: "test_secret".to_string(),
            redirect_uri: "http://localhost:3000".to_string(),
        };

        let token = TokenResponse {
            access_token: "test_token".to_string(),
            token_type: "Bearer".to_string(),
            expires_in: Some(3600),
            refresh_token: None,
            scope: None,
            expires_at: None,
        };

        let info = GmailAccountInfo {
            settings,
            token,
            email: Some("delete@gmail.com".to_string()),
            display_name: None,
            picture_url: None,
        };

        let account_id = "to_delete";
        insert_gmail_account(&conn, account_id, &info, Utc::now().timestamp()).unwrap();

        // Verify it exists
        assert!(fetch_gmail_account(&conn, account_id).is_ok());

        // Delete
        delete_gmail_account(&conn, account_id).unwrap();

        // Verify it's gone
        assert!(fetch_gmail_account(&conn, account_id).is_err());
    }

    #[test]
    fn test_token_encryption() {
        let conn = create_test_db();

        let settings = GmailOAuthSettings {
            client_id: "test_client".to_string(),
            client_secret: "super_secret_value".to_string(),
            redirect_uri: "http://localhost:3000".to_string(),
        };

        let token = TokenResponse {
            access_token: "sensitive_access_token".to_string(),
            token_type: "Bearer".to_string(),
            expires_in: Some(3600),
            refresh_token: Some("sensitive_refresh_token".to_string()),
            scope: None,
            expires_at: None,
        };

        let info = GmailAccountInfo {
            settings,
            token,
            email: Some("encrypted@gmail.com".to_string()),
            display_name: None,
            picture_url: None,
        };

        let account_id = "encrypted_account";
        insert_gmail_account(&conn, account_id, &info, Utc::now().timestamp()).unwrap();

        // Check that raw database values are encrypted (not plaintext)
        let (token_encrypted, secret_encrypted): (String, String) = conn
            .query_row(
                "SELECT token_encrypted, client_secret_encrypted FROM gmail_accounts WHERE id = ?1",
                params![account_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();

        // Should be JSON EncryptedSecret format
        assert!(token_encrypted.starts_with('{'));
        assert!(secret_encrypted.starts_with('{'));

        // Should not contain plaintext values
        assert!(!token_encrypted.contains("sensitive_access_token"));
        assert!(!secret_encrypted.contains("super_secret_value"));

        // But should be able to decrypt and get original values
        let (fetched_info, _) = fetch_gmail_account(&conn, account_id).unwrap();
        assert_eq!(fetched_info.token.access_token, "sensitive_access_token");
        assert_eq!(fetched_info.settings.client_secret, "super_secret_value");
    }
}
