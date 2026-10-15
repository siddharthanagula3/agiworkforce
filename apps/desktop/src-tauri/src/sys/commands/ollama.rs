//! Ollama-specific Tauri commands.
//!
//! This module provides commands to:
//! - Check if Ollama is running locally
//! - Fetch the list of installed Ollama models
//! - Download a model with progress, and cancel a download
//! - See which models are in memory, load one, and unload one
//! - Choose how long Ollama keeps a model in memory after a chat request

use futures_util::StreamExt as _;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, OnceLock};
use std::time::{Duration, Instant};
use tauri::{Emitter, State};
use tokio::sync::Notify;

/// Represents an Ollama model with its metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OllamaModel {
    /// The provider-reported model name
    pub name: String,
    /// Size of the model in bytes
    pub size: u64,
    /// ISO 8601 timestamp of when the model was last modified
    pub modified_at: String,
    /// Model digest/hash
    #[serde(default)]
    pub digest: String,
    /// Additional model details
    #[serde(default)]
    pub details: OllamaModelDetails,
}

/// Detailed information about an Ollama model
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct OllamaModelDetails {
    /// Parameter size (e.g., "7B", "13B")
    #[serde(default)]
    pub parameter_size: String,
    /// Quantization level (e.g., "Q4_0", "Q8_0")
    #[serde(default)]
    pub quantization_level: String,
    /// Provider-reported model family
    #[serde(default)]
    pub family: String,
    /// Model families this model belongs to
    #[serde(default)]
    pub families: Vec<String>,
    /// Parent model name
    #[serde(default)]
    pub parent_model: String,
    /// Model format
    #[serde(default)]
    pub format: String,
}

/// Response from Ollama's /api/tags endpoint
#[derive(Debug, Clone, Serialize, Deserialize)]
struct OllamaTagsResponse {
    models: Vec<OllamaApiModel>,
}

