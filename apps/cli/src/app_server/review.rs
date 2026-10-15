//! Worktrees and per-turn checkpoints for the developer-session host.
//!
//! The git work is `agiworkforce-worktree`'s; this module runs it under the
//! CLI's process-tree supervisor and translates between it and the protocol.

use agiworkforce_app_server::DeveloperSessionHostError;
use agiworkforce_protocol::developer_session::{
    method, AppServerNotification, CheckpointDiffResponse, CheckpointFile, CheckpointFileDiff,
    CheckpointFileStatus, CheckpointHunk, CheckpointListResponse, CheckpointSectionConflict,
    CheckpointSectionsParams, CheckpointSectionsResponse, ManagedWorktreeSummary,
    TurnCheckpointSummary, WorktreeArchive, WorktreeSetupLogNotification, WorktreeSetupScript,
    WorktreeSetupStream, WorktreeStartPoint,
};
use agiworkforce_worktree::checkpoint::{
    Checkpoints, ConversationMark, ForgottenThread, Phase, RewindOutcome, Section, TurnCheckpoint,
    Workspace,
};
use agiworkforce_worktree::managed::{
    ArchiveOutcome, ManagedWorktree, SetupRun, SetupScript, StartPoint, WorktreeManager,
};
use agiworkforce_worktree::snapshot::{ChangeStatus, FilePatch, TreeChange};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::{Mutex as StdMutex, OnceLock};
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, AsyncRead, BufReader};
use tokio::sync::broadcast;

use crate::models::{ContentBlock, Message, MessageContent};
use crate::process_tree::ProcessTreeChild;
use crate::runtime::worktree::BookkeepingRunner;

const NO_GIT: &str = "Checkpoints need a git repository, and this folder is not in one.";

/// The longest a turn waits for its before-snapshot. Staging a large checkout
/// can take minutes; past this the turn starts without a checkpoint rather
/// than leaving the user waiting on bookkeeping.
const TURN_START_SNAPSHOT_LIMIT: Duration = Duration::from_secs(20);

/// How long a finished setup script's output is still read once its process
/// group is ended, for a descendant that left the group with the pipes open.
const SETUP_OUTPUT_DRAIN_LIMIT: Duration = Duration::from_secs(2);

fn invalid(error: impl std::fmt::Display) -> DeveloperSessionHostError {
    DeveloperSessionHostError::invalid_request(error.to_string())
}

fn conflict(error: impl std::fmt::Display) -> DeveloperSessionHostError {
    DeveloperSessionHostError::conflict(error.to_string())
}

/// Where this host keeps the worktrees it makes: the CLI config root's
/// `worktrees/`, unless a test or embedder named another.
pub(super) fn worktrees_root(
    configured: Option<&Path>,
) -> Result<PathBuf, DeveloperSessionHostError> {
    match configured {
        Some(root) => Ok(root.to_path_buf()),
        None => crate::config::CliConfig::config_dir()
            .map(|dir| dir.join("worktrees"))
            .map_err(|error| DeveloperSessionHostError::internal(error.to_string())),
    }
}

/// The worktrees of `workspace`'s repository, with every git pinned to the
/// repository resolved for it first, like checkpoints.
pub(super) async fn manager(
    root: &Path,
    workspace: &Path,
) -> Result<WorktreeManager<'static>, DeveloperSessionHostError> {
    let pinned = pinned_workspace(workspace).await?.ok_or_else(|| {
        invalid(format!(
            "{} is not inside a git repository with a working tree",
            workspace.display()
        ))
    })?;
    let pinned = pinned.with_config_trusted(config_trusted(workspace));
    Ok(WorktreeManager::open(&BookkeepingRunner, root, &pinned))
}

pub(super) fn start_point(start: WorktreeStartPoint) -> StartPoint {
    match start {
        WorktreeStartPoint::Ref { name } => StartPoint::Ref { name },
        WorktreeStartPoint::WorkingTree => StartPoint::WorkingTree,
    }
}

