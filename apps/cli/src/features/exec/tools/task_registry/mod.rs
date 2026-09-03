use std::collections::HashMap;
use std::sync::OnceLock;

use anyhow::Result;

use super::common::print_tool_status;
use super::ToolResult;

// ---------------------------------------------------------------------------
// Privacy guard for the advisor tool (M24)
//
// The advisor tool always calls a CLOUD model. When the active session is in
// Local privacy mode no context must leave the device, so the advisor must be
// blocked before it reaches `consult()`.
//
// The requesting session's trust mode is carried in `ToolExecOptions`. Never
// recover it from process-global state: the app-server hosts independent
// workspace sessions concurrently.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// M18: Session-scoped team / cron registry
// ---------------------------------------------------------------------------

#[derive(Clone, serde::Serialize, serde::Deserialize)]
struct SessionTeam {
    name: String,
    members: Vec<String>,
    created_at: String,
}

#[derive(Clone, serde::Serialize, serde::Deserialize)]
struct SessionCron {
    id: String,
    name: String,
    schedule: String,
    prompt: String,
    enabled: bool,
    created_at: String,
}

struct SessionRegistry {
    teams: std::sync::RwLock<std::collections::HashMap<String, SessionTeam>>,
    crons: std::sync::RwLock<std::collections::HashMap<String, SessionCron>>,
}

impl SessionRegistry {
    fn new() -> Self {
        Self {
            teams: std::sync::RwLock::new(std::collections::HashMap::new()),
            crons: std::sync::RwLock::new(std::collections::HashMap::new()),
        }
    }
}

static SESSION_REGISTRY: OnceLock<SessionRegistry> = OnceLock::new();

fn session_registry() -> &'static SessionRegistry {
    SESSION_REGISTRY.get_or_init(SessionRegistry::new)
}

fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339()
}

fn new_uuid() -> String {
    uuid::Uuid::new_v4().to_string()
}

pub(super) async fn execute_team_create(args: &HashMap<String, String>) -> Result<ToolResult> {
    let name = match args.get("name").filter(|n| !n.is_empty()) {
        Some(n) => n.clone(),
        None => {
            return Ok(ToolResult {
                tool_name: "team_create".into(),
                success: false,
                output: "Missing required argument: name".into(),
            })
        }
    };
    let members: Vec<String> = args
        .get("members")
        .and_then(|m| serde_json::from_str(m).ok())
        .unwrap_or_default();
    let result = {
        let mut guard = session_registry().teams.write().unwrap();
        if guard.contains_key(&name) {
            Err(format!("Team '{}' already exists.", name))
        } else {
            let team = SessionTeam {
                name: name.clone(),
                members,
                created_at: now_iso(),
            };
            guard.insert(name.clone(), team.clone());
            Ok(team)
        }
    };
    match result {
        Err(msg) => Ok(ToolResult {
            tool_name: "team_create".into(),
            success: false,
            output: msg,
        }),
        Ok(team) => {
            print_tool_status("team_create", &format!("name={}", name));
            Ok(ToolResult {
                tool_name: "team_create".into(),
                success: true,
                output: serde_json::to_string_pretty(&team)
                    .unwrap_or_else(|_| format!("Created team {}", name)),
            })
        }
    }
}

pub(super) async fn execute_team_delete(args: &HashMap<String, String>) -> Result<ToolResult> {
    let name = match args.get("name").filter(|n| !n.is_empty()) {
        Some(n) => n.clone(),
        None => {
            return Ok(ToolResult {
                tool_name: "team_delete".into(),
                success: false,
                output: "Missing required argument: name".into(),
            })
        }
    };
    let removed = session_registry()
        .teams
        .write()
        .unwrap()
        .remove(&name)
        .is_some();
    if removed {
        print_tool_status("team_delete", &format!("name={}", name));
        Ok(ToolResult {
            tool_name: "team_delete".into(),
            success: true,
            output: format!("Deleted team '{}'.", name),
        })
    } else {
        Ok(ToolResult {
            tool_name: "team_delete".into(),
            success: false,
            output: format!("Team '{}' not found.", name),
        })
    }
}

