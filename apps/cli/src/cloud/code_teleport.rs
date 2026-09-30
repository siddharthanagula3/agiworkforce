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

fn git_without_hooks(args: &[&str]) -> Result<String, String> {
    let no_hooks =
        std::env::temp_dir().join(format!("agi-teleport-no-hooks-{}", std::process::id()));
    let hooks_setting = format!("core.hooksPath={}", no_hooks.display());
    let mut full = vec!["-c", hooks_setting.as_str()];
    full.extend_from_slice(args);
    git(&full)
}

fn validate_branch(branch: &str) -> Result<(), String> {
    let refused = || {
        format!(
            "The cloud session's working branch `{}` is not a valid branch name, so it was not \
             fetched.",
            branch.escape_debug()
        )
    };
    let bad_char = |ch: char| {
        ch.is_whitespace()
            || ch.is_control()
            || matches!(ch, ':' | '+' | '\\' | '~' | '^' | '?' | '*' | '[')
    };
    if branch.is_empty()
        || branch.starts_with('-')
        || branch.starts_with('/')
        || branch.ends_with('/')
        || branch.ends_with('.')
        || branch.ends_with(".lock")
        || branch == "@"
        || branch.contains("..")
        || branch.contains("@{")
        || branch.contains("//")
        || branch.chars().any(bad_char)
        || branch
            .split('/')
            .any(|part| part.starts_with('.') || part.ends_with(".lock"))
    {
        return Err(refused());
    }
    Ok(())
}

fn fetch_args(remote: &str, branch: &str) -> Vec<String> {
    vec![
        "fetch".to_string(),
        "--quiet".to_string(),
        "--no-recurse-submodules".to_string(),
        "--".to_string(),
        remote.to_string(),
        format!("refs/heads/{branch}:refs/remotes/{remote}/{branch}"),
    ]
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
    validate_branch(&branch)?;
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
    let fetch = fetch_args(&remote, &branch);
    let fetch: Vec<&str> = fetch.iter().map(String::as_str).collect();
    git_without_hooks(&fetch).map_err(|_| {
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
        git_without_hooks(&["checkout", "--quiet", &branch])?;
        git_without_hooks(&["merge", "--ff-only", "--quiet", &tracking]).map_err(|_| {
            format!(
                "Your local `{branch}` has commits the cloud session does not. Rename or reset \
                 it, then run `agi resume --teleport` again."
            )
        })?;
    } else {
        git_without_hooks(&["checkout", "--quiet", "-b", &branch, "--track", &tracking])?;
    }
    Ok(Teleported {
        remote,
        branch,
        created_branch: !exists,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn session(branch: &str) -> CodeSession {
        CodeSession {
            id: "s1".to_string(),
            title: String::new(),
            state: String::new(),
            repository_url: Some("https://github.com/acme/widgets".to_string()),
            working_branch: Some(branch.to_string()),
            base_branch: None,
            pull_request_url: None,
            archived_at: None,
            last_error: None,
            updated_at: String::new(),
        }
    }

    const MALICIOUS: &[&str] = &[
        "--upload-pack=touch PWNED; git-upload-pack",
        "-b",
        "+x:refs/heads/main",
        "x:refs/heads/main",
        "feature/../main",
        "main@{1}",
        "a\\b",
        "a~1",
        "a^",
        "a?",
        "a*",
        "a[b",
        "feature/",
        "main.lock",
        "a b",
        "a\tb",
        "a\u{7f}b",
        ".hidden",
        "a/.b",
        "a//b",
        "a.",
        "@",
    ];

    #[test]
    fn malicious_branches_are_refused_before_git_runs() {
        for branch in MALICIOUS {
            assert!(validate_branch(branch).is_err(), "accepted {branch:?}");
            let error = check_out(&session(branch)).unwrap_err();
            assert!(
                error.contains("is not a valid branch name"),
                "{branch:?} reached git: {error}"
            );
        }
    }

    #[test]
    fn normal_branch_builds_a_pinned_refspec_after_the_separator() {
        assert!(validate_branch("claude/fix-login_2").is_ok());
        assert_eq!(
            fetch_args("origin", "claude/fix-login_2"),
            vec![
                "fetch",
                "--quiet",
                "--no-recurse-submodules",
                "--",
                "origin",
                "refs/heads/claude/fix-login_2:refs/remotes/origin/claude/fix-login_2",
            ]
        );
    }
}