fn protocol_start_point(start: &StartPoint) -> WorktreeStartPoint {
    match start {
        StartPoint::Ref { name } => WorktreeStartPoint::Ref { name: name.clone() },
        StartPoint::WorkingTree => WorktreeStartPoint::WorkingTree,
    }
}

/// The summary without the owning thread, which only the session store knows.
pub(super) fn worktree_summary(worktree: &ManagedWorktree) -> ManagedWorktreeSummary {
    let marker = &worktree.marker;
    ManagedWorktreeSummary {
        id: marker.id.clone(),
        path: worktree.checkout.display().to_string(),
        repository_root: marker.repository_root.display().to_string(),
        label: marker.label.clone(),
        start: protocol_start_point(&marker.start),
        base_commit: marker.base_commit.clone(),
        head: worktree.head.clone(),
        created_at: marker.created_at.to_rfc3339(),
        thread_id: marker.thread_id.clone(),
        thread: None,
        pinned: marker.pinned,
        active: worktree.active,
        missing: worktree.missing,
        setup_exit_code: marker.setup_exit_code,
        setup_ran_at: marker.setup_ran_at.map(|at| at.to_rfc3339()),
    }
}

pub(super) fn setup_script(script: SetupScript) -> WorktreeSetupScript {
    WorktreeSetupScript {
        path: script.path.display().to_string(),
        sha256: script.sha256,
        approved: script.approved,
    }
}

pub(super) fn archive(outcome: ArchiveOutcome) -> WorktreeArchive {
    WorktreeArchive {
        worktree_id: outcome.id,
        snapshot_ref: outcome.snapshot_ref,
        snapshot_commit: outcome.snapshot_commit,
    }
}

/// Marks every fingerprint that identifies a turn by what was said rather
/// than by every byte of the context. A mark without it was taken before the
/// distinction existed and is still checked the old way.
const TURN_IDENTITY: &str = "v2:";

/// How many messages a thread holds and a fingerprint of them, so a rewind
/// can tell a transcript it may cut from one compacted since.
///
/// The fingerprint leaves out the system prompt at the head and the text of
/// every tool result. Both are rewritten where they stand, the prompt by a
/// change of output style and the results when compaction shortens them, and
/// neither makes the conversation a different one: a turn must stay the turn
/// it was after its own send pruned an earlier one's output.
pub(super) fn conversation_mark(messages: &[Message]) -> ConversationMark {
    let identity = prefix_fingerprints(messages, [messages.len()])
        .remove(&messages.len())
        .map(|fingerprint| fingerprint.identity)
        .unwrap_or_default();
    ConversationMark {
        message_count: messages.len(),
        fingerprint: format!("{TURN_IDENTITY}{identity}"),
    }
}

/// The conversation still begins with exactly the messages it held when the
/// turn started, so cutting it there removes this turn and nothing before.
pub(super) fn conversation_rewinds_to(messages: &[Message], mark: &ConversationMark) -> bool {
    rewinds_with(&prefix_fingerprints(messages, [mark.message_count]), mark)
}

fn rewinds_with(fingerprints: &HashMap<usize, PrefixFingerprint>, mark: &ConversationMark) -> bool {
    fingerprints
        .get(&mark.message_count)
        .is_some_and(
            |fingerprint| match mark.fingerprint.strip_prefix(TURN_IDENTITY) {
                Some(identity) => fingerprint.identity == identity,
                None => fingerprint.exact == mark.fingerprint,
            },
        )
}

/// Both fingerprints of one prefix of a conversation: `identity` as
/// [`conversation_mark`] takes it, and `exact` over every byte, which is what
/// a mark recorded before [`TURN_IDENTITY`] holds.
#[derive(Debug, PartialEq, Eq)]
struct PrefixFingerprint {
    identity: String,
    exact: String,
}

