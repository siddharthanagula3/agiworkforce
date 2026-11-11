use crate::{
    config::WorktreeApplyConfig,
    path_security::{ReviewedFile, ReviewedFileError, WorkspaceFileAuthority},
};
use agiworkforce_app_server::DeveloperSessionHostError as Error;
use agiworkforce_protocol::{
    developer_session::{AppServerResponse, CheckpointFileStatus},
    worktree_apply::*,
};
use agiworkforce_worktree::managed::{LocalApplySnapshot, WorktreeManager};
use anyhow::{ensure, Context, Result};
use serde::Deserialize;
use sha2::{Digest, Sha256};

#[cfg(test)]
mod tests;

struct PreparedFile {
    path: String,
    state: WorktreeApplyFileState,
    reason: Option<String>,
    original: Option<ReviewedFile>,
    after: Option<Vec<u8>>,
    executable: Option<bool>,
}

struct PreparedApply {
    plan: WorktreeApplyPlan,
    source: LocalApplySnapshot,
    files: Vec<PreparedFile>,
}

#[derive(Default)]
pub(super) struct ApplyState {
    prepared: Option<PreparedApply>,
    result: Option<WorktreeApplyResult>,
    #[cfg(test)]
    before_commit: Option<Box<dyn FnOnce() + Send + Sync>>,
}

pub(super) struct ValidatedApplyCommit(WorktreeApplyCommitParams);

fn revision(bytes: &[u8]) -> String {
    crate::hex::encode(&Sha256::digest(bytes))
}

fn content(bytes: &[u8], budget: &mut usize) -> WorktreeApplyContent {
    let text = std::str::from_utf8(bytes)
        .ok()
        .filter(|text| !text.contains('\0'));
    let (text, truncated) = match text {
        Some(text) => {
            let mut end = text.len().min(*budget);
            while !text.is_char_boundary(end) {
                end -= 1;
            }
            *budget -= end;
            (Some(text[..end].to_owned()), end != text.len())
        }
        None => (None, false),
    };
    WorktreeApplyContent {
        bytes: bytes.len() as u64,
        revision: revision(bytes),
        binary: text.is_none(),
        text,
        truncated,
    }
}

fn charge(total: &mut u64, bytes: &[u8], policy: &WorktreeApplyConfig) -> Result<()> {
    *total = total
        .checked_add(bytes.len() as u64)
        .context("The apply review size overflowed")?;
    ensure!(
        *total <= policy.max_total_bytes,
        "The worktree apply review exceeds its configured {}-byte budget for captured file versions", policy.max_total_bytes
    );
    Ok(())
}

fn fits_frame(value: &impl serde::Serialize) -> Result<()> {
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Limits {
        max_frame_bytes: usize,
    }
    let limits: Limits = serde_json::from_str(include_str!(
        "../../../../packages/contracts/local-runtime/src/developer-session-limits.json"
    ))?;
    let frame = AppServerResponse::success(u64::MAX, value)?;
    ensure!(serde_json::to_vec(&frame)?.len().saturating_add(1) <= limits.max_frame_bytes, "The worktree review exceeds the shared response limit. Reduce the changed files or the configured preview budget");
    Ok(())
}

fn refused(params: &WorktreeApplyCommitParams, error: impl std::fmt::Display) -> Error {
    Error::worktree_apply_failure(
        error.to_string(),
        WorktreeApplyCommitFailure {
            root_key: params.root_key.clone(),
            worktree_id: params.worktree_id.clone(),
            plan_id: params.plan_id.clone(),
            uncertain: false,
        },
    )
}

fn blocked_file(
    path: &str,
    status: CheckpointFileStatus,
    reason: String,
) -> (PreparedFile, WorktreeApplyFile) {
    (
        PreparedFile {
            path: path.to_owned(),
            state: WorktreeApplyFileState::Blocked,
            reason: Some(reason.clone()),
            original: None,
            after: None,
            executable: None,
        },
        WorktreeApplyFile {
            path: path.to_owned(),
            status,
            state: WorktreeApplyFileState::Blocked,
            reason: Some(reason),
            before: None,
            after: None,
            executable_before: None,
            executable_after: None,
        },
    )
}

