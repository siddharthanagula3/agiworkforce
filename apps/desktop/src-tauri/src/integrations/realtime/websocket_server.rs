use super::{PresenceManager, RealtimeEvent};
use crate::automation::browser::advanced::Cookie;
use crate::automation::browser::{AccessibilityAnalyzer, AdvancedBrowserOps, CdpClient};
use crate::integrations::native_messaging::manifest::install_manifests;
use crate::integrations::native_messaging::{ConnectionState, NativeMessage};
use crate::sys::commands::BrowserStateWrapper;
use crate::ui::events::tool_stream::{emit_tool_completed, emit_tool_error, emit_tool_started};
use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use futures::{
    stream::{SplitSink, SplitStream},
    SinkExt, StreamExt,
};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Instant;
use tauri::Emitter;
use tauri::Manager;
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::Mutex as TokioMutex;
use tokio_tungstenite::{accept_async, tungstenite::Message, WebSocketStream};

pub struct WebSocketClient {
    pub id: String,
    pub user_id: Option<String>,
    pub team_id: Option<String>,
}

pub struct RealtimeServer {
    clients: Arc<TokioMutex<HashMap<String, WebSocketClient>>>,
    senders: Arc<TokioMutex<HashMap<String, SplitSink<WebSocketStream<TcpStream>, Message>>>>,
    presence: Arc<PresenceManager>,
    token: String,
    app_handle: Option<tauri::AppHandle>,
}

impl RealtimeServer {
    pub fn new(
        presence: Arc<PresenceManager>,
        token: String,
        app_handle: Option<tauri::AppHandle>,
    ) -> Self {
        Self {
            clients: Arc::new(TokioMutex::new(HashMap::new())),
            senders: Arc::new(TokioMutex::new(HashMap::new())),
            presence,
            token,
            app_handle,
        }
    }

    pub async fn broadcast_to_user(
        &self,
        user_id: &str,
        event: RealtimeEvent,
    ) -> Result<(), String> {
        Self::broadcast_to_specific_user(user_id, event, &self.clients, &self.senders).await
    }

    pub async fn start(&self, port: u16) -> Result<(), Box<dyn std::error::Error>> {
        let addr = format!("127.0.0.1:{}", port);
        let listener = TcpListener::bind(&addr).await?;

        tracing::info!("WebSocket server listening on {}", addr);

        loop {
            match listener.accept().await {
                Ok((stream, peer)) => {
                    let clients = self.clients.clone();
                    let senders = self.senders.clone();
                    let presence = self.presence.clone();
                    let token = self.token.clone();
                    let app_handle = self.app_handle.clone();

                    tokio::spawn(async move {
                        if let Err(e) = Self::handle_connection_wrapper(
                            stream, peer, clients, senders, presence, token, app_handle,
                        )
                        .await
                        {
                            tracing::error!("Connection error: {}", e);
                        }
                    });
                }
                Err(e) => {
                    tracing::error!("Failed to accept connection: {}", e);
                }
            }
        }
    }

    async fn handle_connection_wrapper(
        stream: TcpStream,
        peer: SocketAddr,
        clients: Arc<TokioMutex<HashMap<String, WebSocketClient>>>,
        senders: Arc<TokioMutex<HashMap<String, SplitSink<WebSocketStream<TcpStream>, Message>>>>,
        presence: Arc<PresenceManager>,
        token: String,
        app_handle: Option<tauri::AppHandle>,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let ws_stream = accept_async(stream).await?;
        Self::handle_connection(
            ws_stream, peer, clients, senders, presence, token, app_handle,
        )
        .await;
        Ok(())
    }

