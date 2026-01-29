//! Tauri commands for multi-channel messaging

use crate::features::messaging::{
    ChannelRouter, DiscordClient, DiscordConfig, MessagingConnection, MessagingPlatform,
    MessagingRouter, SendMessageRequest, SendMessageResponse, SignalClient, SignalConfig,
    SlackClient, SlackConfig, TeamsClient, TeamsConfig, TelegramClient, TelegramConfig,
    UnifiedMessage, WhatsAppClient,
};
use crate::sys::commands::AppDatabase;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;
use tokio::sync::RwLock;
use uuid::Uuid;

/// Shared state for multi-channel messaging connections
pub struct MessagingState {
    pub router: Arc<RwLock<ChannelRouter>>,
    pub discord: Arc<RwLock<Option<DiscordClient>>>,
    pub telegram: Arc<RwLock<Option<TelegramClient>>>,
    pub signal: Arc<RwLock<Option<SignalClient>>>,
}

impl Default for MessagingState {
    fn default() -> Self {
        Self {
            router: Arc::new(RwLock::new(ChannelRouter::new())),
            discord: Arc::new(RwLock::new(None)),
            telegram: Arc::new(RwLock::new(None)),
            signal: Arc::new(RwLock::new(None)),
        }
    }
}

/// Status of a messaging platform connection
#[derive(Debug, Serialize, Deserialize)]
pub struct PlatformStatus {
    pub platform: String,
    pub connected: bool,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ConnectSlackRequest {
    pub user_id: String,
    pub bot_token: String,
    pub app_token: String,
    pub signing_secret: String,
    pub workspace_id: Option<String>,
    pub workspace_name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ConnectWhatsAppRequest {
    pub user_id: String,
    pub phone_number_id: String,
    pub access_token: String,
    pub verify_token: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ConnectTeamsRequest {
    pub user_id: String,
    pub tenant_id: String,
    pub client_id: String,
    pub client_secret: String,
    pub workspace_name: Option<String>,
}

#[tauri::command]
pub async fn connect_slack(
    request: ConnectSlackRequest,
    db: State<'_, AppDatabase>,
) -> Result<MessagingConnection, String> {
    let config = SlackConfig {
        bot_token: request.bot_token.clone(),
        app_token: request.app_token.clone(),
        signing_secret: request.signing_secret.clone(),
    };

    SlackClient::new(config).map_err(|e| format!("Failed to create Slack client: {}", e))?;

    let connection_id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp();

    let credentials_json = serde_json::json!({
        "bot_token": request.bot_token,
        "app_token": request.app_token,
        "signing_secret": request.signing_secret,
    })
    .to_string();

    db.connection()?
        .execute(
            "INSERT INTO messaging_connections
            (id, user_id, platform, workspace_id, workspace_name, credentials, is_active, created_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                connection_id,
                request.user_id,
                "slack",
                request.workspace_id,
                request.workspace_name,
                credentials_json,
                1,
                now,
            ],
        )
        .map_err(|e| format!("Failed to store connection: {}", e))?;

    Ok(MessagingConnection {
        id: connection_id,
        user_id: request.user_id,
        platform: MessagingPlatform::Slack,
        workspace_id: request.workspace_id,
        workspace_name: request.workspace_name,
        is_active: true,
        created_at: now,
        last_used_at: None,
    })
}

#[tauri::command]
pub async fn connect_whatsapp(
    request: ConnectWhatsAppRequest,
    db: State<'_, AppDatabase>,
) -> Result<MessagingConnection, String> {
    WhatsAppClient::new(
        request.phone_number_id.clone(),
        request.access_token.clone(),
    )
    .map_err(|e| format!("Failed to create WhatsApp client: {}", e))?;

    let connection_id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp();

    let credentials_json = serde_json::json!({
        "phone_number_id": request.phone_number_id,
        "access_token": request.access_token,
        "verify_token": request.verify_token,
    })
    .to_string();

    db.connection()?
        .execute(
            "INSERT INTO messaging_connections
            (id, user_id, platform, credentials, is_active, created_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                connection_id,
                request.user_id,
                "whatsapp",
                credentials_json,
                1,
                now,
            ],
        )
        .map_err(|e| format!("Failed to store connection: {}", e))?;

    Ok(MessagingConnection {
        id: connection_id,
        user_id: request.user_id,
        platform: MessagingPlatform::WhatsApp,
        workspace_id: None,
        workspace_name: Some("WhatsApp Business".to_string()),
        is_active: true,
        created_at: now,
        last_used_at: None,
    })
}

#[tauri::command]
pub async fn connect_teams(
    request: ConnectTeamsRequest,
    db: State<'_, AppDatabase>,
) -> Result<MessagingConnection, String> {
    let config = TeamsConfig {
        tenant_id: request.tenant_id.clone(),
        client_id: request.client_id.clone(),
        client_secret: request.client_secret.clone(),
    };

    let mut client =
        TeamsClient::new(config).map_err(|e| format!("Failed to create Teams client: {}", e))?;

    client
        .authenticate()
        .await
        .map_err(|e| format!("Failed to authenticate with Teams: {}", e))?;

    let connection_id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp();

    let credentials_json = serde_json::json!({
        "tenant_id": request.tenant_id,
        "client_id": request.client_id,
        "client_secret": request.client_secret,
    })
    .to_string();

    db.connection()?
        .execute(
            "INSERT INTO messaging_connections
            (id, user_id, platform, workspace_id, workspace_name, credentials, is_active, created_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                connection_id,
                request.user_id,
                "teams",
                Some(request.tenant_id.clone()),
                request.workspace_name,
                credentials_json,
                1,
                now,
            ],
        )
        .map_err(|e| format!("Failed to store connection: {}", e))?;

    Ok(MessagingConnection {
        id: connection_id,
        user_id: request.user_id,
        platform: MessagingPlatform::Teams,
        workspace_id: Some(request.tenant_id),
        workspace_name: request.workspace_name,
        is_active: true,
        created_at: now,
        last_used_at: None,
    })
}

#[tauri::command]
pub async fn send_message(
    connection_id: String,
    channel_id: String,
    text: String,
    db: State<'_, AppDatabase>,
) -> Result<SendMessageResponse, String> {
    let (platform, credentials, user_id): (String, String, String) = {
        let conn = db.connection()?;
        conn.query_row(
            "SELECT platform, credentials, user_id FROM messaging_connections WHERE id = ?1 AND is_active = 1",
            params![connection_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|e| format!("Connection not found: {}", e))?
    };

    let platform = MessagingPlatform::from_str(&platform)
        .ok_or_else(|| format!("Invalid platform: {}", platform))?;

    let mut router = MessagingRouter::new();

    match platform {
        MessagingPlatform::Slack => {
            let creds: serde_json::Value = serde_json::from_str(&credentials)
                .map_err(|e| format!("Invalid credentials: {}", e))?;

            let config = SlackConfig {
                bot_token: creds["bot_token"]
                    .as_str()
                    .ok_or("Missing bot_token")?
                    .to_string(),
                app_token: creds["app_token"]
                    .as_str()
                    .ok_or("Missing app_token")?
                    .to_string(),
                signing_secret: creds["signing_secret"]
                    .as_str()
                    .ok_or("Missing signing_secret")?
                    .to_string(),
            };

            let client = SlackClient::new(config)
                .map_err(|e| format!("Failed to create Slack client: {}", e))?;
            router.set_slack(client);
        }
        MessagingPlatform::WhatsApp => {
            let creds: serde_json::Value = serde_json::from_str(&credentials)
                .map_err(|e| format!("Invalid credentials: {}", e))?;

            let client = WhatsAppClient::new(
                creds["phone_number_id"]
                    .as_str()
                    .ok_or("Missing phone_number_id")?
                    .to_string(),
                creds["access_token"]
                    .as_str()
                    .ok_or("Missing access_token")?
                    .to_string(),
            )
            .map_err(|e| format!("Failed to create WhatsApp client: {}", e))?;
            router.set_whatsapp(client);
        }
        MessagingPlatform::Teams => {
            let creds: serde_json::Value = serde_json::from_str(&credentials)
                .map_err(|e| format!("Invalid credentials: {}", e))?;

            let config = TeamsConfig {
                tenant_id: creds["tenant_id"]
                    .as_str()
                    .ok_or("Missing tenant_id")?
                    .to_string(),
                client_id: creds["client_id"]
                    .as_str()
                    .ok_or("Missing client_id")?
                    .to_string(),
                client_secret: creds["client_secret"]
                    .as_str()
                    .ok_or("Missing client_secret")?
                    .to_string(),
            };

            let mut client = TeamsClient::new(config)
                .map_err(|e| format!("Failed to create Teams client: {}", e))?;
            client
                .authenticate()
                .await
                .map_err(|e| format!("Failed to authenticate: {}", e))?;
            router.set_teams(client);
        }
    }

    let request = SendMessageRequest {
        platform,
        channel_id: channel_id.clone(),
        text: text.clone(),
        attachments: None,
        thread_id: None,
        reply_to: None,
    };

    let response = router
        .send_message(request)
        .await
        .map_err(|e| format!("Failed to send message: {}", e))?;

    let message_id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp();

    db.connection()?
        .execute(
            "INSERT INTO messaging_history
            (id, connection_id, channel_id, message_id, direction, sender_id, content, timestamp)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                message_id,
                connection_id,
                channel_id,
                response.message_id,
                "outbound",
                user_id,
                text,
                now,
            ],
        )
        .map_err(|e| format!("Failed to store message history: {}", e))?;

    db.connection()?
        .execute(
            "UPDATE messaging_connections SET last_used_at = ?1 WHERE id = ?2",
            params![now, connection_id],
        )
        .map_err(|e| format!("Failed to update last_used_at: {}", e))?;

    Ok(response)
}

#[tauri::command]
pub async fn get_messaging_history(
    connection_id: String,
    channel_id: String,
    limit: usize,
    db: State<'_, AppDatabase>,
) -> Result<Vec<UnifiedMessage>, String> {
    let conn = db.connection()?;

    let mut stmt = conn
        .prepare(
            "SELECT id, channel_id, message_id, direction, sender_id, sender_name, content, timestamp, metadata
             FROM messaging_history
             WHERE connection_id = ?1 AND channel_id = ?2
             ORDER BY timestamp DESC
             LIMIT ?3",
        )
        .map_err(|e| format!("Failed to prepare statement: {}", e))?;

    let messages = stmt
        .query_map(params![connection_id, channel_id, limit], |row| {
            let platform_str: String = row.get(8).unwrap_or_else(|_| String::from("slack"));
            let platform = match platform_str.to_lowercase().as_str() {
                "discord" => crate::features::messaging::Platform::Discord,
                "teams" => crate::features::messaging::Platform::Teams,
                "telegram" => crate::features::messaging::Platform::Telegram,
                "signal" => crate::features::messaging::Platform::Signal,
                "whatsapp" => crate::features::messaging::Platform::WhatsApp,
                _ => crate::features::messaging::Platform::Slack,
            };

            Ok(UnifiedMessage {
                id: row.get(0)?,
                platform,
                channel_id: row.get(1)?,
                sender: row.get(4).unwrap_or_else(|_| String::new()),
                content: row.get(6)?,
                timestamp: row.get(7)?,
                attachments: vec![],
                metadata: serde_json::Value::Null,
            })
        })
        .map_err(|e| format!("Failed to query messages: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect messages: {}", e))?;

    Ok(messages)
}

#[tauri::command]
pub async fn disconnect_platform(
    connection_id: String,
    db: State<'_, AppDatabase>,
) -> Result<(), String> {
    db.connection()?
        .execute(
            "UPDATE messaging_connections SET is_active = 0 WHERE id = ?1",
            params![connection_id],
        )
        .map_err(|e| format!("Failed to disconnect: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn list_messaging_connections(
    user_id: String,
    db: State<'_, AppDatabase>,
) -> Result<Vec<MessagingConnection>, String> {
    let conn = db.connection()?;

    let mut stmt = conn
        .prepare(
            "SELECT id, user_id, platform, workspace_id, workspace_name, is_active, created_at, last_used_at
             FROM messaging_connections
             WHERE user_id = ?1
             ORDER BY created_at DESC",
        )
        .map_err(|e| format!("Failed to prepare statement: {}", e))?;

    let connections = stmt
        .query_map(params![user_id], |row| {
            let platform_str: String = row.get(2)?;
            let platform =
                MessagingPlatform::from_str(&platform_str).unwrap_or(MessagingPlatform::Slack);

            Ok(MessagingConnection {
                id: row.get(0)?,
                user_id: row.get(1)?,
                platform,
                workspace_id: row.get(3).ok(),
                workspace_name: row.get(4).ok(),
                is_active: row.get::<_, i32>(5)? == 1,
                created_at: row.get(6)?,
                last_used_at: row.get(7).ok(),
            })
        })
        .map_err(|e| format!("Failed to query connections: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect connections: {}", e))?;

    Ok(connections)
}

// =============================================================================
// Discord, Telegram, Signal Commands (Multi-Channel Messaging)
// =============================================================================

/// Connect to Discord
#[tauri::command]
pub async fn messaging_connect_discord(
    state: State<'_, MessagingState>,
    config: DiscordConfig,
) -> Result<PlatformStatus, String> {
    let mut client = DiscordClient::new(config);

    match client.connect().await {
        Ok(()) => {
            let mut discord = state.discord.write().await;
            *discord = Some(client);

            Ok(PlatformStatus {
                platform: "discord".to_string(),
                connected: true,
                error: None,
            })
        }
        Err(e) => Ok(PlatformStatus {
            platform: "discord".to_string(),
            connected: false,
            error: Some(e.to_string()),
        }),
    }
}

/// Connect to Telegram
#[tauri::command]
pub async fn messaging_connect_telegram(
    state: State<'_, MessagingState>,
    config: TelegramConfig,
) -> Result<PlatformStatus, String> {
    let mut client = TelegramClient::new(config);

    match client.connect().await {
        Ok(()) => {
            let mut telegram = state.telegram.write().await;
            *telegram = Some(client);

            Ok(PlatformStatus {
                platform: "telegram".to_string(),
                connected: true,
                error: None,
            })
        }
        Err(e) => Ok(PlatformStatus {
            platform: "telegram".to_string(),
            connected: false,
            error: Some(e.to_string()),
        }),
    }
}

/// Connect to Signal
#[tauri::command]
pub async fn messaging_connect_signal(
    state: State<'_, MessagingState>,
    config: SignalConfig,
) -> Result<PlatformStatus, String> {
    let mut client = SignalClient::new(config);

    match client.register().await {
        Ok(()) => {
            let mut signal = state.signal.write().await;
            *signal = Some(client);

            Ok(PlatformStatus {
                platform: "signal".to_string(),
                connected: true,
                error: None,
            })
        }
        Err(e) => Ok(PlatformStatus {
            platform: "signal".to_string(),
            connected: false,
            error: Some(e.to_string()),
        }),
    }
}

/// Send message via platform
#[tauri::command]
pub async fn messaging_send(
    state: State<'_, MessagingState>,
    platform: String,
    channel_id: String,
    content: String,
) -> Result<String, String> {
    match platform.as_str() {
        "discord" => {
            let discord = state.discord.read().await;
            if let Some(client) = discord.as_ref() {
                client
                    .send_message(&channel_id, &content)
                    .await
                    .map(|m| m.id)
                    .map_err(|e| e.to_string())
            } else {
                Err("Discord not connected".to_string())
            }
        }
        "telegram" => {
            let telegram = state.telegram.read().await;
            if let Some(client) = telegram.as_ref() {
                let chat_id: i64 = channel_id
                    .parse()
                    .map_err(|_| "Invalid chat ID".to_string())?;
                client
                    .send_message(chat_id, &content)
                    .await
                    .map(|m| m.message_id.to_string())
                    .map_err(|e| e.to_string())
            } else {
                Err("Telegram not connected".to_string())
            }
        }
        "signal" => {
            let signal = state.signal.read().await;
            if let Some(client) = signal.as_ref() {
                client
                    .send_message(&channel_id, &content)
                    .await
                    .map(|()| "sent".to_string())
                    .map_err(|e| e.to_string())
            } else {
                Err("Signal not connected".to_string())
            }
        }
        _ => Err(format!("Unknown platform: {}", platform)),
    }
}

/// Get connected platforms status
#[tauri::command]
pub async fn messaging_get_status(
    state: State<'_, MessagingState>,
) -> Result<Vec<PlatformStatus>, String> {
    let mut statuses = Vec::new();

    let discord = state.discord.read().await;
    statuses.push(PlatformStatus {
        platform: "discord".to_string(),
        connected: discord.as_ref().is_some_and(|c| c.is_connected()),
        error: None,
    });

    let telegram = state.telegram.read().await;
    statuses.push(PlatformStatus {
        platform: "telegram".to_string(),
        connected: telegram.as_ref().is_some_and(|c| c.is_connected()),
        error: None,
    });

    let signal = state.signal.read().await;
    statuses.push(PlatformStatus {
        platform: "signal".to_string(),
        connected: signal.as_ref().is_some_and(|c| c.is_registered()),
        error: None,
    });

    Ok(statuses)
}

/// Disconnect from a platform
#[tauri::command]
pub async fn messaging_disconnect(
    state: State<'_, MessagingState>,
    platform: String,
) -> Result<(), String> {
    match platform.as_str() {
        "discord" => {
            let mut discord = state.discord.write().await;
            if let Some(client) = discord.as_mut() {
                client.disconnect();
            }
            *discord = None;
        }
        "telegram" => {
            let mut telegram = state.telegram.write().await;
            *telegram = None;
        }
        "signal" => {
            let mut signal = state.signal.write().await;
            *signal = None;
        }
        _ => return Err(format!("Unknown platform: {}", platform)),
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_platform_serialization() {
        let platform = MessagingPlatform::Slack;
        assert_eq!(platform.as_str(), "slack");

        let platform = MessagingPlatform::from_str("whatsapp");
        assert!(platform.is_some());
        assert_eq!(platform.unwrap(), MessagingPlatform::WhatsApp);
    }

    #[test]
    fn test_messaging_state_default() {
        let state = MessagingState::default();
        // State should be created with empty clients
        assert!(std::sync::Arc::strong_count(&state.router) >= 1);
        assert!(std::sync::Arc::strong_count(&state.discord) >= 1);
        assert!(std::sync::Arc::strong_count(&state.telegram) >= 1);
        assert!(std::sync::Arc::strong_count(&state.signal) >= 1);
    }

    #[test]
    fn test_platform_status_serialization() {
        let status = PlatformStatus {
            platform: "discord".to_string(),
            connected: true,
            error: None,
        };

        let json = serde_json::to_string(&status).unwrap();
        assert!(json.contains("\"platform\":\"discord\""));
        assert!(json.contains("\"connected\":true"));
        assert!(json.contains("\"error\":null"));
    }
}