impl ApplyState {
    #[cfg(test)]
    pub(super) fn before_commit(&mut self, action: impl FnOnce() + Send + Sync + 'static) {
        self.before_commit = Some(Box::new(action));
    }
    pub(super) async fn prepare(
        &mut self,
        authority: &WorkspaceFileAuthority,
        manager: &WorktreeManager<'_>,
        params: WorktreeApplyPlanParams,
        policy: &WorktreeApplyConfig,
    ) -> Result<WorktreeApplyPlan> {
        policy.validate()?;
        super::workspace_files::check_root(authority, &params.root_key)
            .map_err(anyhow::Error::new)?;
        ensure!(
            authority.root() == manager.repository(),
            "Open and grant the original repository root before applying a worktree"
        );
        let source = manager
            .snapshot_local_apply(&params.worktree_id, policy.max_files)
            .await?;
        let source_authority = WorkspaceFileAuthority::new(&source.checkout)?;
        let mut total = 0u64;
        let mut budget = policy.max_preview_bytes;
        let mut files = Vec::new();
        let mut shown = Vec::new();
        for change in &source.changes {
            let status = match (change.before.is_some(), change.after.is_some()) {
                (true, true) => CheckpointFileStatus::Modified,
                (true, false) => CheckpointFileStatus::Deleted,
                (false, true) => CheckpointFileStatus::Added,
                _ => anyhow::bail!("The reviewed change has no file versions"),
            };
            let target = authority.editor_file(&change.path);
            let supported = change
                .before
                .iter()
                .chain(&change.after)
                .all(|entry| entry.regular_executable().is_some());
            if !supported || target.is_err() {
                let reason = if !supported {
                    "Symbolic links, submodules and special file modes cannot be applied here"
                        .to_owned()
                } else {
                    target
                        .err()
                        .context("The path policy refusal was lost")?
                        .to_string()
                };
                let (file, preview) = blocked_file(&change.path, status, reason);
                files.push(file);
                shown.push(preview);
                continue;
            }
            let captured =
                match source_authority.read_scoped_file(&change.path, policy.max_file_bytes) {
                    Ok(file) => file,
                    Err(error) => {
                        let (file, preview) = blocked_file(
                            &change.path,
                            status,
                            format!("The worktree source cannot be read: {error}"),
                        );
                        files.push(file);
                        shown.push(preview);
                        continue;
                    }
                };
            if let Some(file) = &captured {
                charge(&mut total, &file.bytes, policy)?;
            }
            manager
                .verify_local_apply_file(
                    &source,
                    &change.path,
                    captured.as_ref().map(|file| file.bytes.as_slice()),
                )
                .await?;
            let (directory, path) = target?;
            let original = match directory.review_file(&path, policy.max_file_bytes) {
                Ok(original) => original,
                Err(error) => {
                    let (file, preview) = blocked_file(&change.path, status, error.to_string());
                    files.push(file);
                    shown.push(preview);
                    continue;
                }
            };
            let before = match &change.before {
                Some(entry) => Some(
                    manager
                        .materialize_local_apply(&change.path, entry, policy.max_file_bytes)
                        .await?,
                ),
                None => None,
            };
            let after = match &change.after {
                Some(entry) => Some(
                    manager
                        .materialize_local_apply(&change.path, entry, policy.max_file_bytes)
                        .await?,
                ),
                None => None,
            };
            for bytes in before
                .as_deref()
                .into_iter()
                .chain(after.as_deref())
                .chain(original.bytes())
            {
                charge(&mut total, bytes, policy)?;
            }
            let executable_before = change
                .before
                .as_ref()
                .and_then(|entry| entry.regular_executable());
            let executable_after = change
                .after
                .as_ref()
                .and_then(|entry| entry.regular_executable());
            let (state, reason) = if original.bytes() == after.as_deref()
                && original.executable() == executable_after
            {
                (WorktreeApplyFileState::Unchanged, None)
            } else if original.bytes() == before.as_deref()
                && original.executable() == executable_before
            {
                (WorktreeApplyFileState::Ready, None)
            } else {
                (WorktreeApplyFileState::Conflict, Some("The original file differs from the worktree's starting version; it will be kept".to_owned()))
            };
            shown.push(WorktreeApplyFile {
                path: change.path.clone(),
                status,
                state,
                reason: reason.clone(),
                before: original.bytes().map(|bytes| content(bytes, &mut budget)),
                after: after.as_deref().map(|bytes| content(bytes, &mut budget)),
                executable_before: original.executable(),
                executable_after,
            });
            files.push(PreparedFile {
                path: change.path.clone(),
                state,
                reason,
                original: Some(original),
                after,
                executable: executable_after,
            });
        }
        super::workspace_files::check_root(authority, &params.root_key)
            .map_err(anyhow::Error::new)?;
        source_authority.identity()?;
        let plan = WorktreeApplyPlan {
            root_key: params.root_key,
            worktree_id: params.worktree_id,
            plan_id: uuid::Uuid::new_v4().to_string(),
            source_revision: source.source_tree.clone(),
            files: shown,
        };
        fits_frame(&plan)?;
        self.prepared = Some(PreparedApply {
            plan: plan.clone(),
            source,
            files,
        });
        self.result = None;
        Ok(plan)
    }