    async fn handle_connection(
        mut ws_stream: WebSocketStream<TcpStream>,
        _peer: SocketAddr,
        clients: Arc<TokioMutex<HashMap<String, WebSocketClient>>>,
        senders: Arc<TokioMutex<HashMap<String, SplitSink<WebSocketStream<TcpStream>, Message>>>>,
        presence: Arc<PresenceManager>,
        token: String,
        app_handle: Option<tauri::AppHandle>,
    ) {
        // Enforce Authentication
        tracing::debug!("Waiting for authentication...");
        let mut user_id_from_auth: Option<String> = None;
        let mut team_id_from_auth: Option<String> = None;

        let auth_failure_reason = if let Some(Ok(Message::Text(text))) = ws_stream.next().await {
            if let Ok(RealtimeEvent::Authenticate {
                user_id,
                team_id,
                token: auth_token,
            }) = serde_json::from_str::<RealtimeEvent>(&text)
            {
                if let Some(sent_token) = auth_token {
                    if sent_token == token {
                        user_id_from_auth = Some(user_id);
                        team_id_from_auth = team_id;
                        tracing::info!(
                            "Authentication successful for user: {:?}",
                            user_id_from_auth
                        );
                        None
                    } else {
                        tracing::warn!("Authentication failed: Invalid token");
                        Some("Invalid authentication token for realtime websocket".to_string())
                    }
                } else {
                    tracing::warn!("Authentication failed: Missing token");
                    Some("Missing authentication token for realtime websocket".to_string())
                }
            } else {
                tracing::warn!("Authentication failed: Invalid event format");
                Some("Invalid authentication event format".to_string())
            }
        } else {
            Some("Realtime websocket closed before authentication".to_string())
        };

        if let Some(reason) = auth_failure_reason {
            if let Ok(auth_error_message) =
                serde_json::to_string(&RealtimeEvent::AuthenticationFailed {
                    reason: reason.clone(),
                })
            {
                let _ = ws_stream.send(Message::Text(auth_error_message)).await;
            }
            let _ = ws_stream.close(None).await;
            tracing::warn!(
                "Connection closed due to authentication failure: {}",
                reason
            );
            return;
        }

        if let Some(user_id) = &user_id_from_auth {
            if let Ok(auth_ok_message) = serde_json::to_string(&RealtimeEvent::Authenticated {
                user_id: user_id.clone(),
            }) {
                if let Err(e) = ws_stream.send(Message::Text(auth_ok_message)).await {
                    tracing::warn!("Failed to send realtime auth acknowledgement: {}", e);
                }
            }
        }

        let (sender, receiver) = ws_stream.split();
        let client_id = uuid::Uuid::new_v4().to_string();

        {
            let mut clients_lock = clients.lock().await;
            clients_lock.insert(
                client_id.clone(),
                WebSocketClient {
                    id: client_id.clone(),
                    user_id: user_id_from_auth,
                    team_id: team_id_from_auth,
                },
            );
        }

        {
            let mut senders_lock = senders.lock().await;
            senders_lock.insert(client_id.clone(), sender);
        }

        Self::handle_messages(
            receiver,
            &client_id,
            &clients,
            &senders,
            &presence,
            app_handle.as_ref(),
        )
        .await;

        {
            let mut clients_lock = clients.lock().await;
            if let Some(client) = clients_lock.get(&client_id) {
                if let Some(user_id) = &client.user_id {
                    presence.set_offline(user_id).await;
                }
            }
            clients_lock.remove(&client_id);
        }

        {
            let mut senders_lock = senders.lock().await;
            senders_lock.remove(&client_id);
        }

        tracing::info!("Client disconnected: {}", client_id);
    }

    async fn handle_messages(
        mut receiver: SplitStream<WebSocketStream<TcpStream>>,
        client_id: &str,
        clients: &Arc<TokioMutex<HashMap<String, WebSocketClient>>>,
        senders: &Arc<TokioMutex<HashMap<String, SplitSink<WebSocketStream<TcpStream>, Message>>>>,
        presence: &Arc<PresenceManager>,
        app_handle: Option<&tauri::AppHandle>,
    ) {
        while let Some(Ok(msg)) = receiver.next().await {
            if let Message::Text(text) = msg {
                if let Ok(event) = serde_json::from_str::<RealtimeEvent>(&text) {
                    Self::handle_event(event, client_id, clients, senders, presence, app_handle)
                        .await;
                }
            }
        }
    }

