use super::{
    client::{CloudClient, CloudError},
    projects::api,
};
use agiworkforce_protocol::{account_cloud::CloudProjectTarget, project_files::*};
use serde::Deserialize;
pub(crate) mod upload;

fn validate_checksum(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FilePolicy {
    max_text_preview_chars: usize,
    max_bytes: u64,
}
fn policy() -> Result<FilePolicy, CloudError> {
    serde_json::from_str(include_str!(
        "../../../../packages/contracts/types/src/attachment-policy.json"
    ))
    .map_err(|error| CloudError::Decode(error.to_string()))
}

pub(crate) fn max_file_bytes() -> Result<u64, CloudError> {
    Ok(policy()?.max_bytes)
}

pub fn project_path(target: &CloudProjectTarget) -> Result<String, CloudError> {
    api::validate_workspace(&target.workspace).map_err(CloudError::Decode)?;
    if uuid::Uuid::parse_str(&target.project_id).is_err() {
        return Err(CloudError::Decode("The project identity is invalid".into()));
    }
    Ok(format!(
        "{}/{}/{}",
        api::contract().path,
        urlencoding::encode(&target.project_id),
        api::contract().knowledge_files_segment
    ))
}
pub fn file_path(target: &CloudProjectFileTarget) -> Result<String, CloudError> {
    if uuid::Uuid::parse_str(&target.file_id).is_err() {
        return Err(CloudError::Decode(
            "The project file identity is invalid".into(),
        ));
    }
    Ok(format!(
        "{}/{}",
        project_path(&target.project)?,
        urlencoding::encode(&target.file_id)
    ))
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct FileRow {
    id: String,
    project_id: String,
    file_name: String,
    mime_type: String,
    byte_count: u64,
    checksum_sha256: String,
    added_at: String,
    added_by_user_id: Option<String>,
    text_preview_kind: Option<ProjectFilePreviewKind>,
    indexing: Option<ProjectFileIndexState>,
}
impl FileRow {
    pub(super) fn validated(self, project_id: &str) -> Result<CloudProjectFile, CloudError> {
        if uuid::Uuid::parse_str(&self.id).is_err()
            || self.project_id != project_id
            || self.file_name.is_empty()
            || self.mime_type.is_empty()
            || self.byte_count == 0
            || self.byte_count >= (1_u64 << f64::MANTISSA_DIGITS)
            || !validate_checksum(&self.checksum_sha256)
        {
            return Err(CloudError::Decode(
                "The project returned invalid file metadata".into(),
            ));
        }
        Ok(CloudProjectFile {
            id: self.id,
            project_id: self.project_id,
            file_name: self.file_name,
            mime_type: self.mime_type,
            byte_count: self.byte_count,
            checksum_sha256: self.checksum_sha256.to_ascii_lowercase(),
            added_at: self.added_at,
            added_by_user_id: self.added_by_user_id,
            preview_kind: self.text_preview_kind,
            indexing: self.indexing,
        })
    }
}
pub async fn list(
    client: &CloudClient,
    target: CloudProjectTarget,
) -> Result<CloudProjectFilesResponse, CloudError> {
    api::read(client, &target).await?;
    let client = client.with_workspace(Some(&target.workspace))?;
    #[derive(Deserialize)]
    struct Files {
        files: Vec<FileRow>,
    }
    let response: Files = client
        .get_bounded(
            &project_path(&target)?,
            &[],
            crate::app_server::TRANSCRIPT_JSON_BUDGET,
        )
        .await?;
    let files = response
        .files
        .into_iter()
        .map(|file| file.validated(&target.project_id))
        .collect::<Result<Vec<_>, _>>()?;
    let mut seen = std::collections::HashSet::new();
    if files.iter().any(|file| !seen.insert(&file.id)) {
        return Err(CloudError::Decode(
            "The project returned duplicate file identities".into(),
        ));
    }
    Ok(CloudProjectFilesResponse { target, files })
}
pub async fn current(
    client: &CloudClient,
    target: &CloudProjectFileTarget,
) -> Result<CloudProjectFile, CloudError> {
    let files = list(client, target.project.clone()).await?.files;
    files
        .into_iter()
        .find(|file| file.id == target.file_id)
        .ok_or_else(|| CloudError::Api {
            status: 404,
            message: "This project file is no longer available".into(),
        })
}
pub(crate) async fn current_version(
    client: &CloudClient,
    version: &CloudProjectFileVersion,
) -> Result<CloudProjectFile, CloudError> {
    if !validate_checksum(&version.checksum_sha256) {
        return Err(CloudError::Decode(
            "The selected source checksum is invalid".into(),
        ));
    }
    let file = current(client, &version.target).await?;
    if file.checksum_sha256 != version.checksum_sha256.to_ascii_lowercase() {
        return Err(CloudError::Api {
            status: 412,
            message: "This source changed. Refresh project files before continuing.".into(),
        });
    }
    Ok(file)
}
pub async fn preview(
    client: &CloudClient,
    target: CloudProjectFileTarget,
) -> Result<CloudProjectFilePreview, CloudError> {
    let file = current(client, &target).await?;
    if file.preview_kind.is_none() {
        return Err(CloudError::Decode(
            "This file has no text preview. Download it to view its original content.".into(),
        ));
    }
    let client = client.with_workspace(Some(&target.project.workspace))?;
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Preview {
        kind: ProjectFilePreviewKind,
        text: String,
        truncated: bool,
        file_name: Option<String>,
    }
    let response: Preview = client
        .get_bounded(
            &format!("{}/text", file_path(&target)?),
            &[],
            crate::app_server::TRANSCRIPT_JSON_BUDGET,
        )
        .await?;
    if response.kind == ProjectFilePreviewKind::Office
        || (file.preview_kind != Some(ProjectFilePreviewKind::Office)
            && file.preview_kind != Some(response.kind))
        || response.text.encode_utf16().count() > policy()?.max_text_preview_chars
        || response
            .file_name
            .as_ref()
            .is_some_and(|name| *name != file.file_name)
    {
        return Err(CloudError::Decode(
            "The file preview does not match its metadata or text budget".into(),
        ));
    }
    let latest = current(&client, &target).await?;
    if latest.checksum_sha256 != file.checksum_sha256 {
        return Err(CloudError::Decode("This file changed while its preview was loading. Refresh project files before opening it again.".into()));
    }
    Ok(CloudProjectFilePreview {
        target,
        checksum_sha256: file.checksum_sha256,
        kind: response.kind,
        text: response.text,
        truncated: response.truncated,
    })
}

pub(crate) async fn reindex(
    client: &CloudClient,
    params: CloudProjectFileVersion,
) -> Result<CloudProjectFileReindexResponse, CloudError> {
    let project = crate::cloud::projects::api::read(client, &params.target.project)
        .await?
        .project;
    if !project.can_archive || project.archived {
        return Err(CloudError::Api {
            status: 403,
            message: "Only this active project's owner can reindex its files".into(),
        });
    }
    let file = current_version(client, &params).await?;
    if file
        .indexing
        .as_ref()
        .is_some_and(|index| matches!(index.status.as_str(), "pending" | "indexing"))
    {
        return Ok(CloudProjectFileReindexResponse {
            target: params.target,
            indexing: file.indexing,
            dispatched: false,
            new_request: false,
        });
    }
    let client = client.with_workspace(Some(&params.target.project.workspace))?;
    #[derive(Deserialize)]
    struct Reindexed {
        indexing: Option<ProjectFileIndexState>,
        #[serde(default)]
        dispatched: bool,
    }
    let response: Reindexed = client
        .post_bounded(
            &format!("{}/reindex", file_path(&params.target)?),
            &serde_json::json!({}),
            crate::app_server::TRANSCRIPT_JSON_BUDGET,
        )
        .await?;
    Ok(CloudProjectFileReindexResponse {
        new_request: true,
        target: params.target,
        indexing: response.indexing,
        dispatched: response.dispatched,
    })
}
