use crate::db::AppDatabase;
use crate::messaging::{
    MessagingConnection, MessagingPlatform, MessagingRouter, SendMessageRequest,
    SendMessageResponse, SlackClient, SlackConfig, TeamsClient, TeamsConfig, UnifiedMessage,
    WhatsAppClient,
};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

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

/// Connect to Slack workspace
#[tauri::command]
pub async fn connect_slack(
    request: ConnectSlackRequest,
    db: State<'_, AppDatabase>,
) -> Result<MessagingConnection, String> {
    // Validate Slack credentials by creating a client
    let config = SlackConfig {
        bot_token: request.bot_token.clone(),
        app_token: request.app_token.clone(),
        signing_secret: request.signing_secret.clone(),
    };

    SlackClient::new(config).map_err(|e| format!("Failed to create Slack client: {}", e))?;

    // Generate connection ID
    let connection_id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp();

    // Encrypt credentials (in production, use proper encryption)
    let credentials_json = serde_json::json!({
        "bot_token": request.bot_token,
        "app_token": request.app_token,
        "signing_secret": request.signing_secret,
    })
    .to_string();

    // Store connection in database
    db.conn
        .lock()
        .map_err(|e| format!("Database lock error: {}", e))?
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

/// Connect to WhatsApp Business API
#[tauri::command]
pub async fn connect_whatsapp(
    request: ConnectWhatsAppRequest,
    db: State<'_, AppDatabase>,
) -> Result<MessagingConnection, String> {
    // Validate WhatsApp credentials
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

    db.conn
        .lock()
        .map_err(|e| format!("Database lock error: {}", e))?
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

/// Connect to Microsoft Teams
#[tauri::command]
pub async fn connect_teams(
    request: ConnectTeamsRequest,
    db: State<'_, AppDatabase>,
) -> Result<MessagingConnection, String> {
    // Validate Teams credentials
    let config = TeamsConfig {
        tenant_id: request.tenant_id.clone(),
        client_id: request.client_id.clone(),
        client_secret: request.client_secret.clone(),
    };

    let mut client = TeamsClient::new(config)
        .map_err(|e| format!("Failed to create Teams client: {}", e))?;

    // Test authentication
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

    db.conn
        .lock()
        .map_err(|e| format!("Database lock error: {}", e))?
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

/// Send a message through any messaging platform
#[tauri::command]
pub async fn send_message(
    connection_id: String,
    channel_id: String,
    text: String,
    db: State<'_, AppDatabase>,
) -> Result<SendMessageResponse, String> {
    // Get connection details
    let conn = db
        .conn
        .lock()
        .map_err(|e| format!("Database lock error: {}", e))?;

    let (platform, credentials, user_id): (String, String, String) = conn
        .query_row(
            "SELECT platform, credentials, user_id FROM messaging_connections WHERE id = ?1 AND is_active = 1",
            params![connection_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|e| format!("Connection not found: {}", e))?;

    drop(conn);

    let platform = MessagingPlatform::from_str(&platform)
        .ok_or_else(|| format!("Invalid platform: {}", platform))?;

    // Create router and send message
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

    // Store message in history
    let message_id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp();

    db.conn
        .lock()
        .map_err(|e| format!("Database lock error: {}", e))?
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

    // Update last_used_at
    db.conn
        .lock()
        .map_err(|e| format!("Database lock error: {}", e))?
        .execute(
            "UPDATE messaging_connections SET last_used_at = ?1 WHERE id = ?2",
            params![now, connection_id],
        )
        .map_err(|e| format!("Failed to update last_used_at: {}", e))?;

    Ok(response)
}

/// Get message history for a channel
#[tauri::command]
pub async fn get_messaging_history(
    connection_id: String,
    channel_id: String,
    limit: usize,
    db: State<'_, AppDatabase>,
) -> Result<Vec<UnifiedMessage>, String> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| format!("Database lock error: {}", e))?;

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
            let platform = MessagingPlatform::from_str(&platform_str).unwrap_or(MessagingPlatform::Slack);

            Ok(UnifiedMessage {
                id: row.get(0)?,
                platform,
                channel_id: row.get(1)?,
                sender_id: row.get(4).unwrap_or_else(|_| String::new()),
                sender_name: row.get(5).ok(),
                text: row.get(6)?,
                timestamp: row.get(7)?,
                attachments: vec![],
                metadata: std::collections::HashMap::new(),
            })
        })
        .map_err(|e| format!("Failed to query messages: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect messages: {}", e))?;

    Ok(messages)
}

/// Disconnect from a messaging platform
#[tauri::command]
pub async fn disconnect_platform(
    connection_id: String,
    db: State<'_, AppDatabase>,
) -> Result<(), String> {
    db.conn
        .lock()
        .map_err(|e| format!("Database lock error: {}", e))?
        .execute(
            "UPDATE messaging_connections SET is_active = 0 WHERE id = ?1",
            params![connection_id],
        )
        .map_err(|e| format!("Failed to disconnect: {}", e))?;

    Ok(())
}

/// List all messaging connections for a user
#[tauri::command]
pub async fn list_messaging_connections(
    user_id: String,
    db: State<'_, AppDatabase>,
) -> Result<Vec<MessagingConnection>, String> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| format!("Database lock error: {}", e))?;

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
            let platform = MessagingPlatform::from_str(&platform_str).unwrap_or(MessagingPlatform::Slack);

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
}
