use super::{PresenceManager, RealtimeEvent};
use futures::{
    stream::{SplitSink, SplitStream},
    SinkExt, StreamExt,
};
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
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
}

impl RealtimeServer {
    pub fn new(presence: Arc<PresenceManager>) -> Self {
        Self {
            clients: Arc::new(TokioMutex::new(HashMap::new())),
            senders: Arc::new(TokioMutex::new(HashMap::new())),
            presence,
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

                    tokio::spawn(async move {
                        if let Err(e) = Self::handle_connection_wrapper(
                            stream, peer, clients, senders, presence,
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
    ) -> Result<(), Box<dyn std::error::Error>> {
        let ws_stream = accept_async(stream).await?;
        Self::handle_connection(ws_stream, peer, clients, senders, presence).await;
        Ok(())
    }

    async fn handle_connection(
        ws_stream: WebSocketStream<TcpStream>,
        _peer: SocketAddr,
        clients: Arc<TokioMutex<HashMap<String, WebSocketClient>>>,
        senders: Arc<TokioMutex<HashMap<String, SplitSink<WebSocketStream<TcpStream>, Message>>>>,
        presence: Arc<PresenceManager>,
    ) {
        let (sender, receiver) = ws_stream.split();
        let client_id = uuid::Uuid::new_v4().to_string();

        // Add client
        {
            let mut clients_lock = clients.lock().await;
            clients_lock.insert(
                client_id.clone(),
                WebSocketClient {
                    id: client_id.clone(),
                    user_id: None,
                    team_id: None,
                },
            );
        }

        {
            let mut senders_lock = senders.lock().await;
            senders_lock.insert(client_id.clone(), sender);
        }

        // Handle messages
        Self::handle_messages(receiver, &client_id, &clients, &senders, &presence).await;

        // Remove client on disconnect
        {
            let mut clients_lock = clients.lock().await;
            if let Some(client) = clients_lock.get(&client_id) {
                if let Some(user_id) = &client.user_id {
                    presence.set_offline(user_id);
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
    ) {
        while let Some(Ok(msg)) = receiver.next().await {
            if let Message::Text(text) = msg {
                if let Ok(event) = serde_json::from_str::<RealtimeEvent>(&text) {
                    Self::handle_event(event, client_id, clients, senders, presence).await;
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
    ) {
        match &event {
            RealtimeEvent::Authenticate { user_id, team_id } => {
                // Set user info
                {
                    let mut clients_lock = clients.lock().await;
                    if let Some(client) = clients_lock.get_mut(client_id) {
                        client.user_id = Some(user_id.clone());
                        client.team_id = team_id.clone();
                    }
                }
                presence.set_online(user_id);
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
                // Broadcast to all clients in the same team
                if let Some(team_id) = Self::get_client_team(client_id, clients).await {
                    Self::broadcast_to_team(&team_id, event.clone(), clients, senders).await;
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
        // For now, broadcast to all authenticated clients
        // In a real implementation, track which clients are viewing/editing the resource
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
}
