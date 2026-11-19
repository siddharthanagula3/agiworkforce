use super::{project_path, FileRow};
pub(crate) use crate::cloud::uploads::{checksum, contract, Session};
use crate::cloud::{
    client::{CloudClient, CloudError},
    projects::api,
};
use agiworkforce_protocol::{account_cloud::CloudProjectTarget, project_files::*};
use bytes::Bytes;
use serde::Deserialize;
use std::{path::Path, time::Duration};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FilePolicy {
    max_bytes: u64,
    allowed_mime_prefixes: Vec<String>,
    image_mime_types: Vec<String>,
    office_mime_types: Vec<String>,
    denied_mime_types: Vec<String>,
    denied_extensions: Vec<String>,
    image_extensions: Vec<String>,
    office_extensions: Vec<String>,
    text_extensions: Vec<String>,
    fixed_extensions: Vec<String>,
}
fn policy() -> Result<FilePolicy, CloudError> {
    serde_json::from_str(include_str!(
        "../../../../../packages/contracts/types/src/attachment-policy.json"
    ))
    .map_err(|error| CloudError::Decode(error.to_string()))
}
pub(crate) fn snapshot(
    path: &str,
    selected_at_ms: i64,
) -> Result<(String, String, Bytes), CloudError> {
    let policy = policy()?;
    crate::cloud::uploads::snapshot(path, selected_at_ms, policy.max_bytes, 255, |name, mime| {
        let extension = Path::new(name)
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_ascii_lowercase();
        if policy.denied_extensions.contains(&extension)
            || policy.denied_mime_types.iter().any(|value| value == mime)
            || !(policy
                .allowed_mime_prefixes
                .iter()
                .any(|prefix| mime.starts_with(prefix))
                || policy.image_mime_types.iter().any(|value| value == mime)
                || policy.office_mime_types.iter().any(|value| value == mime)
                || policy.image_extensions.contains(&extension)
                || policy.office_extensions.contains(&extension)
                || policy.text_extensions.contains(&extension)
                || policy.fixed_extensions.contains(&extension))
        {
            return Err(CloudError::LocalFile(
                "This file type is not supported for project uploads".into(),
            ));
        }
        Ok(())
    })
}
pub(crate) async fn writable(
    client: &CloudClient,
    target: &CloudProjectTarget,
) -> Result<String, CloudError> {
    project_path(target)?;
    let project = api::read(client, target).await?.project;
    if !project.can_edit || project.archived {
        return Err(CloudError::Api {
            status: 403,
            message: "This project does not allow new files".into(),
        });
    }
    Ok(project.name)
}
pub(crate) async fn create(
    client: &CloudClient,
    review: &CloudProjectUploadReview,
) -> Result<Session, CloudError> {
    client.post_bounded(&contract()?.resumable_path, &serde_json::json!({ "kind":"knowledge-file", "projectId":review.upload.target.project_id, "fileName":review.file_name, "mimeType":review.mime_type,
        "byteCount":review.byte_count, "checksumSha256":review.checksum_sha256, "sourceSurface":agiworkforce_protocol::projects::ProjectSourceSurface::Desktop }), crate::app_server::TRANSCRIPT_JSON_BUDGET).await
}
pub(crate) async fn complete(
    client: &CloudClient,
    session: &Session,
    review: &CloudProjectUploadReview,
) -> Result<CloudProjectFile, CloudError> {
    #[derive(Deserialize)]
    struct Completed {
        kind: String,
        file: FileRow,
    }
    let response: Completed = client
        .post_bounded_timeout(
            &session.path()?,
            &serde_json::json!({ "session": session.session }),
            crate::app_server::TRANSCRIPT_JSON_BUDGET,
            Duration::from_millis(contract()?.transfer_timeout_ms),
        )
        .await?;
    let file = response.file.validated(&review.upload.target.project_id)?;
    if response.kind != "knowledge-file"
        || file.file_name != review.file_name
        || file.byte_count != review.byte_count
        || file.mime_type != review.mime_type
        || file.checksum_sha256 != review.checksum_sha256
    {
        return Err(CloudError::Decode("The stored project file does not match the reviewed upload. Refresh project files before trying again.".into()));
    }
    Ok(file)
}