/// One message as a turn's identity counts it: a tool result keeps the call
/// it answers and whether it failed, and loses its text.
fn without_tool_output(message: &Message) -> std::borrow::Cow<'_, Message> {
    let MessageContent::Blocks(blocks) = &message.content else {
        return std::borrow::Cow::Borrowed(message);
    };
    if !blocks
        .iter()
        .any(|block| matches!(block, ContentBlock::ToolResult { .. }))
    {
        return std::borrow::Cow::Borrowed(message);
    }
    std::borrow::Cow::Owned(Message {
        role: message.role.clone(),
        content: MessageContent::Blocks(
            blocks
                .iter()
                .map(|block| match block {
                    ContentBlock::ToolResult {
                        tool_use_id,
                        is_error,
                        ..
                    } => ContentBlock::ToolResult {
                        tool_use_id: tool_use_id.clone(),
                        content: String::new(),
                        is_error: *is_error,
                    },
                    other => other.clone(),
                })
                .collect(),
        ),
    })
}

/// A running digest of the messages fed to it, written the way
/// `serde_json::to_vec` writes a slice. Once one message fails to serialize
/// it answers with the digest of nothing, as that call would.
#[derive(Clone)]
struct SliceDigest {
    hasher: Sha256,
    fed: usize,
    unserializable: bool,
}

impl SliceDigest {
    fn new() -> Self {
        let mut hasher = Sha256::new();
        hasher.update(b"[");
        Self {
            hasher,
            fed: 0,
            unserializable: false,
        }
    }

    fn feed(&mut self, message: &Message) {
        if self.unserializable {
            return;
        }
        match serde_json::to_vec(message) {
            Ok(encoded) => {
                if self.fed > 0 {
                    self.hasher.update(b",");
                }
                self.hasher.update(encoded);
                self.fed += 1;
            }
            Err(_) => self.unserializable = true,
        }
    }

    fn so_far(&self) -> String {
        if self.unserializable {
            return crate::hex::encode(&Sha256::digest(b""));
        }
        let mut prefix = self.hasher.clone();
        prefix.update(b"]");
        crate::hex::encode(&prefix.finalize())
    }
}

/// The fingerprints of each `messages[..count]`, in one pass that serializes
/// every message once however many counts are asked for. Counts past the end
/// of `messages` are left out.
fn prefix_fingerprints(
    messages: &[Message],
    counts: impl IntoIterator<Item = usize>,
) -> HashMap<usize, PrefixFingerprint> {
    let mut counts: Vec<usize> = counts
        .into_iter()
        .filter(|count| *count <= messages.len())
        .collect();
    counts.sort_unstable();
    counts.dedup();
    let system_prompt = messages
        .iter()
        .take_while(|message| message.role == "system")
        .count();
    let mut fingerprints = HashMap::with_capacity(counts.len());
    let mut identity = SliceDigest::new();
    let mut exact = SliceDigest::new();
    let mut hashed = 0;
    for count in counts {
        while hashed < count {
            exact.feed(&messages[hashed]);
            if hashed >= system_prompt {
                identity.feed(&without_tool_output(&messages[hashed]));
            }
            hashed += 1;
        }
        fingerprints.insert(
            count,
            PrefixFingerprint {
                identity: identity.so_far(),
                exact: exact.so_far(),
            },
        );
    }
    fingerprints
}

/// The repository `dir` was found in the first time this process looked,
/// kept for the life of the process. Host git is pinned to that git
/// directory, so a `.git` a sandboxed command creates under the workspace
/// later is never discovered, and never gets to configure the host's git.
/// Its code-running settings are recorded then too, unless they were before.
/// A failure to ask git at all is not remembered; an answer is.
async fn pinned_workspace(dir: &Path) -> Result<Option<Workspace>, DeveloperSessionHostError> {
    static PINNED: OnceLock<StdMutex<HashMap<PathBuf, Option<Workspace>>>> = OnceLock::new();
    let pins = PINNED.get_or_init(Default::default);
    if let Some(found) = pins
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .get(dir)
    {
        return Ok(found.clone());
    }
    let found = Workspace::discover(&BookkeepingRunner, dir)
        .await
        .map_err(invalid)?;
    if let Some(workspace) = &found {
        crate::platform::runtime::git::use_git_state_dir();
        if let Err(error) =
            agiworkforce_worktree::config_guard::ensure_baseline(&BookkeepingRunner, workspace)
                .await
        {
            tracing::warn!(workspace = %dir.display(), %error, "repository git settings not recorded");
        }
    }
    Ok(pins
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .entry(dir.to_path_buf())
        .or_insert(found)
        .clone())
}