/// Internal representation of a model from Ollama's API
#[derive(Debug, Clone, Serialize, Deserialize)]
struct OllamaApiModel {
    name: String,
    #[serde(default)]
    size: u64,
    #[serde(default)]
    modified_at: String,
    #[serde(default)]
    digest: String,
    #[serde(default)]
    details: Option<OllamaApiModelDetails>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct OllamaApiModelDetails {
    #[serde(default)]
    parameter_size: Option<String>,
    #[serde(default)]
    quantization_level: Option<String>,
    #[serde(default)]
    family: Option<String>,
    #[serde(default)]
    families: Option<Vec<String>>,
    #[serde(default)]
    parent_model: Option<String>,
    #[serde(default)]
    format: Option<String>,
}

use crate::core::llm::providers::local_endpoint::validate_local_runtime_url;
use crate::core::llm::providers::ollama::{
    configured_keep_alive_seconds, set_configured_keep_alive_seconds,
};
use crate::core::llm::OLLAMA_DEFAULT_BASE_URL;
use crate::data::settings::{
    delete_setting, get_setting, upsert_setting, SettingCategory, SettingValue,
};
use crate::sys::commands::chat::AppDatabase;

fn resolve_ollama_base_url(
    base_url: Option<String>,
    allow_private_network: Option<bool>,
) -> Result<String, String> {
    let candidate = base_url.as_deref().unwrap_or(OLLAMA_DEFAULT_BASE_URL);
    validate_local_runtime_url(candidate, "Ollama", allow_private_network.unwrap_or(false))
        .map(|(url, _)| url)
}

/// Check if Ollama server is running and accessible
///
/// # Returns
/// - `Ok(true)` if Ollama is running and responding
/// - `Ok(false)` if Ollama is not running or not accessible
#[tauri::command]
pub async fn ollama_check_status(
    base_url: Option<String>,
    allow_private_network: Option<bool>,
) -> Result<bool, String> {
    let base_url = resolve_ollama_base_url(base_url, allow_private_network)?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    match client
        .get(format!("{}/api/tags", base_url))
        .timeout(Duration::from_secs(3))
        .send()
        .await
    {
        Ok(response) => Ok(response.status().is_success()),
        Err(_) => Ok(false),
    }
}

/// Fetch the list of installed Ollama models
///
/// # Returns
/// - `Ok(Vec<OllamaModel>)` with the list of installed models
/// - `Err` if Ollama is not running or the request fails
#[tauri::command]
pub async fn ollama_list_models(
    base_url: Option<String>,
    allow_private_network: Option<bool>,
) -> Result<Vec<OllamaModel>, String> {
    let base_url = resolve_ollama_base_url(base_url, allow_private_network)?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let response = client
        .get(format!("{}/api/tags", base_url))
        .timeout(Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| {
            if e.is_connect() {
                "Ollama is not running. Start it with 'ollama serve' in your terminal.".to_string()
            } else if e.is_timeout() {
                "Connection to Ollama timed out. Please check if Ollama is running.".to_string()
            } else {
                format!("Failed to connect to Ollama: {}", e)
            }
        })?;

    if !response.status().is_success() {
        return Err(format!(
            "Ollama API returned error status: {}",
            response.status()
        ));
    }

    let tags_response: OllamaTagsResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse Ollama response: {}", e))?;

    let models = tags_response
        .models
        .into_iter()
        .map(|m| {
            let details = m.details.unwrap_or_default();
            OllamaModel {
                name: m.name,
                size: m.size,
                modified_at: m.modified_at,
                digest: m.digest,
                details: OllamaModelDetails {
                    parameter_size: details.parameter_size.unwrap_or_default(),
                    quantization_level: details.quantization_level.unwrap_or_default(),
                    family: details.family.unwrap_or_default(),
                    families: details.families.unwrap_or_default(),
                    parent_model: details.parent_model.unwrap_or_default(),
                    format: details.format.unwrap_or_default(),
                },
            }
        })
        .collect();

    Ok(models)
}

const PULL_CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const PULL_IDLE_TIMEOUT: Duration = Duration::from_secs(600);
const PULL_PROGRESS_INTERVAL: Duration = Duration::from_millis(250);
const PULL_SUCCESS_STATUS: &str = "success";

/// One line of Ollama's `/api/pull` stream, as the download UI shows it.
/// `total` and `completed` are bytes of the layer named by `digest`; Ollama
/// omits them for the steps that move no bytes.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct OllamaPullProgress {
    pub model: String,
    pub status: String,
    pub digest: Option<String>,
    pub total: Option<u64>,
    pub completed: Option<u64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum OllamaPullOutcome {
    Completed,
    Cancelled,
}

#[derive(Debug, Deserialize)]
struct OllamaPullLine {
    #[serde(default)]
    status: Option<String>,
    #[serde(default)]
    digest: Option<String>,
    #[serde(default)]
    total: Option<u64>,
    #[serde(default)]
    completed: Option<u64>,
    #[serde(default)]
    error: Option<String>,
}

#[derive(Debug, Deserialize)]
struct OllamaErrorBody {
    error: String,
}

static ACTIVE_PULLS: OnceLock<parking_lot::Mutex<HashMap<String, Arc<Notify>>>> = OnceLock::new();

fn active_pulls() -> &'static parking_lot::Mutex<HashMap<String, Arc<Notify>>> {
    ACTIVE_PULLS.get_or_init(Default::default)
}

struct PullRegistration {
    model: String,
}

impl Drop for PullRegistration {
    fn drop(&mut self) {
        active_pulls().lock().remove(&self.model);
    }
}

fn register_pull(model: &str) -> Result<(PullRegistration, Arc<Notify>), String> {
    let mut pulls = active_pulls().lock();
    if pulls.contains_key(model) {
        return Err(format!("'{model}' is already downloading"));
    }
    let cancel = Arc::new(Notify::new());
    pulls.insert(model.to_string(), cancel.clone());
    Ok((
        PullRegistration {
            model: model.to_string(),
        },
        cancel,
    ))
}

fn ollama_error_message(body: &str) -> String {
    serde_json::from_str::<OllamaErrorBody>(body)
        .map(|parsed| parsed.error)
        .unwrap_or_else(|_| body.trim().to_string())
}

fn parse_pull_line(model: &str, line: &str) -> Result<Option<OllamaPullProgress>, String> {
    let line = line.trim();
    if line.is_empty() {
        return Ok(None);
    }
    let Ok(parsed) = serde_json::from_str::<OllamaPullLine>(line) else {
        return Ok(None);
    };
    if let Some(error) = parsed.error {
        return Err(format!("Ollama could not download '{model}': {error}"));
    }
    Ok(parsed.status.map(|status| OllamaPullProgress {
        model: model.to_string(),
        status,
        digest: parsed.digest,
        total: parsed.total,
        completed: parsed.completed,
    }))
}

