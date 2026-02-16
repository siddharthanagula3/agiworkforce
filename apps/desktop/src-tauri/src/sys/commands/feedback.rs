use serde::{Deserialize, Serialize};

use tauri::command;

#[derive(Debug, Serialize, Deserialize)]
pub struct FeedbackPayload {
    pub subject: String,
    pub message: String,
    pub user_id: Option<String>,
    pub metadata: FeedbackMetadata,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FeedbackMetadata {
    pub platform: String,
    pub version: String,
    pub user_agent: String,
}

#[command]
pub async fn submit_feedback(
    subject: String,
    message: String,
    user_id: Option<String>,
    metadata: FeedbackMetadata,
) -> Result<(), String> {
    let supabase_url = std::env::var("VITE_SUPABASE_URL")
        .or_else(|_| std::env::var("SUPABASE_URL"))
        .unwrap_or_default();
    let supabase_key = std::env::var("VITE_SUPABASE_ANON_KEY")
        .or_else(|_| std::env::var("SUPABASE_ANON_KEY"))
        .unwrap_or_default();

    if supabase_url.is_empty() || supabase_key.is_empty() {
        return Err("Missing Supabase configuration".to_string());
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;
    let url = format!("{}/rest/v1/feedback", supabase_url);

    let payload = FeedbackPayload {
        subject,
        message,
        user_id,
        metadata,
    };

    let res = client
        .post(&url)
        .header("apikey", &supabase_key)
        .header("Authorization", format!("Bearer {}", supabase_key))
        .header("Content-Type", "application/json")
        .header("Prefer", "return=minimal")
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Failed to send request: {}", e))?;

    if !res.status().is_success() {
        let status = res.status();
        let text = res.text().await.unwrap_or_default();
        return Err(format!("Supabase error {}: {}", status, text));
    }

    Ok(())
}