/// Whether host git may obey the repository configuration of `workspace`,
/// read from the trust record on every use so a change applies at once.
fn config_trusted(workspace: &Path) -> bool {
    crate::trust::restrictions_for(workspace).repository_config
}

/// Resolve the repository of a host's workspace before any session can run a
/// command in it.
pub(super) async fn pin_workspace(dir: &Path) {
    if let Err(error) = pinned_workspace(dir).await {
        tracing::warn!(workspace = %dir.display(), error = %error.message(), "repository not resolved");
    }
}

async fn checkpoints(
    workspace: &Path,
    thread_id: &str,
) -> Result<Option<Checkpoints<'static>>, DeveloperSessionHostError> {
    let Some(pinned) = pinned_workspace(workspace).await? else {
        return Ok(None);
    };
    let pinned = pinned.with_config_trusted(config_trusted(workspace));
    Checkpoints::open(&BookkeepingRunner, &pinned, thread_id)
        .map(Some)
        .map_err(invalid)
}

async fn require_checkpoints(
    workspace: &Path,
    thread_id: &str,
) -> Result<Checkpoints<'static>, DeveloperSessionHostError> {
    checkpoints(workspace, thread_id)
        .await?
        .ok_or_else(|| DeveloperSessionHostError::unavailable(NO_GIT))
}

/// Snapshot the workspace for one phase of a turn. A checkpoint is an aid to
/// review and rewind, never a precondition for work, so a failure is logged
/// and the turn goes on; the turn then simply lists as not rewindable.
pub(super) async fn record_checkpoint(
    workspace: &Path,
    thread_id: &str,
    turn_id: &str,
    phase: Phase,
    mark: Option<ConversationMark>,
) -> bool {
    let store = match checkpoints(workspace, thread_id).await {
        Ok(Some(store)) => store,
        Ok(None) => return false,
        Err(error) => {
            tracing::warn!(thread_id, turn_id, error = %error.message(), "checkpoint unavailable");
            return false;
        }
    };
    match store.record(turn_id, phase, mark).await {
        Ok(_) => true,
        Err(error) => {
            tracing::warn!(thread_id, turn_id, %error, "checkpoint not recorded");
            false
        }
    }
}

/// [`record_checkpoint`] for the start of a turn, which waits at most
/// [`TURN_START_SNAPSHOT_LIMIT`]. A turn that outruns it has no checkpoint,
/// lists as not rewindable, and records nothing at its end either.
pub(super) async fn record_turn_start_checkpoint(
    workspace: &Path,
    thread_id: &str,
    turn_id: &str,
    mark: ConversationMark,
) -> bool {
    let store = match checkpoints(workspace, thread_id).await {
        Ok(Some(store)) => store,
        Ok(None) => return false,
        Err(error) => {
            tracing::warn!(thread_id, turn_id, error = %error.message(), "checkpoint unavailable");
            return false;
        }
    };
    match store
        .record_within(
            turn_id,
            Phase::Before,
            Some(mark),
            TURN_START_SNAPSHOT_LIMIT,
        )
        .await
    {
        Ok(Some(_)) => true,
        Ok(None) => {
            tracing::warn!(
                thread_id,
                turn_id,
                limit_seconds = TURN_START_SNAPSHOT_LIMIT.as_secs(),
                "no checkpoint for this turn: the workspace snapshot did not finish in time"
            );
            false
        }
        Err(error) => {
            tracing::warn!(thread_id, turn_id, %error, "checkpoint not recorded");
            false
        }
    }
}

