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
// `AgentSession` keeps this flag in sync with its `privacy_mode` (on construction,
// `set_privacy_mode`, and `adopt_provider_privacy_mode`), so `execute_advisor`
// fails closed whenever the active session is Local. Process-global because tool
// executors run without session context; the CLI runs one primary session at a
// time, and the default (`false`) keeps the advisor available outside Local mode.
// ---------------------------------------------------------------------------

static ADVISOR_LOCAL_PRIVACY_GUARD: std::sync::atomic::AtomicBool =
    std::sync::atomic::AtomicBool::new(false);

/// Set the Local-privacy guard for the advisor tool.
///
/// Pass `true` whenever `AgentSession::privacy_mode` is `PrivacyMode::Local`,
/// `false` when it transitions away. This prevents `execute_advisor` from
/// making any outbound cloud call while the session is under the Local privacy
/// boundary.
pub(crate) fn set_advisor_local_privacy_mode(is_local: bool) {
    ADVISOR_LOCAL_PRIVACY_GUARD.store(is_local, std::sync::atomic::Ordering::SeqCst);
}

// ---------------------------------------------------------------------------
// M18: Session-scoped task / team / cron registry
// ---------------------------------------------------------------------------

#[derive(Clone, serde::Serialize, serde::Deserialize)]
pub(super) struct SessionTask {
    pub(super) id: String,
    kind: String,
    status: String,
    command: Option<String>,
    output_path: String,
    started_at: Option<String>,
    ended_at: Option<String>,
    exit_code: Option<i32>,
    error: Option<String>,
}

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
    tasks: std::sync::RwLock<std::collections::HashMap<String, SessionTask>>,
    teams: std::sync::RwLock<std::collections::HashMap<String, SessionTeam>>,
    crons: std::sync::RwLock<std::collections::HashMap<String, SessionCron>>,
}

impl SessionRegistry {
    fn new() -> Self {
        Self {
            tasks: std::sync::RwLock::new(std::collections::HashMap::new()),
            teams: std::sync::RwLock::new(std::collections::HashMap::new()),
            crons: std::sync::RwLock::new(std::collections::HashMap::new()),
        }
    }
}

static SESSION_REGISTRY: OnceLock<SessionRegistry> = OnceLock::new();

fn session_registry() -> &'static SessionRegistry {
    SESSION_REGISTRY.get_or_init(SessionRegistry::new)
}

pub fn session_task_summaries() -> Vec<String> {
    let guard = session_registry().tasks.read().unwrap();
    let mut tasks: Vec<&SessionTask> = guard.values().collect();
    tasks.sort_by(|a, b| a.id.cmp(&b.id));
    tasks
        .iter()
        .map(|t| {
            let cmd = t.command.as_deref().unwrap_or("(no command)");
            format!("[{}] {} — {}", t.status, t.kind, cmd)
        })
        .collect()
}

fn task_output_path(id: &str) -> String {
    let base = crate::config::CliConfig::config_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."))
        .join("tasks");
    let _ = std::fs::create_dir_all(&base);
    base.join(format!("{}.out", id)).display().to_string()
}

fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339()
}

fn new_uuid() -> String {
    uuid::Uuid::new_v4().to_string()
}

const VALID_TASK_KINDS: &[&str] = &[
    "local_shell",
    "local_agent",
    "remote_agent",
    "in_process_teammate",
    "local_workflow",
    "monitor_mcp",
    "dream",
];