/// Takes every complete line out of `buffer`, reporting each one, and returns
/// whether Ollama announced that the pull finished.
fn drain_pull_lines(
    buffer: &mut Vec<u8>,
    model: &str,
    on_progress: &mut impl FnMut(OllamaPullProgress),
) -> Result<bool, String> {
    let mut succeeded = false;
    while let Some(newline) = buffer.iter().position(|byte| *byte == b'\n') {
        let line: Vec<u8> = buffer.drain(..=newline).collect();
        if let Some(progress) = parse_pull_line(model, &String::from_utf8_lossy(&line))? {
            succeeded |= progress.status == PULL_SUCCESS_STATUS;
            on_progress(progress);
        }
    }
    Ok(succeeded)
}

async fn follow_pull(
    response: reqwest::Response,
    model: &str,
    cancel: &Notify,
    mut on_progress: impl FnMut(OllamaPullProgress),
) -> Result<OllamaPullOutcome, String> {
    let mut stream = response.bytes_stream();
    let mut buffer: Vec<u8> = Vec::new();
    let mut succeeded = false;

    loop {
        let next = tokio::select! {
            _ = cancel.notified() => return Ok(OllamaPullOutcome::Cancelled),
            next = tokio::time::timeout(PULL_IDLE_TIMEOUT, stream.next()) => next,
        };
        let chunk = match next {
            Err(_) => {
                return Err(format!(
                    "Ollama sent no download progress for '{model}' for {} minutes. Try again; a download resumes where it stopped.",
                    PULL_IDLE_TIMEOUT.as_secs() / 60
                ));
            }
            Ok(None) => break,
            Ok(Some(Err(error))) => {
                return Err(format!(
                    "The download of '{model}' was interrupted: {error}. Try again; a download resumes where it stopped."
                ));
            }
            Ok(Some(Ok(chunk))) => chunk,
        };
        buffer.extend_from_slice(&chunk);
        succeeded |= drain_pull_lines(&mut buffer, model, &mut on_progress)?;
    }

    buffer.push(b'\n');
    succeeded |= drain_pull_lines(&mut buffer, model, &mut on_progress)?;

    if succeeded {
        Ok(OllamaPullOutcome::Completed)
    } else {
        Err(format!(
            "Ollama closed the download of '{model}' before it finished. Try again; a download resumes where it stopped."
        ))
    }
}

/// Download a model through Ollama, emitting `ollama:pull-progress` as it
/// goes.
///
/// Resolves with `completed` once Ollama reports success, or `cancelled` when
/// [`ollama_cancel_pull`] stopped it. Ollama keeps the layers already
/// downloaded, so pulling the same model again resumes.
#[tauri::command]
pub async fn ollama_pull_model(
    app: tauri::AppHandle,
    model_name: String,
    base_url: Option<String>,
    allow_private_network: Option<bool>,
) -> Result<OllamaPullOutcome, String> {
    let model_name = model_name.trim().to_string();
    if model_name.is_empty() {
        return Err("Model name cannot be empty".to_string());
    }
    let base_url = resolve_ollama_base_url(base_url, allow_private_network)?;
    let (_registration, cancel) = register_pull(&model_name)?;

    let client = reqwest::Client::builder()
        .connect_timeout(PULL_CONNECT_TIMEOUT)
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let request = client
        .post(format!("{}/api/pull", base_url))
        .json(&serde_json::json!({
            "model": model_name,
            "stream": true
        }))
        .send();
    let response = tokio::select! {
        _ = cancel.notified() => return Ok(OllamaPullOutcome::Cancelled),
        response = request => response.map_err(|e| format!("Failed to start the download: {}", e))?,
    };

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!(
            "Ollama could not download '{model_name}': {}",
            ollama_error_message(&error_text)
        ));
    }

    let mut last_emit: Option<(Instant, String)> = None;
    let outcome = follow_pull(response, &model_name, &cancel, |progress| {
        let due = last_emit.as_ref().is_none_or(|(at, status)| {
            *status != progress.status || at.elapsed() >= PULL_PROGRESS_INTERVAL
        });
        if due {
            last_emit = Some((Instant::now(), progress.status.clone()));
            if let Err(error) = app.emit("ollama:pull-progress", progress) {
                tracing::warn!("Failed to emit Ollama pull progress: {error}");
            }
        }
    })
    .await?;

    if outcome == OllamaPullOutcome::Completed {
        crate::core::llm::capability_detection::clear_capability_cache().await;
    }
    Ok(outcome)
}