    async fn handle_event(
        event: RealtimeEvent,
        client_id: &str,
        clients: &Arc<TokioMutex<HashMap<String, WebSocketClient>>>,
        senders: &Arc<TokioMutex<HashMap<String, SplitSink<WebSocketStream<TcpStream>, Message>>>>,
        presence: &Arc<PresenceManager>,
        app_handle: Option<&tauri::AppHandle>,
    ) {
        match &event {
            RealtimeEvent::Authenticate {
                user_id, team_id, ..
            } => {
                {
                    let mut clients_lock = clients.lock().await;
                    if let Some(client) = clients_lock.get_mut(client_id) {
                        client.user_id = Some(user_id.clone());
                        client.team_id = team_id.clone();
                    }
                }
                presence.set_online(user_id).await;
                tracing::info!("Client authenticated: {} as user {}", client_id, user_id);
            }

            RealtimeEvent::GoalCreated { .. } => {
                if let Some(team_id) = Self::get_client_team(client_id, clients).await {
                    Self::broadcast_to_team(&team_id, event.clone(), clients, senders).await;
                }
            }

            RealtimeEvent::GoalUpdated { .. } => {
                if let Some(team_id) = Self::get_client_team(client_id, clients).await {
                    Self::broadcast_to_team(&team_id, event.clone(), clients, senders).await;
                }
            }

            RealtimeEvent::WorkflowUpdated { .. } => {
                if let Some(team_id) = Self::get_client_team(client_id, clients).await {
                    Self::broadcast_to_team(&team_id, event.clone(), clients, senders).await;
                }
            }

            RealtimeEvent::UserTyping { resource_id, .. } => {
                Self::broadcast_to_resource(resource_id, event.clone(), clients, senders).await;
            }

            RealtimeEvent::CursorMoved { .. } => {
                if let Some(team_id) = Self::get_client_team(client_id, clients).await {
                    Self::broadcast_to_team(&team_id, event.clone(), clients, senders).await;
                }
            }

            RealtimeEvent::NativeMessage { id, payload } => {
                tracing::info!("Received native message: {} {:?}", id, payload);
                let native_type = payload
                    .get("type")
                    .and_then(Value::as_str)
                    .map(str::to_string)
                    .unwrap_or_else(|| "unknown".to_string());
                let started_at = Instant::now();

                if let Some(app) = app_handle {
                    let tool_name = format!("extension_native_{}", native_type);
                    emit_tool_started(app, id, &tool_name, Some(payload.clone()));
                }

                let execution = Self::execute_native_message(payload.clone(), app_handle).await;
                let duration_ms = started_at.elapsed().as_millis() as u64;

                let response = match execution {
                    Ok(data) => RealtimeEvent::NativeResponse {
                        id: id.clone(),
                        success: true,
                        data: Some(data),
                        error: None,
                    },
                    Err(error) => RealtimeEvent::NativeResponse {
                        id: id.clone(),
                        success: false,
                        data: None,
                        error: Some(error),
                    },
                };

                if let Some(app) = app_handle {
                    let (success, result, error) = match &response {
                        RealtimeEvent::NativeResponse {
                            success,
                            data,
                            error,
                            ..
                        } => (*success, data.clone(), error.clone()),
                        _ => (
                            false,
                            None,
                            Some("Unexpected native response type".to_string()),
                        ),
                    };

                    if success {
                        emit_tool_completed(
                            app,
                            id,
                            result.clone().unwrap_or_else(|| json!({})),
                            duration_ms,
                        );
                    } else {
                        emit_tool_error(
                            app,
                            id,
                            error
                                .as_deref()
                                .unwrap_or("Native extension request failed"),
                            duration_ms,
                            true,
                        );
                    }

                    // Avoid duplicate/conflicting extension task events for message types
                    // that already emit dedicated events in their execution handlers.
                    let emit_generic_task_event = !matches!(
                        native_type.as_str(),
                        "page_context"
                            | "task_result"
                            | "ping"
                            | "connect"
                            | "disconnect"
                            | "selected_text_query"
                    );

                    if emit_generic_task_event {
                        let task_event = json!({
                            "task_id": id,
                            "success": success,
                            "result": result,
                            "error": error,
                            "actions_performed": 1,
                            "duration": duration_ms,
                            "metadata": {
                                "native_type": native_type
                            }
                        });

                        if let Err(event_error) = app.emit("extension:task-result", &task_event) {
                            tracing::warn!(
                                "Failed to emit extension:task-result from native message: {}",
                                event_error
                            );
                        }
                    }
                }

                let message = Message::Text(serde_json::to_string(&response).unwrap_or_default());
                let mut senders_lock = senders.lock().await;
                if let Some(sender) = senders_lock.get_mut(client_id) {
                    let _ = sender.send(message).await;
                }
            }

            _ => {
                tracing::debug!("Unhandled event type: {:?}", event);
            }
        }
    }

    async fn get_client_team(
        client_id: &str,
        clients: &Arc<TokioMutex<HashMap<String, WebSocketClient>>>,
    ) -> Option<String> {
        let clients_lock = clients.lock().await;
        clients_lock.get(client_id).and_then(|c| c.team_id.clone())
    }

    async fn broadcast_to_team(
        team_id: &str,
        event: RealtimeEvent,
        clients: &Arc<TokioMutex<HashMap<String, WebSocketClient>>>,
        senders: &Arc<TokioMutex<HashMap<String, SplitSink<WebSocketStream<TcpStream>, Message>>>>,
    ) {
        let message = Message::Text(serde_json::to_string(&event).unwrap_or_default());
        let clients_lock = clients.lock().await;
        let mut senders_lock = senders.lock().await;

        for (client_id, client) in clients_lock.iter() {
            if client.team_id.as_deref() == Some(team_id) {
                if let Some(sender) = senders_lock.get_mut(client_id) {
                    let _ = sender.send(message.clone()).await;
                }
            }
        }
    }

    async fn broadcast_to_resource(
        _resource_id: &str,
        event: RealtimeEvent,
        clients: &Arc<TokioMutex<HashMap<String, WebSocketClient>>>,
        senders: &Arc<TokioMutex<HashMap<String, SplitSink<WebSocketStream<TcpStream>, Message>>>>,
    ) {
        let message = Message::Text(serde_json::to_string(&event).unwrap_or_default());
        let clients_lock = clients.lock().await;
        let mut senders_lock = senders.lock().await;

        for (client_id, client) in clients_lock.iter() {
            if client.user_id.is_some() {
                if let Some(sender) = senders_lock.get_mut(client_id) {
                    let _ = sender.send(message.clone()).await;
                }
            }
        }
    }

    async fn broadcast_to_specific_user(
        user_id: &str,
        event: RealtimeEvent,
        clients: &Arc<TokioMutex<HashMap<String, WebSocketClient>>>,
        senders: &Arc<TokioMutex<HashMap<String, SplitSink<WebSocketStream<TcpStream>, Message>>>>,
    ) -> Result<(), String> {
        let message = Message::Text(
            serde_json::to_string(&event)
                .map_err(|e| format!("Failed to serialize event: {}", e))?,
        );

        let clients_lock = clients.lock().await;
        let mut senders_lock = senders.lock().await;
        let mut delivered = false;

        for (client_id, client) in clients_lock.iter() {
            if client.user_id.as_deref() == Some(user_id) {
                if let Some(sender) = senders_lock.get_mut(client_id) {
                    let _ = sender.send(message.clone()).await;
                    delivered = true;
                }
            }
        }

        if delivered {
            Ok(())
        } else {
            Err(format!("User {} not connected", user_id))
        }
    }