fn file_status(status: ChangeStatus) -> CheckpointFileStatus {
    match status {
        ChangeStatus::Added => CheckpointFileStatus::Added,
        ChangeStatus::Modified => CheckpointFileStatus::Modified,
        ChangeStatus::Deleted => CheckpointFileStatus::Deleted,
    }
}

fn checkpoint_file(change: TreeChange) -> CheckpointFile {
    CheckpointFile {
        path: change.path,
        status: file_status(change.status),
        binary: change.binary,
    }
}

fn file_diff(patch: FilePatch) -> CheckpointFileDiff {
    CheckpointFileDiff {
        path: patch.path,
        status: file_status(patch.status),
        binary: patch.binary,
        hunks: patch
            .hunks
            .into_iter()
            .map(|hunk| CheckpointHunk {
                index: u32::try_from(hunk.index).unwrap_or(u32::MAX),
                header: hunk.header,
                text: hunk.text,
            })
            .collect(),
    }
}

pub(super) async fn list_checkpoints(
    workspace: &Path,
    thread_id: &str,
    messages: &[Message],
) -> Result<CheckpointListResponse, DeveloperSessionHostError> {
    let Some(store) = checkpoints(workspace, thread_id).await? else {
        return Ok(CheckpointListResponse {
            thread_id: thread_id.to_string(),
            available: false,
            unavailable_reason: Some(NO_GIT.to_string()),
            turns: Vec::new(),
        });
    };
    let listed = store.list().await.map_err(invalid)?;
    let fingerprints = prefix_fingerprints(
        messages,
        listed
            .iter()
            .filter_map(|turn| turn.conversation.as_ref().map(|mark| mark.message_count)),
    );
    let mut turns = Vec::new();
    for turn in listed {
        let files = if turn.after.is_some() {
            store
                .changes(&turn)
                .await
                .map_err(invalid)?
                .into_iter()
                .map(checkpoint_file)
                .collect()
        } else {
            Vec::new()
        };
        turns.push(TurnCheckpointSummary {
            skipped_files: turn.skipped(),
            rewindable: turn
                .conversation
                .as_ref()
                .is_some_and(|mark| rewinds_with(&fingerprints, mark)),
            turn_id: turn.turn_id,
            index: turn.index,
            started_at: turn.before.at.to_rfc3339(),
            finished_at: turn.after.map(|after| after.at.to_rfc3339()),
            files,
        });
    }
    Ok(CheckpointListResponse {
        thread_id: thread_id.to_string(),
        available: true,
        unavailable_reason: None,
        turns,
    })
}

pub(super) async fn checkpoint_diff(
    workspace: &Path,
    thread_id: &str,
    turn_id: &str,
) -> Result<CheckpointDiffResponse, DeveloperSessionHostError> {
    let store = require_checkpoints(workspace, thread_id).await?;
    let turn = store.turn(turn_id).await.map_err(invalid)?;
    let files = store
        .patches(&turn)
        .await
        .map_err(conflict)?
        .into_iter()
        .map(file_diff)
        .collect();
    Ok(CheckpointDiffResponse {
        thread_id: thread_id.to_string(),
        turn_id: turn_id.to_string(),
        index: turn.index,
        files,
    })
}

pub(super) async fn apply_sections(
    workspace: &Path,
    params: CheckpointSectionsParams,
    stage: bool,
) -> Result<CheckpointSectionsResponse, DeveloperSessionHostError> {
    if params.sections.is_empty() {
        return Err(invalid("Name at least one file to change."));
    }
    let store = require_checkpoints(workspace, &params.thread_id).await?;
    let sections: Vec<Section> = params
        .sections
        .into_iter()
        .map(|section| Section {
            path: section.path,
            hunks: section
                .hunks
                .into_iter()
                .map(|index| usize::try_from(index).unwrap_or(usize::MAX))
                .collect(),
        })
        .collect();
    let outcome = if stage {
        store
            .stage_sections(&params.turn_id, &sections, params.preview)
            .await
    } else {
        store
            .revert_sections(&params.turn_id, &sections, params.preview)
            .await
    }
    .map_err(invalid)?;
    Ok(CheckpointSectionsResponse {
        applied: outcome.applied,
        conflicted: outcome
            .conflicted
            .into_iter()
            .map(|(path, reason)| CheckpointSectionConflict { path, reason })
            .collect(),
        preview: params.preview,
    })
}

