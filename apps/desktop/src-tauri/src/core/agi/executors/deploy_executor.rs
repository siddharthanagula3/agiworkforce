//! Deploy operations executor.
//!
//! Provides agent-facing deployment tools that wrap Vercel MCP and track
//! deployments in the local database.
//!
//! # Supported Operations
//!
//! - `deploy_project`: Deploy a project to Vercel with automatic preset detection
//! - `deploy_status`: Check the status of a deployment
//! - `deploy_list`: List past deployments, optionally filtered by project

use super::{ExecutorContext, ToolExecutor};
use crate::core::agi::ExecutionContext;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::Path;
use uuid::Uuid;

/// A record of a deployment stored in the local database.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeploymentRecord {
    pub id: String,
    pub provider: String,
    pub project_name: String,
    pub deployment_url: Option<String>,
    pub status: String,
    pub preset: Option<String>,
    pub source_path: Option<String>,
    pub error: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// Executor for deploy operations via Vercel MCP.
///
/// Wraps the Vercel MCP deploy tool with preset auto-detection and
/// local deployment tracking in SQLite.
pub struct DeployExecutor;

impl DeployExecutor {
    /// Create a new deploy executor.
    #[must_use]
    pub fn new() -> Self {
        Self
    }
}

impl Default for DeployExecutor {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl ToolExecutor for DeployExecutor {
    fn tool_names(&self) -> Vec<&'static str> {
        vec!["deploy_project", "deploy_status", "deploy_list"]
    }

    fn description(&self) -> &'static str {
        "Deploy operations executor for Vercel via MCP"
    }

    async fn execute(
        &self,
        tool_name: &str,
        parameters: &HashMap<String, Value>,
        context: &ExecutorContext,
        _execution_context: &ExecutionContext,
    ) -> Result<Value> {
        match tool_name {
            "deploy_project" => execute_deploy_project(context, parameters).await,
            "deploy_status" => execute_deploy_status(context, parameters).await,
            "deploy_list" => execute_deploy_list(context, parameters).await,
            _ => Err(anyhow!("Unknown deploy tool: {}", tool_name)),
        }
    }
}

/// Auto-detect the framework preset by inspecting the source directory.
///
/// Detection order:
/// 1. `next.config.js` / `next.config.mjs` / `next.config.ts` -> "nextjs"
/// 2. `index.html` in root -> "static"
/// 3. `package.json` exists -> "spa" (default for Node projects)
/// 4. Otherwise -> None
fn detect_preset(source_path: &str) -> Option<String> {
    let root = Path::new(source_path);

    // Check for Next.js
    for name in &[
        "next.config.js",
        "next.config.mjs",
        "next.config.ts",
    ] {
        if root.join(name).exists() {
            return Some("nextjs".to_string());
        }
    }

    // Check for static site (index.html in root)
    if root.join("index.html").exists() {
        return Some("static".to_string());
    }

    // Check for generic Node/SPA project
    if root.join("package.json").exists() {
        return Some("spa".to_string());
    }

    None
}

