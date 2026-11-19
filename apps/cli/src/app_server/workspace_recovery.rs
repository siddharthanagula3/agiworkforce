use crate::path_security::{DirectoryAuthority, WorkspaceFileAuthority};
use agiworkforce_app_server::DeveloperSessionHostError;
use agiworkforce_protocol::workspace_files::*;
use anyhow::{ensure, Context, Result};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{collections::BTreeMap, path::Path};

const FORMAT_VERSION: u32 = 1;
const STATE_FILE: &str = "buffers.json";

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Entry {
    root_key: String,
    path: String,
    revision: String,
    value: WorkspaceFileRecovery,
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct State {
    version: u32,
    epoch: String,
    entries: BTreeMap<String, Entry>,
}

fn key(root: &str, path: &str) -> Result<String> {
    Ok(crate::hex::encode(&Sha256::digest(serde_json::to_vec(&(
        root, path,
    ))?)))
}

fn validate_value(value: &WorkspaceFileRecovery) -> Result<()> {
    ensure!(
        value.content.len() <= MAX_EDITOR_TEXT_BYTES && !value.content.contains('\0'),
        "The recovered editor text exceeds its limit or contains unsupported content"
    );
    ensure!(
        value.base_revision.len() == 64
            && value
                .base_revision
                .bytes()
                .all(|byte| byte.is_ascii_hexdigit()),
        "The recovered file has no valid base revision"
    );
    Ok(())
}

impl State {
    fn snapshot(&self, params: &WorkspaceFileParams) -> Result<WorkspaceFileRecoverySnapshot> {
        let entry = self.entries.get(&key(&params.root_key, &params.path)?);
        Ok(WorkspaceFileRecoverySnapshot {
            root_key: params.root_key.clone(),
            path: params.path.clone(),
            epoch: self.epoch.clone(),
            revision: entry.map(|entry| entry.revision.clone()),
            recovery: entry.map(|entry| entry.value.clone()),
        })
    }

    fn validate(&self) -> Result<()> {
        ensure!(
            self.version == FORMAT_VERSION,
            "The editor recovery format is unsupported; its contents were retained"
        );
        uuid::Uuid::parse_str(&self.epoch)?;
        ensure!(
            self.entries.len() <= MAX_EDITOR_RECOVERY_FILES,
            "The editor recovery file count exceeds its limit"
        );
        for (stored_key, entry) in &self.entries {
            ensure!(
                !entry.root_key.is_empty()
                    && !entry.path.is_empty()
                    && !entry.path.contains('\0')
                    && *stored_key == key(&entry.root_key, &entry.path)?,
                "Editor recovery contains a mismatched file identity; its contents were retained"
            );
            uuid::Uuid::parse_str(&entry.revision)?;
            validate_value(&entry.value)?;
        }
        Ok(())
    }
}

fn save(directory: &DirectoryAuthority, state: &State) -> Result<()> {
    state.validate()?;
    let bytes = serde_json::to_vec(state)?;
    ensure!(bytes.len() <= MAX_EDITOR_RECOVERY_STORAGE_BYTES, "Editor recovery storage is full. Save or discard recovered edits before retaining more files.");
    directory.identity()?;
    directory.replace_file(
        Path::new(STATE_FILE),
        &bytes,
        true,
        MAX_EDITOR_RECOVERY_STORAGE_BYTES as u64,
    )?;
    directory.sync_directory()?;
    directory.identity()?;
    Ok(())
}

fn load(directory: &DirectoryAuthority) -> Result<State> {
    if let Some(file) = directory.read_file(
        Path::new(STATE_FILE),
        MAX_EDITOR_RECOVERY_STORAGE_BYTES as u64,
    )? {
        let state: State = serde_json::from_slice(&file.bytes)
            .context("Editor recovery could not be read; the saved bytes were retained")?;
        state.validate()?;
        return Ok(state);
    }
    let state = State {
        version: FORMAT_VERSION,
        epoch: uuid::Uuid::new_v4().to_string(),
        entries: BTreeMap::new(),
    };
    save(directory, &state)?;
    Ok(state)
}

fn authorized(authority: &WorkspaceFileAuthority, params: &WorkspaceFileParams) -> Result<bool> {
    super::workspace_files::check_root(authority, &params.root_key).map_err(anyhow::Error::new)?;
    let (directory, path) = authority.editor_file(&params.path)?;
    let file = directory.read_file(&path, MAX_EDITOR_TEXT_BYTES as u64)?;
    Ok(file
        .is_some_and(|file| std::str::from_utf8(&file.bytes).is_ok() && !file.bytes.contains(&0)))
}

fn error(error: anyhow::Error) -> DeveloperSessionHostError {
    DeveloperSessionHostError::conflict(format!("Editor recovery could not be confirmed. Keep your editor text and reload recovery before retrying. {error:#}"))
}

pub(super) fn read(
    base: &Path,
    authority: &WorkspaceFileAuthority,
    params: WorkspaceFileParams,
) -> Result<WorkspaceFileRecoverySnapshot, DeveloperSessionHostError> {
    let work = || -> Result<_> {
        authorized(authority, &params)?;
        let directory =
            DirectoryAuthority::open(base)?.private_child(Path::new("editor-recovery"))?;
        let _lock = directory.recovery_lock()?;
        let state = load(&directory)?;
        directory.sync_directory()?;
        let snapshot = state.snapshot(&params)?;
        authorized(authority, &params)?;
        directory.identity()?;
        Ok(snapshot)
    };
    work().map_err(error)
}

pub(super) fn write(
    base: &Path,
    authority: &WorkspaceFileAuthority,
    params: WorkspaceFileRecoveryWriteParams,
) -> Result<WorkspaceFileRecoveryWriteResponse, DeveloperSessionHostError> {
    let work = || -> Result<_> {
        let target = WorkspaceFileParams {
            root_key: params.root_key.clone(),
            path: params.path.clone(),
        };
        authorized(authority, &target)?;
        uuid::Uuid::parse_str(&params.epoch)?;
        if let Some(revision) = &params.revision {
            uuid::Uuid::parse_str(revision)?;
        }
        if let WorkspaceFileRecoveryChange::Set { value } = &params.change {
            validate_value(value)?;
        }
        let directory =
            DirectoryAuthority::open(base)?.private_child(Path::new("editor-recovery"))?;
        let _lock = directory.recovery_lock()?;
        let mut state = load(&directory)?;
        let current = state.snapshot(&target)?;
        authorized(authority, &target)?;
        directory.identity()?;
        directory.sync_directory()?;
        let same_value = match &params.change {
            WorkspaceFileRecoveryChange::Set { value } => current.recovery.as_ref() == Some(value),
            WorkspaceFileRecoveryChange::Clear => current.recovery.is_none(),
        };
        if state.epoch != params.epoch || (current.revision != params.revision && !same_value) {
            return Ok(WorkspaceFileRecoveryWriteResponse {
                accepted: false,
                current,
            });
        }
        if same_value {
            return Ok(WorkspaceFileRecoveryWriteResponse {
                accepted: true,
                current,
            });
        }
        let identity = key(&params.root_key, &params.path)?;
        match params.change {
            WorkspaceFileRecoveryChange::Set { value } => {
                state.entries.insert(
                    identity,
                    Entry {
                        root_key: params.root_key,
                        path: params.path,
                        revision: uuid::Uuid::new_v4().to_string(),
                        value,
                    },
                );
            }
            WorkspaceFileRecoveryChange::Clear => {
                state.entries.remove(&identity);
                state.epoch = uuid::Uuid::new_v4().to_string();
            }
        }
        authorized(authority, &target)?;
        save(&directory, &state)?;
        authorized(authority, &target)?;
        Ok(WorkspaceFileRecoveryWriteResponse {
            accepted: true,
            current: state.snapshot(&target)?,
        })
    };
    work().map_err(error)
}

pub(super) fn list(
    base: &Path,
    authority: &WorkspaceFileAuthority,
    params: WorkspaceFileRecoveryListParams,
) -> Result<WorkspaceFileRecoveryListResponse, DeveloperSessionHostError> {
    let work = || -> Result<_> {
        super::workspace_files::check_root(authority, &params.root_key)
            .map_err(anyhow::Error::new)?;
        let directory =
            DirectoryAuthority::open(base)?.private_child(Path::new("editor-recovery"))?;
        let _lock = directory.recovery_lock()?;
        let state = load(&directory)?;
        directory.sync_directory()?;
        let mut entries = Vec::new();
        let mut unavailable = 0;
        for entry in state
            .entries
            .values()
            .filter(|entry| entry.root_key == params.root_key)
        {
            let target = WorkspaceFileParams {
                root_key: entry.root_key.clone(),
                path: entry.path.clone(),
            };
            match authorized(authority, &target) {
                Ok(source_available) => entries.push(WorkspaceFileRecoverySummary {
                    path: entry.path.clone(),
                    revision: entry.revision.clone(),
                    byte_count: entry.value.content.len(),
                    source_available,
                }),
                Err(_) => unavailable += 1,
            }
        }
        entries.sort_by(|left, right| left.path.cmp(&right.path));
        super::workspace_files::check_root(authority, &params.root_key)
            .map_err(anyhow::Error::new)?;
        directory.identity()?;
        Ok(WorkspaceFileRecoveryListResponse {
            root_key: params.root_key,
            epoch: state.epoch,
            entries,
            unavailable,
        })
    };
    work().map_err(error)
}

pub(super) fn restore(
    base: &Path,
    authority: &WorkspaceFileAuthority,
    params: WorkspaceFileRecoveryRestoreParams,
) -> Result<WorkspaceFileRecoveryRestoreResponse, DeveloperSessionHostError> {
    let failure = WorkspaceFileRecoveryRestoreFailure {
        root_key: params.root_key.clone(),
        path: params.path.clone(),
        destination: params.destination.clone(),
        uncertain: false,
    };
    let mut uncertain = false;
    let work = || -> Result<_> {
        let target = WorkspaceFileParams {
            root_key: params.root_key.clone(),
            path: params.path.clone(),
        };
        authorized(authority, &target)?;
        uuid::Uuid::parse_str(&params.epoch)?;
        uuid::Uuid::parse_str(&params.revision)?;
        let directory =
            DirectoryAuthority::open(base)?.private_child(Path::new("editor-recovery"))?;
        let _lock = directory.recovery_lock()?;
        let state = load(&directory)?;
        let current = state.snapshot(&target)?;
        ensure!(current.epoch == params.epoch && current.revision.as_deref() == Some(params.revision.as_str()), "The recovered edits changed after review. Reload and review them again before creating a copy.");
        let value = current
            .recovery
            .context("The recovery copy is no longer available")?;
        let (destination, relative) = authority.editor_file(&params.destination)?;
        let granted = destination.new_file_destination(&relative, MAX_EDITOR_TEXT_BYTES as u64)?;
        authorized(authority, &target)?;
        directory.identity()?;
        if let Err(failed) = granted.save(value.content.as_bytes()) {
            uncertain = failed.uncertain;
            if failed.uncertain {
                anyhow::bail!("The recovery copy could not be confirmed at {}. Inspect that path before retrying or choosing another. Retained edits remain available. {}", params.destination, failed.error);
            }
            return Err(failed.error.context(
                "The recovery copy was refused; choose an unused path in an existing folder",
            ));
        }
        uncertain = true;
        let copied = super::workspace_files::read(
            authority,
            WorkspaceFileParams {
                root_key: params.root_key.clone(),
                path: params.destination.clone(),
            },
        )
        .map_err(anyhow::Error::new)?;
        ensure!(copied.content == value.content, "The new file changed before its bytes could be confirmed. Retained edits remain available.");
        directory.identity()?;
        Ok(WorkspaceFileRecoveryRestoreResponse {
            root_key: params.root_key,
            path: params.path,
            source_revision: params.revision,
            destination: params.destination,
            revision: copied.revision,
        })
    };
    work().map_err(|error| {
        DeveloperSessionHostError::recovery_copy_failure(
            error.to_string(),
            WorkspaceFileRecoveryRestoreFailure {
                uncertain,
                ..failure
            },
        )
    })
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    struct Fixture {
        base: tempfile::TempDir,
        workspace: tempfile::TempDir,
        authority: WorkspaceFileAuthority,
    }
    impl Fixture {
        fn new() -> Self {
            let base = tempfile::tempdir().unwrap();
            let workspace = tempfile::tempdir().unwrap();
            std::fs::write(workspace.path().join("note.txt"), "original\r\n🦀").unwrap();
            let authority = WorkspaceFileAuthority::new(workspace.path()).unwrap();
            Self {
                base,
                workspace,
                authority,
            }
        }
        fn target(&self, path: &str) -> WorkspaceFileParams {
            WorkspaceFileParams {
                root_key: self.authority.identity().unwrap(),
                path: path.into(),
            }
        }
        fn snapshot(&self, path: &str) -> WorkspaceFileRecoverySnapshot {
            read(self.base.path(), &self.authority, self.target(path)).unwrap()
        }
        fn set(
            &self,
            snapshot: &WorkspaceFileRecoverySnapshot,
            content: &str,
        ) -> WorkspaceFileRecoveryWriteParams {
            WorkspaceFileRecoveryWriteParams {
                root_key: snapshot.root_key.clone(),
                path: snapshot.path.clone(),
                epoch: snapshot.epoch.clone(),
                revision: snapshot.revision.clone(),
                change: WorkspaceFileRecoveryChange::Set {
                    value: WorkspaceFileRecovery {
                        base_revision: "a".repeat(64),
                        content: content.into(),
                    },
                },
            }
        }
        fn write(
            &self,
            params: WorkspaceFileRecoveryWriteParams,
        ) -> Result<WorkspaceFileRecoveryWriteResponse, DeveloperSessionHostError> {
            write(self.base.path(), &self.authority, params)
        }
        fn list(&self) -> WorkspaceFileRecoveryListResponse {
            list(
                self.base.path(),
                &self.authority,
                WorkspaceFileRecoveryListParams {
                    root_key: self.authority.identity().unwrap(),
                },
            )
            .unwrap()
        }
        fn copy_params(
            &self,
            snapshot: &WorkspaceFileRecoverySnapshot,
            destination: &str,
        ) -> WorkspaceFileRecoveryRestoreParams {
            WorkspaceFileRecoveryRestoreParams {
                root_key: snapshot.root_key.clone(),
                path: snapshot.path.clone(),
                epoch: snapshot.epoch.clone(),
                revision: snapshot.revision.clone().unwrap(),
                destination: destination.into(),
            }
        }
    }

    #[test]
    fn a_new_host_reads_retained_unicode_edits_without_changing_the_workspace_file() {
        let fixture = Fixture::new();
        let before = fixture.snapshot("note.txt");
        let saved = fixture
            .write(fixture.set(&before, "\u{feff}unsaved\r\n🦀"))
            .unwrap();
        assert!(saved.accepted);
        let restarted = WorkspaceFileAuthority::new(fixture.workspace.path()).unwrap();
        assert_eq!(
            read(fixture.base.path(), &restarted, fixture.target("note.txt")).unwrap(),
            saved.current
        );
        assert_eq!(
            std::fs::read_to_string(fixture.workspace.path().join("note.txt")).unwrap(),
            "original\r\n🦀"
        );
        use std::os::unix::fs::PermissionsExt;
        let directory = fixture.base.path().join("editor-recovery");
        assert_eq!(
            std::fs::metadata(&directory).unwrap().permissions().mode() & 0o777,
            0o700
        );
        assert_eq!(
            std::fs::metadata(directory.join(STATE_FILE))
                .unwrap()
                .permissions()
                .mode()
                & 0o777,
            0o600
        );
    }

    #[test]
    fn concurrent_edits_conflict_and_lost_acknowledgements_do_not_rewrite_the_receipt() {
        let fixture = Fixture::new();
        let snapshot = fixture.snapshot("note.txt");
        let first = fixture.set(&snapshot, "first window");
        let saved = fixture.write(first.clone()).unwrap();
        let second = fixture
            .write(fixture.set(&snapshot, "second window"))
            .unwrap();
        assert!(!second.accepted);
        assert_eq!(second.current, saved.current);
        assert_eq!(fixture.write(first).unwrap().current, saved.current);
    }

    #[test]
    fn clearing_rotates_the_epoch_and_fences_stale_writes_to_removed_and_unrelated_buffers() {
        let fixture = Fixture::new();
        let snapshot = fixture.snapshot("note.txt");
        let unrelated = fixture.snapshot("another.txt");
        let stale = fixture.set(&snapshot, "discarded");
        let saved = fixture.write(stale.clone()).unwrap().current;
        let clear = WorkspaceFileRecoveryWriteParams {
            root_key: saved.root_key,
            path: saved.path,
            epoch: saved.epoch,
            revision: saved.revision,
            change: WorkspaceFileRecoveryChange::Clear,
        };
        let cleared = fixture.write(clear.clone()).unwrap();
        assert!(cleared.accepted && cleared.current.recovery.is_none());
        assert_ne!(cleared.current.epoch, snapshot.epoch);
        assert!(!fixture.write(stale).unwrap().accepted);
        assert!(
            !fixture
                .write(fixture.set(&unrelated, "late unrelated edit"))
                .unwrap()
                .accepted
        );
        assert!(!fixture.write(clear).unwrap().accepted);
        assert_eq!(fixture.snapshot("note.txt"), cleared.current);
    }

    #[test]
    fn recovery_is_isolated_by_folder_and_config_root_and_rejects_protected_paths() {
        let fixture = Fixture::new();
        let snapshot = fixture.snapshot("note.txt");
        fixture.write(fixture.set(&snapshot, "retained")).unwrap();
        let other = Fixture::new();
        assert!(read(
            fixture.base.path(),
            &other.authority,
            other.target("note.txt")
        )
        .unwrap()
        .recovery
        .is_none());
        assert!(read(
            other.base.path(),
            &fixture.authority,
            fixture.target("note.txt")
        )
        .unwrap()
        .recovery
        .is_none());
        assert!(read(
            fixture.base.path(),
            &other.authority,
            fixture.target("note.txt")
        )
        .is_err());
        for path in ["../outside.txt", ".env", ".git/config", "src/../../outside"] {
            assert!(
                read(
                    fixture.base.path(),
                    &fixture.authority,
                    fixture.target(path)
                )
                .is_err(),
                "{path}"
            );
        }
    }

    #[test]
    fn an_occupied_store_lock_refuses_without_waiting_or_changing_recovery() {
        let fixture = Fixture::new();
        let snapshot = fixture.snapshot("note.txt");
        let directory = DirectoryAuthority::open(fixture.base.path())
            .unwrap()
            .private_child(Path::new("editor-recovery"))
            .unwrap();
        let held = directory.recovery_lock().unwrap();
        let error = fixture
            .write(fixture.set(&snapshot, "not accepted"))
            .unwrap_err();
        assert!(error.to_string().contains("busy"));
        drop(held);
        assert_eq!(fixture.snapshot("note.txt"), snapshot);
    }

    #[test]
    fn corrupt_recovery_and_symbolic_links_are_preserved_and_never_followed() {
        let fixture = Fixture::new();
        fixture.snapshot("note.txt");
        let path = fixture.base.path().join("editor-recovery").join(STATE_FILE);
        std::fs::write(&path, b"damaged recovery").unwrap();
        assert!(read(
            fixture.base.path(),
            &fixture.authority,
            fixture.target("note.txt")
        )
        .is_err());
        assert_eq!(std::fs::read(&path).unwrap(), b"damaged recovery");
        let outside = fixture.base.path().join("outside");
        std::fs::write(&outside, "do not touch").unwrap();
        std::fs::remove_file(&path).unwrap();
        std::os::unix::fs::symlink(&outside, &path).unwrap();
        assert!(read(
            fixture.base.path(),
            &fixture.authority,
            fixture.target("note.txt")
        )
        .is_err());
        assert_eq!(std::fs::read_to_string(outside).unwrap(), "do not touch");
    }

    #[test]
    fn storage_limits_refuse_new_edits_without_evicting_unsaved_buffers() {
        let fixture = Fixture::new();
        for index in 0..MAX_EDITOR_RECOVERY_FILES {
            let snapshot = fixture.snapshot(&format!("note-{index}.txt"));
            fixture
                .write(fixture.set(&snapshot, "retain this"))
                .unwrap();
        }
        let additional = fixture.snapshot("additional.txt");
        assert!(fixture.write(fixture.set(&additional, "no room")).is_err());
        assert_eq!(
            fixture.snapshot("note-0.txt").recovery.unwrap().content,
            "retain this"
        );
        let saved = fixture.snapshot("note-0.txt");
        fixture
            .write(WorkspaceFileRecoveryWriteParams {
                root_key: saved.root_key,
                path: saved.path,
                epoch: saved.epoch,
                revision: saved.revision,
                change: WorkspaceFileRecoveryChange::Clear,
            })
            .unwrap();
        assert!(
            fixture
                .write(fixture.set(&fixture.snapshot("additional.txt"), "now has room"))
                .unwrap()
                .accepted
        );
    }

    #[test]
    fn serialized_storage_and_text_limits_preserve_the_last_accepted_data() {
        let fixture = Fixture::new();
        let snapshot = fixture.snapshot("note.txt");
        assert!(fixture
            .write(fixture.set(&snapshot, &"x".repeat(MAX_EDITOR_TEXT_BYTES + 1)))
            .is_err());
        assert!(fixture.write(fixture.set(&snapshot, "bad\0text")).is_err());
        let escaped = "\u{1}".repeat(MAX_EDITOR_TEXT_BYTES);
        for name in ["large-a.txt", "large-b.txt"] {
            fixture
                .write(fixture.set(&fixture.snapshot(name), &escaped))
                .unwrap();
        }
        assert!(fixture
            .write(fixture.set(&fixture.snapshot("large-c.txt"), &escaped))
            .is_err());
        assert_eq!(
            fixture.snapshot("large-a.txt").recovery.unwrap().content,
            escaped
        );
        assert!(fixture.snapshot("large-c.txt").recovery.is_none());
    }

    #[test]
    fn recovery_lists_only_granted_folder_metadata_and_keeps_removed_files_discoverable() {
        let fixture = Fixture::new();
        let other = Fixture::new();
        let saved = fixture
            .write(fixture.set(&fixture.snapshot("note.txt"), "retained secret text 🦀"))
            .unwrap()
            .current;
        let other_saved = read(
            fixture.base.path(),
            &other.authority,
            other.target("foreign.txt"),
        )
        .unwrap();
        write(
            fixture.base.path(),
            &other.authority,
            other.set(&other_saved, "another folder"),
        )
        .unwrap();
        std::fs::remove_file(fixture.workspace.path().join("note.txt")).unwrap();
        let listed = fixture.list();
        assert_eq!(listed.entries.len(), 1);
        assert_eq!(listed.entries[0].path, "note.txt");
        assert_eq!(listed.entries[0].revision, saved.revision.unwrap());
        assert!(!listed.entries[0].source_available);
        assert_eq!(
            listed.entries[0].byte_count,
            "retained secret text 🦀".len()
        );
        assert!(!serde_json::to_string(&listed)
            .unwrap()
            .contains("retained secret text"));
        assert_eq!(listed.unavailable, 0);
        assert!(list(
            fixture.base.path(),
            &other.authority,
            WorkspaceFileRecoveryListParams {
                root_key: listed.root_key
            }
        )
        .is_err());
    }

    #[test]
    fn missing_parent_folders_can_be_recovered_to_a_new_file_without_consuming_recovery() {
        let fixture = Fixture::new();
        std::fs::create_dir(fixture.workspace.path().join("nested")).unwrap();
        std::fs::write(fixture.workspace.path().join("nested/lost.txt"), "old").unwrap();
        let saved = fixture
            .write(fixture.set(
                &fixture.snapshot("nested/lost.txt"),
                "\u{feff}unsaved 東京\r\n🦀",
            ))
            .unwrap()
            .current;
        std::fs::rename(
            fixture.workspace.path().join("nested"),
            fixture.workspace.path().join("moved"),
        )
        .unwrap();
        assert!(!fixture.list().entries[0].source_available);
        std::fs::create_dir(fixture.workspace.path().join("output")).unwrap();
        let params = fixture.copy_params(&saved, "output/rescued.txt");
        let result = restore(fixture.base.path(), &fixture.authority, params.clone()).unwrap();
        assert_eq!(result.destination, "output/rescued.txt");
        assert_eq!(result.source_revision, saved.revision.clone().unwrap());
        assert_eq!(
            std::fs::read_to_string(fixture.workspace.path().join("output/rescued.txt")).unwrap(),
            "\u{feff}unsaved 東京\r\n🦀"
        );
        assert_eq!(fixture.snapshot("nested/lost.txt"), saved);
        assert!(restore(fixture.base.path(), &fixture.authority, params).is_err());
        assert_eq!(
            std::fs::read_to_string(fixture.workspace.path().join("moved/lost.txt")).unwrap(),
            "old"
        );
    }

    #[test]
    fn copying_refuses_stale_receipts_and_existing_or_ungranted_destinations() {
        let fixture = Fixture::new();
        let saved = fixture
            .write(fixture.set(&fixture.snapshot("note.txt"), "first"))
            .unwrap()
            .current;
        let stale = fixture.copy_params(&saved, "new.txt");
        let latest = fixture.write(fixture.set(&saved, "newer")).unwrap().current;
        assert!(restore(fixture.base.path(), &fixture.authority, stale).is_err());
        assert!(!fixture.workspace.path().join("new.txt").exists());
        for destination in [
            "note.txt",
            "../outside.txt",
            ".env",
            ".git/config",
            "/tmp/ungranted.txt",
        ] {
            assert!(
                restore(
                    fixture.base.path(),
                    &fixture.authority,
                    fixture.copy_params(&latest, destination)
                )
                .is_err(),
                "{destination}"
            );
        }
        assert_eq!(
            std::fs::read_to_string(fixture.workspace.path().join("note.txt")).unwrap(),
            "original\r\n🦀"
        );
        assert_eq!(fixture.snapshot("note.txt"), latest);
    }

    #[test]
    fn an_uncertain_copy_preserves_recovery_and_can_be_inspected_without_overwriting() {
        let fixture = Fixture::new();
        let saved = fixture
            .write(fixture.set(
                &fixture.snapshot("note.txt"),
                "copied before failed acknowledgement",
            ))
            .unwrap()
            .current;
        let (directory, _) = fixture.authority.editor_file("rescued.txt").unwrap();
        directory.fail_next_directory_sync();
        let params = fixture.copy_params(&saved, "rescued.txt");
        let error = restore(fixture.base.path(), &fixture.authority, params.clone()).unwrap_err();
        assert!(error.to_string().contains("could not be confirmed"));
        let failure: WorkspaceFileRecoveryRestoreFailure =
            serde_json::from_value(error.data().unwrap().clone()).unwrap();
        assert!(failure.uncertain);
        assert_eq!(failure.destination, params.destination);
        assert_eq!(
            std::fs::read_to_string(fixture.workspace.path().join("rescued.txt")).unwrap(),
            "copied before failed acknowledgement"
        );
        assert_eq!(fixture.snapshot("note.txt"), saved);
        let refused = restore(fixture.base.path(), &fixture.authority, params).unwrap_err();
        let failure: WorkspaceFileRecoveryRestoreFailure =
            serde_json::from_value(refused.data().unwrap().clone()).unwrap();
        assert!(!failure.uncertain);
    }

    #[test]
    fn regranting_a_renamed_root_recovers_the_same_folder_but_the_old_grant_is_refused() {
        let fixture = Fixture::new();
        let saved = fixture
            .write(fixture.set(
                &fixture.snapshot("note.txt"),
                "retained across folder rename",
            ))
            .unwrap()
            .current;
        let parent = tempfile::tempdir().unwrap();
        let moved = parent.path().join("renamed");
        std::fs::rename(fixture.workspace.path(), &moved).unwrap();
        assert!(list(
            fixture.base.path(),
            &fixture.authority,
            WorkspaceFileRecoveryListParams {
                root_key: saved.root_key.clone()
            }
        )
        .is_err());
        let regranted = WorkspaceFileAuthority::new(&moved).unwrap();
        let listed = list(
            fixture.base.path(),
            &regranted,
            WorkspaceFileRecoveryListParams {
                root_key: regranted.identity().unwrap(),
            },
        )
        .unwrap();
        assert_eq!(listed.entries[0].path, "note.txt");
        assert_eq!(listed.entries[0].revision, saved.revision.unwrap());
        assert!(listed.entries[0].source_available);
    }

    #[test]
    fn records_now_blocked_by_file_policy_are_counted_without_exposing_their_content() {
        let fixture = Fixture::new();
        let snapshot = fixture.snapshot("note.txt");
        let directory = DirectoryAuthority::open(fixture.base.path())
            .unwrap()
            .private_child(Path::new("editor-recovery"))
            .unwrap();
        {
            let _lock = directory.recovery_lock().unwrap();
            let mut state = load(&directory).unwrap();
            state.entries.insert(
                key(&snapshot.root_key, ".env").unwrap(),
                Entry {
                    root_key: snapshot.root_key.clone(),
                    path: ".env".into(),
                    revision: uuid::Uuid::new_v4().to_string(),
                    value: WorkspaceFileRecovery {
                        base_revision: "a".repeat(64),
                        content: "retained protected material".into(),
                    },
                },
            );
            save(&directory, &state).unwrap();
        }
        let listed = fixture.list();
        assert!(listed.entries.is_empty());
        assert_eq!(listed.unavailable, 1);
        assert!(!serde_json::to_string(&listed)
            .unwrap()
            .contains("protected material"));
        assert!(read(
            fixture.base.path(),
            &fixture.authority,
            fixture.target(".env")
        )
        .is_err());
    }
}
