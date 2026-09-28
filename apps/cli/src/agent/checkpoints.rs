use std::collections::HashSet;
use std::path::{Path, PathBuf};

use chrono::{DateTime, Local};
use serde_json::Value;

use crate::models::Message;

pub(crate) const MAX_CHECKPOINTS: usize = 100;
const MAX_SNAPSHOT_BYTES: u64 = 8 * 1024 * 1024;
const PATH_TOOLS: [&str; 4] = ["write_file", "edit_file", "multiedit", "notebook_edit"];
const PATH_KEYS: [&str; 3] = ["path", "file_path", "notebook_path"];

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum FileState {
    Absent,
    Contents(Vec<u8>),
    Untracked(String),
}

#[derive(Debug, Clone)]
pub(crate) struct FileSnapshot {
    pub path: PathBuf,
    pub before: FileState,
}

#[derive(Debug, Clone)]
pub(crate) struct Checkpoint {
    pub messages: Vec<Message>,
    pub prompt: String,
    pub created_at: DateTime<Local>,
    pub files: Vec<FileSnapshot>,
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
}

impl Checkpoint {
    pub(crate) fn new(messages: Vec<Message>, prompt: String) -> Self {
        Self {
            messages,
            prompt,
            created_at: Local::now(),
            files: Vec::new(),
        }
    }

    pub(crate) fn capture(&mut self, path: &Path) -> bool {
        if self.files.iter().any(|snapshot| snapshot.path == path) {
            return false;
        }
        self.files.push(FileSnapshot {
            path: path.to_path_buf(),
            before: current_state(path),
        });
        true
    }

    pub(crate) fn forget_unchanged(&mut self, paths: &[PathBuf]) {
        self.files.retain(|snapshot| {
            !paths.contains(&snapshot.path) || current_state(&snapshot.path) != snapshot.before
        });
    }
}

fn current_state(path: &Path) -> FileState {
    match std::fs::symlink_metadata(path) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => FileState::Absent,
        Err(error) => FileState::Untracked(error.to_string()),
        Ok(metadata) if metadata.file_type().is_symlink() => {
            FileState::Untracked("it is a symbolic link".to_string())
        }
        Ok(metadata) if !metadata.is_file() => {
            FileState::Untracked("it is not a regular file".to_string())
        }
        Ok(metadata) if metadata.len() > MAX_SNAPSHOT_BYTES => FileState::Untracked(format!(
            "it is larger than {} MB",
            MAX_SNAPSHOT_BYTES / (1024 * 1024)
        )),
        Ok(_) => match std::fs::read(path) {
            Ok(bytes) => FileState::Contents(bytes),
            Err(error) => FileState::Untracked(error.to_string()),
        },
    }
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

pub(crate) fn restore_files(later: &[Checkpoint]) -> RestoreReport {
    let mut seen = HashSet::new();
    let mut report = RestoreReport::default();
    for checkpoint in later {
        for snapshot in &checkpoint.files {
            if !seen.insert(snapshot.path.clone()) {
                continue;
            }
            match &snapshot.before {
                FileState::Absent => match std::fs::remove_file(&snapshot.path) {
                    Ok(()) => report.removed.push(snapshot.path.clone()),
                    Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                    Err(error) => report
                        .skipped
                        .push((snapshot.path.clone(), error.to_string())),
                },
                FileState::Contents(bytes) => {
                    if current_state(&snapshot.path) == snapshot.before {
                        continue;
                    }
                    let written = snapshot
                        .path
                        .parent()
                        .map_or(Ok(()), std::fs::create_dir_all)
                        .and_then(|()| std::fs::write(&snapshot.path, bytes));
                    match written {
                        Ok(()) => report.restored.push(snapshot.path.clone()),
                        Err(error) => report
                            .skipped
                            .push((snapshot.path.clone(), error.to_string())),
                    }
                }
                FileState::Untracked(reason) => {
                    report.skipped.push((snapshot.path.clone(), reason.clone()))
                }
            }
        }
    }
    report
}

pub(crate) fn tracked_files(later: &[Checkpoint]) -> usize {
    later
        .iter()
        .flat_map(|checkpoint| checkpoint.files.iter().map(|snapshot| &snapshot.path))
        .collect::<HashSet<_>>()
        .len()
}