/// The checkpoint a rewind to `turn_id` would return to.
pub(super) async fn rewind_target(
    workspace: &Path,
    thread_id: &str,
    turn_id: &str,
) -> Result<TurnCheckpoint, DeveloperSessionHostError> {
    require_checkpoints(workspace, thread_id)
        .await?
        .turn(turn_id)
        .await
        .map_err(invalid)
}

pub(super) async fn rewind_files(
    workspace: &Path,
    thread_id: &str,
    turn_id: &str,
    preview: bool,
) -> Result<RewindOutcome, DeveloperSessionHostError> {
    require_checkpoints(workspace, thread_id)
        .await?
        .rewind(turn_id, preview)
        .await
        .map_err(|error| DeveloperSessionHostError::internal(error.to_string()))
}

/// Where each rewindable turn begins in `messages`, oldest first: the message
/// count its checkpoint recorded, paired with its id. A turn the conversation
/// can no longer be cut back to is left out, so no message is ever attributed
/// to it.
pub(super) async fn turn_starts(
    workspace: &Path,
    thread_id: &str,
    messages: &[Message],
) -> Vec<(usize, String)> {
    let store = match checkpoints(workspace, thread_id).await {
        Ok(Some(store)) => store,
        Ok(None) => return Vec::new(),
        Err(error) => {
            tracing::warn!(thread_id, error = %error.message(), "turns not read");
            return Vec::new();
        }
    };
    match store.list().await {
        Ok(turns) => {
            let fingerprints = prefix_fingerprints(
                messages,
                turns
                    .iter()
                    .filter_map(|turn| turn.conversation.as_ref().map(|mark| mark.message_count)),
            );
            turns
                .into_iter()
                .filter_map(|turn| {
                    let mark = turn.conversation?;
                    rewinds_with(&fingerprints, &mark).then_some((mark.message_count, turn.turn_id))
                })
                .collect()
        }
        Err(error) => {
            tracing::warn!(thread_id, %error, "turns not read");
            Vec::new()
        }
    }
}

/// The turn the message at `index` belongs to: the latest one that began at
/// or before it.
pub(super) fn turn_of(starts: &[(usize, String)], index: usize) -> Option<String> {
    starts
        .iter()
        .rev()
        .find(|(start, _)| *start <= index)
        .map(|(_, turn_id)| turn_id.clone())
}

/// Remove what a deleted thread left in the repository, keeping the archives
/// of its worktrees unless `discard_archives`. A folder outside git left
/// nothing to remove; a git failure is returned, so a discard the user
/// confirmed is never reported as done when the archives are still there.
pub(super) async fn forget_thread(
    workspace: &Path,
    thread_id: &str,
    discard_archives: bool,
) -> Result<ForgottenThread, DeveloperSessionHostError> {
    let Some(pinned) = pinned_workspace(workspace).await? else {
        return Ok(ForgottenThread::default());
    };
    agiworkforce_worktree::checkpoint::forget_thread(
        &BookkeepingRunner,
        &pinned,
        thread_id,
        discard_archives,
    )
    .await
    .map_err(|error| {
        DeveloperSessionHostError::internal(format!(
            "The checkpoints and worktree archives of thread {thread_id} could not be removed: {error}"
        ))
    })
}