/// Stop a download started by [`ollama_pull_model`]. Returns whether one was
/// running for that model.
#[tauri::command]
pub async fn ollama_cancel_pull(model_name: String) -> Result<bool, String> {
    let cancel = active_pulls().lock().get(model_name.trim()).cloned();
    match cancel {
        Some(cancel) => {
            cancel.notify_one();
            Ok(true)
        }
        None => Ok(false),
    }
}

const LOADED_MODELS_TIMEOUT: Duration = Duration::from_secs(10);
const UNLOAD_TIMEOUT: Duration = Duration::from_secs(60);
const LOAD_TIMEOUT: Duration = Duration::from_secs(600);

/// A model Ollama currently holds in memory, from `/api/ps`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct OllamaLoadedModel {
    pub name: String,
    /// Bytes the loaded model occupies in total.
    pub size: u64,
    /// Bytes of that total held on the GPU.
    pub size_vram: u64,
    /// When Ollama will unload it if it stays idle.
    pub expires_at: Option<String>,
    pub parameter_size: String,
    pub quantization_level: String,
}

#[derive(Debug, Deserialize)]
struct OllamaPsResponse {
    #[serde(default)]
    models: Vec<OllamaPsModel>,
}

#[derive(Debug, Deserialize)]
struct OllamaPsModel {
    name: String,
    #[serde(default)]
    size: u64,
    #[serde(default)]
    size_vram: u64,
    #[serde(default)]
    expires_at: Option<String>,
    #[serde(default)]
    details: Option<OllamaApiModelDetails>,
}

fn loaded_models_from(response: OllamaPsResponse) -> Vec<OllamaLoadedModel> {
    response
        .models
        .into_iter()
        .map(|model| {
            let details = model.details.unwrap_or_default();
            OllamaLoadedModel {
                name: model.name,
                size: model.size,
                size_vram: model.size_vram,
                expires_at: model.expires_at,
                parameter_size: details.parameter_size.unwrap_or_default(),
                quantization_level: details.quantization_level.unwrap_or_default(),
            }
        })
        .collect()
}

/// List the models Ollama currently holds in memory.
#[tauri::command]
pub async fn ollama_list_loaded_models(
    base_url: Option<String>,
    allow_private_network: Option<bool>,
) -> Result<Vec<OllamaLoadedModel>, String> {
    let base_url = resolve_ollama_base_url(base_url, allow_private_network)?;
    let client = reqwest::Client::builder()
        .timeout(LOADED_MODELS_TIMEOUT)
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let response = client
        .get(format!("{}/api/ps", base_url))
        .send()
        .await
        .map_err(|e| format!("Failed to reach Ollama: {}", e))?;

    if !response.status().is_success() {
        return Err(format!(
            "Ollama API returned error status: {}",
            response.status()
        ));
    }

    let parsed: OllamaPsResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse Ollama response: {}", e))?;
    Ok(loaded_models_from(parsed))
}

fn memory_request_body(model_name: &str, keep_alive_seconds: Option<i64>) -> serde_json::Value {
    let mut body = serde_json::json!({
        "model": model_name,
        "stream": false
    });
    if let (Some(seconds), Some(fields)) = (keep_alive_seconds, body.as_object_mut()) {
        fields.insert("keep_alive".to_string(), serde_json::json!(seconds));
    }
    body
}

/// Send Ollama a prompt-less `/api/generate`, which loads the model, or
/// unloads it when the body carries `keep_alive: 0`.
async fn post_memory_request(
    base_url: &str,
    body: serde_json::Value,
    timeout: Duration,
    action: &str,
) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .timeout(timeout)
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let response = client
        .post(format!("{}/api/generate", base_url))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Failed to {action} the model: {e}"))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!(
            "Failed to {action} the model: {}",
            ollama_error_message(&error_text)
        ));
    }
    Ok(())
}

/// The keep-alive an explicit load asks for. "Unload right after each reply"
/// is a zero keep-alive, which would undo the load as it finished, so a load
/// falls back to Ollama's default in that case.
fn load_keep_alive_seconds(configured: Option<i64>) -> Option<i64> {
    configured.filter(|seconds| *seconds != 0)
}

