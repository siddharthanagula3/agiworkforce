use std::collections::HashMap;
use std::time::Duration;

use serde::Deserialize;

use super::{CloudError, CloudSession};
use crate::platform::runtime::session::PrivacyMode;

const PRESIGN_PATH: &str = "/api/uploads/presign";
const COMPLETE_PATH: &str = "/api/uploads/chat-attachment/complete";
const UPLOAD_TIMEOUT: Duration = Duration::from_secs(300);

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Presign {
    upload_url: String,
    #[serde(default)]
    upload_headers: HashMap<String, String>,
    storage_key: String,
}

#[derive(Deserialize)]
struct Completed {
    attachment: Attachment,
}

#[derive(Deserialize)]
struct Attachment {
    id: String,
}

pub async fn upload_chat_attachment(
    privacy: PrivacyMode,
    file_name: &str,
    mime_type: &str,
    bytes: Vec<u8>,
    conversation_id: Option<&str>,
) -> Result<String, CloudError> {
    let session = CloudSession::open(privacy)?;
    let byte_count = bytes.len();
    let presign: Presign = session
        .client
        .post(
            PRESIGN_PATH,
            &serde_json::json!({
                "kind": "chat-attachment",
                "fileName": file_name,
                "mimeType": mime_type,
                "byteCount": byte_count,
            }),
        )
        .await?;

    let mut upload = reqwest::Client::new()
        .put(&presign.upload_url)
        .timeout(UPLOAD_TIMEOUT)
        .body(bytes);
    for (name, value) in &presign.upload_headers {
        upload = upload.header(name, value);
    }
    let stored = upload
        .send()
        .await
        .map_err(|error| CloudError::Transport(error.to_string()))?;
    if !stored.status().is_success() {
        return Err(CloudError::Api {
            status: stored.status().as_u16(),
            message: format!("storage did not accept {file_name}"),
        });
    }

    let mut body = serde_json::json!({
        "storageKey": presign.storage_key,
        "fileName": file_name,
        "mimeType": mime_type,
        "byteCount": byte_count,
    });
    if let Some(conversation_id) = conversation_id {
        body["conversationId"] = serde_json::json!(conversation_id);
    }
    let completed: Completed = session.client.post(COMPLETE_PATH, &body).await?;
    Ok(completed.attachment.id)
}
