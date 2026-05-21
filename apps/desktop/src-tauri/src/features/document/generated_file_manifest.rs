use anyhow::{anyhow, Result};
use chrono::{SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};
use url::Url;

const LOCAL_OWNER_USER_ID: &str = "local-device";
const SOURCE_SURFACE_DESKTOP: &str = "desktop";
const PRIVACY_MODE_LOCAL: &str = "local";
const PROVIDER_MODE_LOCAL: &str = "Local";
const STORAGE_SCOPE_LOCAL_DEVICE: &str = "local_device";
const GENERATED_FILE_BUNDLE_TYPE: &str = "generated_file_bundle";

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum GeneratedDocumentKind {
    Pdf,
    Docx,
    Xlsx,
    Pptx,
}

impl GeneratedDocumentKind {
    pub fn mime_type(self) -> &'static str {
        match self {
            Self::Pdf => "application/pdf",
            Self::Docx => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            Self::Xlsx => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            Self::Pptx => {
                "application/vnd.openxmlformats-officedocument.presentationml.presentation"
            }
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedDocumentComputeSession {
    pub id: String,
    pub owner_user_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub organization_id: Option<String>,
    pub source_surface: String,
    pub privacy_mode: String,
    pub provider_mode: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    pub status: String,
    pub workdir_uri: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub retention_expires_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ttl_seconds: Option<u64>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub completed_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deleted_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedDocumentFilePreview {
    pub kind: String,
    pub uri: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub checksum_sha256: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub byte_count: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page_number: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedDocumentFile {
    pub id: String,
    pub compute_session_id: String,
    pub owner_user_id: String,
    pub source_surface: String,
    pub privacy_mode: String,
    pub provider_mode: String,
    pub kind: GeneratedDocumentKind,
    pub file_name: String,
    pub mime_type: String,
    pub uri: String,
    pub byte_count: u64,
    pub checksum_sha256: String,
    pub preview_derivatives: Vec<GeneratedDocumentFilePreview>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub retention_expires_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deleted_at: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedDocumentArtifactManifest {
    pub id: String,
    pub artifact_id: String,
    pub r#type: String,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_conversation_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_message_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_session_id: Option<String>,
    pub compute_session_id: String,
    pub generated_file_ids: Vec<String>,
    pub privacy_mode: String,
    pub provider_mode: String,
    pub storage_scope: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub checksum_sha256: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedDocumentBundle {
    pub compute_session: GeneratedDocumentComputeSession,
    pub generated_file: GeneratedDocumentFile,
    pub artifact_manifest: GeneratedDocumentArtifactManifest,
}

pub fn build_generated_document_manifest(
    file_path: impl AsRef<Path>,
    kind: GeneratedDocumentKind,
) -> Result<GeneratedDocumentBundle> {
    let absolute_path = normalize_existing_path(file_path.as_ref())?;
    let metadata = std::fs::metadata(&absolute_path)
        .map_err(|e| anyhow!("Failed to read generated file metadata: {}", e))?;
    let checksum_sha256 = sha256_file(&absolute_path)?;
    let file_uri = path_to_file_uri(&absolute_path)?;
    let workdir_uri = path_to_file_uri(
        absolute_path
            .parent()
            .ok_or_else(|| anyhow!("Generated file has no parent directory"))?,
    )?;
    let file_name = absolute_path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| anyhow!("Generated file path has no valid UTF-8 file name"))?
        .to_string();
    let title = absolute_path
        .file_stem()
        .and_then(|stem| stem.to_str())
        .filter(|stem| !stem.trim().is_empty())
        .unwrap_or(&file_name)
        .to_string();
    let now = Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true);
    let identity_hash = sha256_hex(format!("{file_uri}:{checksum_sha256}:{now}").as_bytes());
    let identity_short = &identity_hash[..16];
    let compute_session_id = format!("local-compute-session-{identity_short}");
    let generated_file_id = format!("generated-file-{identity_short}");
    let artifact_id = format!("artifact-{identity_short}");
    let manifest_id = format!("artifact-manifest-{identity_short}");

    Ok(GeneratedDocumentBundle {
        compute_session: GeneratedDocumentComputeSession {
            id: compute_session_id.clone(),
            owner_user_id: LOCAL_OWNER_USER_ID.to_string(),
            organization_id: None,
            source_surface: SOURCE_SURFACE_DESKTOP.to_string(),
            privacy_mode: PRIVACY_MODE_LOCAL.to_string(),
            provider_mode: PROVIDER_MODE_LOCAL.to_string(),
            provider: None,
            model: None,
            status: "completed".to_string(),
            workdir_uri,
            retention_expires_at: None,
            ttl_seconds: None,
            created_at: now.clone(),
            updated_at: now.clone(),
            completed_at: Some(now.clone()),
            deleted_at: None,
        },
        generated_file: GeneratedDocumentFile {
            id: generated_file_id.clone(),
            compute_session_id: compute_session_id.clone(),
            owner_user_id: LOCAL_OWNER_USER_ID.to_string(),
            source_surface: SOURCE_SURFACE_DESKTOP.to_string(),
            privacy_mode: PRIVACY_MODE_LOCAL.to_string(),
            provider_mode: PROVIDER_MODE_LOCAL.to_string(),
            kind,
            file_name,
            mime_type: kind.mime_type().to_string(),
            uri: file_uri,
            byte_count: metadata.len(),
            checksum_sha256: checksum_sha256.clone(),
            preview_derivatives: Vec::new(),
            retention_expires_at: None,
            deleted_at: None,
            created_at: now.clone(),
        },
        artifact_manifest: GeneratedDocumentArtifactManifest {
            id: manifest_id,
            artifact_id,
            r#type: GENERATED_FILE_BUNDLE_TYPE.to_string(),
            title,
            source_conversation_id: None,
            source_message_id: None,
            source_session_id: None,
            compute_session_id,
            generated_file_ids: vec![generated_file_id],
            privacy_mode: PRIVACY_MODE_LOCAL.to_string(),
            provider_mode: PROVIDER_MODE_LOCAL.to_string(),
            storage_scope: STORAGE_SCOPE_LOCAL_DEVICE.to_string(),
            checksum_sha256: Some(checksum_sha256),
            created_at: now.clone(),
            updated_at: now,
        },
    })
}

fn normalize_existing_path(path: &Path) -> Result<PathBuf> {
    let path = if path.is_absolute() {
        path.to_path_buf()
    } else {
        std::env::current_dir()
            .map_err(|e| anyhow!("Failed to resolve current directory: {}", e))?
            .join(path)
    };

    std::fs::canonicalize(&path)
        .map_err(|e| anyhow!("Failed to canonicalize generated file path: {}", e))
}

fn path_to_file_uri(path: &Path) -> Result<String> {
    Url::from_file_path(path)
        .map(|url| url.to_string())
        .map_err(|_| anyhow!("Failed to convert generated file path to file URI"))
}

fn sha256_file(path: &Path) -> Result<String> {
    let mut file = File::open(path).map_err(|e| anyhow!("Failed to open generated file: {}", e))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 8192];

    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|e| anyhow!("Failed to read generated file for checksum: {}", e))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }

    Ok(hex::encode(hasher.finalize()))
}

fn sha256_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hex::encode(hasher.finalize())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generated_document_manifest_matches_suite_contract_shape() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let file_path = temp_dir.path().join("Quarterly Report.pdf");
        std::fs::write(&file_path, b"%PDF-1.7\nhello").expect("test file");

