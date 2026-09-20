//! Consent for a repository push. A [`PushConsent`] is only minted by asking
//! the user, and it carries exactly what the prompt showed them.

use async_trait::async_trait;

use crate::platform::runtime::git::{PushForce, PushPlan};
use crate::tui::approval_broker::ApprovalDecision;

/// What the user is shown before a push runs. Only [`request_push_consent`]
/// builds one, so an approver answers about a plan it did not describe itself.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PushApprovalPrompt {
    remote: String,
    branch: String,
    head: String,
    commits: usize,
    force: PushForce,
    summary: String,
    detail: Vec<String>,
}

impl PushApprovalPrompt {
    fn for_plan(plan: &PushPlan) -> Self {
        Self {
            remote: plan.remote.clone(),
            branch: plan.branch.clone(),
            head: plan.head.clone(),
            commits: plan.commits.len(),
            force: plan.force,
            summary: plan.summary(),
            detail: plan
                .approvals()
                .into_iter()
                .map(|reason| reason.label())
                .collect(),
        }
    }

    pub fn remote(&self) -> &str {
        &self.remote
    }

    pub fn branch(&self) -> &str {
        &self.branch
    }

    pub fn head(&self) -> &str {
        &self.head
    }

    pub fn commits(&self) -> usize {
        self.commits
    }

    pub fn force(&self) -> PushForce {
        self.force
    }

    /// One line naming the remote, the branch and the commit count.
    pub fn summary(&self) -> &str {
        &self.summary
    }

    /// Every reason this push needs a decision, in the order shown.
    pub fn detail(&self) -> &[String] {
        &self.detail
    }
}

/// Proof that the user saw one push and allowed it. The fields are private and
/// no other constructor exists, so nothing downstream can mint one.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PushConsent {
    remote: String,
    branch: String,
    head: String,
    commits: usize,
    force: PushForce,
}

impl PushConsent {
    pub fn remote(&self) -> &str {
        &self.remote
    }

    pub fn branch(&self) -> &str {
        &self.branch
    }

    pub fn head(&self) -> &str {
        &self.head
    }

    pub fn commits(&self) -> usize {
        self.commits
    }

    pub fn force(&self) -> PushForce {
        self.force
    }

    /// Whether this consent was given for exactly the push `plan` describes.
    pub fn covers(&self, plan: &PushPlan) -> bool {
        self.remote == plan.remote
            && self.branch == plan.branch
            && self.head == plan.head
            && self.commits == plan.commits.len()
            && self.force == plan.force
    }
}

/// The surface that puts a push in front of the user. The TUI and the REPL
/// implement it; nothing else decides a push on the user's behalf.
#[async_trait]
pub trait PushApprover: Send + Sync {
    async fn ask(&self, prompt: &PushApprovalPrompt) -> ApprovalDecision;
}