pub(super) async fn execute_task_create(args: &HashMap<String, String>) -> Result<ToolResult> {
    let kind = match args.get("kind") {
        Some(k) if VALID_TASK_KINDS.contains(&k.as_str()) => k.clone(),
        Some(k) => {
            return Ok(ToolResult {
                tool_name: "task_create".into(),
                success: false,
                output: format!(
                    "Invalid kind '{}'. Valid: {}",
                    k,
                    VALID_TASK_KINDS.join(", ")
                ),
            });
        }
        None => {
            return Ok(ToolResult {
                tool_name: "task_create".into(),
                success: false,
                output: "Missing required argument: kind".into(),
            });
        }
    };
    let command = args.get("command").cloned();
    let id = new_uuid();
    let output_path = task_output_path(&id);
    let _ = std::fs::File::create(&output_path);
    let task = SessionTask {
        id: id.clone(),
        kind,
        status: "pending".into(),
        command,
        output_path,
        started_at: None,
        ended_at: None,
        exit_code: None,
        error: None,
    };
    session_registry()
        .tasks
        .write()
        .unwrap()
        .insert(id.clone(), task.clone());
    print_tool_status("task_create", &format!("id={}", id));
    Ok(ToolResult {
        tool_name: "task_create".into(),
        success: true,
        output: serde_json::to_string_pretty(&task).unwrap_or(id),
    })
}

pub(super) async fn execute_task_get(args: &HashMap<String, String>) -> Result<ToolResult> {
    let id = match args.get("id") {
        Some(id) => id.clone(),
        None => {
            return Ok(ToolResult {
                tool_name: "task_get".into(),
                success: false,
                output: "Missing required argument: id".into(),
            });
        }
    };
    let output = {
        let guard = session_registry().tasks.read().unwrap();
        guard
            .get(id.as_str())
            .map(|t| serde_json::to_string_pretty(t).unwrap_or_else(|_| format!("{:?}", t.id)))
    };
    match output {
        Some(json) => Ok(ToolResult {
            tool_name: "task_get".into(),
            success: true,
            output: json,
        }),
        None => Ok(ToolResult {
            tool_name: "task_get".into(),
            success: false,
            output: format!("Task not found: {}", id),
        }),
    }
}

pub(super) async fn execute_task_list(args: &HashMap<String, String>) -> Result<ToolResult> {
    let status_filter = args.get("status").cloned();
    let tasks_json = {
        let guard = session_registry().tasks.read().unwrap();
        let mut tasks: Vec<SessionTask> = guard
            .values()
            .filter(|t| {
                status_filter.as_deref().is_none()
                    || status_filter.as_deref() == Some(t.status.as_str())
            })
            .cloned()
            .collect();
        tasks.sort_by(|a, b| a.id.cmp(&b.id));
        tasks
    };
    if tasks_json.is_empty() {
        return Ok(ToolResult {
            tool_name: "task_list".into(),
            success: true,
            output: "No tasks found.".into(),
        });
    }
    Ok(ToolResult {
        tool_name: "task_list".into(),
        success: true,
        output: serde_json::to_string_pretty(&tasks_json)
            .unwrap_or_else(|_| format!("{} task(s)", tasks_json.len())),
    })
}

pub(super) async fn execute_task_update(args: &HashMap<String, String>) -> Result<ToolResult> {
    let id = match args.get("id") {
        Some(id) => id.clone(),
        None => {
            return Ok(ToolResult {
                tool_name: "task_update".into(),
                success: false,
                output: "Missing required argument: id".into(),
            })
        }
    };
    let new_status = match args.get("status") {
        Some(s) => s.clone(),
        None => {
            return Ok(ToolResult {
                tool_name: "task_update".into(),
                success: false,
                output: "Missing required argument: status".into(),
            })
        }
    };
    let exit_code: Option<i32> = args.get("exit_code").and_then(|s| s.parse().ok());
    let error = args.get("error").cloned();

    let result = {
        let mut guard = session_registry().tasks.write().unwrap();
        match guard.get_mut(id.as_str()) {
            None => Err(format!("Task not found: {}", id)),
            Some(task) => {
                let valid = matches!(
                    (task.status.as_str(), new_status.as_str()),
                    ("pending", "running")
                        | ("pending", "failed")
                        | ("pending", "stopped")
                        | ("running", "completed")
                        | ("running", "failed")
                        | ("running", "stopped")
                );
                if !valid {
                    Err(format!(
                        "Invalid transition: {} → {}",
                        task.status, new_status
                    ))
                } else {
                    if task.started_at.is_none() && new_status == "running" {
                        task.started_at = Some(now_iso());
                    }
                    if matches!(new_status.as_str(), "completed" | "failed" | "stopped") {
                        task.ended_at = Some(now_iso());
                    }
                    task.status = new_status;
                    task.exit_code = exit_code;
                    task.error = error;
                    Ok(task.clone())
                }
            }
        }
    };
    match result {
        Err(msg) => Ok(ToolResult {
            tool_name: "task_update".into(),
            success: false,
            output: msg,
        }),
        Ok(snapshot) => {
            print_tool_status("task_update", &format!("id={} → {}", id, snapshot.status));
            Ok(ToolResult {
                tool_name: "task_update".into(),
                success: true,
                output: serde_json::to_string_pretty(&snapshot)
                    .unwrap_or_else(|_| format!("Updated task {}", id)),
            })
        }
    }
}