        let bundle =
            build_generated_document_manifest(&file_path, GeneratedDocumentKind::Pdf).unwrap();
        let value = serde_json::to_value(&bundle).unwrap();

        assert_eq!(bundle.compute_session.source_surface, "desktop");
        assert_eq!(bundle.compute_session.privacy_mode, "local");
        assert_eq!(bundle.compute_session.provider_mode, "Local");
        assert_eq!(bundle.compute_session.status, "completed");
        assert_eq!(bundle.generated_file.kind, GeneratedDocumentKind::Pdf);
        assert_eq!(bundle.generated_file.file_name, "Quarterly Report.pdf");
        assert_eq!(bundle.generated_file.mime_type, "application/pdf");
        assert_eq!(bundle.generated_file.byte_count, 14);
        assert_eq!(bundle.generated_file.checksum_sha256.len(), 64);
        assert_eq!(
            bundle.generated_file.compute_session_id,
            bundle.compute_session.id
        );
        assert_eq!(
            bundle.artifact_manifest.generated_file_ids,
            vec![bundle.generated_file.id.clone()]
        );
        assert_eq!(bundle.artifact_manifest.storage_scope, "local_device");
        assert_eq!(
            value["generatedFile"]["checksumSha256"]
                .as_str()
                .expect("checksum"),
            bundle.generated_file.checksum_sha256
        );
        assert!(value["computeSession"]["workdirUri"]
            .as_str()
            .expect("workdir uri")
            .starts_with("file://"));
    }

    #[test]
    fn generated_document_kind_mime_types_match_office_formats() {
        assert_eq!(
            GeneratedDocumentKind::Docx.mime_type(),
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        );
        assert_eq!(
            GeneratedDocumentKind::Xlsx.mime_type(),
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        assert_eq!(
            GeneratedDocumentKind::Pptx.mime_type(),
            "application/vnd.openxmlformats-officedocument.presentationml.presentation"
        );
    }
}
