use std::sync::Arc;

use crate::sys::error::{Error, Result};
use crate::sys::security::{
    encryption::{decrypt_secret, encrypt_secret, EncryptedSecret},
    machine_key::{self, KeyPurpose},
};
use chrono::{DateTime, TimeZone, Utc};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json;
use tauri::{command, AppHandle, Emitter, Manager, State};
use uuid::Uuid;

use crate::sys::api::oauth::TokenResponse;

use crate::features::calendar::{
    Calendar, CalendarAccount, CalendarAccountInfo, CalendarEvent, CalendarManager,
    CalendarOAuthSettings, CalendarProvider, CreateEventRequest, EventListResponse,
    ListEventsRequest, UpdateEventRequest,
};

pub struct CalendarState {
    pub manager: Arc<CalendarManager>,
}

impl Default for CalendarState {
    fn default() -> Self {
        Self::new()
    }
}

impl CalendarState {
    pub fn new() -> Self {
        Self {
            manager: Arc::new(CalendarManager::new()),
        }
    }
}

#[derive(Deserialize)]
pub struct CalendarOAuthConfig {
    pub provider: CalendarProvider,
    pub client_id: String,
    pub client_secret: String,
    pub redirect_uri: String,
}

#[derive(Serialize)]
pub struct AuthorizationUrlResponse {
    pub auth_url: String,
    pub state: String,
}

#[derive(Deserialize)]
pub struct CompleteOAuthRequest {
    pub state: String,
    pub code: String,
}

#[derive(Serialize)]
pub struct AccountIdResponse {
    pub account_id: String,
}

#[command]
pub async fn calendar_connect(
    config: CalendarOAuthConfig,
    state: State<'_, CalendarState>,
    app: AppHandle,
) -> Result<AuthorizationUrlResponse> {
    tracing::info!(
        "Starting calendar connection for provider: {:?}",
        config.provider
    );

    let (auth_url, oauth_state) = state.manager.start_oauth(
        config.provider,
        config.client_id,
        config.client_secret,
        config.redirect_uri,
    )?;

    app.emit("calendar:auth_started", &config.provider)
        .map_err(|e| Error::Other(format!("Failed to emit event: {}", e)))?;

    Ok(AuthorizationUrlResponse {
        auth_url,
        state: oauth_state,
    })
}

#[command]
pub async fn calendar_complete_oauth(
    request: CompleteOAuthRequest,
    state: State<'_, CalendarState>,
    app: AppHandle,
) -> Result<AccountIdResponse> {
    tracing::info!("Completing calendar OAuth flow");

    let (provider, settings, pkce) = state.manager.take_pending(&request.state)?;

    let (mut account_info, mut client) =
        CalendarManager::complete_pending(provider, settings, pkce, &request.code).await?;

    if account_info.email.is_none() || account_info.display_name.is_none() {
        if let Ok(calendars) = client.list_calendars().await {
            if let Some(primary) = calendars
                .iter()
                .find(|calendar| calendar.is_primary)
                .or_else(|| calendars.first())
            {
                account_info.email = Some(primary.id.clone());
                account_info.display_name = Some(primary.name.clone());
            }
        }
    }

    let account_id = Uuid::new_v4().to_string();
    let now = Utc::now().timestamp();

    let conn = open_connection(&app)?;
    insert_calendar_account(&conn, &account_id, &account_info, now)?;

    state
        .manager
        .upsert_account(account_id.clone(), account_info.clone(), Some(client))?;

    app.emit("calendar:connected", &account_id)
        .map_err(|e| Error::Other(format!("Failed to emit event: {}", e)))?;

    Ok(AccountIdResponse { account_id })
}

#[command]
pub async fn calendar_disconnect(
    account_id: String,
    state: State<'_, CalendarState>,
    app: AppHandle,
) -> Result<()> {
    tracing::info!("Disconnecting calendar account: {}", account_id);

    let conn = open_connection(&app)?;
    delete_calendar_account(&conn, &account_id)?;
    state.manager.remove_account(&account_id);

    app.emit("calendar:disconnected", &account_id)
        .map_err(|e| Error::Other(format!("Failed to emit event: {}", e)))?;

    Ok(())
}

