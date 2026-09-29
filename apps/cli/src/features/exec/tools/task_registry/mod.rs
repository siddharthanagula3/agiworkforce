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
// Session-scoped team registry. Schedules are not session state: they live in
// the account's hosted schedules service, the same records the web and mobile
// surfaces read.
// ---------------------------------------------------------------------------

#[derive(Clone, serde::Serialize, serde::Deserialize)]
struct SessionTeam {
    name: String,
    members: Vec<String>,
    created_at: String,
}

struct SessionRegistry {
    teams: std::sync::RwLock<std::collections::HashMap<String, SessionTeam>>,
}

impl SessionRegistry {
    fn new() -> Self {
        Self {
            teams: std::sync::RwLock::new(std::collections::HashMap::new()),
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

pub(super) async fn execute_cron_create(
    args: &HashMap<String, String>,
    privacy_mode: crate::agent::PrivacyMode,
) -> Result<ToolResult> {
    let client = match hosted_schedules(privacy_mode, "cron_create") {
        Ok(client) => client,
        Err(result) => return Ok(result),
    };
    let name = match required_arg(args, "name", "cron_create") {
        Ok(value) => value,
        Err(result) => return Ok(result),
    };
    let schedule = match required_arg(args, "schedule", "cron_create") {
        Ok(value) => value,
        Err(result) => return Ok(result),
    };
    let prompt = match required_arg(args, "prompt", "cron_create") {
        Ok(value) => value,
        Err(result) => return Ok(result),
    };
    let enabled = args.get("enabled").map(|v| v != "false").unwrap_or(true);
    let timezone = args
        .get("timezone")
        .map(String::to_string)
        .filter(|zone| !zone.trim().is_empty())
        .unwrap_or_else(crate::schedules::local_timezone);

    let request = crate::schedules::cron_create_request(
        &name, &schedule, &prompt, enabled, &timezone, None, None,
    );
    match client.create(&request).await {
        Ok(created) => {
            print_tool_status("cron_create", &format!("id={}", created.id));
            Ok(ToolResult {
                tool_name: "cron_create".into(),
                success: true,
                output: serde_json::to_string_pretty(&created).unwrap_or(created.id),
            })
        }
        Err(error) => Ok(schedule_failure("cron_create", error)),
    }
}

pub(super) async fn execute_cron_delete(
    args: &HashMap<String, String>,
    privacy_mode: crate::agent::PrivacyMode,
) -> Result<ToolResult> {
    let client = match hosted_schedules(privacy_mode, "cron_delete") {
        Ok(client) => client,
        Err(result) => return Ok(result),
    };
    let id_or_name = match required_arg(args, "id", "cron_delete") {
        Ok(value) => value,
        Err(result) => return Ok(result),
    };
    let resolved = match client.resolve_id(&id_or_name).await {
        Ok(resolved) => resolved,
        Err(error) => return Ok(schedule_failure("cron_delete", error)),
    };
    match client.delete(&resolved).await {
        Ok(()) => {
            print_tool_status("cron_delete", &format!("id={resolved}"));
            Ok(ToolResult {
                tool_name: "cron_delete".into(),
                success: true,
                output: format!("Deleted schedule '{resolved}'."),
            })
        }
        Err(error) => Ok(schedule_failure("cron_delete", error)),
    }
}

pub(super) async fn execute_cron_list(
    args: &HashMap<String, String>,
    privacy_mode: crate::agent::PrivacyMode,
) -> Result<ToolResult> {
    let _ = args;
    let client = match hosted_schedules(privacy_mode, "cron_list") {
        Ok(client) => client,
        Err(result) => return Ok(result),
    };
    match client
        .list(crate::schedules::DEFAULT_SCHEDULE_LIMIT, 0)
        .await
    {
        Ok(schedules) if schedules.is_empty() => Ok(ToolResult {
            tool_name: "cron_list".into(),
            success: true,
            output: "No schedules on this account.".into(),
        }),
        Ok(schedules) => Ok(ToolResult {
            tool_name: "cron_list".into(),
            success: true,
            output: serde_json::to_string_pretty(&schedules)
                .unwrap_or_else(|_| format!("{} schedule(s)", schedules.len())),
        }),
        Err(error) => Ok(schedule_failure("cron_list", error)),
    }
}

/// A scheduled task runs in AGI cloud on the account's own ledger, so the
/// prompt and its results leave the device. A Local session must not reach it,
/// and a signed-out session must not be told a schedule was created.
fn hosted_schedules(
    privacy_mode: crate::agent::PrivacyMode,
    tool_name: &str,
) -> Result<crate::schedules::SchedulesClient, ToolResult> {
    if privacy_mode == crate::agent::PrivacyMode::Local {
        return Err(schedule_failure(
            tool_name,
            crate::schedules::ScheduleError::LocalPrivacy,
        ));
    }
    crate::schedules::SchedulesClient::connect().map_err(|error| schedule_failure(tool_name, error))
}

fn schedule_failure(tool_name: &str, error: crate::schedules::ScheduleError) -> ToolResult {
    ToolResult {
        tool_name: tool_name.into(),
        success: false,
        output: error.to_string(),
    }
}

fn required_arg(
    args: &HashMap<String, String>,
    key: &str,
    tool_name: &str,
) -> Result<String, ToolResult> {
    match args
        .get(key)
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
    {
        Some(value) => Ok(value.to_string()),
        None => Err(ToolResult {
            tool_name: tool_name.into(),
            success: false,
            output: format!("Missing required argument: {key}"),
        }),
    }
}

#[cfg(test)]
mod hosted_schedule_tests {
    use std::collections::HashMap;

    use super::{execute_cron_create, execute_cron_delete, execute_cron_list, required_arg};
    use crate::agent::PrivacyMode;

    fn cron_args() -> HashMap<String, String> {
        HashMap::from([
            ("name".to_string(), "Morning digest".to_string()),
            ("schedule".to_string(), "0 9 * * *".to_string()),
            ("prompt".to_string(), "Summarize my inbox".to_string()),
        ])
    }

    /// A scheduled task runs in AGI cloud, so a Local session must be refused
    /// before the prompt reaches the network, and must never be told a
    /// schedule was created.
    #[tokio::test]
    async fn every_schedule_tool_is_blocked_in_local_privacy_mode() {
        let create = execute_cron_create(&cron_args(), PrivacyMode::Local)
            .await
            .expect("returns Ok");
        assert!(!create.success, "{}", create.output);
        assert!(
            create.output.contains("Local privacy mode"),
            "{}",
            create.output
        );
        assert!(
            create.output.contains("must leave this device"),
            "the refusal must say where the prompt would go: {}",
            create.output
        );

        let list = execute_cron_list(&HashMap::new(), PrivacyMode::Local)
            .await
            .expect("returns Ok");
        assert!(!list.success, "{}", list.output);

        let delete = execute_cron_delete(
            &HashMap::from([("id".to_string(), "anything".to_string())]),
            PrivacyMode::Local,
        )
        .await
        .expect("returns Ok");
        assert!(!delete.success, "{}", delete.output);
    }

    #[test]
    fn a_missing_or_blank_argument_is_reported_before_any_request() {
        let args = HashMap::from([("name".to_string(), "   ".to_string())]);
        let failure = match required_arg(&args, "name", "cron_create") {
            Ok(value) => panic!("a blank argument must not resolve, got '{value}'"),
            Err(failure) => failure,
        };
        assert!(!failure.success);
        assert_eq!(failure.output, "Missing required argument: name");
        assert_eq!(failure.tool_name, "cron_create");

        assert_eq!(
            required_arg(&cron_args(), "schedule", "cron_create")
                .unwrap_or_else(|_| { panic!("a present argument must resolve") }),
            "0 9 * * *"
        );
    }
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

use crate::features::plan::plan_mode::{TodoItem, TodoList};

/// Keyed by workspace, never a process global: the app-server hosts concurrent
/// sessions whose workspaces differ from the process cwd.
fn todo_scope(workspace_root: Option<&std::path::Path>) -> std::path::PathBuf {
    workspace_root
        .map(|root| root.to_path_buf())
        .unwrap_or_else(|| {
            std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."))
        })
}

pub(super) async fn execute_todo_read(
    workspace_root: Option<&std::path::Path>,
) -> Result<ToolResult> {
    let todos = TodoList::load_for_workspace(&todo_scope(workspace_root));
    Ok(ToolResult {
        tool_name: "todo_read".into(),
        success: true,
        output: todos.render(),
    })
}

pub(super) async fn execute_todo_write(
    args: &HashMap<String, String>,
    workspace_root: Option<&std::path::Path>,
) -> Result<ToolResult> {
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
    let items: Vec<TodoItem> = serde_json::from_str(todos_json)
        .map_err(|e| anyhow::anyhow!("Invalid todos JSON: {}", e))?;
    let list = TodoList { items };
    let scope = todo_scope(workspace_root);
    if let Err(error) = list.save_for_workspace(&scope) {
        return Ok(ToolResult {
            tool_name: "todo_write".into(),
            success: false,
            output: format!("Could not persist the todo list: {error}"),
        });
    }
    Ok(ToolResult {
        tool_name: "todo_write".into(),
        success: true,
        output: format!(
            "Updated todo list ({} items)\n{}",
            list.items.len(),
            list.render()
        ),
    })
}

// ---------------------------------------------------------------------------
// ask_user tool
// ---------------------------------------------------------------------------

pub(super) async fn execute_ask_user(
    args: &HashMap<String, String>,
    approval_callback: Option<&super::ApprovalCallback>,
) -> Result<ToolResult> {
    let question = match args
        .get("question")
        .filter(|question| !question.trim().is_empty())
    {
        Some(q) => q,
        None => {
            return Ok(ToolResult {
                tool_name: "ask_user".into(),
                success: false,
                output: "Missing required argument: question".into(),
            });
        }
    };
    let answer = |success: bool, output: String| ToolResult {
        tool_name: "ask_user".into(),
        success,
        output,
    };

    if args.get("kind").map(String::as_str) == Some("approval") {
        let request = crate::tui::approval_broker::ApprovalRequest::new(
            crate::tui::approval_broker::ApprovalRequestKind::AskUser {
                question: question.clone(),
            },
            question.clone(),
            Vec::new(),
        );
        let approved = match super::request_approval(approval_callback, request).await {
            Some(decision) => super::approval_allows(decision),
            None if crate::interactive::can_prompt() => dialoguer::Confirm::new()
                .with_prompt(question.as_str())
                .default(false)
                .interact()
                .unwrap_or(false),
            None => return Ok(answer(
                false,
                "No one can answer here, so nothing was approved. Do not proceed with the action."
                    .into(),
            )),
        };
        return Ok(answer(
            true,
            if approved {
                "The user approved.".into()
            } else {
                "The user declined. Do not proceed with it.".into()
            },
        ));
    }

    let options = question_options(args.get("options"));
    if approval_callback.is_some() && super::interactive_questions_enabled() {
        let request = crate::tui::approval_broker::ApprovalRequest::new(
            crate::tui::approval_broker::ApprovalRequestKind::Question {
                question: question.clone(),
                options: options.clone(),
            },
            question.clone(),
            options.clone(),
        );
        let (decision, mut notes) =
            super::collect_approval_notes(super::request_approval(approval_callback, request))
                .await;
        return Ok(match (decision, notes.pop()) {
            (Some(decision), Some(reply)) if super::approval_allows(decision) => {
                answer(true, format!("User responded: {reply}"))
            }
            _ => answer(
                false,
                "The user closed the question without answering. Carry on with your best judgment, or ask again in your reply if you cannot."
                    .into(),
            ),
        });
    }

    if approval_callback.is_some() || !crate::interactive::can_prompt() {
        return Ok(answer(
            false,
            "A typed answer cannot be collected mid-turn here. Ask the question in your reply and end the turn; the user will answer in their next message."
                .into(),
        ));
    }

    if !options.is_empty() {
        eprintln!(
            "\n{} {}",
            crate::terminal_style::accent_header("Agent asks:"),
            question
        );
        let mut items = options.clone();
        items.push("Type your own answer".to_string());
        let picked = dialoguer::Select::new()
            .items(&items)
            .default(0)
            .interact_opt()
            .unwrap_or(None);
        match picked {
            Some(index) if index < options.len() => {
                return Ok(answer(true, format!("User responded: {}", options[index])));
            }
            Some(_) => {}
            None => {
                return Ok(answer(
                    false,
                    "The user closed the question without answering. Carry on with your best judgment, or ask again in your reply if you cannot."
                        .into(),
                ));
            }
        }
        let reply = dialoguer::Input::<String>::new()
            .with_prompt("Your answer")
            .interact_text()
            .unwrap_or_else(|_| "(no answer)".to_string());
        return Ok(answer(true, format!("User responded: {reply}")));
    }

    eprintln!(
        "\n{} {}",
        crate::terminal_style::accent_header("Agent asks:"),
        question
    );

    let reply = dialoguer::Input::<String>::new()
        .with_prompt("Your answer")
        .interact_text()
        .unwrap_or_else(|_| "(no answer)".to_string());

    Ok(answer(true, format!("User responded: {reply}")))
}

fn question_options(raw: Option<&String>) -> Vec<String> {
    let Some(raw) = raw.map(|raw| raw.trim()).filter(|raw| !raw.is_empty()) else {
        return Vec::new();
    };
    let parsed: Vec<String> = match serde_json::from_str::<Vec<serde_json::Value>>(raw) {
        Ok(values) => values
            .into_iter()
            .filter_map(|value| match value {
                serde_json::Value::String(text) => Some(text),
                serde_json::Value::Object(map) => map
                    .get("label")
                    .and_then(serde_json::Value::as_str)
                    .map(str::to_string),
                _ => None,
            })
            .collect(),
        Err(_) => raw.split('\n').map(str::to_string).collect(),
    };
    let mut options: Vec<String> = Vec::new();
    for option in parsed {
        let option = option.trim().to_string();
        if !option.is_empty() && !options.contains(&option) && options.len() < MAX_QUESTION_OPTIONS
        {
            options.push(option);
        }
    }
    options
}

const MAX_QUESTION_OPTIONS: usize = 6;

// ---------------------------------------------------------------------------
// M36: LSP tools
// ---------------------------------------------------------------------------

const MAX_LSP_DOCUMENT_BYTES: u64 = 2_000_000;

fn resolve_lsp_document(
    file: &str,
    root: &std::path::Path,
) -> std::result::Result<(std::path::PathBuf, String), String> {
    let validated = crate::path_security::validate_workspace_path_with_cwd(file, root)
        .map_err(|reason| format!("Refusing to read outside project: {reason}"))?;
    if crate::sensitive_files::is_sensitive_file(file)
        || crate::sensitive_files::is_sensitive_file(&validated.to_string_lossy())
    {
        return Err(crate::sensitive_files::sensitive_refusal(file));
    }
    if !validated.is_file() {
        return Err(format!("No such file: {file}"));
    }
    let document = crate::repo::layout::comparable_path(&validated);
    let uri = crate::platform::lsp::client::path_to_file_uri(&document);
    Ok((document, uri))
}

fn lsp_position(args: &HashMap<String, String>, key: &str) -> u32 {
    args.get(key)
        .and_then(|value| value.parse::<u32>().ok())
        .unwrap_or(0)
}

async fn lsp_request_for_file(
    args: &HashMap<String, String>,
    tool_name: &str,
    method: &str,
    workspace_root: Option<&std::path::Path>,
) -> Result<ToolResult> {
    let refuse = |output: String| ToolResult {
        tool_name: tool_name.into(),
        success: false,
        output,
    };
    let Some(file) = args.get("file").filter(|s| !s.is_empty()) else {
        return Ok(refuse("Missing required argument: file".into()));
    };
    let root = crate::repo::layout::comparable_path(
        &workspace_root
            .map(std::path::Path::to_path_buf)
            .or_else(|| std::env::current_dir().ok())
            .unwrap_or_else(|| std::path::PathBuf::from(".")),
    );
    let (document, uri) = match resolve_lsp_document(file, &root) {
        Ok(resolved) => resolved,
        Err(reason) => return Ok(refuse(reason)),
    };
    let ext = document.extension().and_then(|e| e.to_str()).unwrap_or("");
    let (Some((server_cmd, server_args)), Some(language_id)) = (
        crate::lsp::server_for_extension(ext),
        crate::lsp::language_id_for_extension(ext),
    ) else {
        return Ok(refuse(format!("No LSP server configured for .{ext} files")));
    };
    match tokio::fs::metadata(&document).await {
        Ok(metadata) if metadata.len() > MAX_LSP_DOCUMENT_BYTES => {
            return Ok(refuse(format!(
                "{file} is too large for the language server tools ({} bytes; limit {MAX_LSP_DOCUMENT_BYTES} bytes)",
                metadata.len()
            )));
        }
        Ok(_) => {}
        Err(e) => return Ok(refuse(format!("Failed to inspect {file}: {e}"))),
    }
    let text = match tokio::fs::read_to_string(&document).await {
        Ok(text) => text,
        Err(e) => return Ok(refuse(format!("Failed to read {file}: {e}"))),
    };
    let mut client = match crate::lsp::LspClient::spawn(server_cmd, server_args, &root).await {
        Ok(c) => c,
        Err(e) => return Ok(refuse(format!("Failed to spawn {server_cmd}: {e}"))),
    };
    let text_document = serde_json::json!({"uri": uri});
    let params = match method {
        "textDocument/definition" | "textDocument/hover" | "textDocument/completion" => {
            serde_json::json!({
                "textDocument": text_document,
                "position": {
                    "line": lsp_position(args, "line"),
                    "character": lsp_position(args, "character"),
                },
            })
        }
        "textDocument/formatting" => serde_json::json!({
            "textDocument": text_document,
            "options": {
                "tabSize": args
                    .get("tab_size")
                    .and_then(|value| value.parse::<u32>().ok())
                    .unwrap_or(4),
                "insertSpaces": true,
            },
        }),
        _ => serde_json::json!({"textDocument": text_document}),
    };
    let result = match client.open_document(&uri, language_id, &text).await {
        Ok(()) => client.request(method, params).await,
        Err(e) => Err(e),
    };
    let _ = client.shutdown().await;
    match result {
        Ok(v) => Ok(ToolResult {
            tool_name: tool_name.into(),
            success: true,
            output: serde_json::to_string_pretty(&v).unwrap_or_else(|_| v.to_string()),
        }),
        Err(e) => Ok(refuse(format!("LSP {method} failed: {e}"))),
    }
}

pub(super) async fn execute_lsp_definition(
    args: &HashMap<String, String>,
    workspace_root: Option<&std::path::Path>,
) -> Result<ToolResult> {
    lsp_request_for_file(
        args,
        "lsp_definition",
        "textDocument/definition",
        workspace_root,
    )
    .await
}
pub(super) async fn execute_lsp_hover(
    args: &HashMap<String, String>,
    workspace_root: Option<&std::path::Path>,
) -> Result<ToolResult> {
    lsp_request_for_file(args, "lsp_hover", "textDocument/hover", workspace_root).await
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

pub(super) async fn execute_lsp_completion(
    args: &HashMap<String, String>,
    workspace_root: Option<&std::path::Path>,
) -> Result<ToolResult> {
    lsp_request_for_file(
        args,
        "lsp_completion",
        "textDocument/completion",
        workspace_root,
    )
    .await
}

pub(super) async fn execute_lsp_document_symbols(
    args: &HashMap<String, String>,
    workspace_root: Option<&std::path::Path>,
) -> Result<ToolResult> {
    lsp_request_for_file(
        args,
        "lsp_document_symbols",
        "textDocument/documentSymbol",
        workspace_root,
    )
    .await
}

pub(super) async fn execute_lsp_format(
    args: &HashMap<String, String>,
    workspace_root: Option<&std::path::Path>,
) -> Result<ToolResult> {
    lsp_request_for_file(
        args,
        "lsp_format",
        "textDocument/formatting",
        workspace_root,
    )
    .await
}

#[cfg(test)]
mod lsp_document_tests {
    use super::resolve_lsp_document;

    fn workspace() -> (tempfile::TempDir, std::path::PathBuf) {
        let tmp = tempfile::tempdir().expect("workspace");
        let root = crate::repo::layout::comparable_path(tmp.path());
        (tmp, root)
    }

    #[cfg(unix)]
    #[test]
    fn a_relative_file_resolves_under_the_session_root() {
        let (_tmp, root) = workspace();
        std::fs::create_dir(root.join("src")).expect("create src");
        std::fs::write(root.join("src").join("main.rs"), "fn main() {}\n").expect("seed file");

        let (document, uri) =
            resolve_lsp_document("src/main.rs", &root).expect("a file inside the root");

        assert_eq!(document, root.join("src").join("main.rs"));
        assert_eq!(uri, format!("{}{}/src/main.rs", "file://", root.display()));
    }

    #[cfg(unix)]
    #[test]
    fn reserved_characters_are_escaped_in_the_uri() {
        let (_tmp, root) = workspace();
        std::fs::create_dir(root.join("a b")).expect("create dir");
        std::fs::write(root.join("a b").join("c#d?.py"), "x = 1\n").expect("seed file");

        let (_, uri) = resolve_lsp_document("a b/c#d?.py", &root).expect("a file inside the root");

        assert!(uri.ends_with("/a%20b/c%23d%3F.py"), "{uri}");
    }

    #[test]
    fn a_file_outside_the_root_is_refused_before_any_server_starts() {
        let (_tmp, root) = workspace();
        let outside = tempfile::tempdir().expect("outside");
        let escaped = outside.path().join("x.rs");
        std::fs::write(&escaped, "fn x() {}\n").expect("seed file");

        assert!(resolve_lsp_document("../x.rs", &root).is_err());
        assert!(resolve_lsp_document(&escaped.to_string_lossy(), &root).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn a_symlink_out_of_the_root_is_refused() {
        let (_tmp, root) = workspace();
        let outside = tempfile::tempdir().expect("outside");
        std::fs::write(outside.path().join("x.rs"), "fn x() {}\n").expect("seed file");
        std::os::unix::fs::symlink(outside.path().join("x.rs"), root.join("linked.rs"))
            .expect("create link");

        assert!(resolve_lsp_document("linked.rs", &root).is_err());
    }

    #[test]
    fn credential_files_and_missing_files_are_refused() {
        let (_tmp, root) = workspace();
        std::fs::create_dir(root.join("config")).expect("create config");
        std::fs::write(root.join("config").join("credentials.py"), "TOKEN = 1\n")
            .expect("seed file");

        let refusal = resolve_lsp_document("config/credentials.py", &root)
            .expect_err("a credential file never reaches a language server");

        assert!(refusal.contains("credential-file policy"), "{refusal}");
        assert!(resolve_lsp_document("src/missing.rs", &root).is_err());
    }

    #[test]
    fn no_document_uri_is_built_by_concatenation() {
        let needle = concat!("format!(\"file:", "//");
        assert!(!include_str!("mod.rs").contains(needle));
    }
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
