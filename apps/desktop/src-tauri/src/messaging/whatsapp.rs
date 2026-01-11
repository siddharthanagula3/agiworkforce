use reqwest::{header, Client};
use serde::{Deserialize, Serialize};
use serde_json::json;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WhatsAppConfig {
    pub phone_number_id: String,
    pub access_token: String,
    pub webhook_verify_token: String,
}

#[derive(Clone)]
pub struct WhatsAppClient {
    client: Client,
    phone_number_id: String,
    access_token: String,
}

impl WhatsAppClient {
    pub fn new(
        phone_number_id: String,
        access_token: String,
    ) -> Result<Self, Box<dyn std::error::Error>> {
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()?;

        Ok(Self {
            client,
            phone_number_id,
            access_token,
        })
    }

    /// Send a text message
    pub async fn send_text(
        &self,
        to: &str,
        message: &str,
    ) -> Result<String, Box<dyn std::error::Error>> {
        let url = format!(
            "https://graph.facebook.com/v18.0/{}/messages",
            self.phone_number_id
        );

        let payload = json!({
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": to,
            "type": "text",
            "text": {
                "body": message,
            }
        });

        let response = self
            .client
            .post(&url)
            .header(
                header::AUTHORIZATION,
                format!("Bearer {}", self.access_token),
            )
            .header(header::CONTENT_TYPE, "application/json")
            .json(&payload)
            .send()
            .await?;

        let result: WhatsAppMessageResponse = response.json().await?;

        if let Some(error) = result.error {
            return Err(format!("WhatsApp API error: {}", error.message).into());
        }

        let message_id = result
            .messages
            .and_then(|msgs| msgs.first().map(|m| m.id.clone()))
            .ok_or("No message ID returned")?;

        Ok(message_id)
    }

    /// Send a template message (pre-approved by WhatsApp)
    pub async fn send_template(
        &self,
        to: &str,
        template: WhatsAppTemplate,
    ) -> Result<String, Box<dyn std::error::Error>> {
        let url = format!(
            "https://graph.facebook.com/v18.0/{}/messages",
            self.phone_number_id
        );

        let payload = json!({
            "messaging_product": "whatsapp",
            "to": to,
            "type": "template",
            "template": {
                "name": template.name,
                "language": {
                    "code": template.language,
                },
                "components": template.components,
            }
        });

        let response = self
            .client
            .post(&url)
            .header(
                header::AUTHORIZATION,
                format!("Bearer {}", self.access_token),
            )
            .header(header::CONTENT_TYPE, "application/json")
            .json(&payload)
            .send()
            .await?;

        let result: WhatsAppMessageResponse = response.json().await?;

        if let Some(error) = result.error {
            return Err(format!("WhatsApp API error: {}", error.message).into());
        }

        let message_id = result
            .messages
            .and_then(|msgs| msgs.first().map(|m| m.id.clone()))
            .ok_or("No message ID returned")?;

        Ok(message_id)
    }

    /// Send an interactive message with buttons
    pub async fn send_interactive(
        &self,
        to: &str,
        interactive: WhatsAppInteractive,
    ) -> Result<String, Box<dyn std::error::Error>> {
        let url = format!(
            "https://graph.facebook.com/v18.0/{}/messages",
            self.phone_number_id
        );

        let payload = json!({
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": to,
            "type": "interactive",
            "interactive": interactive,
        });

        let response = self
            .client
            .post(&url)
            .header(
                header::AUTHORIZATION,
                format!("Bearer {}", self.access_token),
            )
            .header(header::CONTENT_TYPE, "application/json")
            .json(&payload)
            .send()
            .await?;

        let result: WhatsAppMessageResponse = response.json().await?;

        if let Some(error) = result.error {
            return Err(format!("WhatsApp API error: {}", error.message).into());
        }

        let message_id = result
            .messages
            .and_then(|msgs| msgs.first().map(|m| m.id.clone()))
            .ok_or("No message ID returned")?;

        Ok(message_id)
    }

    /// Send an image
    pub async fn send_image(
        &self,
        to: &str,
        image_url: &str,
        caption: Option<&str>,
    ) -> Result<String, Box<dyn std::error::Error>> {
        let url = format!(
            "https://graph.facebook.com/v18.0/{}/messages",
            self.phone_number_id
        );

        let mut image_obj = json!({
            "link": image_url,
        });

        if let Some(cap) = caption {
            image_obj["caption"] = json!(cap);
        }

        let payload = json!({
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": to,
            "type": "image",
            "image": image_obj,
        });

        let response = self
            .client
            .post(&url)
            .header(
                header::AUTHORIZATION,
                format!("Bearer {}", self.access_token),
            )
            .header(header::CONTENT_TYPE, "application/json")
            .json(&payload)
            .send()
            .await?;

        let result: WhatsAppMessageResponse = response.json().await?;

        if let Some(error) = result.error {
            return Err(format!("WhatsApp API error: {}", error.message).into());
        }

        let message_id = result
            .messages
            .and_then(|msgs| msgs.first().map(|m| m.id.clone()))
            .ok_or("No message ID returned")?;

        Ok(message_id)
    }

