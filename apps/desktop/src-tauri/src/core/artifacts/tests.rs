//! Tests for the Artifacts module

use super::*;

#[test]
fn test_artifact_type_display() {
    assert_eq!(ArtifactType::Code.to_string(), "code");
    assert_eq!(ArtifactType::Document.to_string(), "document");
    assert_eq!(ArtifactType::Spreadsheet.to_string(), "spreadsheet");
}

#[test]
fn test_artifact_type_extension() {
    assert_eq!(ArtifactType::Code.default_extension(), "txt");
    assert_eq!(ArtifactType::Document.default_extension(), "md");
    assert_eq!(ArtifactType::Spreadsheet.default_extension(), "csv");
    assert_eq!(ArtifactType::Web.default_extension(), "html");
}

#[test]
fn test_artifact_type_mime() {
    assert_eq!(ArtifactType::Code.mime_type(), "text/plain");
    assert_eq!(ArtifactType::Document.mime_type(), "text/markdown");
    assert_eq!(ArtifactType::Web.mime_type(), "text/html");
}

#[test]
fn test_artifact_new() {
    let artifact = Artifact::new(
        "test-id".to_string(),
        "Test Artifact".to_string(),
        ArtifactType::Code,
        "fn main() {}".to_string(),
        ArtifactMetadata::Code(CodeMetadata {
            language: "rust".to_string(),
            ..Default::default()
        }),
    );

    assert_eq!(artifact.id, "test-id");
    assert_eq!(artifact.title, "Test Artifact");
    assert_eq!(artifact.artifact_type, ArtifactType::Code);
    assert_eq!(artifact.current_version, 1);
    assert_eq!(artifact.versions.len(), 1);
    assert_eq!(artifact.status, ArtifactStatus::Complete);
}

#[test]
fn test_artifact_update() {
    let mut artifact = Artifact::new(
        "test-id".to_string(),
        "Test".to_string(),
        ArtifactType::Document,
        "Version 1".to_string(),
        ArtifactMetadata::Document(DocumentMetadata::default()),
    );

    artifact.update_content("Version 2".to_string(), Some("Update".to_string()));

    assert_eq!(artifact.content, "Version 2");
    assert_eq!(artifact.current_version, 2);
    assert_eq!(artifact.versions.len(), 2);
}

#[test]
fn test_artifact_no_duplicate_version() {
    let mut artifact = Artifact::new(
        "test-id".to_string(),
        "Test".to_string(),
        ArtifactType::Document,
        "Same content".to_string(),
        ArtifactMetadata::default(),
    );

    // Update with same content should not create new version
    artifact.update_content("Same content".to_string(), None);

    assert_eq!(artifact.current_version, 1);
    assert_eq!(artifact.versions.len(), 1);
}

#[test]
fn test_artifact_rollback() {
    let mut artifact = Artifact::new(
        "test-id".to_string(),
        "Test".to_string(),
        ArtifactType::Document,
        "Version 1".to_string(),
        ArtifactMetadata::default(),
    );

    artifact.update_content("Version 2".to_string(), None);
    artifact.update_content("Version 3".to_string(), None);

    assert_eq!(artifact.current_version, 3);

    artifact.rollback_to_version(1).unwrap();

    assert_eq!(artifact.content, "Version 1");
    assert_eq!(artifact.current_version, 4); // Rollback creates a new version
}

#[test]
fn test_artifact_rollback_invalid_version() {
    let mut artifact = Artifact::new(
        "test-id".to_string(),
        "Test".to_string(),
        ArtifactType::Document,
        "Content".to_string(),
        ArtifactMetadata::default(),
    );

    let result = artifact.rollback_to_version(999);
    assert!(result.is_err());
}