    pub(super) fn completed(
        &self,
        params: &WorktreeApplyCommitParams,
    ) -> Option<&WorktreeApplyResult> {
        self.result.as_ref().filter(|result| {
            result.root_key == params.root_key
                && result.worktree_id == params.worktree_id
                && result.plan_id == params.plan_id
        })
    }

    pub(super) fn page(
        &self,
        params: &WorktreeApplyResultParams,
    ) -> Result<WorktreeApplyResultPage, Error> {
        let result = self.result.as_ref().filter(|result| result.root_key == params.root_key && result.worktree_id == params.worktree_id && result.plan_id == params.plan_id).ok_or_else(|| Error::not_found("The apply receipt is not available in this runtime. Inspect the original folder before another apply"))?;
        let start = params
            .after
            .as_ref()
            .map(|after| after.parse::<usize>())
            .transpose()
            .map_err(|_| Error::invalid_request("The apply receipt cursor is invalid"))?
            .unwrap_or(0);
        if start > result.files.len() {
            return Err(Error::invalid_request(
                "The apply receipt cursor is past the result",
            ));
        }
        let total_files = u32::try_from(result.files.len())
            .map_err(|error| Error::internal(error.to_string()))?;
        let page = |end: usize| WorktreeApplyResultPage {
            root_key: result.root_key.clone(),
            worktree_id: result.worktree_id.clone(),
            plan_id: result.plan_id.clone(),
            files: result.files[start..end].to_vec(),
            total_files,
            next_after: (end < result.files.len()).then(|| end.to_string()),
        };
        if start == result.files.len() {
            return Ok(page(start));
        }
        let mut low = start + 1;
        let mut high = result.files.len();
        let mut selected = None;
        while low <= high {
            let end = low + (high - low) / 2;
            let candidate = page(end);
            if fits_frame(&candidate).is_ok() {
                selected = Some(candidate);
                low = end + 1;
            } else {
                high = end - 1;
            }
        }
        selected.ok_or_else(|| Error::internal("A single file receipt exceeds the shared response limit; inspect the original folder before another apply"))
    }

    pub(super) async fn validate_source(
        &self,
        manager: &WorktreeManager<'_>,
        params: &WorktreeApplyCommitParams,
        policy: &WorktreeApplyConfig,
    ) -> Result<ValidatedApplyCommit, Error> {
        let prepared = self.prepared.as_ref().ok_or_else(|| {
            refused(
                params,
                "This apply plan is no longer available. Review the worktree again",
            )
        })?;
        if prepared.plan.root_key != params.root_key
            || prepared.plan.worktree_id != params.worktree_id
            || prepared.plan.plan_id != params.plan_id
        {
            return Err(refused(
                params,
                "The apply plan does not match this folder and worktree",
            ));
        }
        manager
            .validate_local_apply_source(&prepared.source, policy.max_files)
            .await
            .map_err(|error| refused(params, error))?;
        Ok(ValidatedApplyCommit(params.clone()))
    }

