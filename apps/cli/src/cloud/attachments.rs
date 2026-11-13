use std::collections::HashMap;
use std::sync::LazyLock;
use std::time::Duration;

use serde::Deserialize;

use super::{CloudError, CloudSession};
use crate::platform::runtime::session::PrivacyMode;
use agiworkforce_protocol::account_cloud::CloudHistoryAttachment;

const PRESIGN_PATH: &str = "/api/uploads/presign";
const COMPLETE_PATH: &str = "/api/uploads/chat-attachment/complete";
const UPLOAD_TIMEOUT: Duration = Duration::from_secs(300);
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AttachmentPolicy {
    max_bytes: u64,
    max_count: usize,
    file_name_max_length: usize,
    mime_type_max_length: usize,
    mime_types: Vec<String>,
    extensions: Vec<String>,
    image_mime_types: Vec<String>,
    max_message_bytes: u64,
    file_path_prefix: String,
}
static POLICY: LazyLock<AttachmentPolicy> = LazyLock::new(|| {
    serde_json::from_str(include_str!(
        "../../../../packages/contracts/cloud-contracts/src/chat-attachment-policy.json"
    ))
    .expect("the compiled chat attachment policy must match its schema")
});

pub fn max_attachment_bytes() -> u64 {
    POLICY.max_bytes
}

pub(crate) fn snapshot(
    path: &str,
    selected_at_ms: i64,
) -> Result<(String, String, bytes::Bytes), CloudError> {
    super::uploads::snapshot(
        path,
        selected_at_ms,
        POLICY.max_bytes,
        POLICY.file_name_max_length,
        |name, mime| {
            if !managed_accepts(name, mime)
                || name.chars().any(char::is_control)
                || name.contains(['/', '\\'])
            {
                return Err(CloudError::LocalFile(
                    "This file type or filename is not supported for chat uploads".into(),
                ));
            }
            Ok(())
        },
    )
}

pub(crate) async fn create_upload(
    client: &super::CloudClient,
    review: &agiworkforce_protocol::cloud_uploads::CloudUploadReview,
) -> Result<super::uploads::Session, CloudError> {
    client.post_bounded(&super::uploads::contract()?.resumable_path, &serde_json::json!({
        "kind": "chat-attachment", "fileName": review.file_name, "mimeType": review.mime_type,
        "byteCount": review.byte_count, "checksumSha256": review.checksum_sha256,
    }), crate::app_server::TRANSCRIPT_JSON_BUDGET).await
}

pub(crate) async fn complete_upload(
    client: &super::CloudClient,
    session: &super::uploads::Session,
    review: &agiworkforce_protocol::cloud_uploads::CloudUploadReview,
) -> Result<CloudHistoryAttachment, CloudError> {
    use agiworkforce_protocol::{
        account_cloud::CloudHistoryAttachmentKind, cloud_uploads::CloudUploadTarget,
    };
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct UploadedAttachment {
        id: String,
        name: String,
        mime_type: String,
        byte_count: u64,
        #[serde(rename = "type")]
        kind: CloudHistoryAttachmentKind,
    }
    #[derive(Deserialize)]
    struct CompletedUpload {
        kind: String,
        attachment: UploadedAttachment,
    }
    let CloudUploadTarget::Chat { chat } = &review.upload.target else {
        return Err(CloudError::Decode(
            "The upload is not a chat attachment".into(),
        ));
    };
    let completed: CompletedUpload = client.post_bounded_timeout(&session.path()?, &serde_json::json!({ "session": session.session, "conversationId": chat.conversation_id }), crate::app_server::TRANSCRIPT_JSON_BUDGET, Duration::from_millis(super::uploads::contract()?.transfer_timeout_ms)).await?;
    let file = completed.attachment;
    if completed.kind != "chat-attachment"
        || uuid::Uuid::parse_str(&file.id).is_err()
        || file.name != review.file_name
        || file.mime_type != review.mime_type
        || file.byte_count != review.byte_count
        || (file.kind == CloudHistoryAttachmentKind::Image)
            != POLICY.image_mime_types.contains(&file.mime_type)
    {
        return Err(CloudError::Decode("The stored chat attachment differs from the reviewed upload. Check its status before trying again.".into()));
    }
    let attachment = CloudHistoryAttachment {
        id: file.id.clone(),
        asset_id: file.id,
        kind: file.kind,
        name: file.name,
        size: Some(file.byte_count),
        mime_type: Some(file.mime_type),
    };
    submitted(std::slice::from_ref(&attachment))?;
    Ok(attachment)
}

