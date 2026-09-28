use std::collections::HashMap;
use std::path::Path;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use super::{project_path, CloudError, CloudSession, Route};
use crate::platform::runtime::session::PrivacyMode;

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
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeFile {
    pub id: String,
    pub file_name: String,
    pub byte_count: u64,
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
        Ok(registered) => Ok(registered.file),
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
