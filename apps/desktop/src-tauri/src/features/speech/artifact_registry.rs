//! Canonical local speech artifact metadata.
//!
//! Concrete artifact identities live in the model-registry JSON embedded below.
//! A user-owned `models.json` can replace or append descriptors at runtime, but
//! both sources pass through the same path, URL, and checksum validation.

use anyhow::{anyhow, Context, Result};
use serde::Deserialize;
use std::collections::HashSet;
use std::path::{Component, Path};
use std::sync::OnceLock;
use url::Url;

const CANONICAL_SPEECH_ARTIFACTS: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../../packages/ai/model-registry/catalog/speech-artifacts.json"
));
const SUPPORTED_SCHEMA_VERSION: u32 = 1;
pub(crate) const RUNTIME_MANIFEST_FILENAME: &str = "models.json";

static CANONICAL_REGISTRY: OnceLock<std::result::Result<SpeechArtifactRegistry, String>> =
    OnceLock::new();

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SpeechArtifactRegistry {
    schema_version: u32,
    verified_at: String,
    #[serde(default)]
    replacements: Vec<ArtifactReplacement>,
    whisper_models: Vec<WhisperArtifactDescriptor>,
    piper_voices: Vec<PiperVoiceDescriptor>,
    piper_binaries: Vec<PiperBinaryDescriptor>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ArtifactReplacement {
    previous_id: String,
    replacement_id: String,
    reason: String,
    evidence_url: String,
    verified_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ArtifactLicense {
    repository_license: String,
    training_data_license: Option<String>,
    training_data_license_url: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ArtifactProvenance {
    repository: String,
    revision: String,
    artifact_path: String,
    config_path: Option<String>,
    model_card_path: String,
    verified_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WhisperArtifactDescriptor {
    pub(crate) id: String,
    pub(crate) filename: String,
    #[serde(default)]
    pub(crate) description: String,
    #[serde(default)]
    pub(crate) approximate_size_bytes: u64,
    pub(crate) download_url: Option<String>,
    pub(crate) sha256: Option<String>,
    license: Option<ArtifactLicense>,
    provenance: Option<ArtifactProvenance>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PiperVoiceDescriptor {
    pub(crate) id: String,
    pub(crate) model_filename: String,
    pub(crate) config_filename: String,
    pub(crate) model_url: Option<String>,
    pub(crate) config_url: Option<String>,
    pub(crate) model_sha256: Option<String>,
    pub(crate) config_sha256: Option<String>,
    #[serde(default)]
    pub(crate) name: String,
    #[serde(default)]
    pub(crate) language: String,
    #[serde(default)]
    pub(crate) quality: String,
    #[serde(default)]
    pub(crate) sample_rate: u32,
    #[serde(default)]
    pub(crate) size_bytes: u64,
    pub(crate) description: Option<String>,
    license: Option<ArtifactLicense>,
    provenance: Option<ArtifactProvenance>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PiperBinaryDescriptor {
    pub(crate) id: String,
    pub(crate) os: String,
    pub(crate) arch: String,
    pub(crate) archive_filename: String,
    pub(crate) archive_format: String,
    pub(crate) executable_path: String,
    pub(crate) required_files: Vec<String>,
    pub(crate) required_directories: Vec<String>,
    pub(crate) download_url: String,
    pub(crate) sha256: String,
    pub(crate) approximate_size_bytes: u64,
    license: Option<ArtifactLicense>,
    provenance: Option<ArtifactProvenance>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeSpeechManifest {
    #[serde(default)]
    models: Vec<WhisperArtifactDescriptor>,
    #[serde(default)]
    voices: Vec<PiperVoiceDescriptor>,
    #[serde(default)]
    piper_binaries: Vec<PiperBinaryDescriptor>,
}

fn canonical_registry() -> Result<&'static SpeechArtifactRegistry> {
    let result = CANONICAL_REGISTRY.get_or_init(|| {
        let registry: SpeechArtifactRegistry = serde_json::from_str(CANONICAL_SPEECH_ARTIFACTS)
            .map_err(|error| {
                format!("Failed to parse embedded speech artifact registry: {error}")
            })?;
        validate_canonical_registry(&registry).map_err(|error| error.to_string())?;
        Ok(registry)
    });

    match result {
        Ok(registry) => Ok(registry),
        Err(error) => Err(anyhow!(error.clone())),
    }
}

fn validate_canonical_registry(registry: &SpeechArtifactRegistry) -> Result<()> {
    if registry.schema_version != SUPPORTED_SCHEMA_VERSION {
        return Err(anyhow!(
            "Unsupported speech artifact registry schema version {}",
            registry.schema_version
        ));
    }
    validate_nonempty(&registry.verified_at, "registry verifiedAt")?;
    ensure_unique(
        registry.whisper_models.iter().map(|entry| &entry.id),
        "Whisper model",
    )?;
    ensure_unique(
        registry.piper_voices.iter().map(|entry| &entry.id),
        "Piper voice",
    )?;
    ensure_unique(
        registry.piper_binaries.iter().map(|entry| &entry.id),
        "Piper binary",
    )?;

    if registry.whisper_models.is_empty()
        || registry.piper_voices.is_empty()
        || registry.piper_binaries.is_empty()
    {
        return Err(anyhow!("Canonical speech artifact registry is incomplete"));
    }

    for descriptor in &registry.whisper_models {
        validate_whisper_descriptor(descriptor, true)?;
    }
    for descriptor in &registry.piper_voices {
        validate_piper_voice_descriptor(descriptor, true)?;
    }
    for descriptor in &registry.piper_binaries {
        validate_piper_binary_descriptor(descriptor, true)?;
    }

    let live_voice_ids: HashSet<&str> = registry
        .piper_voices
        .iter()
        .map(|entry| entry.id.as_str())
        .collect();
    for replacement in &registry.replacements {
        validate_runtime_id(&replacement.previous_id)?;
        validate_runtime_id(&replacement.replacement_id)?;
        validate_nonempty(&replacement.reason, "replacement reason")?;
        validate_download_url(&replacement.evidence_url)?;
        validate_nonempty(&replacement.verified_at, "replacement verifiedAt")?;
        if live_voice_ids.contains(replacement.previous_id.as_str()) {
            return Err(anyhow!(
                "Replaced speech artifact '{}' remains in the live roster",
                replacement.previous_id
            ));
        }
        if !live_voice_ids.contains(replacement.replacement_id.as_str()) {
            return Err(anyhow!(
                "Speech artifact replacement '{}' has no live target",
                replacement.replacement_id
            ));
        }
    }

    Ok(())
}

fn ensure_unique<'a>(values: impl Iterator<Item = &'a String>, kind: &str) -> Result<()> {
    let mut seen = HashSet::new();
    for value in values {
        if !seen.insert(value) {
            return Err(anyhow!("Duplicate {kind} identifier '{value}'"));
        }
    }
    Ok(())
}

fn validate_license(license: &ArtifactLicense) -> Result<()> {
    validate_nonempty(&license.repository_license, "repository license")?;
    if let Some(value) = &license.training_data_license {
        validate_nonempty(value, "training-data license")?;
    }
    if let Some(url) = &license.training_data_license_url {
        validate_download_url(url)?;
    }
    Ok(())
}

fn validate_provenance(provenance: &ArtifactProvenance) -> Result<()> {
    validate_download_url(&provenance.repository)?;
    validate_nonempty(&provenance.revision, "provenance revision")?;
    validate_nonempty(&provenance.artifact_path, "provenance artifactPath")?;
    if let Some(config_path) = &provenance.config_path {
        validate_nonempty(config_path, "provenance configPath")?;
    }
    validate_nonempty(&provenance.model_card_path, "provenance modelCardPath")?;
    validate_nonempty(&provenance.verified_at, "provenance verifiedAt")?;
    Ok(())
}

fn validate_whisper_descriptor(
    descriptor: &WhisperArtifactDescriptor,
    canonical: bool,
) -> Result<()> {
    validate_runtime_id(&descriptor.id)?;
    safe_artifact_filename(&descriptor.filename)?;
    validate_optional_download(
        descriptor.download_url.as_deref(),
        descriptor.sha256.as_deref(),
        "Whisper model",
    )?;
    validate_metadata(
        descriptor.license.as_ref(),
        descriptor.provenance.as_ref(),
        canonical,
    )
}

fn validate_piper_voice_descriptor(
    descriptor: &PiperVoiceDescriptor,
    canonical: bool,
) -> Result<()> {
    validate_runtime_id(&descriptor.id)?;
    safe_artifact_filename(&descriptor.model_filename)?;
    safe_artifact_filename(&descriptor.config_filename)?;

    let has_any_download = descriptor.model_url.is_some()
        || descriptor.config_url.is_some()
        || descriptor.model_sha256.is_some()
        || descriptor.config_sha256.is_some();
    if has_any_download {
        validate_optional_download(
            descriptor.model_url.as_deref(),
            descriptor.model_sha256.as_deref(),
            "Piper voice model",
        )?;
        validate_optional_download(
            descriptor.config_url.as_deref(),
            descriptor.config_sha256.as_deref(),
            "Piper voice config",
        )?;
        if descriptor.model_url.is_none() || descriptor.config_url.is_none() {
            return Err(anyhow!(
                "A downloadable Piper voice requires both model and config artifacts"
            ));
        }
    }

    validate_metadata(
        descriptor.license.as_ref(),
        descriptor.provenance.as_ref(),
        canonical,
    )
}

fn validate_piper_binary_descriptor(
    descriptor: &PiperBinaryDescriptor,
    canonical: bool,
) -> Result<()> {
    validate_runtime_id(&descriptor.id)?;
    validate_runtime_id(&descriptor.os)?;
    validate_runtime_id(&descriptor.arch)?;
    safe_artifact_filename(&descriptor.id)?;
    safe_artifact_filename(&descriptor.archive_filename)?;
    validate_bundle_relative_path(&descriptor.executable_path)?;
    if descriptor.required_files.is_empty() || descriptor.required_directories.is_empty() {
        return Err(anyhow!(
            "A Piper bundle must declare required files and directories"
        ));
    }
    for path in descriptor
        .required_files
        .iter()
        .chain(descriptor.required_directories.iter())
    {
        validate_bundle_relative_path(path)?;
    }
    if !matches!(descriptor.archive_format.as_str(), "tar.gz" | "zip") {
        return Err(anyhow!("Unsupported Piper archive format"));
    }
    validate_download_url(&descriptor.download_url)?;
    validate_sha256(&descriptor.sha256)?;
    validate_metadata(
        descriptor.license.as_ref(),
        descriptor.provenance.as_ref(),
        canonical,
    )
}

fn validate_metadata(
    license: Option<&ArtifactLicense>,
    provenance: Option<&ArtifactProvenance>,
    required: bool,
) -> Result<()> {
    if required && (license.is_none() || provenance.is_none()) {
        return Err(anyhow!(
            "Canonical speech artifacts require license and provenance metadata"
        ));
    }
    if let Some(license) = license {
        validate_license(license)?;
    }
    if let Some(provenance) = provenance {
        validate_provenance(provenance)?;
    }
    Ok(())
}

fn validate_optional_download(url: Option<&str>, sha256: Option<&str>, kind: &str) -> Result<()> {
    match (url, sha256) {
        (Some(url), Some(sha256)) => {
            validate_download_url(url)?;
            validate_sha256(sha256)
        }
        (None, None) => Ok(()),
        _ => Err(anyhow!(
            "{kind} download URL and SHA-256 must be configured together"
        )),
    }
}

fn runtime_manifest(directory: &Path) -> Result<RuntimeSpeechManifest> {
    let manifest_path = directory.join(RUNTIME_MANIFEST_FILENAME);
    if !manifest_path.is_file() {
        return Ok(RuntimeSpeechManifest::default());
    }
    let content = std::fs::read_to_string(&manifest_path)
        .with_context(|| format!("Failed to read {}", manifest_path.display()))?;
    serde_json::from_str(&content)
        .with_context(|| format!("Failed to parse {}", manifest_path.display()))
}

pub(crate) fn whisper_descriptors(directory: &Path) -> Result<Vec<WhisperArtifactDescriptor>> {
    let mut descriptors = canonical_registry()?.whisper_models.clone();
    for descriptor in runtime_manifest(directory)?.models {
        validate_whisper_descriptor(&descriptor, false)?;
        replace_or_append(&mut descriptors, descriptor, |entry| &entry.id);
    }
    ensure_unique(descriptors.iter().map(|entry| &entry.id), "Whisper model")?;
    Ok(descriptors)
}

pub(crate) fn piper_voice_descriptors(directory: &Path) -> Result<Vec<PiperVoiceDescriptor>> {
    let mut descriptors = canonical_registry()?.piper_voices.clone();
    for descriptor in runtime_manifest(directory)?.voices {
        validate_piper_voice_descriptor(&descriptor, false)?;
        replace_or_append(&mut descriptors, descriptor, |entry| &entry.id);
    }
    ensure_unique(descriptors.iter().map(|entry| &entry.id), "Piper voice")?;
    Ok(descriptors)
}

pub(crate) fn piper_binary_descriptor(
    directory: &Path,
    os: &str,
    arch: &str,
) -> Result<PiperBinaryDescriptor> {
    let mut descriptors = canonical_registry()?.piper_binaries.clone();
    for descriptor in runtime_manifest(directory)?.piper_binaries {
        validate_piper_binary_descriptor(&descriptor, false)?;
        replace_or_append(&mut descriptors, descriptor, |entry| &entry.id);
    }
    ensure_unique(descriptors.iter().map(|entry| &entry.id), "Piper binary")?;
    descriptors
        .into_iter()
        .find(|entry| entry.os == os && entry.arch == arch)
        .ok_or_else(|| anyhow!("Unsupported platform: {os} {arch}. Please install Piper manually."))
}

fn replace_or_append<T, F>(entries: &mut Vec<T>, replacement: T, id: F)
where
    F: Fn(&T) -> &String,
{
    if let Some(index) = entries
        .iter()
        .position(|entry| id(entry) == id(&replacement))
    {
        entries[index] = replacement;
    } else {
        entries.push(replacement);
    }
}

pub(crate) fn validate_runtime_id(value: &str) -> Result<()> {
    let trimmed = value.trim();
    if trimmed.is_empty()
        || trimmed != value
        || value.len() > 256
        || value.chars().any(char::is_control)
    {
        return Err(anyhow!("Invalid local speech artifact identifier"));
    }
    Ok(())
}

fn validate_nonempty(value: &str, field: &str) -> Result<()> {
    if value.trim().is_empty() || value.chars().any(char::is_control) {
        return Err(anyhow!("Invalid {field}"));
    }
    Ok(())
}

pub(crate) fn safe_artifact_filename(filename: &str) -> Result<&str> {
    let path = Path::new(filename);
    if filename.is_empty()
        || path.is_absolute()
        || path.components().count() != 1
        || filename == "."
        || filename == ".."
    {
        return Err(anyhow!("Invalid local speech artifact filename"));
    }
    Ok(filename)
}

fn validate_bundle_relative_path(value: &str) -> Result<()> {
    let path = Path::new(value);
    if value.is_empty() || value.contains('\\') || path.is_absolute() {
        return Err(anyhow!("Invalid Piper bundle path"));
    }
    let mut has_component = false;
    for component in path.components() {
        match component {
            Component::Normal(_) => has_component = true,
            Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err(anyhow!("Invalid Piper bundle path"));
            }
        }
    }
    if !has_component {
        return Err(anyhow!("Invalid Piper bundle path"));
    }
    Ok(())
}

pub(crate) fn validate_download_url(value: &str) -> Result<()> {
    let url = Url::parse(value).context("Invalid local speech artifact download URL")?;
    if url.scheme() != "https"
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err(anyhow!(
            "Local speech artifact download URL must be an HTTPS origin without credentials"
        ));
    }
    Ok(())
}

pub(crate) fn validate_sha256(value: &str) -> Result<()> {
    if value.len() != 64 || !value.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(anyhow!("Invalid local speech artifact SHA-256"));
    }
    Ok(())
}

pub(crate) fn verify_sha256(actual: &[u8], expected: &str) -> Result<()> {
    validate_sha256(expected)?;
    let actual = hex::encode(actual);
    if !actual.eq_ignore_ascii_case(expected) {
        return Err(anyhow!(
            "Downloaded local speech artifact failed SHA-256 verification"
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn embedded_registry_is_complete_and_provenanced() {
        let registry = canonical_registry().unwrap();
        assert!(!registry.whisper_models.is_empty());
        assert!(!registry.piper_voices.is_empty());
        assert!(!registry.piper_binaries.is_empty());
        assert!(registry.whisper_models.iter().all(|entry| {
            entry.download_url.is_some()
                && entry.sha256.is_some()
                && entry.license.is_some()
                && entry.provenance.is_some()
        }));
        assert!(registry.piper_voices.iter().all(|entry| {
            entry.model_url.is_some()
                && entry.config_url.is_some()
                && entry.model_sha256.is_some()
                && entry.config_sha256.is_some()
                && entry.license.is_some()
                && entry.provenance.is_some()
        }));
        assert!(registry.replacements.iter().all(|replacement| {
            registry
                .piper_voices
                .iter()
                .any(|voice| voice.id == replacement.replacement_id)
        }));
    }

    #[test]
    fn runtime_manifest_overrides_by_canonical_id_without_hiding_other_entries() {
        let temp_dir = tempfile::tempdir().unwrap();
        let canonical = canonical_registry().unwrap();
        let selected_id = &canonical.whisper_models[0].id;
        let fixture_filename = "fixture-override.bin";
        std::fs::write(
            temp_dir.path().join(RUNTIME_MANIFEST_FILENAME),
            serde_json::json!({
                "models": [{
                    "id": selected_id,
                    "filename": fixture_filename,
                    "description": "Fixture override",
                    "approximateSizeBytes": 1,
                    "downloadUrl": "https://example.invalid/fixture.bin",
                    "sha256": "0".repeat(64)
                }]
            })
            .to_string(),
        )
        .unwrap();

        let descriptors = whisper_descriptors(temp_dir.path()).unwrap();
        assert_eq!(descriptors.len(), canonical.whisper_models.len());
        assert_eq!(
            descriptors
                .iter()
                .find(|entry| &entry.id == selected_id)
                .unwrap()
                .filename,
            fixture_filename
        );
    }

    #[test]
    fn runtime_download_cannot_escape_directory() {
        let temp_dir = tempfile::tempdir().unwrap();
        std::fs::write(
            temp_dir.path().join(RUNTIME_MANIFEST_FILENAME),
            serde_json::json!({
                "models": [{
                    "id": "fixture-runtime-speech",
                    "filename": "../fixture.bin",
                    "downloadUrl": "https://example.invalid/fixture.bin",
                    "sha256": "0".repeat(64)
                }]
            })
            .to_string(),
        )
        .unwrap();
        assert!(whisper_descriptors(temp_dir.path()).is_err());
    }

    #[test]
    fn runtime_download_cannot_omit_checksum() {
        let temp_dir = tempfile::tempdir().unwrap();
        std::fs::write(
            temp_dir.path().join(RUNTIME_MANIFEST_FILENAME),
            serde_json::json!({
                "models": [{
                    "id": "fixture-runtime-speech",
                    "filename": "fixture-runtime-speech.bin",
                    "downloadUrl": "https://example.invalid/fixture.bin"
                }]
            })
            .to_string(),
        )
        .unwrap();
        assert!(whisper_descriptors(temp_dir.path()).is_err());
    }

    #[test]
    fn runtime_download_cannot_use_an_insecure_url() {
        let temp_dir = tempfile::tempdir().unwrap();
        std::fs::write(
            temp_dir.path().join(RUNTIME_MANIFEST_FILENAME),
            serde_json::json!({
                "models": [{
                    "id": "fixture-runtime-speech",
                    "filename": "fixture-runtime-speech.bin",
                    "downloadUrl": "http://example.invalid/fixture.bin",
                    "sha256": "0".repeat(64)
                }]
            })
            .to_string(),
        )
        .unwrap();
        assert!(whisper_descriptors(temp_dir.path()).is_err());
    }

    #[test]
    fn binary_selection_is_derived_from_registry() {
        let registry = canonical_registry().unwrap();
        let selected = &registry.piper_binaries[0];
        let descriptor = piper_binary_descriptor(
            Path::new("fixture-no-runtime-manifest"),
            &selected.os,
            &selected.arch,
        )
        .unwrap();
        assert_eq!(descriptor.id, selected.id);
    }

    #[test]
    fn sha256_comparison_accepts_case_but_not_mismatch() {
        let digest = [0xab; 32];
        let expected = hex::encode(digest).to_uppercase();
        verify_sha256(&digest, &expected).unwrap();
        assert!(verify_sha256(&[0xcd; 32], &expected).is_err());
    }

    #[test]
    fn manifest_path_is_local_to_selected_directory() {
        let directory = PathBuf::from("fixture-speech-directory");
        assert_eq!(
            directory.join(RUNTIME_MANIFEST_FILENAME),
            PathBuf::from("fixture-speech-directory/models.json")
        );
    }
}