pub(crate) fn submitted(files: &[CloudHistoryAttachment]) -> Result<(), CloudError> {
    let metadata = serde_json::json!({ "attachments": files });
    persisted(Some(&metadata))?;
    let mut total = 0u64;
    for file in files {
        let size = file
            .size
            .filter(|size| *size <= POLICY.max_bytes)
            .ok_or_else(|| {
                CloudError::Decode("The attachment has no admitted byte count".into())
            })?;
        let mime = file
            .mime_type
            .as_ref()
            .filter(|mime| managed_accepts(&file.name, mime))
            .ok_or_else(|| {
                CloudError::Decode("The attachment has no admitted media type".into())
            })?;
        if (file.kind == agiworkforce_protocol::account_cloud::CloudHistoryAttachmentKind::Image)
            != POLICY.image_mime_types.contains(mime)
        {
            return Err(CloudError::Decode(
                "The attachment kind and media type disagree".into(),
            ));
        }
        total = total
            .checked_add(size)
            .ok_or_else(|| CloudError::Decode("The attachment byte budget is exhausted".into()))?;
    }
    if total > POLICY.max_message_bytes {
        return Err(CloudError::Decode(
            "The selected attachments exceed the message byte budget".into(),
        ));
    }
    Ok(())
}

pub(crate) fn admit_additional(
    files: &[CloudHistoryAttachment],
    byte_count: u64,
) -> Result<(), CloudError> {
    submitted(files)?;
    if files.len() >= POLICY.max_count || byte_count == 0 || byte_count > POLICY.max_bytes {
        return Err(CloudError::LocalFile(
            "Send or discard recovered attachments before selecting another file".into(),
        ));
    }
    let total = files.iter().try_fold(byte_count, |total, file| {
        total
            .checked_add(file.size.ok_or_else(|| {
                CloudError::Decode("A recovered attachment has no byte count".into())
            })?)
            .ok_or_else(|| CloudError::Decode("The attachment byte count overflowed".into()))
    })?;
    if total > POLICY.max_message_bytes {
        return Err(CloudError::LocalFile(
            "Send or discard recovered attachments before adding more bytes to this message".into(),
        ));
    }
    Ok(())
}

pub(crate) fn message_metadata(files: &[CloudHistoryAttachment]) -> serde_json::Value {
    if files.is_empty() {
        return serde_json::json!({});
    }
    let files = files
        .iter()
        .map(|file| {
            serde_json::json!({
                "id": file.id, "assetId": file.asset_id, "type": file.kind, "name": file.name,
                "size": file.size, "mimeType": file.mime_type,
                "url": format!("{}{}", POLICY.file_path_prefix, file.asset_id),
            })
        })
        .collect::<Vec<_>>();
    serde_json::json!({ "attachments": files })
}

pub fn managed_accepts(file_name: &str, mime_type: &str) -> bool {
    let mime = mime_type.trim().to_ascii_lowercase();
    if POLICY.mime_types.contains(&mime) || mime.starts_with("text/") {
        return true;
    }
    let name = file_name.trim().to_ascii_lowercase();
    POLICY
        .extensions
        .iter()
        .any(|extension| name.ends_with(extension))
}

pub(super) fn persisted(
    metadata: Option<&serde_json::Value>,
) -> Result<Vec<CloudHistoryAttachment>, CloudError> {
    let Some(value) = metadata.and_then(|metadata| metadata.get("attachments")) else {
        return Ok(Vec::new());
    };
    if value.is_null() {
        return Ok(Vec::new());
    }
    let invalid = || {
        CloudError::Decode(
        "The saved file references are incomplete or invalid. Open this conversation on Web before continuing.".into(),
    )
    };
    let values = value.as_array().ok_or_else(invalid)?;
    if values.len() > POLICY.max_count {
        return Err(invalid());
    }
    let mut attachments = Vec::with_capacity(values.len());
    let mut ids = std::collections::HashSet::new();
    let mut assets = std::collections::HashSet::new();
    for value in values {
        let attachment: CloudHistoryAttachment =
            serde_json::from_value(value.clone()).map_err(|_| invalid())?;
        if attachment.id.is_empty()
            || attachment.id.len() > crate::app_server::TRANSCRIPT_JSON_BUDGET
            || attachment.id.chars().any(char::is_control)
            || uuid::Uuid::parse_str(&attachment.asset_id).is_err()
            || attachment.asset_id.len() != uuid::fmt::Hyphenated::LENGTH
            || attachment.name.trim().is_empty()
            || attachment.name.encode_utf16().count() > POLICY.file_name_max_length
            || attachment.name.contains(['/', '\\'])
            || attachment.name.chars().any(char::is_control)
            || attachment
                .size
                .is_some_and(|bytes| bytes == 0 || bytes > 9_007_199_254_740_991)
            || attachment.mime_type.as_ref().is_some_and(|mime| {
                mime.trim().is_empty()
                    || mime.encode_utf16().count() > POLICY.mime_type_max_length
                    || mime.chars().any(char::is_control)
            })
            || !ids.insert(attachment.id.clone())
            || !assets.insert(attachment.asset_id.to_ascii_lowercase())
        {
            return Err(invalid());
        }
        attachments.push(attachment);
    }
    Ok(attachments)
}

