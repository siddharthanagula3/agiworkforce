use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use super::{CloudClient, CloudError};

const EXPORT_PATH: &str = "/api/user/export";
const ARCHIVES_PATH: &str = "/api/user/export/archives";

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportVolume {
    pub volume: u32,
    pub byte_count: u64,
    pub file_count: u64,
    pub download_path: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportArchive {
    pub id: String,
    pub status: String,
    pub requested_at: String,
    #[serde(default)]
    pub ready_at: Option<String>,
    #[serde(default)]
    pub expires_at: Option<String>,
    #[serde(default)]
    pub volumes: Vec<ExportVolume>,
}

#[derive(Deserialize)]
struct ArchiveResponse {
    archive: Option<ExportArchive>,
}

pub async fn current(client: &CloudClient) -> Result<Option<ExportArchive>, CloudError> {
    Ok(client
        .get::<ArchiveResponse>(ARCHIVES_PATH, &[])
        .await?
        .archive)
}

pub async fn request(client: &CloudClient) -> Result<Option<ExportArchive>, CloudError> {
    Ok(client
        .post::<_, ArchiveResponse>(EXPORT_PATH, &serde_json::json!({}))
        .await?
        .archive)
}

pub async fn download(
    client: &CloudClient,
    archive: &ExportArchive,
    directory: &Path,
) -> Result<Vec<PathBuf>, CloudError> {
    let date = archive
        .requested_at
        .chars()
        .take(10)
        .filter(|character| character.is_ascii_digit() || *character == '-')
        .collect::<String>();
    let mut saved = Vec::new();
    for volume in &archive.volumes {
        let suffix = if archive.volumes.len() > 1 {
            format!("-part-{}", volume.volume)
        } else {
            String::new()
        };
        let target = directory.join(format!("agi-export-{date}{suffix}.zip"));
        client.download_to(&volume.download_path, &target).await?;
        saved.push(target);
    }
    Ok(saved)
}
