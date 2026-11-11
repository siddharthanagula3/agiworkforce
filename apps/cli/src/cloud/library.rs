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
    #[serde(default)]
    pub next_offset: Option<u64>,
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

fn list_query(
    kind: Option<&str>,
    search: Option<&str>,
    limit: u32,
    offset: u64,
) -> Vec<(&'static str, String)> {
    let mut query = vec![("limit", limit.to_string()), ("offset", offset.to_string())];
    if let Some(kind) = kind {
        query.push(("kind", kind.to_string()));
    }
    if let Some(search) = search {
        query.push(("q", search.to_string()));
    }
    query
}

pub async fn list(
    client: &CloudClient,
    kind: Option<&str>,
    search: Option<&str>,
    limit: u32,
    offset: u64,
) -> Result<LibraryPage, CloudError> {
    client
        .get(LIBRARY_PATH, &list_query(kind, search, limit, offset))
        .await
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

pub fn render(page: &LibraryPage, offset: u64) -> String {
    if page.items.is_empty() {
        return if offset == 0 {
            "Your Library is empty.".to_string()
        } else {
            format!("No Library items past offset {offset}.")
        };
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
        lines.push(match page.next_offset.filter(|next| *next > offset) {
            Some(next) => format!(
                "  More items are in your Library; run the same command with --offset {next} for the next page."
            ),
            None => "  More items are in your Library, but no next page was returned; narrow with --kind or --search."
                .to_string(),
        });
    }
    lines.push(
        "agi library show <id> prints a text file; agi library download <id> saves the original."
            .to_string(),
    );
    lines.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn item(id: &str) -> LibraryItem {
        LibraryItem {
            id: id.to_string(),
            file_name: "same.png".to_string(),
            mime_type: "image/png".to_string(),
            kind: "image".to_string(),
            byte_count: None,
            origin: None,
            created_at: "2026-11-09T00:00:00Z".to_string(),
            conversation_id: None,
        }
    }

    #[test]
    fn list_query_carries_the_requested_offset() {
        let query = list_query(Some("image"), Some("same"), 100, 100);
        assert!(query.contains(&("limit", "100".to_string())));
        assert!(query.contains(&("offset", "100".to_string())));
        assert!(query.contains(&("kind", "image".to_string())));
        assert!(query.contains(&("q", "same".to_string())));
    }

    #[test]
    fn a_page_with_more_items_names_the_server_next_offset() {
        let page: LibraryPage = serde_json::from_value(serde_json::json!({
            "items": [serde_json::to_value(item("a")).unwrap()],
            "has_more": true,
            "next_offset": 100
        }))
        .unwrap();
        let rendered = render(&page, 0);
        assert!(rendered.contains("--offset 100"));
        assert!(!rendered.contains("raise --limit"));
    }

    #[test]
    fn a_missing_or_nonadvancing_next_offset_is_not_offered_as_a_next_page() {
        for next_offset in [None, Some(100), Some(50)] {
            let page = LibraryPage {
                items: vec![item("a")],
                has_more: true,
                next_offset,
            };
            let rendered = render(&page, 100);
            assert!(!rendered.contains("--offset"));
            assert!(rendered.contains("no next page was returned"));
        }
    }

    #[test]
    fn the_final_page_offers_no_continuation() {
        let page: LibraryPage = serde_json::from_value(serde_json::json!({
            "items": [serde_json::to_value(item("last")).unwrap()],
            "has_more": false,
            "next_offset": null
        }))
        .unwrap();
        let rendered = render(&page, 100);
        assert!(rendered.contains("last"));
        assert!(!rendered.contains("More items"));
        let empty = LibraryPage {
            items: Vec::new(),
            has_more: false,
            next_offset: None,
        };
        assert_eq!(render(&empty, 100), "No Library items past offset 100.");
        assert_eq!(render(&empty, 0), "Your Library is empty.");
    }
}
