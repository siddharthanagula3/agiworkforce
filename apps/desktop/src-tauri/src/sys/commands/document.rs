use std::path::{Component, Path, PathBuf};
use std::sync::Arc;
use tauri::State;

use crate::features::document::{
    DocumentContent, DocumentManager, DocumentMetadata, ExcelDocumentConfig, ExcelDocumentCreator,
    ExcelSheet, PdfContent, PdfDocumentConfig, PdfDocumentCreator, PresentationConfig,
    PresentationCreator, SearchResult, WordContent, WordDocumentConfig, WordDocumentCreator,
};
use crate::sys::error::{Error, Result};

pub struct DocumentState {
    pub manager: Arc<DocumentManager>,
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
pub async fn document_create_powerpoint(
    output_path: String,
    config: PresentationConfig,
) -> Result<String> {
    let resolved_path = resolve_output_path(&output_path)?;
    let creator = PresentationCreator::new();
    creator.create(&config, &resolved_path)?;
    Ok(resolved_path)
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
                // Bare filename (e.g. "test.pdf") — save to Documents by default
                let docs = dirs::document_dir()
                    .or_else(|| dirs::home_dir().map(|dir| dir.join("Documents")))
                    .ok_or_else(|| {
                        Error::InvalidPath("Unable to resolve Documents directory".to_string())
                    })?;
                resolved = docs.join(&resolved);
            }
        }
    }

    Ok(resolved.to_string_lossy().to_string())
}
