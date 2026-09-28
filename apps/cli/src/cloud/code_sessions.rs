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
    client
        .get(&format!("{CODE_SESSIONS_PATH}/{}", encode_segment(id)), &[])
        .await
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
            _ => "No cloud Code sessions yet. Start one on the web at /code.".to_string(),
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
        "Show one with `agi code show <id>`; open it in the browser with `agi code open <id>`."
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