/// Run an approved setup script until it exits, streaming each line it prints
/// as `worktree/setup/log`. Returns its exit code, or `None` when it could not
/// start or was killed by a signal. Anything it left running in its process
/// group is ended as soon as it exits, the output still buffered is read for at
/// most [`SETUP_OUTPUT_DRAIN_LIMIT`], and the private copy of the script is
/// removed.
pub(super) async fn run_setup_script(
    run: SetupRun,
    worktree_id: &str,
    thread_id: Option<&str>,
    notifications: &broadcast::Sender<AppServerNotification>,
) -> Option<i32> {
    let SetupRun { command, script } = run;
    let exit_code = run_setup_command(command, worktree_id, thread_id, notifications).await;
    let _ = std::fs::remove_file(&script);
    exit_code
}

async fn run_setup_command(
    mut command: tokio::process::Command,
    worktree_id: &str,
    thread_id: Option<&str>,
    notifications: &broadcast::Sender<AppServerNotification>,
) -> Option<i32> {
    command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = match ProcessTreeChild::spawn(command) {
        Ok(child) => child,
        Err(error) => {
            emit_setup_line(
                notifications,
                worktree_id,
                thread_id,
                WorktreeSetupStream::Stderr,
                format!("The setup script could not start: {error}"),
            );
            return None;
        }
    };
    let stdout = child.child_mut().stdout.take();
    let stderr = child.child_mut().stderr.take();
    let output = async {
        tokio::join!(
            pump_setup_output(
                stdout,
                WorktreeSetupStream::Stdout,
                worktree_id,
                thread_id,
                notifications
            ),
            pump_setup_output(
                stderr,
                WorktreeSetupStream::Stderr,
                worktree_id,
                thread_id,
                notifications
            ),
        );
    };
    tokio::pin!(output);
    let mut output_closed = false;
    // A process the script backgrounds inherits its pipes, so they only close
    // once the group is ended: the script's own exit is what ends the run.
    let status = loop {
        tokio::select! {
            status = child.child_mut().wait() => break status,
            () = &mut output, if !output_closed => output_closed = true,
        }
    };
    child.terminate().await;
    if !output_closed
        && tokio::time::timeout(SETUP_OUTPUT_DRAIN_LIMIT, output)
            .await
            .is_err()
    {
        tracing::warn!(
            worktree_id,
            "the setup script's output was still open after its process group ended"
        );
    }
    status.ok().and_then(|status| status.code())
}

async fn pump_setup_output<R: AsyncRead + Unpin>(
    pipe: Option<R>,
    stream: WorktreeSetupStream,
    worktree_id: &str,
    thread_id: Option<&str>,
    notifications: &broadcast::Sender<AppServerNotification>,
) {
    let Some(pipe) = pipe else {
        return;
    };
    let mut reader = BufReader::new(pipe);
    let mut line = Vec::new();
    loop {
        line.clear();
        match reader.read_until(b'\n', &mut line).await {
            Ok(0) | Err(_) => return,
            Ok(_) => emit_setup_line(
                notifications,
                worktree_id,
                thread_id,
                stream,
                String::from_utf8_lossy(&line)
                    .trim_end_matches(['\r', '\n'])
                    .to_string(),
            ),
        }
    }
}