#[command]
pub async fn calendar_list_calendars(
    account_id: String,
    state: State<'_, CalendarState>,
    app: AppHandle,
) -> Result<Vec<Calendar>> {
    let conn = open_connection(&app)?;
    let (info, _) = fetch_calendar_account(&conn, &account_id)?;
    state
        .manager
        .upsert_account(account_id.clone(), info.clone(), None)?;

    let calendars = state.manager.list_calendars(&account_id).await?;

    persist_account(&state, &app, &account_id)?;

    Ok(calendars)
}

#[command]
pub async fn calendar_list_events(
    account_id: String,
    request: ListEventsRequest,
    state: State<'_, CalendarState>,
    app: AppHandle,
) -> Result<EventListResponse> {
    let conn = open_connection(&app)?;
    let (info, _) = fetch_calendar_account(&conn, &account_id)?;
    state
        .manager
        .upsert_account(account_id.clone(), info.clone(), None)?;

    let response = state.manager.list_events(&account_id, &request).await?;

    persist_account(&state, &app, &account_id)?;

    Ok(response)
}

#[command]
pub async fn calendar_create_event(
    account_id: String,
    request: CreateEventRequest,
    state: State<'_, CalendarState>,
    app: AppHandle,
) -> Result<CalendarEvent> {
    tracing::info!(
        "Creating event '{}' in calendar: {}",
        request.title,
        request.calendar_id
    );

    let conn = open_connection(&app)?;
    let (info, _) = fetch_calendar_account(&conn, &account_id)?;
    state
        .manager
        .upsert_account(account_id.clone(), info.clone(), None)?;

    let event = state.manager.create_event(&account_id, &request).await?;

    persist_account(&state, &app, &account_id)?;

    app.emit("calendar:event_created", &event)
        .map_err(|e| Error::Other(format!("Failed to emit event: {}", e)))?;

    Ok(event)
}

#[command]
pub async fn calendar_update_event(
    account_id: String,
    calendar_id: String,
    event_id: String,
    request: UpdateEventRequest,
    state: State<'_, CalendarState>,
    app: AppHandle,
) -> Result<CalendarEvent> {
    tracing::info!("Updating event: {} in calendar: {}", event_id, calendar_id);

    let conn = open_connection(&app)?;
    let (info, _) = fetch_calendar_account(&conn, &account_id)?;
    state
        .manager
        .upsert_account(account_id.clone(), info.clone(), None)?;

    let event = state
        .manager
        .update_event(&account_id, &calendar_id, &event_id, &request)
        .await?;

    persist_account(&state, &app, &account_id)?;

    app.emit("calendar:event_updated", &event)
        .map_err(|e| Error::Other(format!("Failed to emit event: {}", e)))?;

    Ok(event)
}

#[command]
pub async fn calendar_delete_event(
    account_id: String,
    calendar_id: String,
    event_id: String,
    state: State<'_, CalendarState>,
    app: AppHandle,
) -> Result<()> {
    tracing::info!(
        "Deleting event: {} from calendar: {}",
        event_id,
        calendar_id
    );

    let conn = open_connection(&app)?;
    let (info, _) = fetch_calendar_account(&conn, &account_id)?;
    state
        .manager
        .upsert_account(account_id.clone(), info.clone(), None)?;

    state
        .manager
        .delete_event(&account_id, &calendar_id, &event_id)
        .await?;

    persist_account(&state, &app, &account_id)?;

    #[derive(Serialize)]
    struct DeletedEvent {
        calendar_id: String,
        event_id: String,
    }

    app.emit(
        "calendar:event_deleted",
        &DeletedEvent {
            calendar_id,
            event_id: event_id.clone(),
        },
    )
    .map_err(|e| Error::Other(format!("Failed to emit event: {}", e)))?;

    Ok(())
}

#[command]
pub async fn calendar_list_accounts(
    state: State<'_, CalendarState>,
    app: AppHandle,
) -> Result<Vec<CalendarAccount>> {
    let conn = open_connection(&app)?;
    let records = list_calendar_accounts(&conn)?;

    for (account_id, info, _) in &records {
        if let Err(e) = state
            .manager
            .upsert_account(account_id.clone(), info.clone(), None)
        {
            tracing::warn!("Failed to upsert calendar account {}: {}", account_id, e);
        }
    }

    let accounts = records
        .into_iter()
        .map(|(account_id, info, created_at)| CalendarAccount {
            account_id,
            provider: info.provider,
            email: info.email,
            display_name: info.display_name,
            connected_at: created_at,
        })
        .collect();

    Ok(accounts)
}

