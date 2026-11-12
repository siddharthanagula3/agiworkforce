use std::collections::{HashMap, VecDeque};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use once_cell::sync::Lazy;

pub const MAX_EDIT_FILE_BYTES: u64 = 2_000_000;

const MAX_READ_FILE_STATE_ENTRIES: usize = 100;
const READ_FIRST_MESSAGE: &str = "File has not been read yet. Read it first before writing to it.";
const STALE_READ_MESSAGE: &str = "File has been modified since read, either by the user or by a linter. Read it again before attempting to write it.";

static READ_FILE_STATE: Lazy<Mutex<FileStateCache>> =
    Lazy::new(|| Mutex::new(FileStateCache::new(MAX_READ_FILE_STATE_ENTRIES)));

#[derive(Clone)]
struct FileState {
    content: String,
}

struct FileStateCache {
    entries: HashMap<PathBuf, FileState>,
    order: VecDeque<PathBuf>,
    max_entries: usize,
}

impl FileStateCache {
    fn new(max_entries: usize) -> Self {
        Self {
            entries: HashMap::new(),
            order: VecDeque::new(),
            max_entries,
        }
    }

    fn get(&self, key: &Path) -> Option<&FileState> {
        self.entries.get(key)
    }

    fn insert(&mut self, key: PathBuf, state: FileState) {
        self.order.retain(|existing| existing != &key);
        self.order.push_back(key.clone());
        self.entries.insert(key, state);

        while self.entries.len() > self.max_entries {
            if let Some(old_key) = self.order.pop_front() {
                self.entries.remove(&old_key);
            } else {
                break;
            }
        }
    }
}

pub fn record_file_read(path: &Path, content: &str) {
    record_file_state(path, content);
}

pub fn record_file_write(path: &Path, content: &str) {
    record_file_state(path, content);
}

pub fn record_files_written(paths: &[PathBuf]) {
    for path in paths {
        if let Ok(content) = std::fs::read_to_string(path) {
            record_file_state(path, &content);
        }
    }
}

pub fn too_large_to_edit_message(len: u64) -> String {
    format!(
        "File is too large to edit safely ({len} bytes; limit {MAX_EDIT_FILE_BYTES} bytes). Split the file first."
    )
}

pub fn ensure_previously_read_and_fresh(path: &Path) -> std::result::Result<(), String> {
    if !path.exists() {
        return Ok(());
    }

    let key = path
        .canonicalize()
        .map_err(|e| format!("Cannot resolve path for freshness check: {}", e))?;
    let metadata = std::fs::metadata(&key)
        .map_err(|e| format!("Cannot stat file for freshness check: {}", e))?;
    if metadata.len() > MAX_EDIT_FILE_BYTES {
        return Err(too_large_to_edit_message(metadata.len()));
    }

    let state = READ_FILE_STATE
        .lock()
        .ok()
        .and_then(|cache| cache.get(&key).cloned())
        .ok_or_else(|| READ_FIRST_MESSAGE.to_string())?;

    let current = std::fs::read_to_string(&key).map_err(|_| STALE_READ_MESSAGE.to_string())?;
    if current != state.content {
        return Err(STALE_READ_MESSAGE.to_string());
    }

    Ok(())
}

fn record_file_state(path: &Path, content: &str) {
    let Ok(key) = path.canonicalize() else {
        return;
    };
    let state = FileState {
        content: content.to_string(),
    };

    if let Ok(mut cache) = READ_FILE_STATE.lock() {
        cache.insert(key, state);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn existing_file_requires_prior_read() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let path = tmp.path().join("file.txt");
        std::fs::write(&path, "alpha").expect("write file");

        let result = ensure_previously_read_and_fresh(&path);

        assert_eq!(
            result.expect_err("should require a read"),
            READ_FIRST_MESSAGE
        );
    }

    #[test]
    fn file_read_allows_fresh_write() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let path = tmp.path().join("file.txt");
        std::fs::write(&path, "alpha").expect("write file");

        record_file_read(&path, "alpha");

        assert!(ensure_previously_read_and_fresh(&path).is_ok());
    }

    #[test]
    fn changed_file_rejects_stale_write() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let path = tmp.path().join("file.txt");
        std::fs::write(&path, "alpha").expect("write file");
        record_file_read(&path, "alpha");
        let read_mtime = std::fs::metadata(&path)
            .expect("metadata")
            .modified()
            .expect("mtime");

        for _ in 0..20 {
            std::thread::sleep(std::time::Duration::from_millis(25));
            std::fs::write(&path, "beta").expect("modify file");
            let modified = std::fs::metadata(&path)
                .expect("metadata")
                .modified()
                .expect("mtime");
            if modified > read_mtime {
                break;
            }
        }

        let result = ensure_previously_read_and_fresh(&path);

        assert_eq!(
            result.expect_err("should reject stale read"),
            STALE_READ_MESSAGE
        );
    }

    #[test]
    fn a_change_restored_with_an_older_modification_time_is_still_stale() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let path = tmp.path().join("config.yml");
        std::fs::write(&path, "read: yes\n").expect("write file");
        let read_mtime = std::fs::metadata(&path)
            .expect("metadata")
            .modified()
            .expect("mtime");
        record_file_read(&path, "read: yes\n");

        std::fs::write(&path, "restored: from backup\n").expect("restore file");
        std::fs::File::options()
            .write(true)
            .open(&path)
            .expect("open restored file")
            .set_modified(read_mtime - std::time::Duration::from_secs(3_600))
            .expect("set an older modification time");

        assert_eq!(
            ensure_previously_read_and_fresh(&path)
                .expect_err("the restored file is not the one read"),
            STALE_READ_MESSAGE
        );
    }

    #[test]
    fn a_file_over_the_edit_limit_is_refused_as_too_large_not_as_unread() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let path = tmp.path().join("generated.txt");
        std::fs::write(&path, "x".repeat(MAX_EDIT_FILE_BYTES as usize + 1)).expect("write file");

        let refusal = ensure_previously_read_and_fresh(&path).expect_err("too large");

        assert!(refusal.contains("too large to edit"), "{refusal}");
        assert_ne!(refusal, READ_FIRST_MESSAGE);
    }

    #[test]
    fn a_file_between_the_old_read_limit_and_the_edit_limit_can_be_marked_read() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let path = tmp.path().join("fixture.txt");
        let content = "y".repeat(1_500_000);
        std::fs::write(&path, &content).expect("write file");

        record_file_read(&path, &content);

        assert!(ensure_previously_read_and_fresh(&path).is_ok());
    }

    #[test]
    fn files_a_patch_wrote_are_known_to_the_next_edit() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let path = tmp.path().join("a.rs");
        std::fs::write(&path, "fn a() {}\n").expect("write file");
        record_file_read(&path, "fn a() {}\n");
        std::fs::write(&path, "fn a() { patched() }\n").expect("patch file");

        record_files_written(std::slice::from_ref(&path));

        assert!(ensure_previously_read_and_fresh(&path).is_ok());
    }
}