pub(super) async fn execute_cron_create(args: &HashMap<String, String>) -> Result<ToolResult> {
    let name = match args.get("name").filter(|n| !n.is_empty()) {
        Some(n) => n.clone(),
        None => {
            return Ok(ToolResult {
                tool_name: "cron_create".into(),
                success: false,
                output: "Missing required argument: name".into(),
            })
        }
    };
    let schedule = match args.get("schedule").filter(|s| !s.is_empty()) {
        Some(s) => s.clone(),
        None => {
            return Ok(ToolResult {
                tool_name: "cron_create".into(),
                success: false,
                output: "Missing required argument: schedule".into(),
            })
        }
    };
    let prompt = match args.get("prompt").filter(|p| !p.is_empty()) {
        Some(p) => p.clone(),
        None => {
            return Ok(ToolResult {
                tool_name: "cron_create".into(),
                success: false,
                output: "Missing required argument: prompt".into(),
            })
        }
    };
    let enabled = args.get("enabled").map(|v| v != "false").unwrap_or(true);
    let id = new_uuid();
    let cron = SessionCron {
        id: id.clone(),
        name,
        schedule,
        prompt,
        enabled,
        created_at: now_iso(),
    };
    session_registry()
        .crons
        .write()
        .unwrap()
        .insert(id.clone(), cron.clone());
    print_tool_status("cron_create", &format!("id={}", id));
    Ok(ToolResult {
        tool_name: "cron_create".into(),
        success: true,
        output: serde_json::to_string_pretty(&cron).unwrap_or(id),
    })
}

pub(super) async fn execute_cron_delete(args: &HashMap<String, String>) -> Result<ToolResult> {
    let id_or_name = match args.get("id").filter(|i| !i.is_empty()) {
        Some(i) => i.clone(),
        None => {
            return Ok(ToolResult {
                tool_name: "cron_delete".into(),
                success: false,
                output: "Missing required argument: id".into(),
            })
        }
    };
    let mut guard = session_registry().crons.write().unwrap();
    let key = if guard.contains_key(&id_or_name) {
        Some(id_or_name.clone())
    } else {
        guard
            .values()
            .find(|c| c.name == id_or_name)
            .map(|c| c.id.clone())
    };
    match key {
        Some(k) => {
            guard.remove(&k);
            drop(guard);
            print_tool_status("cron_delete", &format!("id={}", k));
            Ok(ToolResult {
                tool_name: "cron_delete".into(),
                success: true,
                output: format!("Deleted cron trigger '{}'.", id_or_name),
            })
        }
        None => Ok(ToolResult {
            tool_name: "cron_delete".into(),
            success: false,
            output: format!("Cron trigger '{}' not found.", id_or_name),
        }),
    }
}

pub(super) async fn execute_cron_list(args: &HashMap<String, String>) -> Result<ToolResult> {
    let _ = args;
    let guard = session_registry().crons.read().unwrap();
    if guard.is_empty() {
        return Ok(ToolResult {
            tool_name: "cron_list".into(),
            success: true,
            output: "No cron triggers registered.".into(),
        });
    }
    let mut crons: Vec<SessionCron> = guard.values().cloned().collect();
    crons.sort_by(|a, b| a.created_at.cmp(&b.created_at));
    Ok(ToolResult {
        tool_name: "cron_list".into(),
        success: true,
        output: serde_json::to_string_pretty(&crons)
            .unwrap_or_else(|_| format!("{} trigger(s)", crons.len())),
    })
}

// ---------------------------------------------------------------------------
// M24: Advisor tool
// ---------------------------------------------------------------------------

