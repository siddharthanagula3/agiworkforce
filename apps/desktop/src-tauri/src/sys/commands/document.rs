use std::path::{Component, Path, PathBuf};
use std::sync::Arc;
use tauri::State;

use crate::features::document::{
    build_generated_document_manifest, DocumentContent, DocumentManager, DocumentMetadata,
    ExcelDocumentConfig, ExcelDocumentCreator, ExcelEdit, ExcelEditor, ExcelSheet,
    GeneratedDocumentArtifactManifest, GeneratedDocumentComputeSession, GeneratedDocumentFile,
    GeneratedDocumentKind, PdfContent, PdfDocumentConfig, PdfDocumentCreator, PresentationConfig,
    PresentationCreator, SearchResult, WordContent, WordDocumentConfig, WordDocumentCreator,
};
use crate::sys::error::{Error, Result};

pub struct DocumentState {
    pub manager: Arc<DocumentManager>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentCreationResult {
    pub path: String,
    #[serde(rename = "file_path")]
    pub file_path: String,
    #[serde(rename = "filePath")]
    pub file_path_camel: String,
    pub format: String,
    pub status: String,
    pub success: bool,
    pub compute_session: GeneratedDocumentComputeSession,
    pub generated_file: GeneratedDocumentFile,
    pub artifact_manifest: GeneratedDocumentArtifactManifest,
}

impl Default for DocumentState {
    fn default() -> Self {
        Self::new()
    }
}

impl DocumentState {
    pub fn new() -> Self {
        Self {
            manager: Arc::new(DocumentManager::new()),
        }
    }
}

#[tauri::command]
pub async fn document_read(
    file_path: String,
    state: State<'_, DocumentState>,
) -> Result<DocumentContent> {
    state.manager.read_document(&file_path).await
}

#[tauri::command]
pub async fn document_extract_text(
    file_path: String,
    state: State<'_, DocumentState>,
) -> Result<String> {
    state.manager.extract_text(&file_path).await
}

#[tauri::command]
pub async fn document_get_metadata(
    file_path: String,
    state: State<'_, DocumentState>,
) -> Result<DocumentMetadata> {
    state.manager.get_metadata(&file_path).await
}

#[tauri::command]
pub async fn document_search(
    file_path: String,
    query: String,
    state: State<'_, DocumentState>,
) -> Result<Vec<SearchResult>> {
    state.manager.search(&file_path, &query).await
}

#[tauri::command]
pub async fn document_detect_type(file_path: String) -> Result<String> {
    let doc_type = DocumentManager::detect_type(&file_path)?;
    Ok(format!("{:?}", doc_type))
}

#[tauri::command]
pub async fn document_create_word(
    output_path: String,
    config: WordDocumentConfig,
    contents: Vec<WordContent>,
) -> Result<String> {
    let resolved_path = resolve_output_path(&output_path)?;
    let creator = WordDocumentCreator::new();
    creator.create(&resolved_path, config, contents)?;
    Ok(resolved_path)
}

/// Edit an existing spreadsheet, preserving the data already in it.
///
/// `ExcelEditor` reads the source workbook through calamine and rewrites it
/// with the edits applied, so existing sheets and cells survive. That is what
/// makes this safe to expose.
///
/// There is deliberately no `document_edit_word` counterpart: `WordEditor`
/// cannot parse an existing .docx (docx_rs is write-only) and builds a NEW
/// document from the edits alone, discarding the source. Exposing that as
/// "edit your document" would silently destroy the user's content. See
/// docs/decisions/wire-or-cut.md.
#[tauri::command]
pub async fn document_edit_excel(
    file_path: String,
    output_path: String,
    edits: Vec<ExcelEdit>,
) -> Result<String> {
    let resolved_source = resolve_output_path(&file_path)?;
    let resolved_output = resolve_output_path(&output_path)?;
    let editor = ExcelEditor::new();
    editor.edit_spreadsheet(&resolved_source, edits, &resolved_output)?;
    Ok(resolved_output)
}

pub async fn document_create_word_manifest(
    output_path: String,
    config: WordDocumentConfig,
    contents: Vec<WordContent>,
) -> Result<DocumentCreationResult> {
    let path = document_create_word(output_path, config, contents).await?;
    document_creation_result(path, "docx", GeneratedDocumentKind::Docx)
}

#[tauri::command]
pub async fn document_create_word_simple(
    output_path: String,
    title: Option<String>,
    author: Option<String>,
    paragraphs: Vec<String>,
) -> Result<String> {
    let resolved_path = resolve_output_path(&output_path)?;
    let creator = WordDocumentCreator::new();
    creator.create_simple(&resolved_path, title, author, paragraphs)?;
    Ok(resolved_path)
}

#[tauri::command]
pub async fn document_create_word_simple_manifest(
    output_path: String,
    title: Option<String>,
    author: Option<String>,
    paragraphs: Vec<String>,
) -> Result<DocumentCreationResult> {
    let path = document_create_word_simple(output_path, title, author, paragraphs).await?;
    document_creation_result(path, "docx", GeneratedDocumentKind::Docx)
}

#[tauri::command]
pub async fn document_create_excel(
    output_path: String,
    config: ExcelDocumentConfig,
    sheets: Vec<ExcelSheet>,
) -> Result<String> {
    let resolved_path = resolve_output_path(&output_path)?;
    let creator = ExcelDocumentCreator::new();
    creator.create(&resolved_path, config, sheets)?;
    Ok(resolved_path)
}

pub async fn document_create_excel_manifest(
    output_path: String,
    config: ExcelDocumentConfig,
    sheets: Vec<ExcelSheet>,
) -> Result<DocumentCreationResult> {
    let path = document_create_excel(output_path, config, sheets).await?;
    document_creation_result(path, "xlsx", GeneratedDocumentKind::Xlsx)
}

#[tauri::command]
pub async fn document_create_excel_simple(
    output_path: String,
    sheet_name: String,
    headers: Vec<String>,
    rows: Vec<Vec<String>>,
) -> Result<String> {
    let resolved_path = resolve_output_path(&output_path)?;
    let creator = ExcelDocumentCreator::new();
    creator.create_simple(&resolved_path, &sheet_name, headers, rows)?;
    Ok(resolved_path)
}

#[tauri::command]
pub async fn document_create_excel_simple_manifest(
    output_path: String,
    sheet_name: String,
    headers: Vec<String>,
    rows: Vec<Vec<String>>,
) -> Result<DocumentCreationResult> {
    let path = document_create_excel_simple(output_path, sheet_name, headers, rows).await?;
    document_creation_result(path, "xlsx", GeneratedDocumentKind::Xlsx)
}

#[tauri::command]
pub async fn document_create_excel_numbers(
    output_path: String,
    sheet_name: String,
    headers: Vec<String>,
    rows: Vec<Vec<f64>>,
) -> Result<String> {
    let resolved_path = resolve_output_path(&output_path)?;
    let creator = ExcelDocumentCreator::new();
    creator.create_with_numbers(&resolved_path, &sheet_name, headers, rows)?;
    Ok(resolved_path)
}

#[tauri::command]
pub async fn document_create_excel_numbers_manifest(
    output_path: String,
    sheet_name: String,
    headers: Vec<String>,
    rows: Vec<Vec<f64>>,
) -> Result<DocumentCreationResult> {
    let path = document_create_excel_numbers(output_path, sheet_name, headers, rows).await?;
    document_creation_result(path, "xlsx", GeneratedDocumentKind::Xlsx)
}

#[tauri::command]
pub async fn document_create_pdf(
    output_path: String,
    config: PdfDocumentConfig,
    contents: Vec<PdfContent>,
) -> Result<String> {
    let resolved_path = resolve_output_path(&output_path)?;
    let creator = PdfDocumentCreator::new();
    creator.create(&resolved_path, config, contents)?;
    Ok(resolved_path)
}

pub async fn document_create_pdf_manifest(
    output_path: String,
    config: PdfDocumentConfig,
    contents: Vec<PdfContent>,
) -> Result<DocumentCreationResult> {
    let path = document_create_pdf(output_path, config, contents).await?;
    document_creation_result(path, "pdf", GeneratedDocumentKind::Pdf)
}

#[tauri::command]
pub async fn document_create_pdf_simple(
    output_path: String,
    title: Option<String>,
    author: Option<String>,
    paragraphs: Vec<String>,
) -> Result<String> {
    let resolved_path = resolve_output_path(&output_path)?;
    let creator = PdfDocumentCreator::new();
    creator.create_simple(&resolved_path, title, author, paragraphs)?;
    Ok(resolved_path)
}

#[tauri::command]
pub async fn document_create_pdf_simple_manifest(
    output_path: String,
    title: Option<String>,
    author: Option<String>,
    paragraphs: Vec<String>,
) -> Result<DocumentCreationResult> {
    let path = document_create_pdf_simple(output_path, title, author, paragraphs).await?;
    document_creation_result(path, "pdf", GeneratedDocumentKind::Pdf)
}

#[tauri::command]
pub async fn document_create_powerpoint(
    output_path: String,
    config: PresentationConfig,
) -> Result<String> {
    let resolved_path = resolve_output_path(&output_path)?;
    let creator = PresentationCreator::new();
    creator.create(&config, &resolved_path)?;
    Ok(resolved_path)
}

pub async fn document_create_powerpoint_manifest(
    output_path: String,
    config: PresentationConfig,
) -> Result<DocumentCreationResult> {
    let path = document_create_powerpoint(output_path, config).await?;
    document_creation_result(path, "pptx", GeneratedDocumentKind::Pptx)
}

#[tauri::command]
pub async fn document_create_powerpoint_simple(
    output_path: String,
    title: String,
    author: String,
    slides: Vec<(String, Vec<String>)>,
) -> Result<String> {
    let resolved_path = resolve_output_path(&output_path)?;
    let creator = PresentationCreator::new();
    creator.create_simple(&title, &author, slides, &resolved_path)?;
    Ok(resolved_path)
}

#[tauri::command]
pub async fn document_create_powerpoint_simple_manifest(
    output_path: String,
    title: String,
    author: String,
    slides: Vec<(String, Vec<String>)>,
) -> Result<DocumentCreationResult> {
    let path = document_create_powerpoint_simple(output_path, title, author, slides).await?;
    document_creation_result(path, "pptx", GeneratedDocumentKind::Pptx)
}

fn document_creation_result(
    path: String,
    format: &str,
    kind: GeneratedDocumentKind,
) -> Result<DocumentCreationResult> {
    let bundle = build_generated_document_manifest(&path, kind).map_err(|e| {
        Error::Generic(format!(
            "Document was created but generated-file manifest creation failed: {}",
            e
        ))
    })?;

    Ok(DocumentCreationResult {
        path: path.clone(),
        file_path: path.clone(),
        file_path_camel: path,
        format: format.to_string(),
        status: "created".to_string(),
        success: true,
        compute_session: bundle.compute_session,
        generated_file: bundle.generated_file,
        artifact_manifest: bundle.artifact_manifest,
    })
}

fn resolve_output_path(output_path: &str) -> Result<String> {
    let trimmed = output_path.trim();
    if trimmed.is_empty() {
        return Err(Error::InvalidPath(
            "output_path cannot be empty".to_string(),
        ));
    }

    let mut resolved = if trimmed == "~" || trimmed.starts_with("~/") {
        let home = dirs::home_dir()
            .ok_or_else(|| Error::InvalidPath("Unable to resolve home directory".to_string()))?;
        if trimmed == "~" {
            home
        } else {
            home.join(trimmed.trim_start_matches("~/"))
        }
    } else {
        PathBuf::from(trimmed)
    };

    if resolved.is_relative() {
        let mut components = Path::new(&resolved).components();
        if let Some(Component::Normal(first)) = components.next() {
            let first_str = first.to_string_lossy();
            if first_str.eq_ignore_ascii_case("desktop") {
                let desktop = dirs::desktop_dir()
                    .or_else(|| dirs::home_dir().map(|dir| dir.join("Desktop")))
                    .ok_or_else(|| {
                        Error::InvalidPath("Unable to resolve Desktop directory".to_string())
                    })?;
                let rest = components.as_path();
                resolved = if rest.as_os_str().is_empty() {
                    desktop
                } else {
                    desktop.join(rest)
                };
            } else if first_str.eq_ignore_ascii_case("documents") {
                let docs = dirs::document_dir()
                    .or_else(|| dirs::home_dir().map(|dir| dir.join("Documents")))
                    .ok_or_else(|| {
                        Error::InvalidPath("Unable to resolve Documents directory".to_string())
                    })?;
                let rest = components.as_path();
                resolved = if rest.as_os_str().is_empty() {
                    docs
                } else {
                    docs.join(rest)
                };
            } else if first_str.eq_ignore_ascii_case("downloads") {
                let downloads = dirs::download_dir()
                    .or_else(|| dirs::home_dir().map(|dir| dir.join("Downloads")))
                    .ok_or_else(|| {
                        Error::InvalidPath("Unable to resolve Downloads directory".to_string())
                    })?;
                let rest = components.as_path();
                resolved = if rest.as_os_str().is_empty() {
                    downloads
                } else {
                    downloads.join(rest)
                };
            } else {
                let docs = dirs::document_dir()
                    .or_else(|| dirs::home_dir().map(|dir| dir.join("Documents")))
                    .ok_or_else(|| {
                        Error::InvalidPath("Unable to resolve Documents directory".to_string())
                    })?;
                resolved = docs.join(&resolved);
            }
        }
    }

    // SECURITY: document_create_* writes a file at this resolved path. Reject
    // directory traversal and protected system paths so a model-driven create can't
    // escape to ~/.ssh, shell rc files, LaunchAgents, etc. (legitimate absolute
    // paths are still allowed; only `..` and denylisted paths are blocked).
    if resolved
        .components()
        .any(|c| matches!(c, Component::ParentDir))
    {
        return Err(Error::InvalidPath(
            "output_path must not contain '..' (directory traversal)".to_string(),
        ));
    }
    if crate::sys::security::blocked_paths::is_blocked(&resolved) {
        return Err(Error::InvalidPath(
            "output_path resolves to a protected system path".to_string(),
        ));
    }

    Ok(resolved.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn document_creation_result_exposes_legacy_path_and_manifest_metadata() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let file_path = temp_dir.path().join("deck.pptx");
        std::fs::write(&file_path, b"pptx bytes").expect("test file");
        let compute_root = temp_dir.path().join("compute-sessions");
        let previous_compute_root = std::env::var_os("AGIWORKFORCE_LOCAL_COMPUTE_ROOT");
        std::env::set_var("AGIWORKFORCE_LOCAL_COMPUTE_ROOT", &compute_root);

        let result = document_creation_result(
            file_path.to_string_lossy().to_string(),
            "pptx",
            GeneratedDocumentKind::Pptx,
        )
        .expect("document creation result");
        let value = serde_json::to_value(&result).expect("json");

        assert_eq!(result.path, file_path.to_string_lossy());
        assert_eq!(result.format, "pptx");
        assert!(result.success);
        assert_eq!(result.generated_file.kind, GeneratedDocumentKind::Pptx);
        assert_eq!(result.generated_file.checksum_sha256.len(), 64);
        assert_eq!(
            value["file_path"].as_str().expect("legacy snake path"),
            result.path
        );
        assert_eq!(
            value["filePath"].as_str().expect("legacy camel path"),
            result.path
        );
        assert_eq!(
            result.artifact_manifest.generated_file_ids,
            vec![result.generated_file.id.clone()]
        );
        assert!(compute_root
            .join(&result.compute_session.id)
            .join("manifest.json")
            .is_file());

        if let Some(value) = previous_compute_root {
            std::env::set_var("AGIWORKFORCE_LOCAL_COMPUTE_ROOT", value);
        } else {
            std::env::remove_var("AGIWORKFORCE_LOCAL_COMPUTE_ROOT");
        }
    }
}