    pub(super) fn commit(
        &mut self,
        authority: &WorkspaceFileAuthority,
        validated: ValidatedApplyCommit,
    ) -> Result<WorktreeApplyResult, Error> {
        let params = validated.0;
        #[cfg(test)]
        if let Some(action) = self.before_commit.take() {
            action();
        }
        if let Some(result) = self.completed(&params) {
            return Ok(result.clone());
        }
        super::workspace_files::check_root(authority, &params.root_key)
            .map_err(|error| refused(&params, error))?;
        let prepared = self
            .prepared
            .as_mut()
            .ok_or_else(|| refused(&params, "This apply plan is no longer available"))?;
        if prepared.plan.root_key != params.root_key
            || prepared.plan.worktree_id != params.worktree_id
            || prepared.plan.plan_id != params.plan_id
        {
            return Err(refused(&params, "The apply plan changed"));
        }
        for file in &mut prepared.files {
            if file.state == WorktreeApplyFileState::Ready {
                authority
                    .editor_file(&file.path)
                    .map_err(|error| refused(&params, error))?;
                file.original
                    .as_mut()
                    .ok_or_else(|| refused(&params, "The reviewed file grant is unavailable"))?
                    .validate()
                    .map_err(|error| refused(&params, error))?;
            }
        }
        let prepared = self
            .prepared
            .take()
            .ok_or_else(|| refused(&params, "The apply plan was consumed"))?;
        let mut results = Vec::new();
        let mut stopped = false;
        for file in prepared.files {
            let mut result = WorktreeApplyFileResult {
                path: file.path.clone(),
                outcome: match file.state {
                    WorktreeApplyFileState::Unchanged => WorktreeApplyOutcome::Skipped,
                    WorktreeApplyFileState::Conflict => WorktreeApplyOutcome::Conflict,
                    WorktreeApplyFileState::Blocked => WorktreeApplyOutcome::Blocked,
                    WorktreeApplyFileState::Ready => WorktreeApplyOutcome::Failed,
                },
                reason: file.reason,
                uncertain: false,
                recovery_paths: Vec::new(),
            };
            if file.state == WorktreeApplyFileState::Ready {
                let attempt = (|| -> Result<(), ReviewedFileError> {
                    if stopped {
                        return Err(ReviewedFileError {
                            error: anyhow::anyhow!(
                                "Not attempted after an earlier unconfirmed file operation"
                            ),
                            uncertain: false,
                            recovery_paths: Vec::new(),
                        });
                    }
                    super::workspace_files::check_root(authority, &params.root_key).map_err(
                        |error| ReviewedFileError {
                            error: anyhow::Error::new(error),
                            uncertain: false,
                            recovery_paths: Vec::new(),
                        },
                    )?;
                    file.original
                        .ok_or_else(|| ReviewedFileError {
                            error: anyhow::anyhow!("The file review was lost"),
                            uncertain: false,
                            recovery_paths: Vec::new(),
                        })?
                        .commit(file.after.as_deref(), file.executable)
                })();
                match attempt {
                    Ok(()) => result.outcome = WorktreeApplyOutcome::Applied,
                    Err(failed) => {
                        result.reason = Some(failed.error.to_string());
                        result.uncertain = failed.uncertain;
                        result.recovery_paths = failed
                            .recovery_paths
                            .into_iter()
                            .map(|path| path.to_string_lossy().into_owned())
                            .collect();
                        stopped |= failed.uncertain;
                    }
                }
            }
            results.push(result);
        }
        let result = WorktreeApplyResult {
            root_key: params.root_key,
            worktree_id: params.worktree_id,
            plan_id: params.plan_id,
            files: results,
        };
        self.result = Some(result.clone());
        Ok(result)
    }
}
