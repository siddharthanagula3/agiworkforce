use std::path::Path;
use std::time::Duration;

use agiworkforce_app_server::DeveloperSessionHostError;
use agiworkforce_protocol::developer_session::{
    GitPullRequestCommit, GitPullRequestParams, GitPullRequestPlanResponse, GitPullRequestResponse,
};
use async_trait::async_trait;

use crate::platform::runtime::git::{GitApi, PushForce, PushPlan, PushReason};
use crate::safety::push_consent::{request_push_consent, PushApprovalPrompt, PushApprover};
use crate::tui::approval_broker::ApprovalDecision;

const PULL_REQUEST_REMOTE: &str = "origin";
const MAX_TITLE_CHARS: usize = 256;
const MAX_BODY_CHARS: usize = 65_536;
const MAX_REF_CHARS: usize = 255;
const GH_TIMEOUT: Duration = Duration::from_secs(90);

fn invalid(message: impl Into<String>) -> DeveloperSessionHostError {
    DeveloperSessionHostError::invalid_request(message)
}

fn internal(error: impl std::fmt::Display) -> DeveloperSessionHostError {
    DeveloperSessionHostError::internal(error.to_string())
}

fn repository_policy(root: &Path) -> agiworkforce_protocol::code_domain::RepositoryPolicy {
    crate::context::gather_repository(root)
        .map(|repository| repository.policy)
        .unwrap_or_default()
}

fn only_nothing_to_push(plan: &PushPlan) -> bool {
    plan.upstream.is_some()
        && plan
            .reasons
            .iter()
            .filter(|reason| reason.blocks())
            .all(|reason| matches!(reason, PushReason::NothingToPush))
}

fn blocking_reason(plan: &PushPlan) -> Option<String> {
    if only_nothing_to_push(plan) {
        return None;
    }
    plan.blocked_by().map(PushReason::label)
}

async fn push_plan(root: &Path) -> Result<PushPlan, DeveloperSessionHostError> {
    GitApi::at(root)
        .push_plan(
            PULL_REQUEST_REMOTE,
            PushForce::Never,
            &repository_policy(root),
        )
        .await
        .map_err(internal)
}

pub async fn plan(root: &Path) -> Result<GitPullRequestPlanResponse, DeveloperSessionHostError> {
    let plan = push_plan(root).await?;
    let base = repository_policy(root)
        .default_branch
        .filter(|base| *base != plan.branch);
    Ok(GitPullRequestPlanResponse {
        remote: plan.remote.clone(),
        branch: plan.branch.clone(),
        head: plan.head.clone(),
        base,
        commits: plan
            .commits
            .iter()
            .map(|commit| GitPullRequestCommit {
                commit: commit.commit.clone(),
                subject: commit.subject.clone(),
            })
            .collect(),
        needs_push: !plan.commits.is_empty(),
        notices: plan
            .approvals()
            .into_iter()
            .map(PushReason::label)
            .collect(),
        blocked: blocking_reason(&plan),
    })
}

struct ConfirmedPush {
    remote: String,
    branch: String,
    head: String,
    commits: usize,
}

#[async_trait]
impl PushApprover for ConfirmedPush {
    async fn ask(&self, prompt: &PushApprovalPrompt) -> ApprovalDecision {
        if prompt.remote() == self.remote
            && prompt.branch() == self.branch
            && prompt.head() == self.head
            && prompt.commits() == self.commits
            && prompt.force() == PushForce::Never
        {
            ApprovalDecision::AllowOnce
        } else {
            ApprovalDecision::Deny
        }
    }
}

fn valid_ref(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= MAX_REF_CHARS
        && !name.starts_with('-')
        && !name.contains("..")
        && !name
            .chars()
            .any(|c| c.is_whitespace() || c.is_control() || "~^:?*[\\".contains(c))
}

