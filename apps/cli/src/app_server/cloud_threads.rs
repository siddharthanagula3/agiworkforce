use std::path::Path;

use agiworkforce_app_server::DeveloperSessionHostError;
use agiworkforce_protocol::developer_session::{
    DeveloperMessage, DeveloperSessionSource, DeveloperSessionTrustMode, ThreadLocation,
    ThreadReadResponse, ThreadStatus, ThreadSummary,
};

use crate::cloud::code_handoff::github_full_name;
use crate::cloud::code_sessions::{self, CodeSession, CodeSessionDetail};
use crate::cloud::{CloudClient, CloudError};
use crate::platform::runtime::session::PrivacyMode;

pub const CLOUD_THREAD_PREFIX: &str = "cloud:";
const OPEN_SESSIONS: &str = "open";

pub fn cloud_session_id(thread_id: &str) -> Option<&str> {
    thread_id
        .strip_prefix(CLOUD_THREAD_PREFIX)
        .filter(|id| !id.is_empty())
}

pub fn turn_refusal() -> DeveloperSessionHostError {
    DeveloperSessionHostError::invalid_request(
        "This is a cloud Code session. Continue it on the web, or bring it here with `agi code teleport`.",
    )
}

fn workspace_repository(workspace: &Path) -> Option<String> {
    let output = std::process::Command::new("git")
        .arg("-C")
        .arg(workspace)
        .args(["remote", "get-url", "origin"])
        .output()
        .ok()
        .filter(|output| output.status.success())?;
    github_full_name(String::from_utf8_lossy(&output.stdout).trim())
}

fn session_repository(session: &CodeSession) -> Option<String> {
    session.repository_url.as_deref().and_then(github_full_name)
}

fn summary(session: &CodeSession) -> ThreadSummary {
    let status = match session.state.as_str() {
        "running" | "provisioning" => ThreadStatus::Running,
        "failed" => ThreadStatus::Failed,
        _ => ThreadStatus::Idle,
    };
    ThreadSummary {
        id: format!("{CLOUD_THREAD_PREFIX}{}", session.id),
        title: crate::cloud::code_teleport::title(session),
        model: None,
        cwd: None,
        provider: Some("managed_cloud".to_string()),
        trust_mode: DeveloperSessionTrustMode::Managed,
        created_at: session.updated_at.clone(),
        updated_at: session.updated_at.clone(),
        created_by: DeveloperSessionSource::Unknown,
        status,
        git_branch: session.working_branch.clone(),
        worktree_root: None,
        client: None,
        repository: session.repository_url.clone(),
        writer: None,
        location: Some(ThreadLocation::Cloud),
    }
}

pub async fn list(workspace: &Path) -> Vec<ThreadSummary> {
    list_in(workspace, crate::account_privacy_mode()).await
}

async fn list_in(workspace: &Path, privacy: PrivacyMode) -> Vec<ThreadSummary> {
    let Some(repository) = workspace_repository(workspace) else {
        return Vec::new();
    };
    let Ok(client) = CloudClient::connect(privacy) else {
        return Vec::new();
    };
    match code_sessions::list(&client, OPEN_SESSIONS).await {
        Ok(sessions) => sessions
            .iter()
            .filter(|session| {
                session_repository(session)
                    .is_some_and(|name| name.eq_ignore_ascii_case(&repository))
            })
            .map(summary)
            .collect(),
        Err(error) => {
            tracing::debug!("[app-server] cloud Code sessions were not listed: {error}");
            Vec::new()
        }
    }
}

pub async fn read(session_id: &str) -> Result<ThreadReadResponse, DeveloperSessionHostError> {
    read_in(session_id, crate::account_privacy_mode()).await
}