    /// Send a document
    pub async fn send_document(
        &self,
        to: &str,
        document_url: &str,
        filename: Option<&str>,
        caption: Option<&str>,
    ) -> Result<String, Box<dyn std::error::Error>> {
        let url = format!(
            "https://graph.facebook.com/v18.0/{}/messages",
            self.phone_number_id
        );

        let mut document_obj = json!({
            "link": document_url,
        });

        if let Some(name) = filename {
            document_obj["filename"] = json!(name);
        }

        if let Some(cap) = caption {
            document_obj["caption"] = json!(cap);
        }

        let payload = json!({
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": to,
            "type": "document",
            "document": document_obj,
        });

        let response = self
            .client
            .post(&url)
            .header(
                header::AUTHORIZATION,
                format!("Bearer {}", self.access_token),
            )
            .header(header::CONTENT_TYPE, "application/json")
            .json(&payload)
            .send()
            .await?;

        let result: WhatsAppMessageResponse = response.json().await?;

        if let Some(error) = result.error {
            return Err(format!("WhatsApp API error: {}", error.message).into());
        }

        let message_id = result
            .messages
            .and_then(|msgs| msgs.first().map(|m| m.id.clone()))
            .ok_or("No message ID returned")?;

        Ok(message_id)
    }

    /// Mark a message as read
    pub async fn mark_as_read(&self, message_id: &str) -> Result<(), Box<dyn std::error::Error>> {
        let url = format!(
            "https://graph.facebook.com/v18.0/{}/messages",
            self.phone_number_id
        );

        let payload = json!({
            "messaging_product": "whatsapp",
            "status": "read",
            "message_id": message_id,
        });

        let response = self
            .client
            .post(&url)
            .header(
                header::AUTHORIZATION,
                format!("Bearer {}", self.access_token),
            )
            .header(header::CONTENT_TYPE, "application/json")
            .json(&payload)
            .send()
            .await?;

        let result: WhatsAppStatusResponse = response.json().await?;

        if !result.success {
            if let Some(error) = result.error {
                return Err(format!("WhatsApp API error: {}", error.message).into());
            }
            return Err("Failed to mark message as read".into());
        }

        Ok(())
    }

    /// Handle incoming webhook events
    pub fn handle_webhook(
        &self,
        payload: WhatsAppWebhook,
    ) -> Result<(), Box<dyn std::error::Error>> {
        // Process webhook payload
        for entry in payload.entry {
            for change in entry.changes {
                if let Some(value) = change.value {
                    // Process messages
                    if let Some(messages) = value.messages {
                        for message in messages {
                            println!("Received message from {}: {:?}", message.from, message.text);
                        }
                    }

                    // Process statuses
                    if let Some(statuses) = value.statuses {
                        for status in statuses {
                            println!("Message {} status: {}", status.id, status.status);
                        }
                    }
                }
            }
        }

        Ok(())
    }

    /// Get media URL from media ID
    pub async fn get_media_url(
        &self,
        media_id: &str,
    ) -> Result<String, Box<dyn std::error::Error>> {
        let url = format!("https://graph.facebook.com/v18.0/{}", media_id);

        let response = self
            .client
            .get(&url)
            .header(
                header::AUTHORIZATION,
                format!("Bearer {}", self.access_token),
            )
            .send()
            .await?;

        let result: WhatsAppMediaResponse = response.json().await?;

        if let Some(error) = result.error {
            return Err(format!("WhatsApp API error: {}", error.message).into());
        }

        tracing::debug!(
            "Fetched WhatsApp media metadata mime={:?} size={:?} sha256={:?}",
            result.mime_type.as_deref(),
            result.file_size,
            result.sha256.as_deref()
        );

        Ok(result.url.ok_or("No media URL returned")?)
    }

    /// Download media content
    pub async fn download_media(
        &self,
        media_url: &str,
    ) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
        let response = self
            .client
            .get(media_url)
            .header(
                header::AUTHORIZATION,
                format!("Bearer {}", self.access_token),
            )
            .send()
            .await?;

        let bytes = response.bytes().await?;
        Ok(bytes.to_vec())
    }
}

// Response types
#[derive(Debug, Deserialize)]
struct WhatsAppMessageResponse {
    messages: Option<Vec<WhatsAppMessageInfo>>,
    error: Option<WhatsAppError>,
}

#[derive(Debug, Deserialize)]
struct WhatsAppMessageInfo {
    id: String,
}

#[derive(Debug, Deserialize)]
struct WhatsAppStatusResponse {
    success: bool,
    error: Option<WhatsAppError>,
}

#[derive(Debug, Deserialize)]
struct WhatsAppMediaResponse {
    url: Option<String>,
    mime_type: Option<String>,
    sha256: Option<String>,
    file_size: Option<u64>,
    error: Option<WhatsAppError>,
}

#[derive(Debug, Deserialize)]
pub struct WhatsAppError {
    pub message: String,
    pub code: i32,
}