pub(super) async fn execute_task_stop(args: &HashMap<String, String>) -> Result<ToolResult> {
    let id = match args.get("id") {
        Some(id) => id.clone(),
        None => {
            return Ok(ToolResult {
                tool_name: "task_stop".into(),
                success: false,
                output: "Missing required argument: id".into(),
            })
        }
    };
    let result = {
        let mut guard = session_registry().tasks.write().unwrap();
        match guard.get_mut(id.as_str()) {
            None => Err(format!("Task not found: {}", id)),
            Some(task) => {
                if matches!(task.status.as_str(), "completed" | "failed" | "stopped") {
                    Err(format!(
                        "Cannot stop task in terminal state: {}",
                        task.status
                    ))
                } else {
                    task.status = "stopped".into();
                    task.ended_at = Some(now_iso());
                    Ok(task.clone())
                }
            }
        }
    };
    match result {
        Err(msg) => Ok(ToolResult {
            tool_name: "task_stop".into(),
            success: false,
            output: msg,
        }),
        Ok(snapshot) => {
            print_tool_status("task_stop", &format!("id={}", id));
            Ok(ToolResult {
                tool_name: "task_stop".into(),
                success: true,
                output: serde_json::to_string_pretty(&snapshot)
                    .unwrap_or_else(|_| format!("Stopped task {}", id)),
            })
        }
    }
}