/// Load a model into memory ahead of the first message, for the keep-alive
/// chosen in Settings.
#[tauri::command]
pub async fn ollama_load_model(
    model_name: String,
    base_url: Option<String>,
    allow_private_network: Option<bool>,
) -> Result<(), String> {
    if model_name.trim().is_empty() {
        return Err("Model name cannot be empty".to_string());
    }
    let base_url = resolve_ollama_base_url(base_url, allow_private_network)?;
    post_memory_request(
        &base_url,
        memory_request_body(
            model_name.trim(),
            load_keep_alive_seconds(configured_keep_alive_seconds()),
        ),
        LOAD_TIMEOUT,
        "load",
    )
    .await
}

/// Unload a model from memory now. It loads again on the next message that
/// uses it.
#[tauri::command]
pub async fn ollama_unload_model(
    model_name: String,
    base_url: Option<String>,
    allow_private_network: Option<bool>,
) -> Result<(), String> {
    if model_name.trim().is_empty() {
        return Err("Model name cannot be empty".to_string());
    }
    let base_url = resolve_ollama_base_url(base_url, allow_private_network)?;
    post_memory_request(
        &base_url,
        memory_request_body(model_name.trim(), Some(0)),
        UNLOAD_TIMEOUT,
        "unload",
    )
    .await
}

const KEEP_ALIVE_SETTING_KEY: &str = "llm.ollama_keep_alive_seconds";
const KEEP_LOADED_SECONDS: i64 = -1;
const MAX_KEEP_ALIVE_SECONDS: i64 = 7 * 24 * 60 * 60;

fn validate_keep_alive(seconds: Option<i64>) -> Result<Option<i64>, String> {
    match seconds {
        None => Ok(None),
        Some(value)
            if value == KEEP_LOADED_SECONDS || (0..=MAX_KEEP_ALIVE_SECONDS).contains(&value) =>
        {
            Ok(Some(value))
        }
        Some(value) => Err(format!("Invalid keep-alive: {value} seconds")),
    }
}

/// Apply the keep-alive saved by an earlier run. An absent or unusable value
/// leaves Ollama's own default in force.
pub fn restore_keep_alive(conn: &rusqlite::Connection) {
    let stored = get_setting(conn, KEEP_ALIVE_SETTING_KEY)
        .ok()
        .and_then(|setting| setting.get_value().ok())
        .and_then(|value| value.as_integer());
    if let Ok(seconds) = validate_keep_alive(stored) {
        set_configured_keep_alive_seconds(seconds);
    }
}

/// The keep-alive sent with chat requests, in seconds, or `None` when Ollama
/// decides.
#[tauri::command]
pub async fn ollama_get_keep_alive() -> Result<Option<i64>, String> {
    Ok(configured_keep_alive_seconds())
}

/// Choose how long Ollama keeps a model in memory after a chat request and
/// save the choice. `None` hands the decision back to Ollama.
#[tauri::command]
pub async fn ollama_set_keep_alive(
    keep_alive_seconds: Option<i64>,
    db: State<'_, AppDatabase>,
) -> Result<Option<i64>, String> {
    let seconds = validate_keep_alive(keep_alive_seconds)?;
    {
        let conn = db.connection()?;
        match seconds {
            Some(value) => upsert_setting(
                &conn,
                KEEP_ALIVE_SETTING_KEY.to_string(),
                SettingValue::Integer(value),
                SettingCategory::Llm,
                false,
            )
            .map_err(|e| format!("Failed to save the keep-alive: {e}"))?,
            None => {
                delete_setting(&conn, KEEP_ALIVE_SETTING_KEY)
                    .map_err(|e| format!("Failed to clear the keep-alive: {e}"))?;
            }
        }
    }
    set_configured_keep_alive_seconds(seconds);
    Ok(seconds)
}