async fn run(root: &Path, program: &str, args: &[&str]) -> Result<String, String> {
    let mut command = tokio::process::Command::new(program);
    command
        .args(args)
        .current_dir(root)
        .env("GH_PROMPT_DISABLED", "1")
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true);
    let output = match tokio::time::timeout(GH_TIMEOUT, command.output()).await {
        Err(_) => return Err(format!("{program} did not answer in time")),
        Ok(Err(error)) if error.kind() == std::io::ErrorKind::NotFound => {
            return Err(format!("{program} is not installed"));
        }
        Ok(Err(error)) => return Err(error.to_string()),
        Ok(Ok(output)) => output,
    };
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err(crate::terminal_text::sanitize_terminal_text(
            String::from_utf8_lossy(&output.stderr).trim(),
        )
        .to_string())
    }
}

fn github_repository(remote_url: &str) -> Option<(String, String)> {
    let path = remote_url
        .strip_prefix("git@github.com:")
        .or_else(|| remote_url.strip_prefix("ssh://git@github.com/"))
        .or_else(|| remote_url.strip_prefix("https://github.com/"))?;
    let path = path.trim_end_matches('/').trim_end_matches(".git");
    let (owner, repo) = path.split_once('/')?;
    let safe = |part: &str| {
        !part.is_empty()
            && part
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
    };
    (safe(owner) && safe(repo)).then(|| (owner.to_string(), repo.to_string()))
}

fn compare_url(
    owner: &str,
    repo: &str,
    base: &str,
    branch: &str,
    title: &str,
    body: &str,
) -> Option<String> {
    let mut url = reqwest::Url::parse("https://github.com/").ok()?;
    url.path_segments_mut()
        .ok()?
        .extend([owner, repo, "compare", &format!("{base}...{branch}")]);
    {
        let mut query = url.query_pairs_mut();
        query.append_pair("expand", "1").append_pair("title", title);
        if !body.is_empty() {
            query.append_pair("body", body);
        }
    }
    Some(url.to_string())
}