pub(super) async fn execute_task_output(args: &HashMap<String, String>) -> Result<ToolResult> {
    let id = match args.get("id") {
        Some(id) => id.clone(),
        None => {
            return Ok(ToolResult {
                tool_name: "task_output".into(),
                success: false,
                output: "Missing required argument: id".into(),
            })
        }
    };
    let max_bytes: usize = args
        .get("max_bytes")
        .and_then(|s| s.parse().ok())
        .unwrap_or(8192);
    let path = {
        let guard = session_registry().tasks.read().unwrap();
        match guard.get(id.as_str()) {
            Some(t) => t.output_path.clone(),
            None => {
                return Ok(ToolResult {
                    tool_name: "task_output".into(),
                    success: false,
                    output: format!("Task not found: {}", id),
                })
            }
        }
    };
    match std::fs::read(&path) {
        Ok(bytes) => {
            let start = bytes.len().saturating_sub(max_bytes);
            let tail = String::from_utf8_lossy(&bytes[start..]).into_owned();
            Ok(ToolResult {
                tool_name: "task_output".into(),
                success: true,
                output: if tail.is_empty() {
                    "(no output yet)".into()
                } else {
                    tail
                },
            })
        }
        Err(e) => Ok(ToolResult {
            tool_name: "task_output".into(),
            success: false,
            output: format!("Could not read output file: {}", e),
        }),
    }
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

pub(super) async fn execute_advisor(args: &HashMap<String, String>) -> Result<ToolResult> {
    // Privacy boundary: the advisor always calls a cloud model. Block the call
    // before touching the network when the session is in Local privacy mode.
    if ADVISOR_LOCAL_PRIVACY_GUARD.load(std::sync::atomic::Ordering::SeqCst) {
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
pub(super) async fn execute_lsp_diagnostics(args: &HashMap<String, String>) -> Result<ToolResult> {
    let _ = args;
    Ok(ToolResult {
        tool_name: "lsp_diagnostics".into(),
        success: true,
        output: serde_json::json!({
            "note": "LSP diagnostics are server-pushed (textDocument/publishDiagnostics). \
                    The basic LSP client doesn't subscribe yet — wire up notifications in M-future.",
            "next": "Use lsp_hover or lsp_definition for synchronous LSP probes."
        }).to_string(),
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

// ---------------------------------------------------------------------------
// Tests for the advisor privacy gate
// ---------------------------------------------------------------------------

#[cfg(test)]
mod advisor_privacy_tests {
    use std::collections::HashMap;
    use std::sync::Mutex;

    use super::{execute_advisor, set_advisor_local_privacy_mode, ADVISOR_LOCAL_PRIVACY_GUARD};

    /// Serialisation lock: `ADVISOR_LOCAL_PRIVACY_GUARD` is process-wide, so
    /// all tests that touch it must run sequentially.
    static TEST_LOCK: Mutex<()> = Mutex::new(());

    /// RAII helper that holds the serialisation lock for the test's lifetime
    /// and resets the privacy guard on drop.
    #[allow(dead_code)]
    struct Guard<'a>(std::sync::MutexGuard<'a, ()>);
    impl Drop for Guard<'_> {
        fn drop(&mut self) {
            set_advisor_local_privacy_mode(false);
        }
    }

    fn acquire() -> Guard<'static> {
        let g = TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        // Always start each test from a clean state.
        ADVISOR_LOCAL_PRIVACY_GUARD.store(false, std::sync::atomic::Ordering::SeqCst);
        Guard(g)
    }

    /// In Local privacy mode `execute_advisor` must return an error immediately
    /// without reaching `consult()` (no cloud call, success=false, message
    /// mentions Local privacy).
    ///
    /// FAILS without the `ADVISOR_LOCAL_PRIVACY_GUARD` check.
    /// PASSES with it.
    #[tokio::test]
    async fn advisor_blocked_in_local_privacy_mode() {
        let _guard = acquire();

        // Simulate a Local-mode session.
        set_advisor_local_privacy_mode(true);

        let mut args = HashMap::new();
        args.insert("question".to_string(), "What is 2 + 2?".to_string());

        let result = execute_advisor(&args)
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
        let _guard = acquire();

        // Guard starts as false (non-Local) — confirm it's clear.
        set_advisor_local_privacy_mode(false);

        let orig_anthropic = std::env::var("ANTHROPIC_API_KEY").ok();
        let orig_openai = std::env::var("OPENAI_API_KEY").ok();
        std::env::remove_var("ANTHROPIC_API_KEY");
        std::env::remove_var("OPENAI_API_KEY");

        let mut args = HashMap::new();
        args.insert("question".to_string(), "test".to_string());

        let result = execute_advisor(&args)
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

    /// Toggling from Local to non-Local must clear the guard so the advisor
    /// can proceed past the privacy check again.
    #[tokio::test]
    async fn advisor_guard_toggles_correctly() {
        let _guard = acquire();

        // Activate Local mode — call must be blocked.
        set_advisor_local_privacy_mode(true);

        let mut args = HashMap::new();
        args.insert("question".to_string(), "ping".to_string());

        let blocked = execute_advisor(&args).await.unwrap();
        assert!(!blocked.success);
        assert!(blocked.output.contains("unavailable in Local privacy mode"));

        // Deactivate Local mode.
        set_advisor_local_privacy_mode(false);

        let orig_a = std::env::var("ANTHROPIC_API_KEY").ok();
        let orig_o = std::env::var("OPENAI_API_KEY").ok();
        std::env::remove_var("ANTHROPIC_API_KEY");
        std::env::remove_var("OPENAI_API_KEY");

        let not_blocked = execute_advisor(&args).await.unwrap();

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
            "guard should be cleared after set_advisor_local_privacy_mode(false), got: {}",
            not_blocked.output
        );
    }
}