async fn read_in(
    session_id: &str,
    privacy: PrivacyMode,
) -> Result<ThreadReadResponse, DeveloperSessionHostError> {
    let client = CloudClient::connect(privacy).map_err(|error| match error {
        CloudError::NotManaged(_) => DeveloperSessionHostError::unavailable(error.to_string()),
        _ => DeveloperSessionHostError::unavailable(
            "Sign in with `agi login` to read cloud Code sessions.",
        ),
    })?;
    let detail = code_sessions::show(&client, session_id)
        .await
        .map_err(|error| match error {
            CloudError::Api { status: 404, .. } => {
                DeveloperSessionHostError::not_found("That cloud Code session was not found.")
            }
            other => DeveloperSessionHostError::unavailable(other.to_string()),
        })?;
    Ok(thread_read(&detail))
}

fn thread_read(detail: &CodeSessionDetail) -> ThreadReadResponse {
    let messages = crate::cloud::code_teleport::history(detail)
        .iter()
        .enumerate()
        .map(|(index, message)| DeveloperMessage {
            role: message.role.clone(),
            text: message.text_content(),
            index: u32::try_from(index).ok(),
            turn_id: None,
        })
        .collect();
    ThreadReadResponse {
        child_tasks: None,
        thread: summary(&detail.session),
        messages,
        transcript_truncated: detail.turns_truncated,
        approvals: Vec::new(),
        file_changes: Vec::new(),
        plan: Vec::new(),
        todos: Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_cloud_session_is_listed_as_a_cloud_thread() {
        let session: CodeSession = serde_json::from_value(serde_json::json!({
            "id": "5f1c",
            "title": "Fix the flaky test",
            "state": "running",
            "repositoryUrl": "https://github.com/acme/app.git",
            "workingBranch": "agi/fix-flaky",
            "updatedAt": "2026-09-29T10:00:00Z",
        }))
        .expect("session");
        let thread = summary(&session);
        assert_eq!(thread.id, "cloud:5f1c");
        assert_eq!(thread.location, Some(ThreadLocation::Cloud));
        assert_eq!(thread.status, ThreadStatus::Running);
        assert_eq!(cloud_session_id(&thread.id), Some("5f1c"));
        assert_eq!(cloud_session_id("5f1c"), None);
        assert_eq!(session_repository(&session).as_deref(), Some("acme/app"));
    }

    fn detail(truncated: bool) -> CodeSessionDetail {
        serde_json::from_value(serde_json::json!({
            "session": { "id": "5f1c", "title": "Fix the flaky test" },
            "turns": [{ "goal": "fix it", "finalMessage": "fixed" }],
            "turnsTruncated": truncated,
        }))
        .expect("detail")
    }

    #[test]
    fn a_cloud_thread_read_reports_a_bounded_window_as_truncated() {
        let read = thread_read(&detail(true));
        assert_eq!(read.messages.len(), 2);
        assert!(read.transcript_truncated);
    }

    #[test]
    fn a_cloud_thread_read_of_a_whole_session_is_not_truncated() {
        let read = thread_read(&detail(false));
        assert_eq!(read.messages.len(), 2);
        assert!(!read.transcript_truncated);
    }

    #[tokio::test]
    async fn a_local_or_byok_session_never_lists_or_reads_cloud_code_sessions() {
        let workspace = tempfile::tempdir().expect("workspace");
        std::process::Command::new("git")
            .args(["init", "--quiet"])
            .current_dir(workspace.path())
            .status()
            .expect("git init");
        std::process::Command::new("git")
            .args(["remote", "add", "origin", "https://github.com/acme/app.git"])
            .current_dir(workspace.path())
            .status()
            .expect("git remote");
        assert_eq!(
            workspace_repository(workspace.path()).as_deref(),
            Some("acme/app")
        );
        for mode in [PrivacyMode::Local, PrivacyMode::Byok] {
            assert!(list_in(workspace.path(), mode).await.is_empty());
            let refused = read_in("5f1c", mode)
                .await
                .expect_err("a cloud session read must be refused outside Cloud mode");
            assert!(
                refused
                    .to_string()
                    .contains(&CloudError::NotManaged(mode).to_string()),
                "{refused}"
            );
        }
    }
}
