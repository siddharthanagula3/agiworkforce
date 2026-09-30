use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use super::{CloudClient, CloudError};

const LIBRARY_PATH: &str = "/api/library";

#[derive(Debug, Serialize, Deserialize)]
pub struct LibraryItem {
    pub id: String,
    pub file_name: String,
    pub mime_type: String,
    pub kind: String,
    #[serde(default)]
    pub byte_count: Option<u64>,
    #[serde(default)]
    pub origin: Option<String>,
    pub created_at: String,
    #[serde(default)]
    pub conversation_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LibraryPage {
    pub items: Vec<LibraryItem>,
    pub has_more: bool,
}

#[derive(Debug, Deserialize)]
pub struct TextPreview {
    pub text: String,
    pub truncated: bool,
    #[serde(default, rename = "fileName")]
    pub file_name: Option<String>,
}

pub fn formatted_source(preview: &TextPreview) -> Option<String> {
    let name = preview.file_name.as_deref()?;
    let extension = std::path::Path::new(name)
        .extension()?
        .to_str()?
        .to_ascii_lowercase();
    if matches!(extension.as_str(), "md" | "markdown" | "mdx") {
        return Some(preview.text.clone());
    }
    if !extension
        .chars()
        .all(|character| character.is_ascii_alphanumeric())
        || matches!(extension.as_str(), "txt" | "log" | "csv" | "tsv")
    {
        return None;
    }
    let fence = if preview.text.contains("```") {
        "~~~~"
    } else {
        "```"
    };
    Some(format!(
        "{fence}{extension}\n{}\n{fence}",
        preview.text.trim_end()
    ))
}

fn file_path(id: &str) -> String {
    format!("/api/files/{}", urlencoding::encode(id))
}

pub async fn list(
    client: &CloudClient,
    kind: Option<&str>,
    search: Option<&str>,
    limit: u32,
) -> Result<LibraryPage, CloudError> {
    let mut query = vec![("limit", limit.to_string())];
    if let Some(kind) = kind {
        query.push(("kind", kind.to_string()));
    }
    if let Some(search) = search {
        query.push(("q", search.to_string()));
    }
    client.get(LIBRARY_PATH, &query).await
}

pub async fn text(client: &CloudClient, id: &str) -> Result<TextPreview, CloudError> {
    client.get(&format!("{}/text", file_path(id)), &[]).await
}

pub async fn download(
    client: &CloudClient,
    id: &str,
    directory: &Path,
) -> Result<PathBuf, CloudError> {
    client.download_into(&file_path(id), directory, id).await
}

pub fn render(page: &LibraryPage) -> String {
    if page.items.is_empty() {
        return "Your Library is empty.".to_string();
    }
    let sanitize = |text: &str| crate::terminal_text::sanitize_terminal_text(text).into_owned();
    let mut lines = vec!["Library, newest first".to_string()];
    for item in &page.items {
        let size = item
            .byte_count
            .map(|bytes| format!(", {}", crate::tools::format_size(bytes)))
            .unwrap_or_default();
        let origin = item.origin.as_deref().unwrap_or("generated");
        lines.push(format!(
            "  {}  {}  ({}, {origin}{size}, {})",
            sanitize(&item.id),
            sanitize(&item.file_name),
            sanitize(&item.kind),
            sanitize(item.created_at.get(..10).unwrap_or(&item.created_at))
        ));
    }
    if page.has_more {
        lines.push(
            "  More items are in your Library; raise --limit or narrow with --search.".to_string(),
        );
    }
    lines.push(
        "agi library show <id> prints a text file; agi library download <id> saves the original."
            .to_string(),
    );
    lines.join("\n")
}