/// Deploy a project via Vercel MCP and record it in the local database.
///
/// # Parameters
///
/// - `source_path` (required): Path to the project directory
/// - `project_name` (required): Name for the Vercel project
/// - `preset` (optional): Framework preset; auto-detected if omitted
/// - `env_vars` (optional): JSON object of environment variable key-value pairs
async fn execute_deploy_project(
    context: &ExecutorContext,
    parameters: &HashMap<String, Value>,
) -> Result<Value> {
    let source_path = parameters
        .get("source_path")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("Missing 'source_path' parameter"))?;
    let project_name = parameters
        .get("project_name")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("Missing 'project_name' parameter"))?;
    let preset_param = parameters
        .get("preset")
        .and_then(|v| v.as_str())
        .map(String::from);
    let env_vars = parameters.get("env_vars").cloned();

    // Validate source path exists
    let source = Path::new(source_path);
    if !source.exists() {
        return Err(anyhow!(
            "Source path not found: '{}'. Please check the path and try again.",
            source_path
        ));
    }
    if !source.is_dir() {
        return Err(anyhow!(
            "'{}' is not a directory. deploy_project requires a project directory.",
            source_path
        ));
    }

    // Auto-detect preset if not specified
    let preset = preset_param.or_else(|| detect_preset(source_path));

    let deployment_id = Uuid::new_v4().to_string();

    tracing::info!(
        "[DeployExecutor] Starting deployment: project={}, source={}, preset={:?}",
        project_name,
        source_path,
        preset
    );

    context.emit_progress(
        &format!("Deploying {} to Vercel...", project_name),
        Some(0.1),
    );

    // Insert pending deployment record
    let Some(ref app) = context.app_handle else {
        return Err(anyhow!(
            "Cannot deploy right now — no app handle available. Please try again later."
        ));
    };

    use tauri::Manager;

    let db_state = app.state::<crate::sys::commands::AppDatabase>();

    // Insert pending deployment record in a scoped block to drop the guard before await
    {
        let conn = db_state
            .conn
            .lock()
            .map_err(|e| anyhow!("Database lock failed: {}", e))?;

        conn.execute(
            "INSERT INTO deployments (id, provider, project_name, status, preset, source_path, created_at, updated_at)
             VALUES (?1, 'vercel', ?2, 'pending', ?3, ?4, datetime('now'), datetime('now'))",
            rusqlite::params![&deployment_id, project_name, &preset, source_path],
        )
        .map_err(|e| anyhow!("Failed to record deployment: {}", e))?;
    }

    context.emit_progress("Calling Vercel MCP deploy...", Some(0.3));

    // Try to call Vercel MCP via the MCP client
    let deploy_result = call_vercel_mcp_deploy(
        app,
        source_path,
        project_name,
        preset.as_deref(),
        env_vars.as_ref(),
    )
    .await;

    // Update deployment record based on result
    let conn = db_state
        .conn
        .lock()
        .map_err(|e| anyhow!("Database lock failed: {}", e))?;

    match deploy_result {
        Ok(deployment_url) => {
            conn.execute(
                "UPDATE deployments SET status = 'deployed', deployment_url = ?1, updated_at = datetime('now') WHERE id = ?2",
                rusqlite::params![&deployment_url, &deployment_id],
            )
            .map_err(|e| anyhow!("Failed to update deployment: {}", e))?;

            tracing::info!(
                "[DeployExecutor] Deployment successful: id={}, url={}",
                deployment_id,
                deployment_url
            );

            Ok(json!({
                "success": true,
                "deployment_id": deployment_id,
                "project_name": project_name,
                "deployment_url": deployment_url,
                "preset": preset,
                "status": "deployed"
            }))
        }
        Err(e) => {
            let error_msg = e.to_string();
            conn.execute(
                "UPDATE deployments SET status = 'failed', error = ?1, updated_at = datetime('now') WHERE id = ?2",
                rusqlite::params![&error_msg, &deployment_id],
            )
            .map_err(|e| anyhow!("Failed to update deployment: {}", e))?;

            tracing::warn!(
                "[DeployExecutor] Deployment failed: id={}, error={}",
                deployment_id,
                error_msg
            );

            Ok(json!({
                "success": false,
                "deployment_id": deployment_id,
                "project_name": project_name,
                "preset": preset,
                "status": "failed",
                "error": error_msg
            }))
        }
    }
}

/// Call Vercel MCP deploy tool through the MCP client.
async fn call_vercel_mcp_deploy(
    app: &tauri::AppHandle,
    source_path: &str,
    project_name: &str,
    preset: Option<&str>,
    env_vars: Option<&Value>,
) -> Result<String> {
    use tauri::Manager;

    let mcp_state = app.try_state::<crate::sys::commands::McpState>();
    let mcp_state = mcp_state.ok_or_else(|| anyhow!("MCP state not available"))?;

    let mut params = serde_json::Map::new();
    params.insert("path".to_string(), json!(source_path));
    params.insert("project_name".to_string(), json!(project_name));
    if let Some(p) = preset {
        params.insert("preset".to_string(), json!(p));
    }
    if let Some(env) = env_vars {
        params.insert("env_vars".to_string(), env.clone());
    }

    let result = mcp_state
        .client
        .call_tool("vercel", "deploy_to_vercel", Value::Object(params))
        .await
        .map_err(|e| anyhow!("Vercel MCP deploy call failed: {}", e))?;

    // Try to extract deployment URL from MCP result
    let url = result
        .get("url")
        .or_else(|| result.get("deployment_url"))
        .and_then(|v| v.as_str())
        .map(String::from)
        .unwrap_or_else(|| format!("https://{}.vercel.app", project_name));

    Ok(url)
}