pub(crate) fn history_content(
    role: &str,
    text: &str,
    metadata: Option<&serde_json::Value>,
) -> Result<serde_json::Value, CloudError> {
    let attachments = persisted(metadata)?;
    if attachments.is_empty() {
        return Ok(serde_json::Value::String(text.into()));
    }
    if role != "user" {
        return Err(CloudError::Decode(
            "Only saved user messages can carry uploaded file references. Open this conversation on Web before continuing.".into(),
        ));
    }
    let mut parts = Vec::with_capacity(attachments.len() + 1);
    if !text.trim().is_empty() {
        parts.push(serde_json::json!({ "type": "text", "text": text }));
    }
    parts.extend(attachments.into_iter().map(|attachment| {
        serde_json::json!({ "type": "file", "file": { "asset_id": attachment.asset_id } })
    }));
    Ok(serde_json::Value::Array(parts))
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

    let upload = session
        .client
        .upload_request(&presign.upload_url, &presign.upload_headers)?
        .timeout(UPLOAD_TIMEOUT)
        .body(bytes);
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

    fn file() -> serde_json::Value {
        serde_json::json!({
            "id": "composer-file",
            "assetId": "77777777-7777-4777-8777-777777777777",
            "type": "file",
            "name": "report 東京.txt",
            "size": 17,
            "mimeType": "text/plain",
            "url": "https://untrusted.example/file",
            "content": "file bytes must never be copied"
        })
    }

    #[test]
    fn saved_files_use_owned_asset_references_without_urls_or_inline_bytes() {
        let metadata = serde_json::json!({ "attachments": [file()] });
        let content = history_content("user", "Read these 🦀", Some(&metadata)).unwrap();
        assert_eq!(
            content,
            serde_json::json!([
                { "type": "text", "text": "Read these 🦀" },
                { "type": "file", "file": { "asset_id": "77777777-7777-4777-8777-777777777777" } }
            ])
        );
        let projected = serde_json::to_value(persisted(Some(&metadata)).unwrap()).unwrap();
        assert_eq!(projected[0]["name"], "report 東京.txt");
        assert!(projected[0].get("url").is_none());
        assert!(projected[0].get("content").is_none());
        assert!(history_content("assistant", "", Some(&metadata)).is_err());
    }

    #[test]
    fn attachment_only_history_and_older_references_keep_their_context() {
        let mut old = file();
        old.as_object_mut().unwrap().remove("size");
        old.as_object_mut().unwrap().remove("mimeType");
        let metadata = serde_json::json!({ "attachments": [old] });
        let content = history_content("user", " \n", Some(&metadata)).unwrap();
        assert_eq!(content.as_array().unwrap().len(), 1);
        assert_eq!(content[0]["type"], "file");
        assert_eq!(history_content("user", "Plain", None).unwrap(), "Plain");
    }

    #[test]
    fn invalid_saved_references_never_silently_become_text_only_context() {
        let mut cases = vec![serde_json::json!({}), serde_json::json!("file")];
        for (key, value) in [
            ("assetId", serde_json::json!("file:///private/key")),
            ("assetId", serde_json::json!(null)),
            ("type", serde_json::json!("unknown")),
            ("name", serde_json::json!("../private.txt")),
            ("name", serde_json::json!("report\n.txt")),
            (
                "name",
                serde_json::json!("🦀".repeat(POLICY.file_name_max_length)),
            ),
            ("size", serde_json::json!(-1)),
            (
                "mimeType",
                serde_json::json!("text/plain\nAuthorization: token"),
            ),
        ] {
            let mut bad = file();
            bad[key] = value;
            cases.push(serde_json::json!([bad]));
        }
        cases.push(serde_json::json!([file(), file()]));
        cases.push(serde_json::json!(vec![file(); POLICY.max_count + 1]));
        for attachments in cases {
            let metadata = serde_json::json!({ "attachments": attachments });
            assert!(
                history_content("user", "Do not lose context", Some(&metadata)).is_err(),
                "{metadata}"
            );
        }
    }

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
