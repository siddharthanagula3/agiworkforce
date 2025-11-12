use serde::{Deserialize, Serialize};
use tauri::State;

use crate::db::AppDatabase;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OnboardingStep {
    pub id: i64,
    pub step_id: String,
    pub step_name: String,
    pub completed: bool,
    pub skipped: bool,
    pub completed_at: Option<i64>,
    pub data: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OnboardingStatus {
    pub completed: bool,
    pub progress_percent: f64,
    pub total_steps: usize,
    pub completed_steps: usize,
    pub steps: Vec<OnboardingStep>,
}

/// Get onboarding status
#[tauri::command]
pub async fn get_onboarding_status(db: State<'_, AppDatabase>) -> Result<OnboardingStatus, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, step_id, step_name, completed, skipped, completed_at, data, created_at, updated_at
             FROM onboarding_progress
             ORDER BY id",
        )
        .map_err(|e| format!("Failed to prepare statement: {}", e))?;

    let steps: Vec<OnboardingStep> = stmt
        .query_map([], |row| {
            Ok(OnboardingStep {
                id: row.get(0)?,
                step_id: row.get(1)?,
                step_name: row.get(2)?,
                completed: row.get::<_, i32>(3)? == 1,
                skipped: row.get::<_, i32>(4)? == 1,
                completed_at: row.get(5)?,
                data: row.get(6)?,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
            })
        })
        .map_err(|e| format!("Failed to query onboarding progress: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect onboarding steps: {}", e))?;

    let total_steps = steps.len();
    let completed_steps = steps.iter().filter(|s| s.completed || s.skipped).count();
    let progress_percent = if total_steps > 0 {
        (completed_steps as f64 / total_steps as f64) * 100.0
    } else {
        0.0
    };
    let completed = completed_steps == total_steps;

    Ok(OnboardingStatus {
        completed,
        progress_percent,
        total_steps,
        completed_steps,
        steps,
    })
}

/// Complete an onboarding step
#[tauri::command]
pub async fn complete_onboarding_step(
    db: State<'_, AppDatabase>,
    step_id: String,
    data: Option<String>,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let now = chrono::Utc::now().timestamp();

    conn.execute(
        "UPDATE onboarding_progress
         SET completed = 1, completed_at = ?1, data = ?2, updated_at = ?1
         WHERE step_id = ?3",
        [&now.to_string(), &data.unwrap_or_default(), &step_id],
    )
    .map_err(|e| format!("Failed to complete onboarding step: {}", e))?;

    Ok(())
}

/// Skip an onboarding step
#[tauri::command]
pub async fn skip_onboarding_step(
    db: State<'_, AppDatabase>,
    step_id: String,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let now = chrono::Utc::now().timestamp();

    conn.execute(
        "UPDATE onboarding_progress
         SET skipped = 1, updated_at = ?1
         WHERE step_id = ?2",
        [&now.to_string(), &step_id],
    )
    .map_err(|e| format!("Failed to skip onboarding step: {}", e))?;

    Ok(())
}

/// Reset onboarding progress
#[tauri::command]
pub async fn reset_onboarding(db: State<'_, AppDatabase>) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let now = chrono::Utc::now().timestamp();

    conn.execute(
        "UPDATE onboarding_progress
         SET completed = 0, skipped = 0, completed_at = NULL, data = NULL, updated_at = ?1",
        [&now.to_string()],
    )
    .map_err(|e| format!("Failed to reset onboarding: {}", e))?;

    Ok(())
}

