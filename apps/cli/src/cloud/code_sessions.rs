use serde::{Deserialize, Serialize};

use super::client::{CloudClient, CloudError};

pub const CODE_SESSIONS_PATH: &str = "/api/code/sessions";
pub const CODE_PAGE_ROUTE: &str = "/code";
pub const STATUS_FILTERS: [&str; 4] = ["open", "closed", "archived", "all"];

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodeSession {
    pub id: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub state: String,
    #[serde(default)]
    pub repository_url: Option<String>,
    #[serde(default)]
    pub working_branch: Option<String>,
    #[serde(default)]
    pub base_branch: Option<String>,
    #[serde(default)]
    pub pull_request_url: Option<String>,
    #[serde(default)]
    pub archived_at: Option<String>,
    #[serde(default)]
    pub last_error: Option<String>,
    #[serde(default)]
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodeStep {
    #[serde(default)]
    pub tool_name: String,
    #[serde(default)]
    pub label: Option<String>,
    #[serde(default)]
    pub is_error: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodeTurn {
    #[serde(default)]
    pub goal: String,
    #[serde(default)]
    pub stop_reason: Option<String>,
    #[serde(default)]
    pub final_message: String,
    #[serde(default)]
    pub error_message: Option<String>,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub steps: Vec<CodeStep>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CodeSessionDetail {
    pub session: CodeSession,
    #[serde(default)]
    pub turns: Vec<CodeTurn>,
}

#[derive(Debug, Deserialize)]
struct CodeSessionList {
    #[serde(default)]
    sessions: Vec<CodeSession>,
}

pub async fn list(client: &CloudClient, status: &str) -> Result<Vec<CodeSession>, CloudError> {
    let list: CodeSessionList = client
        .get(CODE_SESSIONS_PATH, &[("status", status.to_string())])
        .await?;
    Ok(list.sessions)
}

pub async fn show(client: &CloudClient, id: &str) -> Result<CodeSessionDetail, CloudError> {
    client.get(&session_path(id), &[]).await
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodeApproval {
    pub turn_id: String,
    pub step_index: u32,
    #[serde(default)]
    pub command: String,
    #[serde(default)]
    pub reason: String,
    #[serde(default)]
    pub goal: String,
    #[serde(default)]
    pub expires_at: String,
}

#[derive(Debug, Deserialize)]
struct CodeApprovalList {
    #[serde(default)]
    approvals: Vec<CodeApproval>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CodeApprovalDecision<'a> {
    turn_id: &'a str,
    step_index: u32,
    decision: &'a str,
}

const APPROVAL_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(300);

pub async fn approvals(client: &CloudClient, id: &str) -> Result<Vec<CodeApproval>, CloudError> {
    let list: CodeApprovalList = client
        .get(&format!("{}/agent/approvals", session_path(id)), &[])
        .await?;
    Ok(list.approvals)
}

pub async fn decide_approval(
    client: &CloudClient,
    id: &str,
    turn_id: &str,
    step_index: u32,
    approve: bool,
) -> Result<serde_json::Value, CloudError> {
    let decision = if approve { "approve" } else { "reject" };
    client
        .post_idempotent(
            &format!("{}/agent/approvals", session_path(id)),
            &format!("code-approval:{id}:{turn_id}:{step_index}:{decision}"),
            &CodeApprovalDecision {
                turn_id,
                step_index,
                decision,
            },
            APPROVAL_TIMEOUT,
        )
        .await
}

pub fn approval_handle(session_id: &str, approval: &CodeApproval) -> String {
    format!("{session_id}/{}/{}", approval.turn_id, approval.step_index)
}

pub fn parse_approval_handle(handle: &str) -> Option<(&str, &str, u32)> {
    let mut parts = handle.trim().splitn(3, '/');
    let session = parts.next().filter(|part| !part.is_empty())?;
    let turn = parts.next().filter(|part| !part.is_empty())?;
    let step = parts.next()?.parse().ok()?;
    Some((session, turn, step))
}

pub fn render_approvals(pending: &[(CodeSession, Vec<CodeApproval>)]) -> String {
    let sanitize = |text: &str| crate::terminal_text::sanitize_terminal_text(text).into_owned();
    let count: usize = pending.iter().map(|(_, approvals)| approvals.len()).sum();
    if count == 0 {
        return "No cloud Code session is waiting for an approval.".to_string();
    }
    let mut lines = vec![format!(
        "{count} approval(s) waiting in cloud Code sessions:"
    )];
    for (session, approvals) in pending {
        for approval in approvals {
            lines.push(format!(
                "  {}  {}",
                approval_handle(&session.id, approval),
                sanitize(&session.title)
            ));
            lines.push(format!("      runs: {}", sanitize(&approval.command)));
            if !approval.reason.is_empty() {
                lines.push(format!("      why: {}", sanitize(&approval.reason)));
            }
            if !approval.expires_at.is_empty() {
                lines.push(format!("      expires: {}", sanitize(&approval.expires_at)));
            }
        }
    }
    lines
        .push("Answer with `agi code approve <handle>` or `agi code reject <handle>`.".to_string());
    lines.join("\n")
}

pub fn session_path(id: &str) -> String {
    format!("{CODE_SESSIONS_PATH}/{}", encode_segment(id))
}

pub fn page_url(base: &str, id: &str) -> String {
    format!(
        "{}{CODE_PAGE_ROUTE}/{}",
        base.trim_end_matches('/'),
        encode_segment(id)
    )
}

fn encode_segment(id: &str) -> String {
    id.bytes()
        .map(|byte| {
            if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.') {
                (byte as char).to_string()
            } else {
                format!("%{byte:02X}")
            }
        })
        .collect()
}

fn where_it_works(session: &CodeSession) -> String {
    match (
        session.repository_url.as_deref(),
        session.working_branch.as_deref(),
    ) {
        (Some(repository), Some(branch)) => format!("{repository} on {branch}"),
        (Some(repository), None) => repository.to_string(),
        _ => "no repository".to_string(),
    }
}

pub fn render_list(sessions: &[CodeSession], status: &str) -> String {
    if sessions.is_empty() {
        return match status {
            "archived" => "No archived cloud Code sessions.".to_string(),
            "closed" => "No closed cloud Code sessions.".to_string(),
            _ => "No cloud Code sessions yet. Start one with `agi code start \"<task>\"` from a GitHub checkout, or on the web at /code.".to_string(),
        };
    }
    let mut lines = vec![format!("Cloud Code sessions ({})", sessions.len())];
    for session in sessions {
        let state = if session.archived_at.is_some() {
            "archived"
        } else {
            session.state.as_str()
        };
        lines.push(format!(
            "  {}  {}  [{}]  {}",
            session.id,
            if session.title.trim().is_empty() {
                "Untitled"
            } else {
                session.title.trim()
            },
            state,
            where_it_works(session)
        ));
    }
    lines.push(String::new());
    lines.push(
        "Show one with `agi code show <id>`, open it in the browser with `agi code open <id>`, \
         or continue it in this checkout with `agi resume --teleport <id>`."
            .to_string(),
    );
    lines.join("\n")
}

pub fn render_detail(detail: &CodeSessionDetail, url: &str) -> String {
    let session = &detail.session;
    let mut lines = vec![
        format!(
            "{} ({})",
            if session.title.trim().is_empty() {
                "Untitled"
            } else {
                session.title.trim()
            },
            session.id
        ),
        format!("  State: {}", session.state),
        format!("  Works on: {}", where_it_works(session)),
    ];
    if let Some(base) = session.base_branch.as_deref() {
        lines.push(format!("  Measured against: {base}"));
    }
    if let Some(pull_request) = session.pull_request_url.as_deref() {
        lines.push(format!("  Pull request: {pull_request}"));
    }
    if let Some(error) = session.last_error.as_deref() {
        lines.push(format!("  Last error: {error}"));
    }
    lines.push(format!("  Open: {url}"));
    if detail.turns.is_empty() {
        lines.push(String::new());
        lines.push("No turns yet.".to_string());
    }
    for turn in &detail.turns {
        lines.push(String::new());
        lines.push(format!("> {}", turn.goal.trim()));
        for step in &turn.steps {
            lines.push(format!(
                "  {} {}",
                if step.is_error { "x" } else { "-" },
                step.label.as_deref().unwrap_or(step.tool_name.as_str())
            ));
        }
        if !turn.final_message.trim().is_empty() {
            lines.push(turn.final_message.trim().to_string());
        }
        if let Some(error) = turn.error_message.as_deref() {
            lines.push(format!("Error: {error}"));
        }
    }
    lines.join("\n")
}
