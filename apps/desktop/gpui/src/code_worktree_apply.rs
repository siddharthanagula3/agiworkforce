use crate::code_worktrees::CodeWorktrees;
use agiworkforce_protocol::{developer_session::CheckpointFileStatus, worktree_apply::*};
use anyhow::{ensure, Context, Result};
use std::{
    collections::HashSet,
    path::{Component, Path},
};

pub struct ApplyReceiptPages {
    params: WorktreeApplyCommitParams,
    expected: HashSet<String>,
    files: Vec<WorktreeApplyFileResult>,
    seen: HashSet<String>,
    started: bool,
    done: bool,
}

impl ApplyReceiptPages {
    pub fn new(params: &WorktreeApplyCommitParams, plan: &WorktreeApplyPlan) -> Result<Self> {
        ensure!(
            plan.root_key == params.root_key
                && plan.worktree_id == params.worktree_id
                && plan.plan_id == params.plan_id,
            "The apply receipt request does not match its review"
        );
        Ok(Self {
            params: params.clone(),
            expected: plan.files.iter().map(|file| file.path.clone()).collect(),
            files: Vec::new(),
            seen: HashSet::new(),
            started: false,
            done: false,
        })
    }
    pub fn push(&mut self, page: WorktreeApplyResultPage) -> Result<()> {
        ensure!(
            !self.done
                && page.root_key == self.params.root_key
                && page.worktree_id == self.params.worktree_id
                && page.plan_id == self.params.plan_id
                && page.total_files as usize == self.expected.len(),
            "The apply receipt page belongs to another operation or changed its file count"
        );
        ensure!(
            !page.files.is_empty() || self.expected.is_empty(),
            "The apply receipt page made no progress"
        );
        let mut seen = self.seen.clone();
        for file in &page.files {
            ensure!(
                self.expected.contains(&file.path) && seen.insert(file.path.clone()),
                "The apply receipt repeated or added an unreviewed file"
            );
        }
        let length = self
            .files
            .len()
            .checked_add(page.files.len())
            .context("The apply receipt size overflowed")?;
        ensure!(
            length <= self.expected.len(),
            "The apply receipt returned too many files"
        );
        match &page.next_after {
            Some(after) => ensure!(
                after.parse::<usize>().ok() == Some(length) && length < self.expected.len(),
                "The apply receipt cursor did not advance to the next file"
            ),
            None => ensure!(
                length == self.expected.len(),
                "The apply receipt omitted files"
            ),
        }
        self.started = true;
        self.done = page.next_after.is_none();
        self.files.extend(page.files);
        self.seen = seen;
        Ok(())
    }
    pub fn next_params(&self) -> Option<WorktreeApplyResultParams> {
        (!self.done).then(|| WorktreeApplyResultParams {
            root_key: self.params.root_key.clone(),
            worktree_id: self.params.worktree_id.clone(),
            plan_id: self.params.plan_id.clone(),
            after: self.started.then(|| self.files.len().to_string()),
        })
    }
    pub fn finish(self) -> Result<WorktreeApplyResult> {
        ensure!(
            self.done && self.seen == self.expected,
            "The apply receipt is incomplete"
        );
        Ok(WorktreeApplyResult {
            root_key: self.params.root_key,
            worktree_id: self.params.worktree_id,
            plan_id: self.params.plan_id,
            files: self.files,
        })
    }
}

pub async fn collect_apply_receipt(
    client: &agiworkforce_app_server::BackgroundDeveloperSessionClient,
    params: &WorktreeApplyCommitParams,
    plan: &WorktreeApplyPlan,
    first: Option<WorktreeApplyResultPage>,
) -> Result<WorktreeApplyResult> {
    let mut pages = ApplyReceiptPages::new(params, plan)?;
    if let Some(first) = first {
        pages.push(first)?;
    }
    while let Some(params) = pages.next_params() {
        let page = client
            .request(
                agiworkforce_protocol::developer_session::method::WORKTREE_APPLY_RESULT,
                params,
            )
            .await?;
        pages.push(page)?;
    }
    pages.finish()
}

fn valid_content(content: &WorktreeApplyContent) -> bool {
    !content.revision.is_empty()
        && content.revision.chars().all(|ch| ch.is_ascii_hexdigit())
        && match &content.text {
            Some(text) => {
                !content.binary
                    && !text.contains('\0')
                    && text.len() as u64 <= content.bytes
                    && (content.truncated || text.len() as u64 == content.bytes)
            }
            None => content.binary && !content.truncated,
        }
}

pub fn clean_refusal(params: &WorktreeApplyCommitParams, error: &anyhow::Error) -> bool {
    let Some(agiworkforce_app_server::DeveloperSessionClientError::Remote {
        data: Some(data), ..
    }) = error.downcast_ref::<agiworkforce_app_server::DeveloperSessionClientError>()
    else {
        return false;
    };
    serde_json::from_value::<WorktreeApplyCommitFailure>(data.clone()).is_ok_and(|failure| {
        failure.root_key == params.root_key
            && failure.worktree_id == params.worktree_id
            && failure.plan_id == params.plan_id
            && !failure.uncertain
    })
}

impl CodeWorktrees {
    pub fn apply_review_params(&self, id: &str) -> Result<WorktreeApplyPlanParams> {
        ensure!(
            !self.uncertain,
            "Reconnect the coding folder before another apply review"
        );
        let root = self
            .root
            .as_ref()
            .context("Load the coding folder identity")?;
        let tree = self.selected(id)?;
        ensure!(root.cwd == tree.repository_root && !tree.active && !tree.missing, "Open the original repository root and stop the worktree runtime before applying its changes");
        Ok(WorktreeApplyPlanParams {
            root_key: root.root_key.clone(),
            worktree_id: id.to_owned(),
        })
    }