pub(super) async fn execute_advisor(
    args: &HashMap<String, String>,
    privacy_mode: crate::agent::PrivacyMode,
) -> Result<ToolResult> {
    // Privacy boundary: the advisor always calls a cloud model. Block the call
    // before touching the network when the session is in Local privacy mode.
    if privacy_mode == crate::agent::PrivacyMode::Local {
        return Ok(ToolResult {
            tool_name: "advisor".into(),
            success: false,
            output: "advisor is unavailable in Local privacy mode: \
                     context must not leave this device. \
                     Switch to BYOK or Managed mode to use the advisor tool."
                .into(),
        });
    }

    let question = match args.get("question").filter(|q| !q.is_empty()) {
        Some(q) => q.clone(),
        None => {
            return Ok(ToolResult {
                tool_name: "advisor".into(),
                success: false,
                output: "Missing required argument: question".into(),
            });
        }
    };
    let model = args.get("model").cloned();
    print_tool_status(
        "advisor",
        &format!("model={}", model.as_deref().unwrap_or("default")),
    );

    let req = crate::runtime::advisor::AdvisorRequest { question, model };
    match crate::runtime::advisor::consult(req).await {
        Ok(resp) => Ok(ToolResult {
            tool_name: "advisor".into(),
            success: true,
            output: serde_json::to_string_pretty(&serde_json::json!({
                "answer": resp.answer,
                "model_used": resp.model_used,
                "tokens": resp.tokens,
            }))
            .unwrap_or(resp.answer),
        }),
        Err(e) => Ok(ToolResult {
            tool_name: "advisor".into(),
            success: false,
            output: format!("Advisor error: {}", e),
        }),
    }
}

// ---------------------------------------------------------------------------
// Todo tools
// ---------------------------------------------------------------------------

static TODO_STORE: std::sync::LazyLock<tokio::sync::Mutex<Vec<TodoItem>>> =
    std::sync::LazyLock::new(|| tokio::sync::Mutex::new(Vec::new()));

#[derive(Clone, serde::Serialize, serde::Deserialize)]
struct TodoItem {
    content: String,
    status: String,
    priority: String,
}

pub(super) async fn execute_todo_read() -> Result<ToolResult> {
    let todos = TODO_STORE.lock().await;
    if todos.is_empty() {
        return Ok(ToolResult {
            tool_name: "todo_read".into(),
            success: true,
            output: "No todos. Use todo_write to create a task list.".into(),
        });
    }
    let mut lines = Vec::new();
    for (i, todo) in todos.iter().enumerate() {
        let marker = match todo.status.as_str() {
            "completed" => "[x]",
            "in_progress" => "[~]",
            _ => "[ ]",
        };
        lines.push(format!(
            "{} {}. [{}] {}",
            marker,
            i + 1,
            todo.priority,
            todo.content
        ));
    }
    Ok(ToolResult {
        tool_name: "todo_read".into(),
        success: true,
        output: lines.join("\n"),
    })
}

pub(super) async fn execute_todo_write(args: &HashMap<String, String>) -> Result<ToolResult> {
    let todos_json = match args.get("todos") {
        Some(j) => j,
        None => {
            return Ok(ToolResult {
                tool_name: "todo_write".into(),
                success: false,
                output: "Missing: todos (JSON array of {content, status, priority})".into(),
            });
        }
    };
    let new_todos: Vec<TodoItem> = serde_json::from_str(todos_json)
        .map_err(|e| anyhow::anyhow!("Invalid todos JSON: {}", e))?;
    let count = new_todos.len();
    let mut store = TODO_STORE.lock().await;
    *store = new_todos;
    Ok(ToolResult {
        tool_name: "todo_write".into(),
        success: true,
        output: format!("Updated todo list ({} items)", count),
    })
}

// ---------------------------------------------------------------------------
// ask_user tool
// ---------------------------------------------------------------------------

pub(super) async fn execute_ask_user(args: &HashMap<String, String>) -> Result<ToolResult> {
    let question = match args.get("question") {
        Some(q) => q,
        None => {
            return Ok(ToolResult {
                tool_name: "ask_user".into(),
                success: false,
                output: "Missing required argument: question".into(),
            });
        }
    };

    eprintln!(
        "\n{} {}",
        crate::terminal_style::accent_header("Agent asks:"),
        question
    );

    let answer = dialoguer::Input::<String>::new()
        .with_prompt("Your answer")
        .interact_text()
        .unwrap_or_else(|_| "(no answer)".to_string());

    Ok(ToolResult {
        tool_name: "ask_user".into(),
        success: true,
        output: format!("User responded: {}", answer),
    })
}

