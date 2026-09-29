use std::collections::HashMap;
use std::time::Duration;

use serde::Deserialize;

use super::{CloudError, CloudSession};
use crate::platform::runtime::session::PrivacyMode;

const PRESIGN_PATH: &str = "/api/uploads/presign";
const COMPLETE_PATH: &str = "/api/uploads/chat-attachment/complete";
const UPLOAD_TIMEOUT: Duration = Duration::from_secs(300);
const CONTRACT: &str =
    include_str!("../../../../packages/contracts/cloud-contracts/src/chat-attachments.ts");

fn contract_list(name: &str) -> Vec<&'static str> {
    let Some(start) = CONTRACT.find(&format!("const {name} = [")) else {
        return Vec::new();
    };
    let body = &CONTRACT[start..];
    let body = &body[body.find('[').unwrap_or(0) + 1..body.find(']').unwrap_or(0)];
    body.split(',')
        .map(|item| item.trim().trim_matches('\''))
        .filter(|item| !item.is_empty())
        .collect()
}

pub fn max_attachment_bytes() -> u64 {
    CONTRACT
        .lines()
        .find_map(|line| {
            line.trim()
                .strip_prefix("export const MAX_CHAT_ATTACHMENT_BYTES =")
        })
        .map(|expression| {
            expression
                .trim()
                .trim_end_matches(';')
                .split('*')
                .map(|factor| factor.trim().parse::<u64>().unwrap_or(0))
                .product()
        })
        .unwrap_or(0)
}

pub fn managed_accepts(file_name: &str, mime_type: &str) -> bool {
    let mime = mime_type.trim().to_ascii_lowercase();
    if contract_list("CHAT_ATTACHMENT_MIME_TYPES").contains(&mime.as_str())
        || mime.starts_with("text/")
    {
        return true;
    }
    let name = file_name.trim().to_ascii_lowercase();
    contract_list("CHAT_ATTACHMENT_EXTENSIONS")
        .iter()
        .any(|extension| name.ends_with(extension))
}

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_accept_list_and_size_cap_come_from_cloud_contracts() {
        assert_eq!(max_attachment_bytes(), 12 * 1024 * 1024);
        assert!(managed_accepts("report.pdf", "application/pdf"));
        assert!(managed_accepts("deck.pptx", "application/octet-stream"));
        assert!(!managed_accepts("legacy.xls", "application/vnd.ms-excel"));
        assert!(!managed_accepts(
            "sheet.ods",
            "application/vnd.oasis.opendocument.spreadsheet"
        ));
    }
}