/// Ask about `plan` and mint consent only when the user allowed it. A plan the
/// repository already blocks is never offered, so consent cannot exist for one.
pub async fn request_push_consent(
    approver: &dyn PushApprover,
    plan: &PushPlan,
) -> Option<PushConsent> {
    if plan.blocked_by().is_some() {
        return None;
    }
    let prompt = PushApprovalPrompt::for_plan(plan);
    if !approver.ask(&prompt).await.is_allowing() {
        return None;
    }
    Some(PushConsent {
        remote: prompt.remote,
        branch: prompt.branch,
        head: prompt.head,
        commits: prompt.commits,
        force: prompt.force,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;
    use std::sync::Mutex;

    struct Answers {
        decision: ApprovalDecision,
        asked: Mutex<Vec<PushApprovalPrompt>>,
    }

    impl Answers {
        fn with(decision: ApprovalDecision) -> Self {
            Self {
                decision,
                asked: Mutex::new(Vec::new()),
            }
        }

        fn asked(&self) -> Vec<PushApprovalPrompt> {
            self.asked.lock().expect("asked").clone()
        }
    }

    #[async_trait]
    impl PushApprover for Answers {
        async fn ask(&self, prompt: &PushApprovalPrompt) -> ApprovalDecision {
            self.asked.lock().expect("asked").push(prompt.clone());
            self.decision
        }
    }

    fn collect_rs(dir: &Path, out: &mut Vec<std::path::PathBuf>) {
        let Ok(entries) = std::fs::read_dir(dir) else {
            return;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                collect_rs(&path, out);
            } else if path.extension().and_then(|ext| ext.to_str()) == Some("rs") {
                out.push(path);
            }
        }
    }

    /// Source-level invariant: a `PushConsent` struct literal may appear only in
    /// this file, so no second mint can be added without this test failing.
    #[test]
    fn consent_is_built_in_one_place_and_nowhere_else() {
        let needle = ["PushConsent", " {"].concat();
        let src_root = Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
        let mut files = Vec::new();
        collect_rs(&src_root, &mut files);
        assert!(!files.is_empty(), "no sources under {src_root:?}");

        let mut hits = Vec::new();
        for file in &files {
            let contents = std::fs::read_to_string(file).unwrap_or_default();
            for (index, line) in contents.lines().enumerate() {
                let trimmed = line.trim_start();
                // A struct literal, not prose, a return type or an impl header.
                if trimmed.starts_with("//")
                    || trimmed.starts_with('*')
                    || trimmed.starts_with("impl")
                    || line.contains("->")
                {
                    continue;
                }
                if line.contains(&needle) {
                    hits.push((file.clone(), index + 1));
                }
            }
        }
        let outside: Vec<_> = hits
            .iter()
            .filter(|(file, _)| !file.ends_with("safety/push_consent.rs"))
            .collect();
        assert!(
            outside.is_empty(),
            "consent is minted outside the approval path: {outside:?}"
        );
    }

    fn plan_for(branch: &str, head: &str, commits: usize) -> PushPlan {
        crate::platform::runtime::git::test_support::push_plan_fixture(
            "origin", branch, head, commits,
        )
    }

    #[tokio::test]
    async fn consent_exists_only_after_the_user_allows_the_push_they_were_shown() {
        let plan = plan_for("feature", "aaaaaaa", 2);

        let denied = Answers::with(ApprovalDecision::Deny);
        assert!(request_push_consent(&denied, &plan).await.is_none());
        assert_eq!(denied.asked().len(), 1);

        let allowed = Answers::with(ApprovalDecision::AllowOnce);
        let consent = request_push_consent(&allowed, &plan)
            .await
            .expect("the user allowed it");
        assert!(consent.covers(&plan));

        let shown = allowed.asked();
        assert_eq!(shown[0].branch(), "feature");
        assert_eq!(shown[0].head(), "aaaaaaa");
        assert_eq!(shown[0].commits(), 2);
        assert_eq!(shown[0].summary(), plan.summary());
        assert_eq!(consent.head(), shown[0].head());
        assert_eq!(consent.commits(), shown[0].commits());
    }

    #[tokio::test]
    async fn consent_covers_the_plan_it_was_given_for_and_no_other() {
        let first = plan_for("feature", "aaaaaaa", 1);
        let approver = Answers::with(ApprovalDecision::AllowSession);
        let consent = request_push_consent(&approver, &first)
            .await
            .expect("allowed");

        assert!(!consent.covers(&plan_for("release", "aaaaaaa", 1)));
        assert!(!consent.covers(&plan_for("feature", "bbbbbbb", 1)));
        assert!(!consent.covers(&plan_for("feature", "aaaaaaa", 2)));
    }

    #[tokio::test]
    async fn a_blocked_push_is_never_put_in_front_of_the_user() {
        let plan = plan_for("feature", "aaaaaaa", 0);
        assert!(plan.blocked_by().is_some());

        let approver = Answers::with(ApprovalDecision::AlwaysAllow);
        assert!(request_push_consent(&approver, &plan).await.is_none());
        assert!(
            approver.asked().is_empty(),
            "a push that cannot run is not offered"
        );
    }
}