// ---------------------------------------------------------------------------
// M36: LSP tools
// ---------------------------------------------------------------------------

async fn lsp_request_for_file(args: &HashMap<String, String>, method: &str) -> Result<ToolResult> {
    let file = match args.get("file").filter(|s| !s.is_empty()) {
        Some(f) => f.clone(),
        None => {
            return Ok(ToolResult {
                tool_name: method.into(),
                success: false,
                output: "Missing required argument: file".into(),
            })
        }
    };
    let ext = std::path::Path::new(&file)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");
    let Some((server_cmd, server_args)) = crate::lsp::server_for_extension(ext) else {
        return Ok(ToolResult {
            tool_name: method.into(),
            success: false,
            output: format!("No LSP server configured for .{ext} files"),
        });
    };
    let workspace = std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
    let mut client = match crate::lsp::LspClient::spawn(server_cmd, server_args, &workspace).await {
        Ok(c) => c,
        Err(e) => {
            return Ok(ToolResult {
                tool_name: method.into(),
                success: false,
                output: format!("Failed to spawn {server_cmd}: {e}"),
            })
        }
    };
    let uri = format!("file://{file}");
    let params = if method == "textDocument/definition" || method == "textDocument/hover" {
        let line = args
            .get("line")
            .and_then(|s| s.parse::<u32>().ok())
            .unwrap_or(0);
        let character = args
            .get("character")
            .and_then(|s| s.parse::<u32>().ok())
            .unwrap_or(0);
        serde_json::json!({
            "textDocument": {"uri": uri},
            "position": {"line": line, "character": character},
        })
    } else {
        serde_json::json!({"textDocument": {"uri": uri}})
    };
    let result = client.request(method, params).await;
    let _ = client.shutdown().await;
    match result {
        Ok(v) => Ok(ToolResult {
            tool_name: method.into(),
            success: true,
            output: serde_json::to_string_pretty(&v).unwrap_or_else(|_| v.to_string()),
        }),
        Err(e) => Ok(ToolResult {
            tool_name: method.into(),
            success: false,
            output: format!("LSP {method} failed: {e}"),
        }),
    }
}

pub(super) async fn execute_lsp_definition(args: &HashMap<String, String>) -> Result<ToolResult> {
    lsp_request_for_file(args, "textDocument/definition").await
}
pub(super) async fn execute_lsp_hover(args: &HashMap<String, String>) -> Result<ToolResult> {
    lsp_request_for_file(args, "textDocument/hover").await
}
// Diagnostics are server-pushed (textDocument/publishDiagnostics) and the stdio
// client has no notification reader, so nothing is ever collected. This must
// fail loudly: a success with an empty diagnostic list reads as "file is clean"
// to the model, which is a claim nothing here checked.
pub(super) async fn execute_lsp_diagnostics(args: &HashMap<String, String>) -> Result<ToolResult> {
    let target = args
        .get("file")
        .map(String::as_str)
        .filter(|f| !f.is_empty())
        .unwrap_or("the requested file");
    Ok(ToolResult {
        tool_name: "lsp_diagnostics".into(),
        success: false,
        output: serde_json::json!({
            "error": "unsupported",
            "checked": false,
            "message": format!(
                "lsp_diagnostics is not implemented. The LSP client does not subscribe to \
                 textDocument/publishDiagnostics, so no diagnostics were collected for {target}. \
                 This is not an empty diagnostic list, nothing was checked, and no conclusion \
                 about errors or warnings in this file may be drawn from it."
            ),
            "next": "Run the project's own compiler or linter (for example a type-check or lint \
                    command) for real diagnostics; lsp_hover and lsp_definition remain available \
                    for synchronous LSP probes."
        })
        .to_string(),
    })
}