pub async fn create(
    root: &Path,
    params: GitPullRequestParams,
) -> Result<GitPullRequestResponse, DeveloperSessionHostError> {
    let title = params.title.trim();
    if title.is_empty() || title.chars().count() > MAX_TITLE_CHARS {
        return Err(invalid(format!(
            "A pull request needs a title of at most {MAX_TITLE_CHARS} characters"
        )));
    }
    let body = params.body.as_deref().unwrap_or("").trim();
    if body.chars().count() > MAX_BODY_CHARS {
        return Err(invalid(format!(
            "A pull request description is limited to {MAX_BODY_CHARS} characters"
        )));
    }
    let base = match params.base.as_deref().map(str::trim) {
        Some(base) if !base.is_empty() => base.to_string(),
        _ => repository_policy(root).default_branch.ok_or_else(|| {
            invalid(
                "Name the branch to merge into; this repository does not say which is its default",
            )
        })?,
    };
    if !valid_ref(&base) {
        return Err(invalid("That is not a branch name git accepts"));
    }

    let plan = push_plan(root).await?;
    if let Some(reason) = blocking_reason(&plan) {
        return Err(DeveloperSessionHostError::conflict(format!(
            "No pull request was opened: {reason}"
        )));
    }
    if plan.branch == base {
        return Err(invalid(format!(
            "{base} is the branch to merge into; switch to the branch with your changes first"
        )));
    }
    if plan.remote != params.confirmed_remote
        || plan.branch != params.confirmed_branch
        || plan.head != params.confirmed_head
        || u32::try_from(plan.commits.len()).ok() != Some(params.confirmed_commits)
    {
        return Err(DeveloperSessionHostError::conflict(
            "The branch changed after you reviewed it; review the push again",
        ));
    }

    let mut pushed = false;
    if !plan.commits.is_empty() {
        let approver = ConfirmedPush {
            remote: params.confirmed_remote.clone(),
            branch: params.confirmed_branch.clone(),
            head: params.confirmed_head.clone(),
            commits: plan.commits.len(),
        };
        let consent = request_push_consent(&approver, &plan)
            .await
            .ok_or_else(|| {
                DeveloperSessionHostError::conflict(
                    "The push was not approved and nothing left this machine",
                )
            })?;
        let profile = crate::permissions::PermissionStore::load()
            .unwrap_or_default()
            .code_permission_profile(None);
        GitApi::at(root)
            .push(&plan.clone().approved(consent), &profile)
            .await
            .map_err(|error| DeveloperSessionHostError::conflict(error.to_string()))?;
        pushed = true;
    }

    let mut gh_args = vec![
        "pr",
        "create",
        "--head",
        plan.branch.as_str(),
        "--base",
        base.as_str(),
        "--title",
        title,
        "--body",
        body,
    ];
    if params.draft {
        gh_args.push("--draft");
    }
    let gh_failure = match run(root, "gh", &gh_args).await {
        Ok(output) => {
            if let Some(url) = output
                .lines()
                .rev()
                .map(str::trim)
                .find(|line| line.starts_with("https://"))
            {
                return Ok(GitPullRequestResponse {
                    url: url.to_string(),
                    created: true,
                    pushed,
                    note: None,
                });
            }
            "gh did not report the new pull request's address".to_string()
        }
        Err(failure) => failure,
    };

    let remote_url = run(root, "git", &["remote", "get-url", &plan.remote])
        .await
        .map_err(|failure| {
            DeveloperSessionHostError::conflict(format!(
                "The pull request could not be opened ({gh_failure}), and the remote address could not be read: {failure}"
            ))
        })?;
    let Some(url) = github_repository(remote_url.trim())
        .and_then(|(owner, repo)| compare_url(&owner, &repo, &base, &plan.branch, title, body))
    else {
        return Err(DeveloperSessionHostError::conflict(format!(
            "The pull request could not be opened: {gh_failure}"
        )));
    };
    Ok(GitPullRequestResponse {
        url,
        created: false,
        pushed,
        note: Some(format!(
            "The GitHub CLI could not open it ({gh_failure}), so finish it on GitHub"
        )),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::platform::runtime::git::test_support::push_plan_fixture;

    fn confirmed(remote: &str, branch: &str, head: &str, commits: usize) -> ConfirmedPush {
        ConfirmedPush {
            remote: remote.to_string(),
            branch: branch.to_string(),
            head: head.to_string(),
            commits,
        }
    }

    #[tokio::test]
    async fn consent_covers_only_the_push_the_user_reviewed() {
        let plan = push_plan_fixture("origin", "feature", "aaaaaaa", 2);

        let reviewed = confirmed("origin", "feature", "aaaaaaa", 2);
        let consent = request_push_consent(&reviewed, &plan)
            .await
            .expect("the reviewed push is allowed");
        assert!(consent.covers(&plan));

        for other in [
            confirmed("upstream", "feature", "aaaaaaa", 2),
            confirmed("origin", "main", "aaaaaaa", 2),
            confirmed("origin", "feature", "bbbbbbb", 2),
            confirmed("origin", "feature", "aaaaaaa", 3),
        ] {
            assert!(request_push_consent(&other, &plan).await.is_none());
        }
    }

    #[test]
    fn only_a_github_remote_gets_a_compare_page() {
        assert_eq!(
            github_repository("git@github.com:acme/app.git"),
            Some(("acme".to_string(), "app".to_string()))
        );
        assert_eq!(
            github_repository("https://github.com/acme/app"),
            Some(("acme".to_string(), "app".to_string()))
        );
        assert_eq!(github_repository("https://gitlab.com/acme/app.git"), None);
        assert_eq!(github_repository("https://github.com/acme/a b"), None);

        let url = compare_url("acme", "app", "main", "feature/x", "Fix it", "Body text")
            .expect("compare url");
        assert!(url.starts_with("https://github.com/acme/app/compare/"));
        assert!(url.contains("title=Fix+it"));
        assert!(url.contains("body=Body+text"));
    }

    #[test]
    fn a_base_that_git_would_read_as_an_option_is_refused() {
        assert!(valid_ref("main"));
        assert!(valid_ref("release/2026.09"));
        assert!(!valid_ref("--upload-pack=evil"));
        assert!(!valid_ref("main..other"));
        assert!(!valid_ref("has space"));
    }
}
