use std::collections::HashMap;
use std::path::Path;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use super::{project_path, CloudError, CloudSession, Route};
use crate::platform::runtime::session::PrivacyMode;
use crate::terminal_text::sanitize_terminal_text;

const PRESIGN_PATH: &str = "/api/uploads/presign";
const UPLOAD_PROTOCOL_VERSION: u32 = 2;
const SOURCE_SURFACE: &str = "cli";
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
struct Registered {
    file: KnowledgeFile,
    #[serde(default)]
    notice: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeIndexing {
    pub status: String,
    #[serde(default)]
    pub chunk_count: u64,
    #[serde(default)]
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeFile {
    pub id: String,
    pub file_name: String,
    pub byte_count: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub indexing: Option<KnowledgeIndexing>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notice: Option<String>,
}

impl KnowledgeFile {
    pub fn receipt(&self, project_name: &str) -> String {
        let file_name = sanitize_terminal_text(&self.file_name);
        let project_name = sanitize_terminal_text(project_name);
        let mut receipt = match non_empty(self.summary.as_deref()) {
            Some(summary) => format!(
                "Added {file_name} to '{project_name}'. {}",
                sanitize_terminal_text(summary)
            ),
            None => format!(
                "Added {file_name} to '{project_name}'. Chats in the project, and managed turns in a directory linked to it, can search it."
            ),
        };
        if let Some(notice) = non_empty(self.notice.as_deref()) {
            receipt.push('\n');
            receipt.push_str(&sanitize_terminal_text(notice));
        }
        if let Some(indexing) = self.indexing.as_ref().filter(|i| i.status == "failed") {
            receipt.push_str("\nIndexing failed");
            if let Some(error) = non_empty(indexing.error.as_deref()) {
                receipt.push_str(": ");
                receipt.push_str(&sanitize_terminal_text(error));
            }
        }
        receipt
    }
}

fn non_empty(value: Option<&str>) -> Option<&str> {
    value.map(str::trim).filter(|value| !value.is_empty())
}

pub async fn add_file(
    privacy: PrivacyMode,
    project_id: &str,
    path: &Path,
) -> Result<KnowledgeFile, CloudError> {
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| CloudError::Transport(format!("{} is not a file", path.display())))?
        .to_string();
    let bytes = std::fs::read(path).map_err(|error| {
        CloudError::Transport(format!("could not read {}: {error}", path.display()))
    })?;
    let mime_type = mime_guess::from_path(path)
        .first_or_octet_stream()
        .essence_str()
        .to_string();
    let byte_count = bytes.len();
    let checksum = crate::hex::encode(&Sha256::digest(&bytes));
    let session = CloudSession::open(privacy)?;
    let presign: Presign = session
        .client
        .post(
            PRESIGN_PATH,
            &serde_json::json!({
                "kind": "knowledge-file",
                "uploadProtocolVersion": UPLOAD_PROTOCOL_VERSION,
                "projectId": project_id,
                "fileName": file_name,
                "mimeType": mime_type,
                "byteCount": byte_count,
                "checksumSha256": checksum,
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

    let registered: Result<Registered, CloudError> = session
        .client
        .post(
            &format!("{}/knowledge-files", project_path(project_id)),
            &serde_json::json!({
                "fileName": file_name,
                "mimeType": mime_type,
                "byteCount": byte_count,
                "checksumSha256": checksum,
                "sourceSurface": SOURCE_SURFACE,
                "storageUri": presign.storage_key,
            }),
        )
        .await;
    match registered {
        Ok(registered) => Ok(KnowledgeFile {
            notice: registered.notice,
            ..registered.file
        }),
        Err(error) => {
            let cleanup: Result<serde_json::Value, CloudError> = session
                .client
                .call(
                    &Route::delete(PRESIGN_PATH),
                    &[],
                    Some(&serde_json::json!({
                        "kind": "knowledge-file",
                        "projectId": project_id,
                        "storageKey": presign.storage_key,
                    })),
                )
                .await;
            if let Err(cleanup) = cleanup {
                tracing::debug!("[knowledge] uploaded object was not removed: {cleanup}");
            }
            Err(error)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn registered(body: serde_json::Value) -> KnowledgeFile {
        let registered: Registered = serde_json::from_value(body).expect("decodes");
        KnowledgeFile {
            notice: registered.notice,
            ..registered.file
        }
    }

    #[test]
    fn a_readable_source_is_announced_as_searchable() {
        let file = registered(serde_json::json!({
            "file": {
                "id": "f1",
                "fileName": "notes.md",
                "byteCount": 12,
                "summary": null,
                "indexing": null
            }
        }));
        let receipt = file.receipt("Plans");
        assert!(receipt.contains("can search it"), "{receipt}");
    }

    #[test]
    fn an_unreadable_image_carries_the_servers_readability_summary_instead_of_the_search_claim() {
        let file = registered(serde_json::json!({
            "file": {
                "id": "f2",
                "fileName": "chart.png",
                "byteCount": 90,
                "summary": "Not readable: text is not extracted from images, so only this file name reaches the model."
            }
        }));
        let receipt = file.receipt("Plans");
        assert!(receipt.contains("Not readable"), "{receipt}");
        assert!(!receipt.contains("can search it"), "{receipt}");
        let json = serde_json::to_value(&file).expect("serializes");
        assert!(json["summary"]
            .as_str()
            .is_some_and(|summary| summary.starts_with("Not readable")));
    }

    #[test]
    fn the_envelope_notice_and_a_failed_index_reach_the_receipt() {
        let file = registered(serde_json::json!({
            "file": {
                "id": "f3",
                "fileName": "scan.pdf",
                "byteCount": 90,
                "summary": "Scanned pages were left unread.",
                "indexing": {
                    "status": "failed",
                    "chunkCount": 0,
                    "semantic": false,
                    "attempts": 3,
                    "error": "embedding unavailable",
                    "indexedAt": null
                }
            },
            "notice": "Some pages were withheld."
        }));
        let receipt = file.receipt("Plans");
        assert!(
            receipt.contains("Scanned pages were left unread."),
            "{receipt}"
        );
        assert!(receipt.contains("Some pages were withheld."), "{receipt}");
        assert!(
            receipt.contains("Indexing failed: embedding unavailable"),
            "{receipt}"
        );
        let json = serde_json::to_value(&file).expect("serializes");
        assert_eq!(json["notice"], "Some pages were withheld.");
        assert_eq!(json["indexing"]["status"], "failed");
    }
}