#[test]
fn test_artifact_streaming() {
    let mut artifact = Artifact::new_streaming(
        "test-id".to_string(),
        "Streaming Test".to_string(),
        ArtifactType::Code,
        ArtifactMetadata::Code(CodeMetadata::default()),
    );

    assert_eq!(artifact.status, ArtifactStatus::Streaming);
    assert_eq!(artifact.current_version, 0);
    assert!(artifact.versions.is_empty());

    artifact.append_content("fn ");
    artifact.append_content("main() {}");

    assert_eq!(artifact.content, "fn main() {}");

    artifact.finalize_streaming(Some("Complete".to_string()));

    assert_eq!(artifact.status, ArtifactStatus::Complete);
    assert_eq!(artifact.current_version, 1);
    assert_eq!(artifact.versions.len(), 1);
}

#[test]
fn test_artifact_archive() {
    let mut artifact = Artifact::new(
        "test-id".to_string(),
        "Test".to_string(),
        ArtifactType::Document,
        "Content".to_string(),
        ArtifactMetadata::default(),
    );

    artifact.archive();
    assert_eq!(artifact.status, ArtifactStatus::Archived);

    artifact.unarchive();
    assert_eq!(artifact.status, ArtifactStatus::Complete);
}

#[test]
fn test_artifact_mark_failed() {
    let mut artifact = Artifact::new(
        "test-id".to_string(),
        "Test".to_string(),
        ArtifactType::Document,
        "Content".to_string(),
        ArtifactMetadata::default(),
    );

    artifact.mark_failed(Some("Network error".to_string()));

    assert_eq!(artifact.status, ArtifactStatus::Failed);
    assert!(artifact.tags.contains(&"error:Network error".to_string()));
}

#[test]
fn test_artifact_get_version_diff() {
    let mut artifact = Artifact::new(
        "test-id".to_string(),
        "Test".to_string(),
        ArtifactType::Document,
        "Version 1".to_string(),
        ArtifactMetadata::default(),
    );

    artifact.update_content("Version 2".to_string(), None);

    let diff = artifact.get_version_diff(1, 2).unwrap();

    assert_eq!(diff.from_version, 1);
    assert_eq!(diff.to_version, 2);
    assert_eq!(diff.from_content, "Version 1");
    assert_eq!(diff.to_content, "Version 2");
}

#[test]
fn test_artifact_summary() {
    let artifact = Artifact::new(
        "test-id".to_string(),
        "Test Summary".to_string(),
        ArtifactType::Code,
        "fn main() {}".to_string(),
        ArtifactMetadata::default(),
    );

    let summary = ArtifactSummary::from(&artifact);

    assert_eq!(summary.id, "test-id");
    assert_eq!(summary.title, "Test Summary");
    assert_eq!(summary.artifact_type, ArtifactType::Code);
    assert_eq!(summary.current_version, 1);
    assert_eq!(summary.version_count, 1);
}

#[test]
fn test_code_metadata_default() {
    let meta = CodeMetadata::default();
    assert_eq!(meta.language, "text");
    assert!(meta.file_path.is_none());
    assert!(meta.highlight_lines.is_none());
    assert!(!meta.executable);
}

#[test]
fn test_document_metadata_default() {
    let meta = DocumentMetadata::default();
    assert_eq!(meta.format, "markdown");
    assert!(meta.toc.is_none());
    assert!(meta.word_count.is_none());
}

#[test]
fn test_spreadsheet_metadata_default() {
    let meta = SpreadsheetMetadata::default();
    assert!(meta.columns.is_empty());
    assert_eq!(meta.row_count, 0);
}

#[test]
fn test_artifact_filter_default() {
    let filter = ArtifactFilter::default();
    assert!(filter.artifact_types.is_none());
    assert!(filter.statuses.is_none());
    assert!(filter.tags.is_none());
    assert!(filter.conversation_id.is_none());
    assert!(filter.search_query.is_none());
    assert!(!filter.pinned_only);
    assert!(filter.limit.is_none());
    assert!(filter.offset.is_none());
}