    async fn execute_native_message(
        payload: Value,
        app_handle: Option<&tauri::AppHandle>,
    ) -> Result<Value, String> {
        let message: NativeMessage = serde_json::from_value(payload)
            .map_err(|e| format!("Invalid native message payload: {}", e))?;

        match message {
            NativeMessage::Ping => Ok(json!({ "pong": true })),

            NativeMessage::Connect { extension_id } => {
                if let Err(error) = install_manifests(Some(extension_id.as_str())) {
                    tracing::warn!(
                        "Failed to refresh native messaging manifests for extension {}: {}",
                        extension_id,
                        error
                    );
                }

                if let Some(app) = app_handle {
                    if let Some(native_state) =
                        app.try_state::<crate::sys::commands::NativeMessagingStateWrapper>()
                    {
                        *native_state.extension_id.write().await = Some(extension_id.clone());
                        let mut state = native_state.state.write().await;
                        state.connection_state = ConnectionState::Connected;
                        state.extension_id = Some(extension_id.clone());
                    }

                    if let Err(e) = app.emit(
                        "extension:connection-status",
                        &json!({
                            "connected": true,
                            "status": "connected",
                            "extension_id": extension_id,
                            "timestamp": chrono::Utc::now().timestamp_millis()
                        }),
                    ) {
                        tracing::warn!(
                            "Failed to emit extension:connection-status (connected): {}",
                            e
                        );
                    }
                }

                Ok(json!({
                    "connected": true,
                    "extension_id": extension_id,
                    "version": env!("CARGO_PKG_VERSION")
                }))
            }

            NativeMessage::Disconnect { reason } => {
                if let Some(app) = app_handle {
                    if let Some(native_state) =
                        app.try_state::<crate::sys::commands::NativeMessagingStateWrapper>()
                    {
                        *native_state.extension_id.write().await = None;
                        let mut state = native_state.state.write().await;
                        state.connection_state = ConnectionState::Disconnected;
                        state.extension_id = None;
                    }

                    if let Err(e) = app.emit(
                        "extension:connection-status",
                        &json!({
                            "connected": false,
                            "status": "disconnected",
                            "reason": reason,
                            "timestamp": chrono::Utc::now().timestamp_millis()
                        }),
                    ) {
                        tracing::warn!(
                            "Failed to emit extension:connection-status (disconnected): {}",
                            e
                        );
                    }
                }

                Ok(json!({
                    "disconnected": true,
                    "reason": reason
                }))
            }

            NativeMessage::GetTabs => {
                let app = app_handle.ok_or_else(|| "Desktop app handle unavailable".to_string())?;
                let browser_state = app.state::<BrowserStateWrapper>();
                let tab_manager = browser_state
                    .get_tab_manager()
                    .map_err(|e| format!("Browser state unavailable: {}", e))?;
                let tab_manager = tab_manager.lock().await;
                let active_tab_id = tab_manager
                    .get_active_tab()
                    .await
                    .map_err(|e| e.to_string())?
                    .map(|tab| tab.id);
                let tabs = tab_manager.list_tabs().await.map_err(|e| e.to_string())?;

                let tab_payload = tabs
                    .into_iter()
                    .map(|tab| {
                        json!({
                            "id": tab.id,
                            "url": tab.url,
                            "title": tab.title,
                            "active": active_tab_id.as_ref() == Some(&tab.id),
                            "favicon_url": tab.favicon,
                            "status": if tab.loading { "loading" } else { "complete" }
                        })
                    })
                    .collect::<Vec<_>>();

                Ok(json!({ "tabs": tab_payload }))
            }

            NativeMessage::GetActiveTab => {
                let app = app_handle.ok_or_else(|| "Desktop app handle unavailable".to_string())?;
                let browser_state = app.state::<BrowserStateWrapper>();
                let tab_manager = browser_state
                    .get_tab_manager()
                    .map_err(|e| format!("Browser state unavailable: {}", e))?;
                let tab_manager = tab_manager.lock().await;
                let tab = tab_manager
                    .get_active_tab()
                    .await
                    .map_err(|e| e.to_string())?;

                Ok(json!({
                    "active_tab": tab
                }))
            }

            NativeMessage::CreateTab { url } => {
                let app = app_handle.ok_or_else(|| "Desktop app handle unavailable".to_string())?;
                let browser_state = app.state::<BrowserStateWrapper>();
                let tab_manager = browser_state
                    .get_tab_manager()
                    .map_err(|e| format!("Browser state unavailable: {}", e))?;
                let tab_id = tab_manager
                    .lock()
                    .await
                    .open_tab(&url)
                    .await
                    .map_err(|e| e.to_string())?;

                Ok(json!({
                    "created": true,
                    "tab_id": tab_id,
                    "url": url
                }))
            }

            NativeMessage::CloseTab { tab_id } => {
                let app = app_handle.ok_or_else(|| "Desktop app handle unavailable".to_string())?;
                let browser_state = app.state::<BrowserStateWrapper>();
                let tab_manager = browser_state
                    .get_tab_manager()
                    .map_err(|e| format!("Browser state unavailable: {}", e))?;
                tab_manager
                    .lock()
                    .await
                    .close_tab(&tab_id.to_string())
                    .await
                    .map_err(|e| e.to_string())?;

                Ok(json!({
                    "closed": true,
                    "tab_id": tab_id
                }))
            }

            NativeMessage::SwitchTab { tab_id } => {
                let app = app_handle.ok_or_else(|| "Desktop app handle unavailable".to_string())?;
                let browser_state = app.state::<BrowserStateWrapper>();
                let tab_manager = browser_state
                    .get_tab_manager()
                    .map_err(|e| format!("Browser state unavailable: {}", e))?;
                tab_manager
                    .lock()
                    .await
                    .switch_to_tab(&tab_id.to_string())
                    .await
                    .map_err(|e| e.to_string())?;

                Ok(json!({
                    "switched": true,
                    "tab_id": tab_id
                }))
            }

            NativeMessage::Navigate { url, tab_id } => {
                let app = app_handle.ok_or_else(|| "Desktop app handle unavailable".to_string())?;
                let (client, resolved_tab_id) =
                    Self::get_native_cdp_client(app, tab_id, true, Some(&url)).await?;
                client.navigate(&url).await.map_err(|e| e.to_string())?;

                Ok(json!({
                    "navigated": true,
                    "tab_id": resolved_tab_id,
                    "url": url
                }))
            }

            NativeMessage::Click { selector, tab_id } => {
                let app = app_handle.ok_or_else(|| "Desktop app handle unavailable".to_string())?;
                let (client, resolved_tab_id) =
                    Self::get_native_cdp_client(app, tab_id, false, None).await?;
                client
                    .click_element(&selector)
                    .await
                    .map_err(|e| e.to_string())?;

                Ok(json!({
                    "clicked": true,
                    "tab_id": resolved_tab_id,
                    "selector": selector
                }))
            }

            NativeMessage::Type {
                selector,
                text,
                tab_id,
            } => {
                let app = app_handle.ok_or_else(|| "Desktop app handle unavailable".to_string())?;
                let (client, resolved_tab_id) =
                    Self::get_native_cdp_client(app, tab_id, false, None).await?;
                client
                    .type_into_element(&selector, &text, false)
                    .await
                    .map_err(|e| e.to_string())?;

                Ok(json!({
                    "typed": true,
                    "tab_id": resolved_tab_id,
                    "selector": selector,
                    "chars": text.chars().count()
                }))
            }

            NativeMessage::GetElement { selector, tab_id } => {
                let app = app_handle.ok_or_else(|| "Desktop app handle unavailable".to_string())?;
                let (client, resolved_tab_id) =
                    Self::get_native_cdp_client(app, tab_id, false, None).await?;
                let script = format!(
                    r#"(function() {{
                        const el = document.querySelector('{}');
                        if (!el) return null;
                        return {{
                            tag_name: el.tagName.toLowerCase(),
                            id: el.id || null,
                            class_name: el.className || null,
                            text_content: (el.textContent || '').trim(),
                            inner_html: el.innerHTML || '',
                            outer_html: el.outerHTML || ''
                        }};
                    }})()"#,
                    selector.replace('\'', "\\'")
                );
                let element = client.evaluate(&script).await.map_err(|e| e.to_string())?;