    pub fn accept_apply_plan(
        &mut self,
        params: &WorktreeApplyPlanParams,
        plan: WorktreeApplyPlan,
    ) -> Result<()> {
        ensure!(
            self.apply_review_params(&params.worktree_id)? == *params
                && plan.root_key == params.root_key
                && plan.worktree_id == params.worktree_id
                && !plan.source_revision.is_empty()
                && uuid::Uuid::parse_str(&plan.plan_id).is_ok(),
            "The apply review belongs to another folder or worktree"
        );
        let mut paths = HashSet::new();
        for file in &plan.files {
            ensure!(
                !file.path.is_empty()
                    && !file.path.contains(['\\', '\0'])
                    && Path::new(&file.path)
                        .components()
                        .all(|part| matches!(part, Component::Normal(_)))
                    && paths.insert(&file.path),
                "The apply review repeated or escaped a file path"
            );
            ensure!(
                file.before.iter().chain(&file.after).all(valid_content),
                "The apply review contains an invalid file preview"
            );
            ensure!(
                file.before.is_some() == file.executable_before.is_some()
                    && file.after.is_some() == file.executable_after.is_some(),
                "The apply review omitted a file mode"
            );
            if file.state == WorktreeApplyFileState::Ready {
                ensure!(
                    match file.status {
                        CheckpointFileStatus::Added =>
                            file.before.is_none() && file.after.is_some(),
                        CheckpointFileStatus::Modified =>
                            file.before.is_some() && file.after.is_some(),
                        CheckpointFileStatus::Deleted =>
                            file.before.is_some() && file.after.is_none(),
                    },
                    "The apply review's file versions do not match its operation"
                );
            }
            if matches!(
                file.state,
                WorktreeApplyFileState::Conflict | WorktreeApplyFileState::Blocked
            ) {
                ensure!(
                    file.reason
                        .as_ref()
                        .is_some_and(|reason| !reason.is_empty()),
                    "The refused file has no explanation"
                );
            }
        }
        self.apply_path = plan.files.first().map(|file| file.path.clone());
        self.apply_plan = Some(plan);
        self.apply_result = None;
        Ok(())
    }

    pub fn apply_commit_params(&self) -> Result<WorktreeApplyCommitParams> {
        ensure!(
            self.operation.is_none() && !self.uncertain && self.apply_result.is_none(),
            "The apply operation is pending, completed or unconfirmed"
        );
        let plan = self
            .apply_plan
            .as_ref()
            .context("Review a worktree before applying it")?;
        let params = self.apply_review_params(&plan.worktree_id)?;
        ensure!(
            params.root_key == plan.root_key
                && plan
                    .files
                    .iter()
                    .any(|file| file.state == WorktreeApplyFileState::Ready),
            "The reviewed folder changed or has no applicable changes"
        );
        Ok(WorktreeApplyCommitParams {
            root_key: plan.root_key.clone(),
            worktree_id: plan.worktree_id.clone(),
            plan_id: plan.plan_id.clone(),
        })
    }

    pub fn accept_apply_result(
        &mut self,
        params: &WorktreeApplyCommitParams,
        result: WorktreeApplyResult,
    ) -> Result<()> {
        let plan = self
            .apply_plan
            .as_ref()
            .context("The apply review is no longer open")?;
        ensure!(
            plan.root_key == params.root_key
                && plan.worktree_id == params.worktree_id
                && plan.plan_id == params.plan_id
                && result.root_key == params.root_key
                && result.worktree_id == params.worktree_id
                && result.plan_id == params.plan_id
                && result.files.len() == plan.files.len(),
            "The runtime returned a different or incomplete apply result"
        );
        let mut paths = HashSet::new();
        for file in &result.files {
            ensure!(paths.insert(&file.path), "The apply result repeated a file");
            let reviewed = plan
                .files
                .iter()
                .find(|reviewed| reviewed.path == file.path)
                .context("The apply result named an unreviewed file")?;
            ensure!(
                match reviewed.state {
                    WorktreeApplyFileState::Ready => matches!(
                        file.outcome,
                        WorktreeApplyOutcome::Applied | WorktreeApplyOutcome::Failed
                    ),
                    WorktreeApplyFileState::Unchanged =>
                        file.outcome == WorktreeApplyOutcome::Skipped,
                    WorktreeApplyFileState::Conflict =>
                        file.outcome == WorktreeApplyOutcome::Conflict,
                    WorktreeApplyFileState::Blocked =>
                        file.outcome == WorktreeApplyOutcome::Blocked,
                },
                "The runtime changed a file that was outside the applicable review"
            );
            ensure!(
                (!file.uncertain && file.recovery_paths.is_empty())
                    || file.outcome == WorktreeApplyOutcome::Failed,
                "The apply receipt has inconsistent recovery metadata"
            );
            if file.outcome == WorktreeApplyOutcome::Failed {
                ensure!(
                    file.reason
                        .as_ref()
                        .is_some_and(|reason| !reason.is_empty()),
                    "The failed apply result has no explanation"
                );
            }
        }
        if self.apply_uncertain {
            self.uncertain = false;
        }
        self.apply_uncertain = result.files.iter().any(|file| file.uncertain);
        self.uncertain |= self.apply_uncertain;
        self.apply_result = Some(result);
        Ok(())
    }
}
