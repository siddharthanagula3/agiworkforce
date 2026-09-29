use crate::models::Message;

use super::code_handoff::{git, github_full_name, working_tree_changes};
use super::code_sessions::{CodeSession, CodeSessionDetail};

const LOCAL_SESSION_PREFIX: &str = "code-";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Teleported {
    pub remote: String,
    pub branch: String,
    pub created_branch: bool,
}

pub fn local_session_id(session_id: &str) -> String {
    format!("{LOCAL_SESSION_PREFIX}{session_id}")
}

pub fn title(session: &CodeSession) -> String {
    let title = session.title.trim();
    if title.is_empty() {
        format!("Cloud Code session {}", session.id)
    } else {
        title.to_string()
    }
}

pub fn history(detail: &CodeSessionDetail) -> Vec<Message> {
    let mut messages = Vec::new();
    for turn in &detail.turns {
        let goal = turn.goal.trim();
        if goal.is_empty() {
            continue;
        }
        messages.push(Message::text("user", goal));
        let answer = match (turn.final_message.trim(), turn.error_message.as_deref()) {
            (message, _) if !message.is_empty() => message.to_string(),
            (_, Some(error)) => format!("The cloud turn stopped: {error}"),
            _ => "The cloud turn ended without a reply.".to_string(),
        };
        messages.push(Message::text("assistant", &answer));
    }
    messages
}

fn matching_remote(full_name: &str) -> Result<String, String> {
    let remotes = git(&["remote"]).map_err(|_| {
        "Run `agi resume --teleport` inside a checkout of the session's repository.".to_string()
    })?;
    remotes
        .lines()
        .map(str::trim)
        .filter(|remote| !remote.is_empty())
        .find(|remote| {
            git(&["remote", "get-url", remote])
                .ok()
                .and_then(|url| github_full_name(url.trim()))
                .is_some_and(|name| name.eq_ignore_ascii_case(full_name))
        })
        .map(str::to_string)
        .ok_or_else(|| {
            format!(
                "This checkout is not {full_name}. Run `agi resume --teleport` from a checkout of \
                 that repository, not a fork."
            )
        })
}

pub fn check_out(session: &CodeSession) -> Result<Teleported, String> {
    let full_name = session
        .repository_url
        .as_deref()
        .and_then(github_full_name)
        .ok_or_else(|| {
            "This cloud session has no GitHub repository, so there is no branch to bring here. \
             Use `agi resume --teleport` for sessions started on a repository."
                .to_string()
        })?;
    let branch = session
        .working_branch
        .as_deref()
        .map(str::trim)
        .filter(|branch| !branch.is_empty())
        .ok_or_else(|| "This cloud session has no working branch yet.".to_string())?
        .to_string();
    git(&["rev-parse", "--show-toplevel"])
        .map_err(|_| format!("Run `agi resume --teleport` inside a checkout of {full_name}."))?;
    let remote = matching_remote(&full_name)?;
    let (changed, _) = working_tree_changes()?;
    if !changed.is_empty() {
        return Err(format!(
            "This checkout has uncommitted changes ({}). Commit or stash them first, then run \
             `agi resume --teleport` again.",
            changed.join(", ")
        ));
    }
    git(&["fetch", "--quiet", &remote, &branch]).map_err(|_| {
        format!(
            "`{branch}` is not on GitHub yet. Commit and push it from the cloud session first, \
             then run `agi resume --teleport` again."
        )
    })?;
    let tracking = format!("{remote}/{branch}");
    let exists = git(&[
        "rev-parse",
        "--verify",
        "--quiet",
        &format!("refs/heads/{branch}"),
    ])
    .is_ok();
    if exists {
        git(&["checkout", "--quiet", &branch])?;
        git(&["merge", "--ff-only", "--quiet", &tracking]).map_err(|_| {
            format!(
                "Your local `{branch}` has commits the cloud session does not. Rename or reset \
                 it, then run `agi resume --teleport` again."
            )
        })?;
    } else {
        git(&["checkout", "--quiet", "-b", &branch, "--track", &tracking])?;
    }
    Ok(Teleported {
        remote,
        branch,
        created_branch: !exists,
    })
}