#[command]
pub async fn calendar_get_system_timezone() -> Result<String> {
    use crate::features::calendar::timezone::get_system_timezone;

    let tz = get_system_timezone();
    Ok(tz.to_string())
}

fn open_connection(app_handle: &AppHandle) -> Result<Connection> {
    let db_path = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| Error::Generic(format!("Failed to get app data dir: {}", e)))?
        .join("agiworkforce.db");

    Connection::open(db_path).map_err(|e| Error::Generic(format!("Database error: {}", e)))
}

fn insert_calendar_account(
    conn: &Connection,
    account_id: &str,
    info: &CalendarAccountInfo,
    created_at: i64,
) -> Result<()> {
    let config_json = serde_json::to_string(&info.settings)
        .map_err(|e| Error::Generic(format!("Failed to serialize settings: {}", e)))?;

    let token_json_raw = serde_json::to_string(&info.token)
        .map_err(|e| Error::Generic(format!("Failed to serialize token: {}", e)))?;

    // ENCRYPTION: Encrypt the token JSON
    let key = machine_key::derive_key(KeyPurpose::CalendarCredentials);
    let encrypted_token = encrypt_secret(&key, &token_json_raw)
        .map_err(|e| Error::Generic(format!("Failed to encrypt token: {}", e)))?;

    // Store as JSON string of EncryptedSecret
    let token_json = serde_json::to_string(&encrypted_token)
        .map_err(|e| Error::Generic(format!("Failed to serialize encrypted token: {}", e)))?;

    conn.execute(
        "INSERT INTO calendar_accounts (id, provider, account_email, display_name, token_json, config_json, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
         ON CONFLICT(id) DO UPDATE SET
            provider = excluded.provider,
            account_email = excluded.account_email,
            display_name = excluded.display_name,
            token_json = excluded.token_json, // Updates with new encrypted value
            config_json = excluded.config_json,
            created_at = calendar_accounts.created_at,
            updated_at = excluded.updated_at",
        params![
            account_id,
            provider_to_string(info.provider),
            info.email,
            info.display_name,
            token_json,
            config_json,
            created_at
        ],
    )
    .map_err(|e| Error::Generic(format!("Database error: {}", e)))?;

    Ok(())
}

fn fetch_calendar_account(
    conn: &Connection,
    account_id: &str,
) -> Result<(CalendarAccountInfo, DateTime<Utc>)> {
    conn.query_row(
        "SELECT provider, account_email, display_name, token_json, config_json, created_at
         FROM calendar_accounts WHERE id = ?1",
        params![account_id],
        |row| {
            let provider_str: String = row.get(0)?;
            let provider = match provider_str.as_str() {
                "google" => CalendarProvider::Google,
                "outlook" => CalendarProvider::Outlook,
                other => {
                    return Err(rusqlite::Error::FromSqlConversionFailure(
                        0,
                        rusqlite::types::Type::Text,
                        Box::new(Error::Other(format!("Unknown provider {}", other))),
                    ))
                }
            };

            let config_json: String = row.get(4)?;
            let token_json_enc: String = row.get(3)?; // Now contains EncryptedSecret JSON

            let settings: CalendarOAuthSettings =
                serde_json::from_str(&config_json).map_err(|e| {
                    rusqlite::Error::FromSqlConversionFailure(
                        4,
                        rusqlite::types::Type::Text,
                        Box::new(e),
                    )
                })?;

            // DECRYPTION:
            let key = machine_key::derive_key(KeyPurpose::CalendarCredentials);

            // Try to deserialize as EncryptedSecret
            let token: TokenResponse =
                match serde_json::from_str::<EncryptedSecret>(&token_json_enc) {
                    Ok(encrypted_secret) => {
                        // It's encrypted, decrypt it
                        let decrypted_json =
                            decrypt_secret(&key, &encrypted_secret).map_err(|e| {
                                rusqlite::Error::FromSqlConversionFailure(
                                    3,
                                    rusqlite::types::Type::Text,
                                    Box::new(Error::Generic(e)),
                                )
                            })?;
                        serde_json::from_str(&decrypted_json).map_err(|e| {
                            rusqlite::Error::FromSqlConversionFailure(
                                3,
                                rusqlite::types::Type::Text,
                                Box::new(e),
                            )
                        })?
                    }
                    Err(_) => {
                        // Fallback: Use as plain text (migration path for existing unencrypted data)
                        // If parsing as EncryptedSecret fails, assume it's the old plain JSON
                        serde_json::from_str(&token_json_enc).map_err(|e| {
                            rusqlite::Error::FromSqlConversionFailure(
                                3,
                                rusqlite::types::Type::Text,
                                Box::new(e),
                            )
                        })?
                    }
                };

            let created_at: i64 = row.get(5)?;
            let connected_at = Utc
                .timestamp_opt(created_at, 0)
                .single()
                .unwrap_or_else(Utc::now);

            Ok((
                CalendarAccountInfo {
                    provider,
                    settings,
                    token,
                    email: row.get(1)?,
                    display_name: row.get(2)?,
                },
                connected_at,
            ))
        },
    )
    .map_err(|e| Error::Generic(format!("Database error: {}", e)))
}

