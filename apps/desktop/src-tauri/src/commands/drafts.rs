use tauri::State;
use crate::state::draft_manager::DraftManager;
use crate::models::advanced_features::MessageDraft;

#[tauri::command]
pub async fn save_draft(
    draft_manager: State<'_, DraftManager>,
    conversation_id: String,
    content: String,
    attachments: Vec<String>,
    focus_mode: Option<String>,
) -> Result<(), String> {
    let draft = MessageDraft {
        conversation_id,
        content,
        attachments,
        focus_mode,
        saved_at: chrono::Utc::now(),
    };

    draft_manager
        .save_draft(&draft)
        .map_err(|e| format!("Failed to save draft: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn get_draft(
    draft_manager: State<'_, DraftManager>,
    conversation_id: String,
) -> Result<Option<MessageDraft>, String> {
    draft_manager
        .get_draft(&conversation_id)
        .map_err(|e| format!("Failed to get draft: {}", e))
}

#[tauri::command]
pub async fn clear_draft(
    draft_manager: State<'_, DraftManager>,
    conversation_id: String,
) -> Result<(), String> {
    draft_manager
        .clear_draft(&conversation_id)
        .map_err(|e| format!("Failed to clear draft: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn get_all_drafts(
    draft_manager: State<'_, DraftManager>,
) -> Result<Vec<MessageDraft>, String> {
    draft_manager
        .get_all_drafts()
        .map_err(|e| format!("Failed to get drafts: {}", e))
}
