use anyhow::Result as AnyResult;
use tauri::{AppHandle, State};

use crate::automation::{
    codegen::{CodeGenerator, CodeLanguage, GeneratedCode},
    executor::{AutomationScript, ExecutionResult, ExecutorConfig, ExecutorService},
    inspector::{DetailedElementInfo, ElementSelector, InspectorService},
    recorder::{global_recorder, Recording, RecordingSession},
};
use crate::db::repository;
use super::AppDatabase;

// ============================================================================
// Recorder Commands
// ============================================================================

#[tauri::command]
pub fn automation_record_start(app: AppHandle) -> Result<RecordingSession, String> {
    let recorder = global_recorder();
    let _ = recorder.set_app_handle(app);
    recorder.start_recording().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn automation_record_stop() -> Result<Recording, String> {
    let recorder = global_recorder();
    recorder.stop_recording().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn automation_record_action_click(x: i32, y: i32, button: String) -> Result<(), String> {
    let recorder = global_recorder();
    if recorder.is_recording() {
        recorder.record_click(x, y, &button).map_err(|e| e.to_string())
    } else {
        Ok(())
    }
}

#[tauri::command]
pub fn automation_record_action_type(text: String, x: i32, y: i32) -> Result<(), String> {
    let recorder = global_recorder();
    if recorder.is_recording() {
        recorder.record_type(&text, x, y).map_err(|e| e.to_string())
    } else {
        Ok(())
    }
}

#[tauri::command]
pub fn automation_record_action_screenshot() -> Result<(), String> {
    let recorder = global_recorder();
    if recorder.is_recording() {
        recorder.record_screenshot().map_err(|e| e.to_string())
    } else {
        Ok(())
    }
}

#[tauri::command]
pub fn automation_record_action_wait(duration_ms: u64) -> Result<(), String> {
    let recorder = global_recorder();
    if recorder.is_recording() {
        recorder.record_wait(duration_ms).map_err(|e| e.to_string())
    } else {
        Ok(())
    }
}

#[tauri::command]
pub fn automation_record_is_recording() -> Result<bool, String> {
    let recorder = global_recorder();
    Ok(recorder.is_recording())
}

#[tauri::command]
pub fn automation_record_get_session() -> Result<Option<RecordingSession>, String> {
    let recorder = global_recorder();
    Ok(recorder.get_session())
}

// ============================================================================
// Inspector Commands
// ============================================================================

#[tauri::command]
pub fn automation_inspect_element_at_point(x: i32, y: i32) -> Result<DetailedElementInfo, String> {
    let inspector = InspectorService::new().map_err(|e| e.to_string())?;
    inspector.inspect_element_at_point(x, y).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn automation_inspect_element_by_id(element_id: String) -> Result<DetailedElementInfo, String> {
    let inspector = InspectorService::new().map_err(|e| e.to_string())?;
    inspector.inspect_element_by_id(&element_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn automation_find_element_by_selector(
    selector: ElementSelector,
) -> Result<Option<String>, String> {
    let inspector = InspectorService::new().map_err(|e| e.to_string())?;
    inspector.find_element_by_selector(&selector).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn automation_generate_selector(element_id: String) -> Result<Vec<ElementSelector>, String> {
    let inspector = InspectorService::new().map_err(|e| e.to_string())?;
    inspector.generate_selector(&element_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn automation_get_element_tree(
    element_id: String,
) -> Result<
    (
        Option<crate::automation::inspector::BasicElementInfo>,
        Vec<crate::automation::inspector::BasicElementInfo>,
    ),
    String,
> {
    let inspector = InspectorService::new().map_err(|e| e.to_string())?;
    inspector.get_element_tree(&element_id).map_err(|e| e.to_string())
}

// ============================================================================
// Executor Commands
// ============================================================================

#[tauri::command]
pub async fn automation_execute_script(
    app: AppHandle,
    script: AutomationScript,
) -> Result<ExecutionResult, String> {
    let config = ExecutorConfig::default();
    let executor = ExecutorService::new(config).map_err(|e| e.to_string())?;
    executor.execute_script(script, Some(&app)).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn automation_save_script(
    db: State<'_, AppDatabase>,
    script: AutomationScript,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    // Save script to database as JSON
    let script_json = serde_json::to_string(&script).map_err(|e| e.to_string())?;

    repository::save_setting(&conn, &format!("automation_script_{}", script.id), &script_json)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn automation_load_script(
    db: State<'_, AppDatabase>,
    script_id: String,
) -> Result<AutomationScript, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    let script_json = repository::get_setting(&conn, &format!("automation_script_{}", script_id))
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Script not found".to_string())?;

    serde_json::from_str(&script_json).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn automation_list_scripts(
    db: State<'_, AppDatabase>,
) -> Result<Vec<AutomationScript>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    // Get all settings with prefix "automation_script_"
    let settings = repository::list_settings(&conn).map_err(|e| e.to_string())?;

    let mut scripts = Vec::new();
    for (key, value) in settings {
        if key.starts_with("automation_script_") {
            if let Ok(script) = serde_json::from_str::<AutomationScript>(&value) {
                scripts.push(script);
            }
        }
    }

    // Sort by updated_at descending
    scripts.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));

    Ok(scripts)
}

#[tauri::command]
pub async fn automation_delete_script(
    db: State<'_, AppDatabase>,
    script_id: String,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    repository::delete_setting(&conn, &format!("automation_script_{}", script_id))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn automation_save_recording_as_script(
    db: State<'_, AppDatabase>,
    recording: Recording,
    name: String,
    description: String,
    tags: Vec<String>,
) -> Result<AutomationScript, String> {
    use std::time::{SystemTime, UNIX_EPOCH};
    use uuid::Uuid;

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64;

    // Convert recording actions to script actions
    let script_actions: Vec<crate::automation::executor::ScriptAction> = recording
        .actions
        .into_iter()
        .map(|action| {
            let coordinates = action.target.map(|target| crate::automation::executor::Coordinates {
                x: target.x,
                y: target.y,
            });

            crate::automation::executor::ScriptAction {
                id: action.id,
                action_type: format!("{:?}", action.action_type).to_lowercase(),
                selector: None,
                coordinates,
                value: action.value,
                duration: None,
                condition: None,
                repeat_count: None,
            }
        })
        .collect();

    let script = AutomationScript {
        id: Uuid::new_v4().to_string(),
        name,
        description,
        tags,
        actions: script_actions,
        created_at: now,
        updated_at: now,
        last_run_at: None,
    };

    // Save to database
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let script_json = serde_json::to_string(&script).map_err(|e| e.to_string())?;

    repository::save_setting(&conn, &format!("automation_script_{}", script.id), &script_json)
        .map_err(|e| e.to_string())?;

    Ok(script)
}

// ============================================================================
// Code Generation Commands
// ============================================================================

#[tauri::command]
pub fn automation_generate_code(
    script: AutomationScript,
    language: CodeLanguage,
) -> Result<GeneratedCode, String> {
    CodeGenerator::generate(&script, language).map_err(|e| e.to_string())
}