fn list_calendar_accounts(
    conn: &Connection,
) -> Result<Vec<(String, CalendarAccountInfo, DateTime<Utc>)>> {
    let mut stmt = conn
        .prepare(
            "SELECT id, provider, account_email, display_name, token_json, config_json, created_at
             FROM calendar_accounts
             ORDER BY created_at DESC",
        )
        .map_err(|e| Error::Generic(format!("Database error: {}", e)))?;

    let accounts = stmt
        .query_map([], |row| {
            let id: String = row.get(0)?;
            let provider = match row.get::<_, String>(1)?.as_str() {
                "google" => CalendarProvider::Google,
                "outlook" => CalendarProvider::Outlook,
                other => {
                    return Err(rusqlite::Error::FromSqlConversionFailure(
                        1,
                        rusqlite::types::Type::Text,
                        Box::new(Error::Other(format!("Unknown provider {}", other))),
                    ))
                }
            };
            let config_json: String = row.get(5)?;
            let token_json: String = row.get(4)?;
            let settings: CalendarOAuthSettings =
                serde_json::from_str(&config_json).map_err(|e| {
                    rusqlite::Error::FromSqlConversionFailure(
                        5,
                        rusqlite::types::Type::Text,
                        Box::new(e),
                    )
                })?;
            let token: TokenResponse = serde_json::from_str(&token_json).map_err(|e| {
                rusqlite::Error::FromSqlConversionFailure(
                    4,
                    rusqlite::types::Type::Text,
                    Box::new(e),
                )
            })?;
            let created_at: i64 = row.get(6)?;
            let connected_at = Utc
                .timestamp_opt(created_at, 0)
                .single()
                .unwrap_or_else(Utc::now);

            Ok((
                id,
                CalendarAccountInfo {
                    provider,
                    settings,
                    token,
                    email: row.get(2)?,
                    display_name: row.get(3)?,
                },
                connected_at,
            ))
        })
        .map_err(|e| Error::Generic(format!("Database error: {}", e)))?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| Error::Generic(format!("Database error: {}", e)))?;

    Ok(accounts)
}

pub fn load_persisted_calendar_accounts(
    conn: &Connection,
) -> Result<Vec<(String, CalendarAccountInfo, DateTime<Utc>)>> {
    list_calendar_accounts(conn)
}

fn delete_calendar_account(conn: &Connection, account_id: &str) -> Result<()> {
    conn.execute(
        "DELETE FROM calendar_accounts WHERE id = ?1",
        params![account_id],
    )
    .map_err(|e| Error::Generic(format!("Database error: {}", e)))?;
    Ok(())
}

fn persist_account(
    state: &State<'_, CalendarState>,
    app: &AppHandle,
    account_id: &str,
) -> Result<()> {
    if let Some(info) = state.manager.account_info(account_id) {
        let conn = open_connection(app)?;
        let updated_at = Utc::now().timestamp();
        insert_calendar_account(&conn, account_id, &info, updated_at)?;
    }
    Ok(())
}

fn provider_to_string(provider: CalendarProvider) -> &'static str {
    match provider {
        CalendarProvider::Google => "google",
        CalendarProvider::Outlook => "outlook",
    }
}