/// Delete an Ollama model
///
/// # Arguments
/// * `model_name` - The name of the model to delete
///
/// # Returns
/// - `Ok(())` if the model was deleted
/// - `Err` if the deletion fails
#[tauri::command]
pub async fn ollama_delete_model(
    model_name: String,
    base_url: Option<String>,
    allow_private_network: Option<bool>,
) -> Result<(), String> {
    if model_name.trim().is_empty() {
        return Err("Model name cannot be empty".to_string());
    }
    let base_url = resolve_ollama_base_url(base_url, allow_private_network)?;

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let response = client
        .delete(format!("{}/api/delete", base_url))
        .json(&serde_json::json!({
            "name": model_name
        }))
        .timeout(Duration::from_secs(30))
        .send()
        .await
        .map_err(|e| format!("Failed to delete model: {}", e))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!(
            "Failed to delete model: {}",
            ollama_error_message(&error_text)
        ));
    }

    crate::core::llm::capability_detection::clear_capability_cache().await;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_ollama_check_status_when_not_running() {
        // A running local Ollama returns true; an absent one returns false.
        // Either way the command must not turn connection refusal into an error.
        let result = ollama_check_status(None, None).await;
        assert!(result.is_ok());
    }

    #[test]
    fn resolves_configured_ollama_url_without_trailing_slash() {
        let url =
            resolve_ollama_base_url(Some("http://192.168.1.20:11434/".to_string()), Some(true))
                .unwrap();
        assert_eq!(url, "http://192.168.1.20:11434");
    }

    #[test]
    fn refuses_ollama_urls_outside_the_local_boundary() {
        assert!(
            resolve_ollama_base_url(Some("http://192.168.1.20:11434".to_string()), None).is_err()
        );
        assert!(resolve_ollama_base_url(
            Some("https://ollama.example.com".to_string()),
            Some(true)
        )
        .is_err());
        assert_eq!(
            resolve_ollama_base_url(None, None).unwrap(),
            OLLAMA_DEFAULT_BASE_URL
        );
    }

    #[test]
    fn rejects_ollama_urls_with_embedded_credentials() {
        let result =
            resolve_ollama_base_url(Some("http://user:secret@localhost:11434".to_string()), None);
        assert_eq!(
            result.unwrap_err(),
            "Ollama URL must not contain credentials"
        );
    }

    fn collect_pull_lines(input: &str) -> (Result<bool, String>, Vec<OllamaPullProgress>, Vec<u8>) {
        let mut buffer = input.as_bytes().to_vec();
        let mut seen = Vec::new();
        let outcome = drain_pull_lines(&mut buffer, "fixture-model", &mut |progress| {
            seen.push(progress)
        });
        (outcome, seen, buffer)
    }

    #[test]
    fn pull_progress_carries_layer_bytes() {
        let (outcome, seen, rest) = collect_pull_lines(
            "{\"status\":\"pulling manifest\"}\n{\"status\":\"pulling abc\",\"digest\":\"abc\",\"total\":100,\"completed\":25}\n",
        );

        assert_eq!(outcome, Ok(false));
        assert!(rest.is_empty());
        assert_eq!(seen.len(), 2);
        assert_eq!(seen[0].status, "pulling manifest");
        assert_eq!(seen[0].total, None);
        assert_eq!(seen[1].digest.as_deref(), Some("abc"));
        assert_eq!(seen[1].total, Some(100));
        assert_eq!(seen[1].completed, Some(25));
    }

    #[test]
    fn a_line_split_across_chunks_waits_for_its_end() {
        let (outcome, seen, rest) = collect_pull_lines("{\"status\":\"pulling manif");

        assert_eq!(outcome, Ok(false));
        assert!(seen.is_empty());
        assert_eq!(rest, b"{\"status\":\"pulling manif".to_vec());
    }

    #[test]
    fn the_success_line_finishes_the_pull() {
        let (outcome, seen, _) =
            collect_pull_lines("{\"status\":\"writing manifest\"}\n{\"status\":\"success\"}\n");

        assert_eq!(outcome, Ok(true));
        assert_eq!(seen.len(), 2);
    }

    #[test]
    fn an_error_line_fails_the_pull_with_ollamas_reason() {
        let (outcome, _, _) =
            collect_pull_lines("{\"error\":\"pull model manifest: file does not exist\"}\n");

        let error = outcome.expect_err("an error line must fail the pull");
        assert!(error.contains("fixture-model"));
        assert!(error.contains("file does not exist"));
    }

    #[test]
    fn a_second_pull_of_the_same_model_is_refused_until_the_first_ends() {
        let model = "fixture-registry-model";
        let (registration, _cancel) = register_pull(model).expect("first pull");
        assert!(register_pull(model).is_err());

        drop(registration);
        assert!(register_pull(model).is_ok());
    }

    #[tokio::test]
    async fn cancelling_reports_whether_a_pull_was_running() {
        let model = "fixture-cancel-model";
        assert_eq!(ollama_cancel_pull(model.to_string()).await, Ok(false));

        let (_registration, cancel) = register_pull(model).expect("pull");
        assert_eq!(ollama_cancel_pull(model.to_string()).await, Ok(true));
        tokio::time::timeout(Duration::from_secs(1), cancel.notified())
            .await
            .expect("the running pull is told to stop");
    }

    #[test]
    fn ollama_error_bodies_are_reduced_to_their_message() {
        assert_eq!(
            ollama_error_message("{\"error\":\"model not found\"}"),
            "model not found"
        );
        assert_eq!(ollama_error_message(" plain failure \n"), "plain failure");
    }

    #[test]
    fn loaded_models_keep_memory_and_expiry() {
        let parsed: OllamaPsResponse = serde_json::from_str(
            "{\"models\":[{\"name\":\"fixture:latest\",\"size\":5137025024,\"size_vram\":4000000000,\"expires_at\":\"2026-06-04T14:38:31Z\",\"details\":{\"parameter_size\":\"7.2B\",\"quantization_level\":\"Q4_0\"}}]}",
        )
        .unwrap();

        assert_eq!(
            loaded_models_from(parsed),
            vec![OllamaLoadedModel {
                name: "fixture:latest".to_string(),
                size: 5_137_025_024,
                size_vram: 4_000_000_000,
                expires_at: Some("2026-06-04T14:38:31Z".to_string()),
                parameter_size: "7.2B".to_string(),
                quantization_level: "Q4_0".to_string(),
            }]
        );
    }

    #[test]
    fn nothing_loaded_is_an_empty_list() {
        let parsed: OllamaPsResponse = serde_json::from_str("{\"models\":[]}").unwrap();
        assert!(loaded_models_from(parsed).is_empty());
    }

    #[test]
    fn unloading_sends_a_zero_keep_alive_and_loading_sends_the_chosen_one() {
        assert_eq!(
            memory_request_body("fixture:latest", Some(0)),
            serde_json::json!({ "model": "fixture:latest", "stream": false, "keep_alive": 0 })
        );
        assert_eq!(
            memory_request_body("fixture:latest", Some(1800)),
            serde_json::json!({ "model": "fixture:latest", "stream": false, "keep_alive": 1800 })
        );
        assert_eq!(
            memory_request_body("fixture:latest", None),
            serde_json::json!({ "model": "fixture:latest", "stream": false })
        );
    }

    #[test]
    fn an_explicit_load_is_not_undone_by_a_zero_keep_alive() {
        assert_eq!(load_keep_alive_seconds(Some(0)), None);
        assert_eq!(load_keep_alive_seconds(Some(900)), Some(900));
        assert_eq!(load_keep_alive_seconds(Some(-1)), Some(-1));
        assert_eq!(load_keep_alive_seconds(None), None);
    }

    #[test]
    fn keep_alive_accepts_the_documented_range_only() {
        assert_eq!(validate_keep_alive(None), Ok(None));
        assert_eq!(validate_keep_alive(Some(0)), Ok(Some(0)));
        assert_eq!(validate_keep_alive(Some(-1)), Ok(Some(-1)));
        assert_eq!(validate_keep_alive(Some(3600)), Ok(Some(3600)));
        assert!(validate_keep_alive(Some(-2)).is_err());
        assert!(validate_keep_alive(Some(MAX_KEEP_ALIVE_SECONDS + 1)).is_err());
    }

    #[test]
    fn test_ollama_model_serialization() {
        let model = OllamaModel {
            name: "fixture-local-model:current".to_string(),
            size: 4_000_000_000,
            modified_at: "2024-01-15T10:30:00Z".to_string(),
            digest: "abc123".to_string(),
            details: OllamaModelDetails {
                parameter_size: "7B".to_string(),
                quantization_level: "Q4_0".to_string(),
                family: "fixture-family".to_string(),
                families: vec!["fixture-family".to_string()],
                parent_model: String::new(),
                format: "gguf".to_string(),
            },
        };

        let json = serde_json::to_string(&model).unwrap();
        assert!(json.contains("fixture-local-model:current"));
        assert!(json.contains("7B"));
    }
}
