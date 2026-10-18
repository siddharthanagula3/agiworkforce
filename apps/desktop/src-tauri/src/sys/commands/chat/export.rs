use rusqlite::Connection;
use tauri::State;

use super::AppDatabase;
use crate::data::db::repository;

/// The title of a conversation the user owns, or an error naming why it cannot
/// be exported.
fn owned_conversation_title(
    conn: &Connection,
    conversation_id: i64,
    user_id: &str,
) -> Result<String, String> {
    if user_id.is_empty() {
        return Err("User ID cannot be empty".to_string());
    }
    repository::get_conversation(conn, conversation_id, user_id)
        .map(|conversation| conversation.title)
        .map_err(|e| format!("Conversation {conversation_id} not found: {e}"))
}

/// Export a conversation as formatted text.
///
/// Queries all messages for the given `conversation_id` from the local
/// database and returns them formatted according to `format`.
///
/// Supported formats:
/// - `"markdown"`, Each message rendered as `## {Role}\n\n{content}\n\n---\n\n`.
#[tauri::command]
pub async fn conversation_export(
    conversation_id: String,
    format: String,
    user_id: String,
    db: State<'_, AppDatabase>,
) -> Result<String, String> {
    if format != "markdown" {
        return Err(format!("Unsupported export format: {format}"));
    }

    let conv_id: i64 = conversation_id
        .parse()
        .map_err(|_| "Invalid conversation ID".to_string())?;

    let conn = db.connection()?;

    let title = owned_conversation_title(&conn, conv_id, &user_id)?;

    let mut stmt = conn
        .prepare(
            "SELECT role, content, created_at FROM messages \
             WHERE conversation_id = ?1 AND superseded_key IS NULL ORDER BY created_at ASC, id ASC",
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

/// A file name for the save dialog, from the conversation title. Only the
/// person's choice in the dialog decides where the file is written.
fn suggested_pdf_name(title: &str) -> String {
    let stem: String = title
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || matches!(c, ' ' | '-' | '_') {
                c
            } else {
                '_'
            }
        })
        .take(80)
        .collect();
    let stem = stem.trim();
    if stem.is_empty() {
        "conversation.pdf".to_string()
    } else {
        format!("{stem}.pdf")
    }
}

/// Export a conversation as a PDF file.
///
/// Rust opens the save dialog itself and writes only to the path the person
/// picks there, so the page cannot choose where the file lands. Returns the
/// path written, or `None` when the dialog was closed without a choice.
#[tauri::command]
pub async fn conversation_export_pdf(
    conversation_id: String,
    user_id: String,
    app: tauri::AppHandle,
    db: State<'_, AppDatabase>,
) -> Result<Option<String>, String> {
    use crate::features::document::{PdfContent, PdfDocumentConfig, PdfDocumentCreator};
    use tauri_plugin_dialog::DialogExt;

    let conv_id: i64 = conversation_id
        .parse()
        .map_err(|_| "Invalid conversation ID".to_string())?;

    let (title, rows) = {
        let conn = db.connection()?;
        let title = owned_conversation_title(&conn, conv_id, &user_id)?;
        let mut stmt = conn
            .prepare(
                "SELECT role, content FROM messages \
                 WHERE conversation_id = ?1 AND superseded_key IS NULL ORDER BY created_at ASC, id ASC",
            )
            .map_err(|e| format!("Failed to prepare message query: {e}"))?;
        let rows: Vec<(String, String)> = stmt
            .query_map(rusqlite::params![conv_id], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|e| format!("Failed to query messages: {e}"))?
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(|e| format!("Failed to read message rows: {e}"))?;
        (title, rows)
    };

    let dialog_app = app.clone();
    let file_name = suggested_pdf_name(&title);
    let picked = tokio::task::spawn_blocking(move || {
        dialog_app
            .dialog()
            .file()
            .set_title("Export conversation as PDF")
            .set_file_name(file_name)
            .add_filter("PDF", &["pdf"])
            .blocking_save_file()
    })
    .await
    .map_err(|e| format!("The save dialog failed: {e}"))?;
    let Some(picked) = picked else {
        return Ok(None);
    };
    let mut output_path = picked
        .into_path()
        .map_err(|e| format!("The chosen location is not a local path: {e}"))?;
    if output_path.extension().is_none_or(|ext| ext != "pdf") {
        output_path.set_extension("pdf");
    }
    let output_path = output_path
        .into_os_string()
        .into_string()
        .map_err(|_| "The chosen path is not valid Unicode.".to_string())?;

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

    Ok(Some(output_path))
}
