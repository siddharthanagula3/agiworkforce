//! Webhook automation module

use crate::sys::error::{Error, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use tokio::sync::mpsc;

/// Webhook configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Webhook {
    pub id: String,
    pub name: String,
    pub webhook_type: WebhookType,
    pub url: Option<String>,
    pub secret: Option<String>,
    pub events: Vec<String>,
    pub enabled: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum WebhookType {
    Incoming, // Listen for external webhooks
    Outgoing, // Send webhooks to external URLs
}

/// Incoming webhook payload
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebhookPayload {
    pub webhook_id: String,
    pub event: String,
    pub data: serde_json::Value,
    pub timestamp: i64,
    pub signature: Option<String>,
}

/// Outgoing webhook request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OutgoingWebhook {
    pub url: String,
    pub event: String,
    pub data: serde_json::Value,
    pub headers: HashMap<String, String>,
}

/// Webhook execution result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebhookResult {
    pub success: bool,
    pub status_code: Option<u16>,
    pub response_body: Option<String>,
    pub error: Option<String>,
    pub duration_ms: u64,
}

/// Webhook manager
pub struct WebhookManager {
    webhooks: Arc<RwLock<HashMap<String, Webhook>>>,
    client: reqwest::Client,
    incoming_tx: Option<mpsc::Sender<WebhookPayload>>,
    server_port: u16,
}

impl WebhookManager {
    pub fn new() -> Self {
        Self {
            webhooks: Arc::new(RwLock::new(HashMap::new())),
            client: reqwest::Client::new(),
            incoming_tx: None,
            server_port: 9876,
        }
    }

    /// Set incoming webhook event sender
    pub fn set_event_sender(&mut self, tx: mpsc::Sender<WebhookPayload>) {
        self.incoming_tx = Some(tx);
    }

    /// Create a new webhook
    pub fn create_webhook(
        &self,
        name: &str,
        webhook_type: WebhookType,
        url: Option<&str>,
        events: Vec<String>,
    ) -> Result<Webhook> {
        let id = uuid::Uuid::new_v4().to_string();
        let secret = uuid::Uuid::new_v4().to_string().replace("-", "");

        let webhook = Webhook {
            id: id.clone(),
            name: name.to_string(),
            webhook_type,
            url: url.map(String::from),
            secret: Some(secret),
            events,
            enabled: true,
            created_at: chrono::Utc::now().to_rfc3339(),
        };

        let mut webhooks = self
            .webhooks
            .write()
            .map_err(|e| Error::Generic(e.to_string()))?;
        webhooks.insert(id, webhook.clone());

        Ok(webhook)
    }

    /// Get a webhook by ID
    pub fn get_webhook(&self, id: &str) -> Result<Option<Webhook>> {
        let webhooks = self
            .webhooks
            .read()
            .map_err(|e| Error::Generic(e.to_string()))?;
        Ok(webhooks.get(id).cloned())
    }

    /// List all webhooks
    pub fn list_webhooks(&self) -> Result<Vec<Webhook>> {
        let webhooks = self
            .webhooks
            .read()
            .map_err(|e| Error::Generic(e.to_string()))?;
        Ok(webhooks.values().cloned().collect())
    }

    /// Delete a webhook
    pub fn delete_webhook(&self, id: &str) -> Result<bool> {
        let mut webhooks = self
            .webhooks
            .write()
            .map_err(|e| Error::Generic(e.to_string()))?;
        Ok(webhooks.remove(id).is_some())
    }

    /// Enable/disable a webhook
    pub fn set_enabled(&self, id: &str, enabled: bool) -> Result<()> {
        let mut webhooks = self
            .webhooks
            .write()
            .map_err(|e| Error::Generic(e.to_string()))?;

        if let Some(webhook) = webhooks.get_mut(id) {
            webhook.enabled = enabled;
            Ok(())
        } else {
            Err(Error::Generic(format!("Webhook {} not found", id)))
        }
    }

    /// Send an outgoing webhook
    pub async fn send_webhook(&self, request: OutgoingWebhook) -> WebhookResult {
        let start = std::time::Instant::now();

        let mut req = self.client.post(&request.url);

        for (key, value) in &request.headers {
            req = req.header(key, value);
        }

        let payload = serde_json::json!({
            "event": request.event,
            "data": request.data,
            "timestamp": chrono::Utc::now().timestamp_millis()
        });

        match req.json(&payload).send().await {
            Ok(response) => {
                let status = response.status().as_u16();
                let body = response.text().await.ok();

                WebhookResult {
                    success: status >= 200 && status < 300,
                    status_code: Some(status),
                    response_body: body,
                    error: None,
                    duration_ms: start.elapsed().as_millis() as u64,
                }
            }
            Err(e) => WebhookResult {
                success: false,
                status_code: None,
                response_body: None,
                error: Some(e.to_string()),
                duration_ms: start.elapsed().as_millis() as u64,
            },
        }
    }

    /// Trigger webhooks for an event
    pub async fn trigger_event(&self, event: &str, data: serde_json::Value) -> Vec<WebhookResult> {
        let webhooks = match self.webhooks.read() {
            Ok(w) => w.clone(),
            Err(_) => return vec![],
        };

        let mut results = Vec::new();

        for webhook in webhooks.values() {
            if !webhook.enabled || webhook.webhook_type != WebhookType::Outgoing {
                continue;
            }

            if !webhook.events.contains(&event.to_string())
                && !webhook.events.contains(&"*".to_string())
            {
                continue;
            }

            if let Some(url) = &webhook.url {
                let request = OutgoingWebhook {
                    url: url.clone(),
                    event: event.to_string(),
                    data: data.clone(),
                    headers: HashMap::new(),
                };

                results.push(self.send_webhook(request).await);
            }
        }

        results
    }

    /// Handle incoming webhook (called by HTTP server)
    pub async fn handle_incoming(
        &self,
        webhook_id: &str,
        event: &str,
        data: serde_json::Value,
        signature: Option<&str>,
    ) -> Result<()> {
        let webhook = self
            .get_webhook(webhook_id)?
            .ok_or_else(|| Error::Generic("Webhook not found".into()))?;

        if !webhook.enabled || webhook.webhook_type != WebhookType::Incoming {
            return Err(Error::Generic("Webhook is not an incoming webhook".into()));
        }

        // Verify signature if secret is set
        if let Some(ref secret) = webhook.secret {
            if let Some(sig) = signature {
                // Simple HMAC verification would go here
                let _ = (secret, sig); // Placeholder
            }
        }

        let payload = WebhookPayload {
            webhook_id: webhook_id.to_string(),
            event: event.to_string(),
            data,
            timestamp: chrono::Utc::now().timestamp_millis(),
            signature: signature.map(String::from),
        };

        if let Some(ref tx) = self.incoming_tx {
            tx.send(payload)
                .await
                .map_err(|e| Error::Generic(format!("Failed to send webhook event: {}", e)))?;
        }

        Ok(())
    }

    /// Get the incoming webhook URL for a webhook
    pub fn get_incoming_url(&self, webhook_id: &str) -> Result<String> {
        let webhook = self
            .get_webhook(webhook_id)?
            .ok_or_else(|| Error::Generic("Webhook not found".into()))?;

        if webhook.webhook_type != WebhookType::Incoming {
            return Err(Error::Generic("Not an incoming webhook".into()));
        }

        Ok(format!(
            "http://localhost:{}/webhook/{}",
            self.server_port, webhook_id
        ))
    }
}

impl Default for WebhookManager {
    fn default() -> Self {
        Self::new()
    }
}
