use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use chrono::{DateTime, Local, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Arc;

use crate::path_security::WorkspaceFileAuthority;

mod storage;
use sha2::{Digest, Sha256};
use storage::CheckpointStorage;

use crate::models::Message;

#[cfg(test)]
mod boundary_tests;

pub(crate) const MAX_CHECKPOINTS: usize = 100;
const MAX_SNAPSHOT_BYTES: u64 = 8 * 1024 * 1024;
const INDEX_FILE: &str = "index.json";
const BLOB_DIR: &str = "blobs";
const INDEX_VERSION: u32 = 1;
const PATH_TOOLS: [&str; 4] = ["write_file", "edit_file", "multiedit", "notebook_edit"];
const PATH_KEYS: [&str; 3] = ["path", "file_path", "notebook_path"];

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum FileState {
    Absent,
    Contents(String),
    Untracked(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct FileSnapshot {
    pub path: PathBuf,
    pub before: FileState,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct Checkpoint {
    pub message_count: usize,
    pub prompt: String,
    pub created_at: DateTime<Utc>,
    pub files: Vec<FileSnapshot>,
}

#[derive(Serialize, Deserialize)]
struct CheckpointIndex {
    version: u32,
    checkpoints: Vec<Checkpoint>,
}

enum Observed {
    Absent,
    Contents(Vec<u8>),
    Untracked(String),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RewindMode {
    CodeAndConversation,
    Conversation,
    Code,
}

impl RewindMode {
    pub fn parse(text: &str) -> Option<Self> {
        match text.trim().to_ascii_lowercase().as_str() {
            "" | "both" | "all" | "code-and-conversation" => Some(Self::CodeAndConversation),
            "conversation" | "chat" | "conv" => Some(Self::Conversation),
            "code" | "files" => Some(Self::Code),
            _ => None,
        }
    }

    pub fn restores_code(self) -> bool {
        matches!(self, Self::CodeAndConversation | Self::Code)
    }

    pub fn restores_conversation(self) -> bool {
        matches!(self, Self::CodeAndConversation | Self::Conversation)
    }
}

#[derive(Debug, Default)]
pub struct RestoreReport {
    pub restored: Vec<PathBuf>,
    pub removed: Vec<PathBuf>,
    pub skipped: Vec<(PathBuf, String)>,
}

#[derive(Debug)]
pub struct RewindOutcome {
    pub prompt: String,
    pub files: Option<RestoreReport>,
    pub conversation_restored: bool,
    pub remaining: usize,
}

#[derive(Debug, Clone)]
pub struct CheckpointSummary {
    pub index: usize,
    pub created_at: DateTime<Local>,
    pub prompt: String,
    pub tracked_files: usize,
    pub message_index: Option<usize>,
}

impl CheckpointSummary {
    pub fn conversation_available(&self) -> bool {
        self.message_index.is_some()
    }
}

pub(crate) struct CheckpointLog {
    disk: Option<DiskStorage>,
    memory_blobs: HashMap<String, Vec<u8>>,
    checkpoints: Vec<Checkpoint>,
    unsaved: Option<String>,
    reported: bool,
}

impl std::fmt::Debug for CheckpointLog {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("CheckpointLog")
            .field("disk", &self.disk)
            .field("checkpoints", &self.checkpoints.len())
            .field("held_copies", &self.memory_blobs.len())
            .finish()
    }
}

impl Default for CheckpointLog {
    fn default() -> Self {
        Self::in_memory()
    }
}

impl CheckpointLog {
    pub(crate) fn in_memory() -> Self {
        Self {
            disk: None,
            memory_blobs: HashMap::new(),
            checkpoints: Vec::new(),
            unsaved: None,
            reported: false,
        }
    }

    pub(crate) fn beside(session_path: &Path) -> Self {
        let mut log = Self {
            disk: Some(DiskStorage {
                session_path: session_path.to_path_buf(),
                owner: CheckpointStorage::open(session_path)
                    .map(Arc::new)
                    .map_err(|error| format!("{error:#}")),
            }),
            ..Self::in_memory()
        };
        log.load_index();
        log
    }

    pub(crate) fn reload_beside(self, session_path: &Path) -> Self {
        if self
            .disk
            .as_ref()
            .is_some_and(|disk| disk.session_path == session_path)
        {
            let mut log = Self {
                disk: self.disk,
                ..Self::in_memory()
            };
            log.load_index();
            log
        } else {
            Self::beside(session_path)
        }
    }

    fn load_index(&mut self) {
        let result = self.storage().and_then(read_index);
        match result {
            Ok(checkpoints) => self.checkpoints = checkpoints,
            Err(error) => self.unsaved = Some(format!(
                "the saved checkpoints could not be read ({error:#}), so earlier prompts cannot be rewound"
            )),
        }
    }

    pub(crate) fn moved_into(self, mut destination: Self) -> Self {
        if self.disk.is_some() {
            return destination;
        }
        destination.checkpoints = self.checkpoints;
        for (digest, bytes) in self.memory_blobs {
            let saved = destination.store_blob(bytes);
            if let Err(error) = saved {
                let lost = FileState::Contents(digest);
                for snapshot in destination
                    .checkpoints
                    .iter_mut()
                    .flat_map(|checkpoint| checkpoint.files.iter_mut())
                    .filter(|snapshot| snapshot.before == lost)
                {
                    snapshot.before =
                        FileState::Untracked(format!("its copy could not be saved: {error:#}"));
                }
            }
        }
        destination.persist(false);
        destination
    }

    fn storage(&self) -> Result<&CheckpointStorage> {
        self.disk
            .as_ref()
            .context("no disk checkpoint backing was selected")?
            .owner
            .as_deref()
            .map_err(|error| anyhow::anyhow!(error.clone()))
    }

    pub(crate) fn checkpoints(&self) -> &[Checkpoint] {
        &self.checkpoints
    }

    pub(crate) fn len(&self) -> usize {
        self.checkpoints.len()
    }

    pub(crate) fn take_unsaved(&mut self) -> Option<String> {
        let unsaved = self.unsaved.take()?;
        if self.reported {
            return None;
        }
        self.reported = true;
        Some(unsaved)
    }

    pub(crate) fn push(&mut self, message_count: usize, prompt: String) {
        self.checkpoints.push(Checkpoint {
            message_count,
            prompt,
            created_at: Utc::now(),
            files: Vec::new(),
        });
        let evicted = self.checkpoints.len().saturating_sub(MAX_CHECKPOINTS);
        self.checkpoints.drain(..evicted);
        self.persist(evicted > 0);
    }

    pub(crate) fn pop(&mut self) -> Option<Checkpoint> {
        let popped = self.checkpoints.pop();
        if popped.is_some() {
            self.persist(true);
        }
        popped
    }

    pub(crate) fn truncate(&mut self, len: usize) {
        if len < self.checkpoints.len() {
            self.checkpoints.truncate(len);
            self.persist(true);
        }
    }

    pub(crate) fn capture(
        &mut self,
        path: &Path,
        authority: Option<&WorkspaceFileAuthority>,
    ) -> bool {
        let Some(checkpoint) = self.checkpoints.last() else {
            return false;
        };
        if checkpoint
            .files
            .iter()
            .any(|snapshot| snapshot.path == path)
        {
            return false;
        }
        let before = match observe(path, authority) {
            Observed::Absent => FileState::Absent,
            Observed::Untracked(reason) => FileState::Untracked(reason),
            Observed::Contents(bytes) => match self.store_blob(bytes) {
                Ok(digest) => FileState::Contents(digest),
                Err(error) => {
                    FileState::Untracked(format!("its copy could not be saved: {error:#}"))
                }
            },
        };
        if let Some(checkpoint) = self.checkpoints.last_mut() {
            checkpoint.files.push(FileSnapshot {
                path: path.to_path_buf(),
                before,
            });
        }
        self.persist(false);
        true
    }

    pub(crate) fn forget_unchanged(
        &mut self,
        paths: &[PathBuf],
        authority: Option<&WorkspaceFileAuthority>,
    ) {
        let Some(checkpoint) = self.checkpoints.last_mut() else {
            return;
        };
        let before = checkpoint.files.len();
        checkpoint.files.retain(|snapshot| {
            !paths.contains(&snapshot.path)
                || !still_matches(&snapshot.path, &snapshot.before, authority)
        });
        if checkpoint.files.len() != before {
            self.persist(true);
        }
    }

    pub(crate) fn summaries(&self, messages: &[Message]) -> Vec<CheckpointSummary> {
        self.checkpoints
            .iter()
            .enumerate()
            .map(|(index, checkpoint)| CheckpointSummary {
                index,
                created_at: checkpoint.created_at.with_timezone(&Local),
                prompt: checkpoint.prompt.clone(),
                tracked_files: self.tracked_files(index),
                message_index: prompt_position_matches(messages, checkpoint)
                    .then(|| transcript_index(messages, checkpoint.message_count)),
            })
            .collect()
    }

    pub(crate) fn tracked_files(&self, from: usize) -> usize {
        self.checkpoints
            .iter()
            .skip(from)
            .flat_map(|checkpoint| checkpoint.files.iter())
            .filter(|snapshot| !matches!(snapshot.before, FileState::Untracked(_)))
            .map(|snapshot| &snapshot.path)
            .collect::<HashSet<_>>()
            .len()
    }

    pub(crate) fn restore_files(
        &self,
        from: usize,
        authority: Option<&WorkspaceFileAuthority>,
    ) -> RestoreReport {
        let mut seen = HashSet::new();
        let mut report = RestoreReport::default();
        for snapshot in self
            .checkpoints
            .iter()
            .skip(from)
            .flat_map(|checkpoint| checkpoint.files.iter())
        {
            if !seen.insert(snapshot.path.clone()) {
                continue;
            }
            let path = &snapshot.path;
            if let FileState::Untracked(reason) = &snapshot.before {
                report.skipped.push((path.clone(), reason.clone()));
                continue;
            }
            let resolved = authority
                .context("the session workspace file authority is unavailable")
                .and_then(|authority| authority.resolve(path));
            let (root, relative) = match resolved {
                Ok(resolved) => resolved,
                Err(error) => {
                    report.skipped.push((path.clone(), format!("{error:#}")));
                    continue;
                }
            };
            match &snapshot.before {
                FileState::Absent => match root.remove_file(&relative) {
                    Ok(true) => report.removed.push(path.clone()),
                    Ok(false) => {}
                    Err(error) => report.skipped.push((path.clone(), format!("{error:#}"))),
                },
                FileState::Contents(digest) => {
                    let written = self.read_blob(digest).and_then(|bytes| {
                        root.replace_file(&relative, &bytes, false, MAX_SNAPSHOT_BYTES)
                    });
                    match written {
                        Ok(true) => report.restored.push(path.clone()),
                        Ok(false) => {}
                        Err(error) => report.skipped.push((
                            path.clone(),
                            format!("its saved copy could not be restored: {error:#}"),
                        )),
                    }
                }
                FileState::Untracked(_) => unreachable!(),
            }
        }
        report
    }

    fn store_blob(&mut self, bytes: Vec<u8>) -> Result<String> {
        let digest = crate::hex::encode(&Sha256::digest(&bytes));
        validate_blob(&digest, &bytes)?;
        if self.disk.is_some() {
            self.storage()?.store_blob(&digest, &bytes)?;
        } else {
            if let Some(existing) = self.memory_blobs.get(&digest) {
                validate_blob(&digest, existing)?;
            }
            self.memory_blobs.entry(digest.clone()).or_insert(bytes);
        }
        Ok(digest)
    }

    fn read_blob(&self, digest: &str) -> Result<Vec<u8>> {
        validate_digest(digest)?;
        if self.disk.is_some() {
            self.storage()?.read_blob(digest)
        } else {
            let bytes = self
                .memory_blobs
                .get(digest)
                .context("no copy is held for it")?;
            validate_blob(digest, bytes)?;
            Ok(bytes.clone())
        }
    }

    fn referenced_blobs(&self) -> HashSet<&str> {
        self.checkpoints
            .iter()
            .flat_map(|checkpoint| checkpoint.files.iter())
            .filter_map(|snapshot| match &snapshot.before {
                FileState::Contents(digest) => Some(digest.as_str()),
                FileState::Absent | FileState::Untracked(_) => None,
            })
            .collect()
    }

    fn persist(&mut self, dropped_snapshots: bool) {
        if self.disk.is_none() {
            if dropped_snapshots {
                self.collect_garbage();
            }
            return;
        }
        let written = (|| -> Result<()> {
            let storage = self.storage()?;
            let Some(directory) = storage.directory(!self.checkpoints.is_empty())? else {
                return Ok(());
            };
            let index = CheckpointIndex {
                version: INDEX_VERSION,
                checkpoints: self.checkpoints.clone(),
            };
            let bytes = serde_json::to_vec(&index).context("serializing the checkpoint index")?;
            directory.replace_file(Path::new(INDEX_FILE), &bytes, true, MAX_SNAPSHOT_BYTES)?;
            Ok(())
        })();
        match written {
            Ok(()) if dropped_snapshots => self.collect_garbage(),
            Ok(()) => {}
            Err(error) if !self.reported => self.unsaved = Some(format!(
                "checkpoints could not be saved to disk ({error:#}), so they last only until this session ends"
            )),
            Err(_) => {}
        }
    }

    fn collect_garbage(&mut self) {
        let referenced: HashSet<String> = self
            .referenced_blobs()
            .into_iter()
            .map(str::to_string)
            .collect();
        if self.disk.is_some() {
            let result = self
                .storage()
                .and_then(|storage| storage.collect_garbage(&referenced));
            if let Err(error) = result {
                if !self.reported {
                    self.unsaved = Some(format!(
                        "unused checkpoint copies could not be removed: {error:#}"
                    ));
                }
            }
        } else {
            self.memory_blobs
                .retain(|digest, _| referenced.contains(digest));
        }
    }
}

#[derive(Debug)]
struct DiskStorage {
    session_path: PathBuf,
    owner: Result<Arc<CheckpointStorage>, String>,
}

fn read_index(storage: &CheckpointStorage) -> Result<Vec<Checkpoint>> {
    let Some(directory) = storage.directory(false)? else {
        return Ok(Vec::new());
    };
    let Some(file) = directory.read_file(Path::new(INDEX_FILE), MAX_SNAPSHOT_BYTES)? else {
        return Ok(Vec::new());
    };
    let mut index: CheckpointIndex =
        serde_json::from_slice(&file.bytes).context("parsing the checkpoint index")?;
    anyhow::ensure!(
        index.version == INDEX_VERSION,
        "the checkpoint index has version {}, this CLI reads version {INDEX_VERSION}",
        index.version
    );
    anyhow::ensure!(
        index.checkpoints.len() <= MAX_CHECKPOINTS,
        "the checkpoint index exceeds the allowed checkpoint count"
    );
    for snapshot in index
        .checkpoints
        .iter_mut()
        .flat_map(|checkpoint| checkpoint.files.iter_mut())
    {
        if let FileState::Contents(digest) = &snapshot.before {
            if let Err(error) = validate_digest(digest) {
                snapshot.before = FileState::Untracked(format!(
                    "its saved copy identifier is invalid: {error:#}"
                ));
            }
        }
    }
    Ok(index.checkpoints)
}

fn validate_digest(digest: &str) -> Result<()> {
    anyhow::ensure!(
        digest.len() == 64
            && digest
                .bytes()
                .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte)),
        "the saved copy identifier must be a lowercase SHA-256 digest"
    );
    Ok(())
}

fn validate_blob(digest: &str, bytes: &[u8]) -> Result<()> {
    validate_digest(digest)?;
    anyhow::ensure!(
        bytes.len() as u64 <= MAX_SNAPSHOT_BYTES,
        "the saved copy exceeds the allowed size"
    );
    anyhow::ensure!(
        crate::hex::encode(&Sha256::digest(bytes)) == digest,
        "the saved copy does not match its digest"
    );
    Ok(())
}

fn observe(path: &Path, authority: Option<&WorkspaceFileAuthority>) -> Observed {
    let read = authority
        .context("the session workspace file authority is unavailable")
        .and_then(|authority| authority.resolve(path))
        .and_then(|(root, relative)| root.read_file(&relative, MAX_SNAPSHOT_BYTES));
    match read {
        Ok(None) => Observed::Absent,
        Ok(Some(file)) => Observed::Contents(file.bytes),
        Err(error) => Observed::Untracked(format!("{error:#}")),
    }
}

fn still_matches(
    path: &Path,
    before: &FileState,
    authority: Option<&WorkspaceFileAuthority>,
) -> bool {
    match (observe(path, authority), before) {
        (Observed::Absent, FileState::Absent) => true,
        (Observed::Contents(bytes), FileState::Contents(digest)) => {
            validate_blob(digest, &bytes).is_ok()
        }
        _ => false,
    }
}

pub(crate) fn prompt_position_matches(messages: &[Message], checkpoint: &Checkpoint) -> bool {
    messages
        .get(checkpoint.message_count)
        .is_some_and(|message| {
            message.role == "user" && message.text_content() == checkpoint.prompt
        })
}

pub(crate) fn transcript_index(messages: &[Message], position: usize) -> usize {
    messages
        .iter()
        .take(position)
        .filter(|message| !message.role.eq_ignore_ascii_case("system"))
        .count()
}

pub(crate) fn edited_paths(tool: &str, args: &Value, root: Option<&Path>) -> Vec<PathBuf> {
    let mut raw: Vec<String> = Vec::new();
    if PATH_TOOLS.contains(&tool) {
        if let Some(path) = PATH_KEYS
            .iter()
            .find_map(|key| args.get(*key).and_then(Value::as_str))
        {
            raw.push(path.to_string());
        }
    } else if tool == "apply_patch" {
        if let Some(patch) = args.get("patch").and_then(Value::as_str) {
            for line in patch.lines() {
                let Some(target) = line
                    .strip_prefix("--- ")
                    .or_else(|| line.strip_prefix("+++ "))
                else {
                    continue;
                };
                let target = target.split('\t').next().unwrap_or(target).trim();
                if target.is_empty() || target == "/dev/null" {
                    continue;
                }
                let target = target
                    .strip_prefix("a/")
                    .or_else(|| target.strip_prefix("b/"))
                    .unwrap_or(target);
                raw.push(target.to_string());
            }
        }
    }
    let base = root
        .map(Path::to_path_buf)
        .or_else(|| std::env::current_dir().ok());
    let mut paths: Vec<PathBuf> = Vec::new();
    for entry in raw {
        let entry = entry.trim();
        if entry.is_empty() {
            continue;
        }
        let path = PathBuf::from(crate::path_security::expand_home(entry));
        let path = match (&base, path.is_relative()) {
            (Some(base), true) => base.join(path),
            _ => path,
        };
        if !paths.contains(&path) {
            paths.push(path);
        }
    }
    paths
}