/// Export user data (for GDPR compliance)
#[tauri::command]
pub async fn export_user_data(db: State<'_, AppDatabase>) -> Result<String, String> {
    use serde_json::json;

    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    // Export conversations
    let mut stmt = conn
        .prepare("SELECT id, title, created_at, updated_at FROM conversations")
        .map_err(|e| format!("Failed to prepare conversations query: {}", e))?;

    let conversations: Vec<serde_json::Value> = stmt
        .query_map([], |row| {
            Ok(json!({
                "id": row.get::<_, i64>(0)?,
                "title": row.get::<_, String>(1)?,
                "created_at": row.get::<_, String>(2)?,
                "updated_at": row.get::<_, String>(3)?,
            }))
        })
        .map_err(|e| format!("Failed to query conversations: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect conversations: {}", e))?;

    // Export messages
    let mut stmt = conn
        .prepare("SELECT id, conversation_id, role, content, created_at FROM messages")
        .map_err(|e| format!("Failed to prepare messages query: {}", e))?;

    let messages: Vec<serde_json::Value> = stmt
        .query_map([], |row| {
            Ok(json!({
                "id": row.get::<_, i64>(0)?,
                "conversation_id": row.get::<_, i64>(1)?,
                "role": row.get::<_, String>(2)?,
                "content": row.get::<_, String>(3)?,
                "created_at": row.get::<_, String>(4)?,
            }))
        })
        .map_err(|e| format!("Failed to query messages: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect messages: {}", e))?;

    // Export settings (non-encrypted only)
    let mut stmt = conn
        .prepare("SELECT key, value FROM settings_v2 WHERE encrypted = 0")
        .map_err(|e| format!("Failed to prepare settings query: {}", e))?;

    let settings: Vec<serde_json::Value> = stmt
        .query_map([], |row| {
            Ok(json!({
                "key": row.get::<_, String>(0)?,
                "value": row.get::<_, String>(1)?,
            }))
        })
        .map_err(|e| format!("Failed to query settings: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect settings: {}", e))?;

    // Combine into final export
    let export_data = json!({
        "export_date": chrono::Utc::now().to_rfc3339(),
        "version": "1.0",
        "conversations": conversations,
        "messages": messages,
        "settings": settings,
    });

    serde_json::to_string_pretty(&export_data)
        .map_err(|e| format!("Failed to serialize export: {}", e))
}

/// Check if app is online
#[tauri::command]
pub async fn check_connectivity() -> Result<bool, String> {
    // Simple connectivity check - try to resolve DNS
    match tokio::net::lookup_host("www.google.com:80").await {
        Ok(mut addrs) => Ok(addrs.next().is_some()),
        Err(_) => Ok(false),
    }
}

/// Get current session info
#[tauri::command]
pub async fn get_session_info(db: State<'_, AppDatabase>) -> Result<serde_json::Value, String> {
    use serde_json::json;

    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    // Get most recent session
    let result = conn.query_row(
        "SELECT id, started_at, last_activity, idle_timeout_minutes, auto_lock_enabled, locked_at
         FROM user_sessions
         ORDER BY last_activity DESC
         LIMIT 1",
        [],
        |row| {
            Ok(json!({
                "id": row.get::<_, String>(0)?,
                "started_at": row.get::<_, i64>(1)?,
                "last_activity": row.get::<_, i64>(2)?,
                "idle_timeout_minutes": row.get::<_, i64>(3)?,
                "auto_lock_enabled": row.get::<_, i32>(4)? == 1,
                "locked_at": row.get::<_, Option<i64>>(5)?,
            }))
        },
    );

    match result {
        Ok(session) => Ok(session),
        Err(rusqlite::Error::QueryReturnedNoRows) => {
            // No session exists, create one
            let session_id = uuid::Uuid::new_v4().to_string();
            let now = chrono::Utc::now().timestamp();

            conn.execute(
                "INSERT INTO user_sessions (id, started_at, last_activity, created_at, updated_at)
                 VALUES (?1, ?2, ?2, ?2, ?2)",
                [&session_id, &now.to_string()],
            )
            .map_err(|e| format!("Failed to create session: {}", e))?;

            Ok(json!({
                "id": session_id,
                "started_at": now,
                "last_activity": now,
                "idle_timeout_minutes": 30,
                "auto_lock_enabled": false,
                "locked_at": null,
            }))
        }
        Err(e) => Err(format!("Failed to get session info: {}", e)),
    }
}

/// Update session activity
#[tauri::command]
pub async fn update_session_activity(
    db: State<'_, AppDatabase>,
    session_id: String,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let now = chrono::Utc::now().timestamp();

    conn.execute(
        "UPDATE user_sessions
         SET last_activity = ?1, updated_at = ?1
         WHERE id = ?2",
        [&now.to_string(), &session_id],
    )
    .map_err(|e| format!("Failed to update session activity: {}", e))?;

    Ok(())
}