pub(super) async fn execute_lsp_completion(args: &HashMap<String, String>) -> Result<ToolResult> {
    let file = match args.get("file").filter(|s| !s.is_empty()) {
        Some(f) => f.clone(),
        None => {
            return Ok(ToolResult {
                tool_name: "lsp_completion".into(),
                success: false,
                output: "Missing required argument: file".into(),
            })
        }
    };
    let line = args
        .get("line")
        .and_then(|s| s.parse::<u32>().ok())
        .unwrap_or(0);
    let character = args
        .get("character")
        .and_then(|s| s.parse::<u32>().ok())
        .unwrap_or(0);
    let ext = std::path::Path::new(&file)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");
    let Some((server_cmd, server_args)) = crate::lsp::server_for_extension(ext) else {
        return Ok(ToolResult {
            tool_name: "lsp_completion".into(),
            success: false,
            output: format!("No LSP server configured for .{ext} files"),
        });
    };
    let workspace = std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
    let mut client = match crate::lsp::LspClient::spawn(server_cmd, server_args, &workspace).await {
        Ok(c) => c,
        Err(e) => {
            return Ok(ToolResult {
                tool_name: "lsp_completion".into(),
                success: false,
                output: format!("Failed to spawn {server_cmd}: {e}"),
            })
        }
    };
    let uri = format!("file://{file}");
    let params = serde_json::json!({
        "textDocument": {"uri": uri},
        "position": {"line": line, "character": character},
    });
    let result = client.request("textDocument/completion", params).await;
    let _ = client.shutdown().await;
    match result {
        Ok(v) => Ok(ToolResult {
            tool_name: "lsp_completion".into(),
            success: true,
            output: serde_json::to_string_pretty(&v).unwrap_or_else(|_| v.to_string()),
        }),
        Err(e) => Ok(ToolResult {
            tool_name: "lsp_completion".into(),
            success: false,
            output: format!("LSP completion failed: {e}"),
        }),
    }
}

pub(super) async fn execute_lsp_document_symbols(
    args: &HashMap<String, String>,
) -> Result<ToolResult> {
    lsp_request_for_file(args, "textDocument/documentSymbol").await
}

pub(super) async fn execute_lsp_format(args: &HashMap<String, String>) -> Result<ToolResult> {
    lsp_request_for_file(args, "textDocument/formatting").await
}

#[cfg(test)]
mod lsp_diagnostics_tests {
    use std::collections::HashMap;

    use super::execute_lsp_diagnostics;

    /// The tool collects nothing, so it must not report success: a success with
    /// no diagnostics is indistinguishable from "this file is clean".
    ///
    /// FAILS against the old stub, which returned success=true.
    #[tokio::test]
    async fn diagnostics_reports_failure_instead_of_a_clean_file() {
        let mut args = HashMap::new();
        args.insert("file".to_string(), "src/main.rs".to_string());

        let result = execute_lsp_diagnostics(&args).await.expect("returns Ok");

        assert!(
            !result.success,
            "lsp_diagnostics must not report success while it checks nothing: {}",
            result.output
        );

        let payload: serde_json::Value =
            serde_json::from_str(&result.output).expect("output is JSON");
        assert_eq!(payload["checked"], serde_json::json!(false));
        assert_eq!(payload["error"], serde_json::json!("unsupported"));
        assert!(
            payload["message"]
                .as_str()
                .is_some_and(|m| m.contains("src/main.rs") && m.contains("nothing was checked")),
            "message must name the file and deny any cleanliness claim: {}",
            result.output
        );
        assert!(
            !payload
                .as_object()
                .expect("object")
                .contains_key("diagnostics"),
            "an empty diagnostics list would be read as a clean file: {}",
            result.output
        );
    }

    #[tokio::test]
    async fn diagnostics_fails_even_without_a_file_argument() {
        let result = execute_lsp_diagnostics(&HashMap::new())
            .await
            .expect("returns Ok");
        assert!(!result.success);
        assert_eq!(result.tool_name, "lsp_diagnostics");
    }
}