fn emit_setup_line(
    notifications: &broadcast::Sender<AppServerNotification>,
    worktree_id: &str,
    thread_id: Option<&str>,
    stream: WorktreeSetupStream,
    text: String,
) {
    if let Ok(notification) = AppServerNotification::new(
        method::WORKTREE_SETUP_LOG,
        WorktreeSetupLogNotification {
            worktree_id: worktree_id.to_string(),
            thread_id: thread_id.map(str::to_string),
            stream,
            text,
        },
    ) {
        let _ = notifications.send(notification);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_message_belongs_to_the_latest_turn_that_began_at_or_before_it() {
        let starts = vec![(2, "turn-1".to_string()), (5, "turn-2".to_string())];
        assert_eq!(turn_of(&starts, 0), None);
        assert_eq!(turn_of(&starts, 2).as_deref(), Some("turn-1"));
        assert_eq!(turn_of(&starts, 4).as_deref(), Some("turn-1"));
        assert_eq!(turn_of(&starts, 9).as_deref(), Some("turn-2"));
    }

    #[test]
    fn a_compacted_conversation_does_not_rewind_to_a_mark_taken_before_it() {
        let messages = vec![
            Message::text("user", "first"),
            Message::text("assistant", "answer"),
            Message::text("user", "second"),
        ];
        let mark = conversation_mark(&messages[..2]);
        assert!(conversation_rewinds_to(&messages, &mark));

        let compacted = vec![
            Message::text("system", "summary of earlier work"),
            Message::text("user", "second"),
        ];
        assert!(!conversation_rewinds_to(&compacted, &mark));
        assert!(!conversation_rewinds_to(&messages[..1], &mark));
    }

    #[test]
    fn one_pass_fingerprints_match_a_mark_of_each_prefix() {
        let messages = vec![
            Message::text("user", "first"),
            Message::text("assistant", "answer"),
            Message::text("user", "second"),
        ];

        let fingerprints = prefix_fingerprints(&messages, [3, 0, 2, 1, 2, 9]);

        assert_eq!(fingerprints.len(), 4);
        for count in 0..=messages.len() {
            let fingerprint = fingerprints
                .get(&count)
                .expect("a prefix that was asked for");
            assert_eq!(
                format!("{TURN_IDENTITY}{}", fingerprint.identity),
                conversation_mark(&messages[..count]).fingerprint,
                "prefix of {count} messages"
            );
            let every_byte = serde_json::to_vec(&messages[..count]).expect("serialize");
            assert_eq!(
                fingerprint.exact,
                crate::hex::encode(&Sha256::digest(every_byte)),
                "a mark recorded before turn identities must still check out"
            );
            let recorded_before = ConversationMark {
                message_count: count,
                fingerprint: fingerprint.exact.clone(),
            };
            assert!(conversation_rewinds_to(&messages, &recorded_before));
        }
        assert!(!fingerprints.contains_key(&9));
    }

    #[test]
    fn a_turn_keeps_its_mark_when_output_is_shortened_or_the_prompt_restyled() {
        let result = |content: &str| {
            Message::blocks(
                "user",
                vec![ContentBlock::ToolResult {
                    tool_use_id: "call-1".to_string(),
                    content: content.to_string(),
                    is_error: false,
                }],
            )
        };
        let mut messages = vec![
            Message::text("system", "prompt in the default style"),
            Message::text("user", "read the file"),
            result(&"x".repeat(4_000)),
            Message::text("assistant", "done"),
        ];
        let second_turn = conversation_mark(&messages);
        messages.push(Message::text("user", "next"));

        messages[2] = result("[Older tool output pruned during context compaction]\nxxx");
        messages[0] = Message::text("system", "prompt in the terse style");
        assert!(
            conversation_rewinds_to(&messages, &second_turn),
            "pruning an earlier turn's output made a later turn a stranger to its own mark"
        );

        messages[3] = Message::text("assistant", "something else was said");
        assert!(!conversation_rewinds_to(&messages, &second_turn));
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn a_setup_script_that_backgrounds_a_process_ends_when_the_script_exits() {
        let _serial = crate::process_tree::CHILD_SPAWNING_TESTS.lock().await;
        let (notifications, mut log) = broadcast::channel(16);

        let exit_code = tokio::time::timeout(
            Duration::from_secs(10),
            run_setup_command(
                crate::process_tree::shell_command("echo ready; sleep 1000 & exit 3"),
                "worktree-1",
                None,
                &notifications,
            ),
        )
        .await
        .expect("the run ends once the script exits, not when its background process does");

        assert_eq!(exit_code, Some(3));
        let line = log.try_recv().expect("the script's output is streamed");
        assert_eq!(line.method, method::WORKTREE_SETUP_LOG);
        assert_eq!(line.params["text"], "ready");
    }
}
