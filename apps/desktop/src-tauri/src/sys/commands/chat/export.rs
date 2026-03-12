use tauri::State;
use tracing::warn;

use super::AppDatabase;

/// Export a conversation as formatted text.
///
/// Queries all messages for the given `conversation_id` from the local
/// database and returns them formatted according to `format`.
///
/// Supported formats:
/// - `"markdown"` — Each message rendered as `## {Role}\n\n{content}\n\n---\n\n`.
#[tauri::command]
pub async fn conversation_export(
    conversation_id: String,
    format: String,
    db: State<'_, AppDatabase>,
) -> Result<String, String> {
    if format != "markdown" {
        return Err(format!("Unsupported export format: {format}"));
    }

    let conv_id: i64 = conversation_id
        .parse()
        .map_err(|_| "Invalid conversation ID".to_string())?;

    let conn = db.connection()?;

    let title: String = conn
        .query_row(
            "SELECT title FROM conversations WHERE id = ?1",
            rusqlite::params![conv_id],
            |row| row.get(0),
        )
        .unwrap_or_else(|e| {
            warn!("Could not fetch title for conversation {}: {e}", conv_id);
            "Untitled Conversation".to_string()
        });

    let mut stmt = conn
        .prepare(
            "SELECT role, content, created_at FROM messages \
             WHERE conversation_id = ?1 ORDER BY created_at ASC",
        )
        .map_err(|e| format!("Failed to prepare message query: {e}"))?;

    let rows = stmt
        .query_map(rusqlite::params![conv_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(|e| format!("Failed to query messages: {e}"))?;

    let mut output = format!("# {title}\n\n");

    for row in rows {
        let (role, content, _created_at) =
            row.map_err(|e| format!("Failed to read message row: {e}"))?;

        let role_label = match role.as_str() {
            "user" => "User",
            "assistant" => "Assistant",
            "system" => "System",
            other => other,
        };

        output.push_str(&format!("## {role_label}\n\n{content}\n\n---\n\n"));
    }

    Ok(output)
}

/// Export a conversation as a PDF file.
///
/// Loads all messages for `conversation_id` from SQLite, builds structured
/// PDF content (title heading, per-message role header + body), and writes
/// the result to `output_path`.
#[tauri::command]
pub async fn conversation_export_pdf(
    conversation_id: String,
    output_path: String,
    db: State<'_, AppDatabase>,
) -> Result<String, String> {
    use crate::features::document::{PdfContent, PdfDocumentConfig, PdfDocumentCreator};

    let path = std::path::Path::new(&output_path);
    if let Some(ext) = path.extension() {
        if ext != "pdf" {
            return Err("Output path must have a .pdf extension".to_string());
        }
    } else {
        return Err("Output path must have a .pdf extension".to_string());
    }

    let canonical_dir = path
        .parent()
        .unwrap_or(std::path::Path::new("."))
        .canonicalize()
        .map_err(|e| format!("Invalid output directory: {e}"))?;
    let canonical_str = canonical_dir.to_string_lossy();
    if canonical_str.contains("..") {
        return Err("Path traversal not allowed".to_string());
    }

    let blocked_prefixes = ["/etc", "/usr", "/bin", "/sbin", "/var", "/System"];
    for prefix in &blocked_prefixes {
        if canonical_str.starts_with(prefix) {
            return Err(format!("Cannot write to system directory: {prefix}"));
        }
    }

    let conv_id: i64 = conversation_id
        .parse()
        .map_err(|_| "Invalid conversation ID".to_string())?;

    let conn = db.connection()?;

    let title: String = conn
        .query_row(
            "SELECT title FROM conversations WHERE id = ?1",
            rusqlite::params![conv_id],
            |row| row.get(0),
        )
        .unwrap_or_else(|e| {
            warn!("Could not fetch title for conversation {}: {e}", conv_id);
            "Untitled Conversation".to_string()
        });

    let mut stmt = conn
        .prepare(
            "SELECT role, content FROM messages \
             WHERE conversation_id = ?1 ORDER BY created_at ASC",
        )
        .map_err(|e| format!("Failed to prepare message query: {e}"))?;

    let rows: Vec<(String, String)> = stmt
        .query_map(rusqlite::params![conv_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| format!("Failed to query messages: {e}"))?
        .collect::<std::result::Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to read message rows: {e}"))?;

    let mut contents: Vec<PdfContent> = Vec::new();
    contents.push(PdfContent::Heading {
        level: 1,
        text: title.clone(),
    });

    for (role, content) in rows {
        let role_label = match role.as_str() {
            "user" => "User",
            "assistant" => "Assistant",
            "system" => "System",
            other => other,
        }
        .to_string();

        contents.push(PdfContent::Heading {
            level: 2,
            text: role_label,
        });

        for line in content.lines() {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            if trimmed.starts_with("```") || trimmed.ends_with("```") {
                contents.push(PdfContent::Paragraph {
                    text: trimmed.to_string(),
                    bold: Some(false),
                    italic: Some(true),
                    font_size: Some(10),
                    alignment: None,
                });
            } else {
                contents.push(PdfContent::Paragraph {
                    text: trimmed.to_string(),
                    bold: None,
                    italic: None,
                    font_size: None,
                    alignment: None,
                });
            }
        }
    }

    let creator = PdfDocumentCreator::new();
    let pdf_config = PdfDocumentConfig {
        title: Some(title.clone()),
        author: None,
        subject: Some("Exported conversation".to_string()),
        page_size: Some("A4".to_string()),
    };

    creator
        .create(&output_path, pdf_config, contents)
        .map_err(|e| format!("Failed to create PDF: {e}"))?;

    Ok(output_path)
}