// Data types
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WhatsAppTemplate {
    pub name: String,
    pub language: String, // e.g., "en_US"
    pub components: Vec<WhatsAppTemplateComponent>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WhatsAppTemplateComponent {
    #[serde(rename = "type")]
    pub component_type: String, // "header", "body", "button"
    pub parameters: Vec<WhatsAppTemplateParameter>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WhatsAppTemplateParameter {
    #[serde(rename = "type")]
    pub param_type: String, // "text", "currency", "date_time"
    pub text: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WhatsAppInteractive {
    #[serde(rename = "type")]
    pub interactive_type: String, // "button", "list"
    pub body: WhatsAppInteractiveBody,
    pub action: WhatsAppInteractiveAction,
    pub header: Option<WhatsAppInteractiveHeader>,
    pub footer: Option<WhatsAppInteractiveFooter>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WhatsAppInteractiveBody {
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WhatsAppInteractiveHeader {
    #[serde(rename = "type")]
    pub header_type: String, // "text", "image", "video", "document"
    pub text: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WhatsAppInteractiveFooter {
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WhatsAppInteractiveAction {
    pub buttons: Option<Vec<WhatsAppButton>>,
    pub sections: Option<Vec<WhatsAppSection>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WhatsAppButton {
    #[serde(rename = "type")]
    pub button_type: String, // "reply"
    pub reply: WhatsAppButtonReply,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WhatsAppButtonReply {
    pub id: String,
    pub title: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WhatsAppSection {
    pub title: String,
    pub rows: Vec<WhatsAppRow>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WhatsAppRow {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
}

// Webhook types
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WhatsAppWebhook {
    pub object: String,
    pub entry: Vec<WhatsAppEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WhatsAppEntry {
    pub id: String,
    pub changes: Vec<WhatsAppChange>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WhatsAppChange {
    pub value: Option<WhatsAppValue>,
    pub field: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WhatsAppValue {
    pub messaging_product: String,
    pub metadata: Option<WhatsAppMetadata>,
    pub contacts: Option<Vec<WhatsAppContact>>,
    pub messages: Option<Vec<WhatsAppIncomingMessage>>,
    pub statuses: Option<Vec<WhatsAppStatus>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WhatsAppMetadata {
    pub display_phone_number: String,
    pub phone_number_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WhatsAppContact {
    pub profile: WhatsAppProfile,
    pub wa_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WhatsAppProfile {
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WhatsAppIncomingMessage {
    pub from: String,
    pub id: String,
    pub timestamp: String,
    #[serde(rename = "type")]
    pub message_type: String,
    pub text: Option<WhatsAppTextMessage>,
    pub image: Option<WhatsAppMediaMessage>,
    pub video: Option<WhatsAppMediaMessage>,
    pub audio: Option<WhatsAppMediaMessage>,
    pub document: Option<WhatsAppDocumentMessage>,
    pub location: Option<WhatsAppLocationMessage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WhatsAppTextMessage {
    pub body: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WhatsAppMediaMessage {
    pub id: String,
    pub mime_type: String,
    pub sha256: String,
    pub caption: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WhatsAppDocumentMessage {
    pub id: String,
    pub mime_type: String,
    pub sha256: String,
    pub filename: String,
    pub caption: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WhatsAppLocationMessage {
    pub latitude: f64,
    pub longitude: f64,
    pub name: Option<String>,
    pub address: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WhatsAppStatus {
    pub id: String,
    pub status: String, // "sent", "delivered", "read", "failed"
    pub timestamp: String,
    pub recipient_id: String,
}

// Helper functions
impl WhatsAppInteractive {
    pub fn buttons(body_text: &str, buttons: Vec<WhatsAppButton>) -> Self {
        Self {
            interactive_type: "button".to_string(),
            body: WhatsAppInteractiveBody {
                text: body_text.to_string(),
            },
            action: WhatsAppInteractiveAction {
                buttons: Some(buttons),
                sections: None,
            },
            header: None,
            footer: None,
        }
    }

    pub fn list(body_text: &str, sections: Vec<WhatsAppSection>) -> Self {
        Self {
            interactive_type: "list".to_string(),
            body: WhatsAppInteractiveBody {
                text: body_text.to_string(),
            },
            action: WhatsAppInteractiveAction {
                buttons: None,
                sections: Some(sections),
            },
            header: None,
            footer: None,
        }
    }
}

impl WhatsAppButton {
    pub fn reply(id: &str, title: &str) -> Self {
        Self {
            button_type: "reply".to_string(),
            reply: WhatsAppButtonReply {
                id: id.to_string(),
                title: title.to_string(),
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_whatsapp_button_creation() {
        let button = WhatsAppButton::reply("btn_1", "Click Me");
        assert_eq!(button.button_type, "reply");
        assert_eq!(button.reply.id, "btn_1");
        assert_eq!(button.reply.title, "Click Me");
    }

    #[test]
    fn test_whatsapp_interactive_buttons() {
        let buttons = vec![
            WhatsAppButton::reply("btn_1", "Yes"),
            WhatsAppButton::reply("btn_2", "No"),
        ];
        let interactive = WhatsAppInteractive::buttons("Choose an option:", buttons);
        assert_eq!(interactive.interactive_type, "button");
        assert!(interactive.action.buttons.is_some());
    }
}