// ---------------------------------------------------------------------------
// Tests for the advisor privacy gate
// ---------------------------------------------------------------------------

#[cfg(test)]
mod advisor_privacy_tests {
    use std::collections::HashMap;

    use super::execute_advisor;
    use crate::agent::PrivacyMode;

    /// In Local privacy mode `execute_advisor` must return an error immediately
    /// without reaching `consult()` (no cloud call, success=false, message
    /// mentions Local privacy).
    ///
    /// FAILS without the `ADVISOR_LOCAL_PRIVACY_GUARD` check.
    /// PASSES with it.
    #[tokio::test]
    async fn advisor_blocked_in_local_privacy_mode() {
        let mut args = HashMap::new();
        args.insert("question".to_string(), "What is 2 + 2?".to_string());

        let result = execute_advisor(&args, PrivacyMode::Local)
            .await
            .expect("execute_advisor should return Ok, not Err");

        assert!(
            !result.success,
            "advisor should fail in Local privacy mode, got success=true"
        );
        assert!(
            result.output.contains("unavailable in Local privacy mode"),
            "error message should mention Local privacy mode, got: {}",
            result.output
        );
        assert!(
            result.output.contains("context must not leave this device"),
            "error message should explain the privacy constraint, got: {}",
            result.output
        );
        assert_eq!(result.tool_name, "advisor");
    }

    /// Outside Local mode the advisor proceeds past the privacy gate and fails
    /// downstream (no API key in CI/test env). The failure message must NOT
    /// contain the Local-privacy text, confirming the gate was not triggered.
    #[tokio::test]
    async fn advisor_not_blocked_outside_local_mode() {
        let orig_anthropic = std::env::var("ANTHROPIC_API_KEY").ok();
        let orig_openai = std::env::var("OPENAI_API_KEY").ok();
        std::env::remove_var("ANTHROPIC_API_KEY");
        std::env::remove_var("OPENAI_API_KEY");

        let mut args = HashMap::new();
        args.insert("question".to_string(), "test".to_string());

        let result = execute_advisor(&args, PrivacyMode::Byok)
            .await
            .expect("execute_advisor should return Ok");

        if let Some(v) = orig_anthropic {
            std::env::set_var("ANTHROPIC_API_KEY", v);
        }
        if let Some(v) = orig_openai {
            std::env::set_var("OPENAI_API_KEY", v);
        }

        // The downstream error must NOT be the Local-privacy gate message.
        assert!(
            !result.output.contains("unavailable in Local privacy mode"),
            "privacy gate should NOT fire in non-Local mode, got: {}",
            result.output
        );
    }

    /// Each invocation carries its own boundary, so interleaved sessions
    /// cannot overwrite one another's policy.
    #[tokio::test]
    async fn advisor_policy_is_scoped_to_each_invocation() {
        let mut args = HashMap::new();
        args.insert("question".to_string(), "ping".to_string());

        let blocked = execute_advisor(&args, PrivacyMode::Local).await.unwrap();
        assert!(!blocked.success);
        assert!(blocked.output.contains("unavailable in Local privacy mode"));

        let orig_a = std::env::var("ANTHROPIC_API_KEY").ok();
        let orig_o = std::env::var("OPENAI_API_KEY").ok();
        std::env::remove_var("ANTHROPIC_API_KEY");
        std::env::remove_var("OPENAI_API_KEY");

        let not_blocked = execute_advisor(&args, PrivacyMode::Byok).await.unwrap();

        if let Some(v) = orig_a {
            std::env::set_var("ANTHROPIC_API_KEY", v);
        }
        if let Some(v) = orig_o {
            std::env::set_var("OPENAI_API_KEY", v);
        }

        // After clearing the guard the privacy message must not appear.
        assert!(
            !not_blocked
                .output
                .contains("unavailable in Local privacy mode"),
            "the Local invocation must not contaminate the BYOK invocation: {}",
            not_blocked.output
        );
    }
}
