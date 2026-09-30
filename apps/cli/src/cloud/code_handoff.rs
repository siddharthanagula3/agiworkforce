use std::process::Command;
use std::time::Duration;

use serde::{Deserialize, Serialize};

use super::client::{CloudClient, CloudError};
use super::code_sessions::{session_path, CodeSession, CodeStep, CODE_SESSIONS_PATH};

pub const TASK_LIMIT: usize = 8_000;
pub const TITLE_LIMIT: usize = 120;
pub const NETWORK_ACCESS: &str = "trusted";
const REPOSITORIES_PATH: &str = "/api/github/repositories";
const CREATE_TIMEOUT: Duration = Duration::from_secs(300);
const TURN_TIMEOUT: Duration = Duration::from_secs(330);
const LISTED_PATHS: usize = 6;
const TASK_PREVIEW_CHARS: usize = 160;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Checkout {
    pub full_name: String,
    pub remote: String,
    pub branch: String,
    pub remote_commit: String,
    pub unpushed_commits: usize,
    pub changed_files: Vec<String>,
    pub untracked_files: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Access {
    Installation {
        installation_id: u64,
        full_name: String,
        private: bool,
    },
    PublicClone,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Review {
    pub moves: Vec<String>,
    pub stays: Vec<String>,
    pub access: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingApproval {
    #[serde(default)]
    pub tool_name: String,
    #[serde(default)]
    pub command: String,
    #[serde(default)]
    pub reason: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TurnOutcome {
    #[serde(default)]
    pub turn_id: String,
    pub stop_reason: String,
    #[serde(default)]
    pub steps_used: u32,
    #[serde(default)]
    pub final_message: String,
    #[serde(default)]
    pub steps: Vec<CodeStep>,
    #[serde(default)]
    pub pending_approval: Option<PendingApproval>,
    #[serde(default)]
    pub error_message: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct InstallationRepository {
    installation_id: u64,
    full_name: String,
    #[serde(default)]
    is_private: bool,
}

#[derive(Debug, Deserialize)]
struct RepositoryList {
    #[serde(default)]
    repositories: Vec<InstallationRepository>,
}

#[derive(Debug, Deserialize)]
struct CreatedSession {
    session: CodeSession,
}

pub fn validate_task(task: &str) -> Result<String, String> {
    let task = task.trim();
    if task.is_empty() {
        return Err("Say what the cloud session should do: agi code start \"<task>\"".to_string());
    }
    if task.contains('\0') {
        return Err("The task cannot contain a null byte.".to_string());
    }
    let length = task.encode_utf16().count();
    if length > TASK_LIMIT {
        return Err(format!(
            "The task is {length} characters; a cloud session takes at most {TASK_LIMIT}."
        ));
    }
    Ok(task.to_string())
}

pub fn title_for(task: &str) -> String {
    let line = task
        .lines()
        .map(|line| line.split_whitespace().collect::<Vec<_>>().join(" "))
        .find(|line| !line.is_empty())
        .unwrap_or_default();
    if line.encode_utf16().count() <= TITLE_LIMIT {
        return line;
    }
    let mut title = String::new();
    let mut length = 0;
    for character in line.chars() {
        if length + character.len_utf16() > TITLE_LIMIT - 1 {
            break;
        }
        length += character.len_utf16();
        title.push(character);
    }
    format!("{}…", title.trim_end())
}

pub(crate) fn git(args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .args(args)
        .env("GIT_OPTIONAL_LOCKS", "0")
        .output()
        .map_err(|error| format!("could not run git: {error}"))?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).into_owned())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

pub fn github_full_name(url: &str) -> Option<String> {
    let url = url.trim();
    let (host, path) = match url.split_once("://") {
        Some((_, rest)) => {
            let (authority, path) = rest.split_once('/')?;
            let host = authority
                .rsplit_once('@')
                .map_or(authority, |(_, host)| host);
            (host.split(':').next()?, path)
        }
        None => {
            let (authority, path) = url.split_once(':')?;
            (
                authority
                    .rsplit_once('@')
                    .map_or(authority, |(_, host)| host),
                path,
            )
        }
    };
    if !host.eq_ignore_ascii_case("github.com") && !host.eq_ignore_ascii_case("www.github.com") {
        return None;
    }
    let path = path.trim_matches('/');
    let path = path.strip_suffix(".git").unwrap_or(path);
    let (owner, name) = path.split_once('/')?;
    let valid = |part: &str| {
        !part.is_empty()
            && part
                .chars()
                .all(|character| character.is_ascii_alphanumeric() || "._-".contains(character))
    };
    (valid(owner) && valid(name)).then(|| format!("{owner}/{name}"))
}

pub(crate) fn working_tree_changes() -> Result<(Vec<String>, Vec<String>), String> {
    let status = git(&[
        "-c",
        "core.fsmonitor=false",
        "status",
        "--porcelain=v1",
        "-z",
        "--untracked-files=normal",
    ])?;
    let mut changed = Vec::new();
    let mut untracked = Vec::new();
    let mut entries = status.split('\0').filter(|entry| !entry.is_empty());
    while let Some(entry) = entries.next() {
        let Some((code, path)) = entry.get(..2).zip(entry.get(3..)) else {
            continue;
        };
        if code == "??" {
            untracked.push(path.to_string());
            continue;
        }
        if code.contains('R') || code.contains('C') {
            entries.next();
        }
        changed.push(path.to_string());
    }
    Ok((changed, untracked))
}

pub fn inspect() -> Result<Checkout, String> {
    git(&["rev-parse", "--show-toplevel"]).map_err(|_| {
        "Run `agi code start` inside a git checkout of a GitHub repository: the cloud session \
         clones it from GitHub."
            .to_string()
    })?;
    let local_branch = git(&["symbolic-ref", "--quiet", "--short", "HEAD"])
        .map(|branch| branch.trim().to_string())
        .map_err(|_| {
            "HEAD is detached. Check out the branch the cloud session should start from, and \
             push it to GitHub."
                .to_string()
        })?;
    let upstream = git(&[
        "for-each-ref",
        "--format=%(upstream:remotename) %(upstream:remoteref)",
        &format!("refs/heads/{local_branch}"),
    ])
    .unwrap_or_default();
    let (remote, branch) = match upstream.trim().split_once(' ') {
        Some((remote, remote_ref))
            if !remote.is_empty() && remote_ref.starts_with("refs/heads/") =>
        {
            (
                remote.to_string(),
                remote_ref.trim_start_matches("refs/heads/").to_string(),
            )
        }
        _ => ("origin".to_string(), local_branch.clone()),
    };
    let url = git(&["remote", "get-url", &remote])
        .map(|url| url.trim().to_string())
        .map_err(|_| {
            format!(
                "This checkout has no `{remote}` remote, so a cloud session has no GitHub \
                 repository to clone. Add one and push `{local_branch}` first."
            )
        })?;
    let full_name = github_full_name(&url).ok_or_else(|| {
        format!(
            "Cloud sessions clone from GitHub, and the `{remote}` remote of this checkout is {url}."
        )
    })?;
    let remote_commit = git(&[
        "rev-parse",
        "--verify",
        "--quiet",
        &format!("refs/remotes/{remote}/{branch}^{{commit}}"),
    ])
    .map(|commit| commit.trim().to_string())
    .map_err(|_| {
        format!(
            "`{branch}` is not on GitHub as far as this checkout knows, so the cloud session \
             has nothing to clone. Push it with `git push -u {remote} {local_branch}`, or run \
             `git fetch {remote}` if it is already there."
        )
    })?;
    let unpushed_commits = git(&["rev-list", "--count", &format!("{remote_commit}..HEAD")])
        .ok()
        .and_then(|count| count.trim().parse().ok())
        .unwrap_or(0);
    let (changed_files, untracked_files) = working_tree_changes()?;
    Ok(Checkout {
        full_name,
        remote,
        branch,
        remote_commit,
        unpushed_commits,
        changed_files,
        untracked_files,
    })
}

pub async fn repository_access(
    client: &CloudClient,
    full_name: &str,
) -> Result<Access, CloudError> {
    let list: RepositoryList = client
        .get(REPOSITORIES_PATH, &[("search", full_name.to_string())])
        .await?;
    Ok(list
        .repositories
        .into_iter()
        .find(|repository| repository.full_name.eq_ignore_ascii_case(full_name))
        .map(|repository| Access::Installation {
            installation_id: repository.installation_id,
            full_name: repository.full_name,
            private: repository.is_private,
        })
        .unwrap_or(Access::PublicClone))
}

fn plural(count: usize, one: &str, many: &str) -> String {
    format!("{count} {}", if count == 1 { one } else { many })
}

fn listed(paths: &[String]) -> String {
    let shown = paths
        .iter()
        .take(LISTED_PATHS)
        .map(String::as_str)
        .collect::<Vec<_>>()
        .join(", ");
    match paths.len().saturating_sub(LISTED_PATHS) {
        0 => shown,
        more => format!("{shown} and {more} more"),
    }
}

pub fn review(checkout: &Checkout, access: &Access, model: &str, base: &str) -> Review {
    let short_commit: String = checkout.remote_commit.chars().take(7).collect();
    let moves = vec![
        format!(
            "{} on GitHub at {}, as GitHub has it ({short_commit} as of your last fetch)",
            checkout.full_name, checkout.branch
        ),
        format!(
            "the task, for {} to work on in a sandbox with Trusted hosts network access \
             (package registries and code hosts only)",
            crate::model_catalog::display_name(model)
        ),
    ];
    let mut stays = Vec::new();
    if checkout.unpushed_commits > 0 {
        stays.push(format!(
            "{} on {} that GitHub does not have yet: push first with `git push`",
            plural(checkout.unpushed_commits, "commit", "commits"),
            checkout.branch
        ));
    }
    if !checkout.changed_files.is_empty() {
        stays.push(format!(
            "{}: {}",
            plural(
                checkout.changed_files.len(),
                "changed file",
                "changed files"
            ),
            listed(&checkout.changed_files)
        ));
    }
    if !checkout.untracked_files.is_empty() {
        stays.push(format!(
            "{}: {}",
            plural(
                checkout.untracked_files.len(),
                "untracked file",
                "untracked files"
            ),
            listed(&checkout.untracked_files)
        ));
    }
    stays.push(
        "this terminal's conversations, environment variables, MCP servers and local settings"
            .to_string(),
    );
    let access = match access {
        Access::Installation {
            full_name, private, ..
        } => format!(
            "the AGI Workforce GitHub app can clone {full_name}{}.",
            if *private { " (private)" } else { "" }
        ),
        Access::PublicClone => format!(
            "{} is not in a GitHub installation you connected, so the session clones it as a \
             public repository. A private repository needs the GitHub app: connect GitHub on \
             the Code page ({}/code) first.",
            checkout.full_name,
            base.trim_end_matches('/')
        ),
    };
    Review {
        moves,
        stays,
        access,
    }
}

pub fn render_review(review: &Review, task: &str) -> String {
    let preview: String = task.chars().take(TASK_PREVIEW_CHARS).collect();
    let mut lines = vec![
        "Hand this task to a cloud Code session:".to_string(),
        format!(
            "  \"{}{}\"",
            preview.split_whitespace().collect::<Vec<_>>().join(" "),
            if task.chars().count() > TASK_PREVIEW_CHARS {
                "…"
            } else {
                ""
            }
        ),
        String::new(),
        "What moves to the cloud".to_string(),
    ];
    lines.extend(review.moves.iter().map(|line| format!("  - {line}")));
    lines.push("What stays on this machine".to_string());
    lines.extend(review.stays.iter().map(|line| format!("  - {line}")));
    lines.push(format!("Access: {}", review.access));
    lines.join("\n")
}

pub fn create_body(
    request_id: &str,
    title: &str,
    checkout: &Checkout,
    access: &Access,
) -> serde_json::Value {
    match access {
        Access::Installation {
            installation_id,
            full_name,
            ..
        } => serde_json::json!({
            "requestId": request_id,
            "title": title,
            "networkAccess": NETWORK_ACCESS,
            "repository": {
                "installationId": installation_id,
                "fullName": full_name,
                "branch": checkout.branch,
            },
        }),
        Access::PublicClone => serde_json::json!({
            "requestId": request_id,
            "title": title,
            "networkAccess": NETWORK_ACCESS,
            "repositoryUrl": format!("https://github.com/{}.git", checkout.full_name),
            "repositoryBranch": checkout.branch,
        }),
    }
}

pub async fn create(
    client: &CloudClient,
    body: &serde_json::Value,
) -> Result<CodeSession, CloudError> {
    let reply = client
        .post_reply(CODE_SESSIONS_PATH, None, body, CREATE_TIMEOUT)
        .await?;
    if !reply.is_success() {
        return Err(CloudError::Api {
            status: reply.status,
            message: crate::schedules::api_error_message(&reply.body),
        });
    }
    serde_json::from_str::<CreatedSession>(&reply.body)
        .map(|created| created.session)
        .map_err(|error| CloudError::Decode(error.to_string()))
}

pub async fn start_turn(
    client: &CloudClient,
    session_id: &str,
    task: &str,
    model: &str,
) -> Result<TurnOutcome, CloudError> {
    client
        .post_idempotent(
            &format!("{}/agent", session_path(session_id)),
            &format!("agi.code.cli.turn.{}", uuid::Uuid::new_v4()),
            &serde_json::json!({ "goal": task, "model": model }),
            TURN_TIMEOUT,
        )
        .await
}

pub async fn cancel_turn(client: &CloudClient, session_id: &str) -> Result<(), CloudError> {
    client
        .post::<_, serde_json::Value>(
            &format!("{}/agent/cancel", session_path(session_id)),
            &serde_json::json!({}),
        )
        .await
        .map(|_| ())
}

pub fn render_outcome(outcome: &TurnOutcome, url: &str) -> String {
    let mut lines = Vec::new();
    for step in &outcome.steps {
        lines.push(format!(
            "  {} {}",
            if step.is_error { "x" } else { "-" },
            step.label.as_deref().unwrap_or(step.tool_name.as_str())
        ));
    }
    if !outcome.final_message.trim().is_empty() {
        lines.push(outcome.final_message.trim().to_string());
    }
    let stopped = match outcome.stop_reason.as_str() {
        "done" => None,
        "awaiting_approval" => Some(match &outcome.pending_approval {
            Some(approval) => format!(
                "Waiting for your approval to run `{}`{}. Approve or deny it at {url}",
                if approval.command.trim().is_empty() {
                    approval.tool_name.as_str()
                } else {
                    approval.command.trim()
                },
                if approval.reason.trim().is_empty() {
                    String::new()
                } else {
                    format!(" ({})", approval.reason.trim())
                }
            ),
            None => format!("Waiting for your approval. Approve or deny it at {url}"),
        }),
        "max_steps" => Some(format!(
            "Stopped at the step limit after {} steps. Continue it at {url}",
            outcome.steps_used
        )),
        "timeout" => Some(format!(
            "Stopped when the turn ran out of time. Continue it at {url}"
        )),
        "cancelled" => Some("Stopped.".to_string()),
        "denied" => Some(format!("Stopped: a step was denied. Continue it at {url}")),
        _ => Some(format!(
            "The turn failed: {}",
            outcome
                .error_message
                .as_deref()
                .unwrap_or("the cloud session did not say why")
        )),
    };
    if let Some(stopped) = stopped {
        lines.push(stopped);
    }
    lines.join("\n")
}

pub fn render_session(session: &CodeSession, remote: &str, url: &str) -> String {
    let mut lines = vec![
        format!("Session: {} ({})", session.id, session.title.trim()),
        format!("Open: {url}"),
    ];
    if let Some(branch) = session.working_branch.as_deref() {
        lines.push(format!(
            "Once the session pushes {branch}, bring it here with `git fetch {remote} {branch} && git switch {branch}`."
        ));
    }
    lines.join("\n")
}