/// Query deployment status from the local database.
///
/// # Parameters
///
/// - `deployment_id` (required): The ID of the deployment to check
async fn execute_deploy_status(
    context: &ExecutorContext,
    parameters: &HashMap<String, Value>,
) -> Result<Value> {
    let deployment_id = parameters
        .get("deployment_id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("Missing 'deployment_id' parameter"))?;

    let Some(ref app) = context.app_handle else {
        return Err(anyhow!(
            "Cannot check deployment status right now. Please try again later."
        ));
    };

    use tauri::Manager;

    let db_state = app.state::<crate::sys::commands::AppDatabase>();
    let conn = db_state
        .conn
        .lock()
        .map_err(|e| anyhow!("Database lock failed: {}", e))?;

    let mut stmt = conn
        .prepare(
            "SELECT id, provider, project_name, deployment_url, status, preset, source_path, error, created_at, updated_at
             FROM deployments WHERE id = ?1",
        )
        .map_err(|e| anyhow!("Failed to prepare query: {}", e))?;

    let record = stmt
        .query_row(rusqlite::params![deployment_id], |row| {
            Ok(DeploymentRecord {
                id: row.get(0)?,
                provider: row.get(1)?,
                project_name: row.get(2)?,
                deployment_url: row.get(3)?,
                status: row.get(4)?,
                preset: row.get(5)?,
                source_path: row.get(6)?,
                error: row.get(7)?,
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
            })
        })
        .map_err(|e| anyhow!("Deployment not found: {}", e))?;

    Ok(json!({
        "deployment_id": record.id,
        "provider": record.provider,
        "project_name": record.project_name,
        "deployment_url": record.deployment_url,
        "status": record.status,
        "preset": record.preset,
        "source_path": record.source_path,
        "error": record.error,
        "created_at": record.created_at,
        "updated_at": record.updated_at
    }))
}

/// List deployments from the local database with optional filtering.
///
/// # Parameters
///
/// - `project_name` (optional): Filter by project name
/// - `limit` (optional): Maximum number of results (default: 20)
async fn execute_deploy_list(
    context: &ExecutorContext,
    parameters: &HashMap<String, Value>,
) -> Result<Value> {
    let project_name = parameters
        .get("project_name")
        .and_then(|v| v.as_str())
        .map(String::from);
    let limit = parameters
        .get("limit")
        .and_then(|v| v.as_i64())
        .unwrap_or(20)
        .min(100);

    let Some(ref app) = context.app_handle else {
        return Err(anyhow!(
            "Cannot list deployments right now. Please try again later."
        ));
    };

    use tauri::Manager;

    let db_state = app.state::<crate::sys::commands::AppDatabase>();
    let conn = db_state
        .conn
        .lock()
        .map_err(|e| anyhow!("Database lock failed: {}", e))?;

    let records = if let Some(ref name) = project_name {
        let mut stmt = conn
            .prepare(
                "SELECT id, provider, project_name, deployment_url, status, preset, source_path, error, created_at, updated_at
                 FROM deployments WHERE project_name = ?1 ORDER BY created_at DESC LIMIT ?2",
            )
            .map_err(|e| anyhow!("Failed to prepare query: {}", e))?;

        let rows = stmt
            .query_map(rusqlite::params![name, limit], |row| {
                Ok(DeploymentRecord {
                    id: row.get(0)?,
                    provider: row.get(1)?,
                    project_name: row.get(2)?,
                    deployment_url: row.get(3)?,
                    status: row.get(4)?,
                    preset: row.get(5)?,
                    source_path: row.get(6)?,
                    error: row.get(7)?,
                    created_at: row.get(8)?,
                    updated_at: row.get(9)?,
                })
            })
            .map_err(|e| anyhow!("Query failed: {}", e))?
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(|e| anyhow!("Failed to collect results: {}", e))?;
        rows
    } else {
        let mut stmt = conn
            .prepare(
                "SELECT id, provider, project_name, deployment_url, status, preset, source_path, error, created_at, updated_at
                 FROM deployments ORDER BY created_at DESC LIMIT ?1",
            )
            .map_err(|e| anyhow!("Failed to prepare query: {}", e))?;

        let rows = stmt
            .query_map(rusqlite::params![limit], |row| {
                Ok(DeploymentRecord {
                    id: row.get(0)?,
                    provider: row.get(1)?,
                    project_name: row.get(2)?,
                    deployment_url: row.get(3)?,
                    status: row.get(4)?,
                    preset: row.get(5)?,
                    source_path: row.get(6)?,
                    error: row.get(7)?,
                    created_at: row.get(8)?,
                    updated_at: row.get(9)?,
                })
            })
            .map_err(|e| anyhow!("Query failed: {}", e))?
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(|e| anyhow!("Failed to collect results: {}", e))?;
        rows
    };

    let count = records.len();
    let records_json = serde_json::to_value(&records)
        .map_err(|e| anyhow!("Failed to serialize deployments: {}", e))?;

    Ok(json!({
        "success": true,
        "count": count,
        "project_name": project_name,
        "deployments": records_json
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_deploy_executor_tool_names() {
        let executor = DeployExecutor::new();
        let names = executor.tool_names();

        assert!(names.contains(&"deploy_project"));
        assert!(names.contains(&"deploy_status"));
        assert!(names.contains(&"deploy_list"));
        assert_eq!(names.len(), 3);
    }

    #[test]
    fn test_deploy_executor_description() {
        let executor = DeployExecutor::new();
        let description = executor.description();
        assert!(!description.is_empty());
        assert!(description.contains("Deploy"));
    }

    #[test]
    fn test_detect_preset_none() {
        let dir = std::env::temp_dir().join("deploy_test_empty");
        let _ = std::fs::create_dir_all(&dir);
        let result = detect_preset(&dir.to_string_lossy());
        assert!(result.is_none());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