                Ok(json!({
                    "tab_id": resolved_tab_id,
                    "selector": selector,
                    "element": element
                }))
            }

            NativeMessage::GetElements { selector, tab_id } => {
                let app = app_handle.ok_or_else(|| "Desktop app handle unavailable".to_string())?;
                let (client, resolved_tab_id) =
                    Self::get_native_cdp_client(app, tab_id, false, None).await?;
                let elements = client
                    .query_all(&selector)
                    .await
                    .map_err(|e| e.to_string())?;

                Ok(json!({
                    "tab_id": resolved_tab_id,
                    "selector": selector,
                    "elements": elements
                }))
            }

            NativeMessage::GetText { selector, tab_id } => {
                let app = app_handle.ok_or_else(|| "Desktop app handle unavailable".to_string())?;
                let (client, resolved_tab_id) =
                    Self::get_native_cdp_client(app, tab_id, false, None).await?;
                let text = client
                    .get_text(&selector)
                    .await
                    .map_err(|e| e.to_string())?;

                Ok(json!({
                    "tab_id": resolved_tab_id,
                    "selector": selector,
                    "text": text
                }))
            }

            NativeMessage::GetAttribute {
                selector,
                attribute,
                tab_id,
            } => {
                let app = app_handle.ok_or_else(|| "Desktop app handle unavailable".to_string())?;
                let (client, resolved_tab_id) =
                    Self::get_native_cdp_client(app, tab_id, false, None).await?;
                let value = client
                    .get_attribute(&selector, &attribute)
                    .await
                    .map_err(|e| e.to_string())?;

                Ok(json!({
                    "tab_id": resolved_tab_id,
                    "selector": selector,
                    "attribute": attribute,
                    "value": value
                }))
            }

            NativeMessage::SetAttribute {
                selector,
                attribute,
                value,
                tab_id,
            } => {
                let app = app_handle.ok_or_else(|| "Desktop app handle unavailable".to_string())?;
                let (client, resolved_tab_id) =
                    Self::get_native_cdp_client(app, tab_id, false, None).await?;
                let script = format!(
                    r#"(function() {{
                        const el = document.querySelector('{}');
                        if (!el) throw new Error('Element not found');
                        el.setAttribute('{}', '{}');
                        return true;
                    }})()"#,
                    selector.replace('\'', "\\'"),
                    attribute.replace('\'', "\\'"),
                    value.replace('\'', "\\'")
                );
                client.evaluate(&script).await.map_err(|e| e.to_string())?;

                Ok(json!({
                    "set": true,
                    "tab_id": resolved_tab_id,
                    "selector": selector,
                    "attribute": attribute
                }))
            }

            NativeMessage::Screenshot { tab_id, format } => {
                let app = app_handle.ok_or_else(|| "Desktop app handle unavailable".to_string())?;
                let (client, resolved_tab_id) =
                    Self::get_native_cdp_client(app, tab_id, false, None).await?;
                let image_bytes = client
                    .capture_screenshot(false)
                    .await
                    .map_err(|e| e.to_string())?;
                let requested_format = format.unwrap_or_else(|| "png".to_string());

                Ok(json!({
                    "tab_id": resolved_tab_id,
                    "format": requested_format,
                    "data": BASE64_STANDARD.encode(image_bytes)
                }))
            }

            NativeMessage::GetAccessibilityTree { tab_id } => {
                let app = app_handle.ok_or_else(|| "Desktop app handle unavailable".to_string())?;
                let (client, resolved_tab_id) =
                    Self::get_native_cdp_client(app, tab_id, false, None).await?;
                let tree = client
                    .evaluate(AccessibilityAnalyzer::get_accessibility_tree_script())
                    .await
                    .map_err(|e| e.to_string())?;

                Ok(json!({
                    "tab_id": resolved_tab_id,
                    "tree": tree
                }))
            }

            NativeMessage::GetFocusableElements { tab_id } => {
                let app = app_handle.ok_or_else(|| "Desktop app handle unavailable".to_string())?;
                let (client, resolved_tab_id) =
                    Self::get_native_cdp_client(app, tab_id, false, None).await?;
                let elements = client
                    .evaluate(
                        r#"(function() {
                            const nodes = document.querySelectorAll(
                                'a[href], button, input, textarea, select, [tabindex]:not([tabindex="-1"])'
                            );
                            return Array.from(nodes).map((el) => ({
                                tag: el.tagName.toLowerCase(),
                                id: el.id || null,
                                class_name: el.className || null,
                                text: (el.textContent || '').trim().slice(0, 200)
                            }));
                        })()"#,
                    )
                    .await
                    .map_err(|e| e.to_string())?;

                Ok(json!({
                    "tab_id": resolved_tab_id,
                    "elements": elements
                }))
            }

            NativeMessage::GetCookies { url } => {
                let app = app_handle.ok_or_else(|| "Desktop app handle unavailable".to_string())?;
                let (client, resolved_tab_id) =
                    Self::get_native_cdp_client(app, None, false, None).await?;
                let mut cookies = AdvancedBrowserOps::get_cookies(client)
                    .await
                    .map_err(|e| e.to_string())?;

                if let Some(target_url) = url {
                    let domain = target_url
                        .replace("https://", "")
                        .replace("http://", "")
                        .split('/')
                        .next()
                        .unwrap_or("")
                        .to_string();
                    cookies.retain(|cookie| cookie.domain.contains(&domain));
                }

                Ok(json!({
                    "tab_id": resolved_tab_id,
                    "cookies": cookies
                }))
            }

            NativeMessage::SetCookie { cookie } => {
                let app = app_handle.ok_or_else(|| "Desktop app handle unavailable".to_string())?;
                let (client, resolved_tab_id) =
                    Self::get_native_cdp_client(app, None, false, None).await?;
                let mapped_cookie = Cookie {
                    name: cookie.name,
                    value: cookie.value,
                    domain: cookie.domain.unwrap_or_default(),
                    path: cookie.path.unwrap_or_else(|| "/".to_string()),
                    secure: cookie.secure.unwrap_or(false),
                    http_only: cookie.http_only.unwrap_or(false),
                    same_site: None,
                };
                AdvancedBrowserOps::set_cookie(client, mapped_cookie)
                    .await
                    .map_err(|e| e.to_string())?;

                Ok(json!({
                    "set": true,
                    "tab_id": resolved_tab_id
                }))
            }

            NativeMessage::GetLocalStorage { key, tab_id } => {
                let app = app_handle.ok_or_else(|| "Desktop app handle unavailable".to_string())?;
                let (client, resolved_tab_id) =
                    Self::get_native_cdp_client(app, tab_id, false, None).await?;
                let data = if let Some(storage_key) = key {
                    let script = format!(
                        "window.localStorage.getItem('{}')",
                        storage_key.replace('\'', "\\'")
                    );
                    client.evaluate(&script).await.map_err(|e| e.to_string())?
                } else {
                    client
                        .evaluate(
                            r#"(function() {
                                const output = {};
                                for (let i = 0; i < localStorage.length; i++) {
                                    const key = localStorage.key(i);
                                    if (key !== null) {
                                        output[key] = localStorage.getItem(key);
                                    }
                                }
                                return output;
                            })()"#,
                        )
                        .await
                        .map_err(|e| e.to_string())?
                };

                Ok(json!({
                    "tab_id": resolved_tab_id,
                    "data": data
                }))
            }

            NativeMessage::SetLocalStorage { key, value, tab_id } => {
                let app = app_handle.ok_or_else(|| "Desktop app handle unavailable".to_string())?;
                let (client, resolved_tab_id) =
                    Self::get_native_cdp_client(app, tab_id, false, None).await?;
                let script = format!(
                    "window.localStorage.setItem('{}', '{}'); true;",
                    key.replace('\'', "\\'"),
                    value.replace('\'', "\\'")
                );
                client.evaluate(&script).await.map_err(|e| e.to_string())?;

                Ok(json!({
                    "set": true,
                    "tab_id": resolved_tab_id,
                    "key": key
                }))
            }

            NativeMessage::GetPageInfo { tab_id } => {
                let app = app_handle.ok_or_else(|| "Desktop app handle unavailable".to_string())?;
                let (client, resolved_tab_id) =
                    Self::get_native_cdp_client(app, tab_id, false, None).await?;
                let url = client.get_url().await.map_err(|e| e.to_string())?;
                let title = client.get_title().await.map_err(|e| e.to_string())?;

                Ok(json!({
                    "tab_id": resolved_tab_id,
                    "url": url,
                    "title": title
                }))
            }

            NativeMessage::GetPageContent { tab_id } => {
                let app = app_handle.ok_or_else(|| "Desktop app handle unavailable".to_string())?;
                let (client, resolved_tab_id) =
                    Self::get_native_cdp_client(app, tab_id, false, None).await?;
                let html = client.get_content().await.map_err(|e| e.to_string())?;

                Ok(json!({
                    "tab_id": resolved_tab_id,
                    "html": html
                }))
            }

            NativeMessage::PageContext {
                url,
                title,
                html,
                selected_text,
                tab_id,
                timestamp,
            } => {
                let app = app_handle.ok_or_else(|| "Desktop app handle unavailable".to_string())?;
                let tab_id_u32 = u32::try_from(tab_id)
                    .map_err(|_| format!("Invalid negative tab_id for page_context: {}", tab_id))?;

                let context = crate::sys::commands::extension::PageContext {
                    url,
                    title,
                    html,
                    selected_text,
                    tab_id: tab_id_u32,
                    timestamp,
                };
                let response =
                    crate::sys::commands::extension::process_page_context_event(context, app)
                        .await?;
                serde_json::to_value(response)
                    .map_err(|e| format!("Failed to serialize page_context response: {}", e))
            }

            NativeMessage::TaskResult {
                task_id,
                success,
                screenshot,
                result,
                error,
                actions_performed,
                duration,
            } => {
                let app = app_handle.ok_or_else(|| "Desktop app handle unavailable".to_string())?;
                let task_result = crate::sys::commands::extension::TaskResult {
                    task_id,
                    success,
                    screenshot,
                    result,
                    error,
                    actions_performed,
                    duration,
                };
                let response =
                    crate::sys::commands::extension::process_task_result_event(task_result, app)
                        .await?;
                serde_json::to_value(response)
                    .map_err(|e| format!("Failed to serialize task_result response: {}", e))
            }

            NativeMessage::SelectedTextQuery {
                selected_text,
                context_url,
                tab_id,
            } => {
                let app = app_handle.ok_or_else(|| "Desktop app handle unavailable".to_string())?;

                // Store the selected text in the latest page context so the LLM prompt
                // builder can include it when the user next sends a message.
                if let Ok(mut guard) = crate::sys::commands::extension::LATEST_PAGE_CONTEXT.lock() {
                    match *guard {
                        Some(ref mut ctx) => {
                            // If tab_id or context_url differ from stored context,
                            // clear stale title/html so they are not attributed to
                            // the wrong page.
                            if let Some(new_tab_id) = tab_id.and_then(|id| u32::try_from(id).ok()) {
                                if ctx.tab_id != new_tab_id {
                                    ctx.title.clear();
                                    ctx.html.clear();
                                    ctx.tab_id = new_tab_id;
                                }
                            }
                            if let Some(ref url) = context_url {
                                if ctx.url != *url {
                                    ctx.url = url.clone();
                                    ctx.title.clear();
                                    ctx.html.clear();
                                }
                            }
                            ctx.selected_text = Some(selected_text.clone());
                        }
                        None => {
                            let now_ms = std::time::SystemTime::now()
                                .duration_since(std::time::UNIX_EPOCH)
                                .map(|d| d.as_millis() as u64)
                                .unwrap_or(0);
                            *guard = Some(crate::sys::commands::extension::PageContext {
                                url: context_url.clone().unwrap_or_default(),
                                title: String::new(),
                                html: String::new(),
                                selected_text: Some(selected_text.clone()),
                                tab_id: tab_id.unwrap_or(0).max(0) as u32,
                                timestamp: now_ms,
                            });
                        }
                    }
                }

                // Emit a Tauri event so the frontend can open the chat and pre-fill context.
                let _ = app.emit(
                    "extension:selected_text_query",
                    &json!({
                        "text": selected_text,
                        "context_url": context_url,
                        "tab_id": tab_id,
                    }),
                );

                Ok(json!({ "success": true }))
            }

            NativeMessage::ExecuteScript { script, tab_id } => {
                let app = app_handle.ok_or_else(|| "Desktop app handle unavailable".to_string())?;
                let (client, resolved_tab_id) =
                    Self::get_native_cdp_client(app, tab_id, false, None).await?;
                let result = client.evaluate(&script).await.map_err(|e| e.to_string())?;

                Ok(json!({
                    "tab_id": resolved_tab_id,
                    "result": result
                }))
            }

            NativeMessage::Response { .. } | NativeMessage::Pong => {
                Err("Unexpected native message type from extension".to_string())
            }
        }
    }

    async fn get_native_cdp_client(
        app_handle: &tauri::AppHandle,
        requested_tab_id: Option<i32>,
        allow_create: bool,
        initial_url: Option<&str>,
    ) -> Result<(Arc<CdpClient>, String), String> {
        let browser_state = app_handle.state::<BrowserStateWrapper>();
        let resolved_tab_id = if let Some(tab_id) = requested_tab_id {
            tab_id.to_string()
        } else {
            let tab_manager = browser_state
                .get_tab_manager()
                .map_err(|e| format!("Browser state unavailable: {}", e))?;
            let tab_manager = tab_manager.lock().await;
            let tabs = tab_manager.list_tabs().await.map_err(|e| e.to_string())?;

            if let Some(tab) = tabs.first() {
                tab.id.clone()
            } else if allow_create {
                let url = initial_url.unwrap_or("about:blank");
                tab_manager.open_tab(url).await.map_err(|e| e.to_string())?
            } else {
                return Err(
                    "No browser tabs available. Open a tab or provide a valid tab_id first."
                        .to_string(),
                );
            }
        };

        let cdp = browser_state
            .get_cdp_client_for_tab(&resolved_tab_id)
            .await
            .map_err(|e| {
                format!(
                    "Failed to connect to browser tab {}: {}",
                    resolved_tab_id, e
                )
            })?;

        Ok((cdp, resolved_tab_id))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_execute_native_message_ping() {
        let result = RealtimeServer::execute_native_message(json!({ "type": "ping" }), None).await;

        assert!(result.is_ok());
        assert_eq!(result.unwrap(), json!({ "pong": true }));
    }

    #[tokio::test]
    async fn test_execute_native_message_connect_without_app_handle() {
        let result = RealtimeServer::execute_native_message(
            json!({ "type": "connect", "extension_id": "ext_123" }),
            None,
        )
        .await;

        assert!(result.is_ok());
        let payload = result.unwrap_or_default();
        assert_eq!(payload.get("connected"), Some(&json!(true)));
        assert_eq!(payload.get("extension_id"), Some(&json!("ext_123")));
    }

    #[tokio::test]
    async fn test_execute_native_message_disconnect_without_app_handle() {
        let result = RealtimeServer::execute_native_message(
            json!({ "type": "disconnect", "reason": "test_disconnect" }),
            None,
        )
        .await;

        assert!(result.is_ok());
        let payload = result.unwrap_or_default();
        assert_eq!(payload.get("disconnected"), Some(&json!(true)));
        assert_eq!(payload.get("reason"), Some(&json!("test_disconnect")));
    }

    #[tokio::test]
    async fn test_execute_native_message_rejects_invalid_payload() {
        let result =
            RealtimeServer::execute_native_message(json!({ "type": "unknown_type" }), None).await;

        assert!(result.is_err());
        assert!(result
            .err()
            .unwrap_or_default()
            .contains("Invalid native message payload"));
    }

    #[tokio::test]
    async fn test_execute_native_message_page_context_requires_app_handle() {
        let result = RealtimeServer::execute_native_message(
            json!({
                "type": "page_context",
                "url": "https://example.com",
                "title": "Example",
                "html": "<html><body>ok</body></html>",
                "selected_text": "ok",
                "tab_id": 1,
                "timestamp": 1
            }),
            None,
        )
        .await;

        assert!(result.is_err());
        assert!(result
            .err()
            .unwrap_or_default()
            .contains("Desktop app handle unavailable"));
    }

    #[tokio::test]
    async fn test_execute_native_message_task_result_requires_app_handle() {
        let result = RealtimeServer::execute_native_message(
            json!({
                "type": "task_result",
                "task_id": "task-1",
                "success": true,
                "screenshot": null,
                "result": { "ok": true },
                "error": null,
                "actions_performed": 1,
                "duration": 12
            }),
            None,
        )
        .await;

        assert!(result.is_err());
        assert!(result
            .err()
            .unwrap_or_default()
            .contains("Desktop app handle unavailable"));
    }
}
