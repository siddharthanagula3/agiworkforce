use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use chrono::{DateTime, Local, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};

use crate::models::Message;

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
    dir: Option<PathBuf>,
    memory_blobs: HashMap<String, Vec<u8>>,
    checkpoints: Vec<Checkpoint>,
    unsaved: Option<String>,
    reported: bool,
}

impl std::fmt::Debug for CheckpointLog {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("CheckpointLog")
            .field("dir", &self.dir)
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
            dir: None,
            memory_blobs: HashMap::new(),
            checkpoints: Vec::new(),
            unsaved: None,
            reported: false,
        }
    }

    pub(crate) fn beside(session_path: &Path) -> Self {
        let dir = crate::runtime::session_control::checkpoint_dir(session_path);
        let mut log = Self {
            dir: Some(dir.clone()),
            ..Self::in_memory()
        };
        match read_index(&dir) {
            Ok(checkpoints) => log.checkpoints = checkpoints,
            Err(error) => {
                log.unsaved = Some(format!(
                    "the saved checkpoints could not be read ({error:#}), so earlier prompts cannot be rewound"
                ))
            }
        }
        log
    }

    pub(crate) fn moved_beside(self, session_path: &Path) -> Self {
        if self.dir.is_some() {
            return Self::beside(session_path);
        }
        let Self {
            memory_blobs,
            checkpoints,
            ..
        } = self;
        let dir = crate::runtime::session_control::checkpoint_dir(session_path);
        let mut moved = Self {
            dir: Some(dir.clone()),
            checkpoints,
            ..Self::in_memory()
        };
        for (digest, bytes) in memory_blobs {
            if let Err(error) = write_private(&dir.join(BLOB_DIR).join(&digest), &bytes) {
                let lost = FileState::Contents(digest);
                for snapshot in moved
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
        moved.persist(false);
        moved
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

    pub(crate) fn capture(&mut self, path: &Path) -> bool {
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
        let before = match observe(path) {
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

    pub(crate) fn forget_unchanged(&mut self, paths: &[PathBuf]) {
        let Some(checkpoint) = self.checkpoints.last_mut() else {
            return;
        };
        let before = checkpoint.files.len();
        checkpoint.files.retain(|snapshot| {
            !paths.contains(&snapshot.path) || !still_matches(&snapshot.path, &snapshot.before)
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

    pub(crate) fn restore_files(&self, from: usize) -> RestoreReport {
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
            match &snapshot.before {
                FileState::Absent => match std::fs::remove_file(path) {
                    Ok(()) => report.removed.push(path.clone()),
                    Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                    Err(error) => report.skipped.push((path.clone(), error.to_string())),
                },
                FileState::Contents(digest) => {
                    if let Some(reason) = unsafe_to_overwrite(path) {
                        report.skipped.push((path.clone(), reason));
                        continue;
                    }
                    let bytes = match self.read_blob(digest) {
                        Ok(bytes) => bytes,
                        Err(error) => {
                            report.skipped.push((
                                path.clone(),
                                format!("its saved copy could not be read: {error:#}"),
                            ));
                            continue;
                        }
                    };
                    if std::fs::read(path).is_ok_and(|current| current == bytes) {
                        continue;
                    }
                    let written = path
                        .parent()
                        .map_or(Ok(()), std::fs::create_dir_all)
                        .and_then(|()| std::fs::write(path, &bytes));
                    match written {
                        Ok(()) => report.restored.push(path.clone()),
                        Err(error) => report.skipped.push((path.clone(), error.to_string())),
                    }
                }
                FileState::Untracked(reason) => report.skipped.push((path.clone(), reason.clone())),
            }
        }
        report
    }

    fn store_blob(&mut self, bytes: Vec<u8>) -> Result<String> {
        let digest = crate::hex::encode(&Sha256::digest(&bytes));
        match &self.dir {
            Some(dir) => {
                let target = dir.join(BLOB_DIR).join(&digest);
                if !target.exists() {
                    write_private(&target, &bytes)?;
                }
            }
            None => {
                self.memory_blobs.entry(digest.clone()).or_insert(bytes);
            }
        }
        Ok(digest)
    }

    fn read_blob(&self, digest: &str) -> Result<Vec<u8>> {
        match &self.dir {
            Some(dir) => {
                let path = dir.join(BLOB_DIR).join(digest);
                std::fs::read(&path).with_context(|| format!("reading {}", path.display()))
            }
            None => self
                .memory_blobs
                .get(digest)
                .cloned()
                .ok_or_else(|| anyhow::anyhow!("no copy is held for it")),
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
        if dropped_snapshots {
            self.collect_garbage();
        }
        let Some(dir) = &self.dir else {
            return;
        };
        if self.checkpoints.is_empty() && !dir.join(INDEX_FILE).exists() {
            return;
        }
        let index = CheckpointIndex {
            version: INDEX_VERSION,
            checkpoints: self.checkpoints.clone(),
        };
        let written = serde_json::to_vec(&index)
            .context("serializing the checkpoint index")
            .and_then(|bytes| write_private(&dir.join(INDEX_FILE), &bytes));
        if let Err(error) = written {
            if !self.reported {
                self.unsaved = Some(format!(
                    "checkpoints could not be saved to disk ({error:#}), so they last only until this session ends"
                ));
            }
        }
    }

    fn collect_garbage(&mut self) {
        let referenced: HashSet<String> = self
            .referenced_blobs()
            .into_iter()
            .map(str::to_string)
            .collect();
        match &self.dir {
            Some(dir) => {
                let Ok(entries) = std::fs::read_dir(dir.join(BLOB_DIR)) else {
                    return;
                };
                for entry in entries.flatten() {
                    let name = entry.file_name();
                    if name
                        .to_str()
                        .is_some_and(|digest| !referenced.contains(digest))
                    {
                        let _ = std::fs::remove_file(entry.path());
                    }
                }
            }
            None => self
                .memory_blobs
                .retain(|digest, _| referenced.contains(digest)),
        }
    }
}

fn read_index(dir: &Path) -> Result<Vec<Checkpoint>> {
    let path = dir.join(INDEX_FILE);
    let bytes = match std::fs::read(&path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(error).with_context(|| format!("reading {}", path.display())),
    };
    let index: CheckpointIndex =
        serde_json::from_slice(&bytes).with_context(|| format!("parsing {}", path.display()))?;
    anyhow::ensure!(
        index.version == INDEX_VERSION,
        "{} has version {}, this CLI reads version {INDEX_VERSION}",
        path.display(),
        index.version
    );
    Ok(index.checkpoints)
}

fn write_private(target: &Path, bytes: &[u8]) -> Result<()> {
    let dir = target
        .parent()
        .ok_or_else(|| anyhow::anyhow!("{} has no parent directory", target.display()))?;
    std::fs::create_dir_all(dir).with_context(|| format!("creating {}", dir.display()))?;
    let staged = tempfile::NamedTempFile::new_in(dir)
        .with_context(|| format!("creating a file in {}", dir.display()))?;
    std::fs::write(staged.path(), bytes)
        .with_context(|| format!("writing {}", staged.path().display()))?;
    staged
        .persist(target)
        .map_err(|error| anyhow::anyhow!("saving {}: {}", target.display(), error))?;
    Ok(())
}

fn observe(path: &Path) -> Observed {
    match std::fs::symlink_metadata(path) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Observed::Absent,
        Err(error) => Observed::Untracked(error.to_string()),
        Ok(metadata) if metadata.file_type().is_symlink() => {
            Observed::Untracked("it is a symbolic link".to_string())
        }
        Ok(metadata) if !metadata.is_file() => {
            Observed::Untracked("it is not a regular file".to_string())
        }
        Ok(metadata) if metadata.len() > MAX_SNAPSHOT_BYTES => Observed::Untracked(format!(
            "it is larger than {} MB",
            MAX_SNAPSHOT_BYTES / (1024 * 1024)
        )),
        Ok(_) => match std::fs::read(path) {
            Ok(bytes) => Observed::Contents(bytes),
            Err(error) => Observed::Untracked(error.to_string()),
        },
    }
}

fn still_matches(path: &Path, before: &FileState) -> bool {
    match (observe(path), before) {
        (Observed::Absent, FileState::Absent) => true,
        (Observed::Contents(bytes), FileState::Contents(digest)) => {
            crate::hex::encode(&Sha256::digest(&bytes)) == *digest
        }
        _ => false,
    }
}

fn unsafe_to_overwrite(path: &Path) -> Option<String> {
    let metadata = std::fs::symlink_metadata(path).ok()?;
    if metadata.file_type().is_symlink() {
        return Some("it is a symbolic link".to_string());
    }
    if !metadata.is_file() {
        return Some("it is not a regular file".to_string());
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        if metadata.nlink() > 1 {
            return Some("it is hard-linked to another file".to_string());
        }
    }
    None
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
