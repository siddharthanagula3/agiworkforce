//! Unified messaging channel abstraction

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

use crate::sys::error::{Error, Result};

/// Supported messaging platforms
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Platform {
    Discord,
    Slack,
    Teams,
    Telegram,
    Signal,
    WhatsApp,
}

impl Platform {
    pub fn as_str(&self) -> &'static str {
        match self {
            Platform::Discord => "discord",
            Platform::Slack => "slack",
            Platform::Teams => "teams",
            Platform::Telegram => "telegram",
            Platform::Signal => "signal",
            Platform::WhatsApp => "whatsapp",
        }
    }
}

/// A unified message across platforms
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnifiedMessage {
    pub id: String,
    pub platform: Platform,
    pub channel_id: String,
    pub sender: String,
    pub content: String,
    pub timestamp: i64,
    pub attachments: Vec<Attachment>,
    pub metadata: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Attachment {
    pub id: String,
    pub filename: String,
    pub content_type: String,
    pub size: u64,
    pub url: Option<String>,
}

/// A unified channel/conversation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnifiedChannel {
    pub id: String,
    pub platform: Platform,
    pub name: String,
    pub channel_type: ChannelType,
    pub participants: Vec<String>,
    pub metadata: serde_json::Value,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ChannelType {
    Direct,
    Group,
    Public,
}

/// Trait for messaging providers
#[async_trait]
pub trait MessagingChannel: Send + Sync {
    fn platform(&self) -> Platform;

    async fn connect(&mut self) -> Result<()>;
    async fn disconnect(&mut self) -> Result<()>;
    fn is_connected(&self) -> bool;

    async fn send_message(&self, channel_id: &str, content: &str) -> Result<String>;
    async fn receive_messages(&mut self) -> Result<Vec<UnifiedMessage>>;
    async fn list_channels(&self) -> Result<Vec<UnifiedChannel>>;
}

/// Routes messages across multiple platforms
pub struct ChannelRouter {
    channels: Arc<RwLock<HashMap<Platform, Box<dyn MessagingChannel>>>>,
}

impl ChannelRouter {
    pub fn new() -> Self {
        Self {
            channels: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Register a messaging channel
    pub async fn register(&self, channel: Box<dyn MessagingChannel>) {
        let platform = channel.platform();
        let mut channels = self.channels.write().await;
        channels.insert(platform, channel);
    }

    /// Unregister a platform
    pub async fn unregister(&self, platform: Platform) -> Option<Box<dyn MessagingChannel>> {
        let mut channels = self.channels.write().await;
        channels.remove(&platform)
    }

    /// Connect to a platform
    pub async fn connect(&self, platform: Platform) -> Result<()> {
        let mut channels = self.channels.write().await;
        if let Some(channel) = channels.get_mut(&platform) {
            channel.connect().await
        } else {
            Err(Error::Generic(format!(
                "Platform {:?} not registered",
                platform
            )))
        }
    }

    /// Connect to all platforms
    pub async fn connect_all(&self) -> Vec<(Platform, Result<()>)> {
        let mut channels = self.channels.write().await;
        let mut results = Vec::new();

        for (platform, channel) in channels.iter_mut() {
            results.push((*platform, channel.connect().await));
        }

        results
    }

    /// Send message to a specific platform and channel
    pub async fn send(
        &self,
        platform: Platform,
        channel_id: &str,
        content: &str,
    ) -> Result<String> {
        let channels = self.channels.read().await;
        if let Some(channel) = channels.get(&platform) {
            channel.send_message(channel_id, content).await
        } else {
            Err(Error::Generic(format!(
                "Platform {:?} not registered",
                platform
            )))
        }
    }

    /// Broadcast message to all connected platforms
    pub async fn broadcast(&self, content: &str) -> Vec<(Platform, Result<String>)> {
        let channels = self.channels.read().await;
        let mut results = Vec::new();

        for (platform, channel) in channels.iter() {
            if channel.is_connected() {
                // Get the first available channel for each platform
                if let Ok(chans) = channel.list_channels().await {
                    if let Some(first_chan) = chans.first() {
                        results.push((
                            *platform,
                            channel.send_message(&first_chan.id, content).await,
                        ));
                    }
                }
            }
        }

        results
    }

    /// Receive messages from all platforms
    pub async fn receive_all(&self) -> Vec<UnifiedMessage> {
        let mut channels = self.channels.write().await;
        let mut all_messages = Vec::new();

        for (_, channel) in channels.iter_mut() {
            if channel.is_connected() {
                if let Ok(messages) = channel.receive_messages().await {
                    all_messages.extend(messages);
                }
            }
        }

        // Sort by timestamp
        all_messages.sort_by_key(|m| m.timestamp);
        all_messages
    }

    /// List all channels across platforms
    pub async fn list_all_channels(&self) -> Vec<UnifiedChannel> {
        let channels = self.channels.read().await;
        let mut all_channels = Vec::new();

        for (_, channel) in channels.iter() {
            if channel.is_connected() {
                if let Ok(chans) = channel.list_channels().await {
                    all_channels.extend(chans);
                }
            }
        }

        all_channels
    }

    /// Get connected platforms
    pub async fn get_connected_platforms(&self) -> Vec<Platform> {
        let channels = self.channels.read().await;
        channels
            .iter()
            .filter(|(_, ch)| ch.is_connected())
            .map(|(p, _)| *p)
            .collect()
    }
}

impl Default for ChannelRouter {
    fn default() -> Self {
        Self::new()
    }
}
