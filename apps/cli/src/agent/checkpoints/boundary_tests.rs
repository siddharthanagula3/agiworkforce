use super::{Checkpoint, CheckpointIndex, CheckpointLog, FileSnapshot, FileState, INDEX_VERSION};
use std::path::{Path, PathBuf};

struct Fixture {
    _temporary: tempfile::TempDir,
    workspace: PathBuf,
    outside: PathBuf,
    store: PathBuf,
}

impl Fixture {
    fn new() -> Self {
        let temporary = tempfile::tempdir().unwrap();
        let root = temporary.path().canonicalize().unwrap();
        let workspace = root.join("workspace");
        let outside = root.join("outside");
        let store = root.join("store");
        for dir in [&workspace, &outside, &store] {
            std::fs::create_dir(dir).unwrap();
        }
        Self {
            _temporary: temporary,
            workspace,
            outside,
            store,
        }
    }

    fn in_workspace<T>(&self, action: impl FnOnce() -> T) -> T {
        crate::path_security::scope_workspace_paths_sync(self.workspace.clone(), Vec::new(), action)
    }

    fn authority(&self) -> crate::path_security::WorkspaceFileAuthority {
        crate::path_security::WorkspaceFileAuthority::new(&self.workspace).unwrap()
    }

    fn session_path(&self) -> PathBuf {
        self.store.join("synthetic-session.json")
    }

    fn checkpoint_dir(&self) -> PathBuf {
        crate::runtime::session_control::checkpoint_dir(&self.session_path())
    }

    fn load_snapshot(&self, path: &Path, digest: String) -> CheckpointLog {
        let dir = self.checkpoint_dir();
        std::fs::create_dir_all(dir.join("blobs")).unwrap();
        let index = CheckpointIndex {
            version: INDEX_VERSION,
            checkpoints: vec![Checkpoint {
                message_count: 0,
                prompt: "synthetic checkpoint prompt".to_string(),
                created_at: chrono::Utc::now(),
                files: vec![FileSnapshot {
                    path: path.to_path_buf(),
                    before: FileState::Contents(digest),
                }],
            }],
        };
        std::fs::write(dir.join("index.json"), serde_json::to_vec(&index).unwrap()).unwrap();
        CheckpointLog::beside(&self.session_path())
    }
}

struct Sentinel {
    path: PathBuf,
    bytes: Vec<u8>,
    #[cfg(unix)]
    identity: (u64, u64),
}

impl Sentinel {
    fn new(path: PathBuf, bytes: &[u8]) -> Self {
        std::fs::write(&path, bytes).unwrap();
        Self {
            #[cfg(unix)]
            identity: {
                use std::os::unix::fs::MetadataExt;
                let metadata = std::fs::metadata(&path).unwrap();
                (metadata.dev(), metadata.ino())
            },
            path,
            bytes: bytes.to_vec(),
        }
    }

    fn assert_unchanged(&self) {
        assert_eq!(std::fs::read(&self.path).unwrap(), self.bytes);
        #[cfg(unix)]
        {
            use std::os::unix::fs::MetadataExt;
            let metadata = std::fs::metadata(&self.path).unwrap();
            assert_eq!((metadata.dev(), metadata.ino()), self.identity);
        }
    }
}

#[cfg(unix)]
fn replace_parent_with_symlink(parent: &Path, outside: &Path) {
    let original = parent.with_file_name("original-parent");
    std::fs::rename(parent, original).unwrap();
    std::os::unix::fs::symlink(outside, parent).unwrap();
}

#[test]
fn checkpoint_contents_restore_owned_file_control() {
    let fixture = Fixture::new();
    let path = fixture.workspace.join("ordinary.txt");
    std::fs::write(&path, b"owned bytes before edit").unwrap();
    fixture.in_workspace(|| {
        let authority = fixture.authority();
        let mut log = CheckpointLog::in_memory();
        log.push(0, "synthetic checkpoint prompt".to_string());
        assert!(log.capture(&path, Some(&authority)));
        std::fs::write(&path, b"owned edited bytes").unwrap();
        let report = log.restore_files(0, Some(&authority));
        assert_eq!(std::fs::read(&path).unwrap(), b"owned bytes before edit");
        assert_eq!(report.restored, vec![path]);
        assert!(report.removed.is_empty());
        assert!(report.skipped.is_empty());
    });
}

#[test]
fn checkpoint_absent_restore_owned_file_control() {
    let fixture = Fixture::new();
    let path = fixture.workspace.join("created.txt");
    fixture.in_workspace(|| {
        let authority = fixture.authority();
        let mut log = CheckpointLog::in_memory();
        log.push(0, "synthetic checkpoint prompt".to_string());
        assert!(log.capture(&path, Some(&authority)));
        assert!(matches!(
            log.checkpoints()[0].files[0].before,
            FileState::Absent
        ));
        std::fs::write(&path, b"owned newly created bytes").unwrap();
        let report = log.restore_files(0, Some(&authority));
        assert!(!path.exists());
        assert_eq!(report.removed, vec![path]);
        assert!(report.restored.is_empty());
        assert!(report.skipped.is_empty());
    });
}

#[cfg(unix)]
#[test]
fn checkpoint_contents_parent_symlink_cannot_write_outside() {
    let fixture = Fixture::new();
    let parent = fixture.workspace.join("subdirectory");
    std::fs::create_dir(&parent).unwrap();
    let path = parent.join("ordinary.txt");
    std::fs::write(&path, b"owned bytes before edit").unwrap();
    let outside = Sentinel::new(
        fixture.outside.join("ordinary.txt"),
        b"outside sentinel must retain its bytes",
    );
    fixture.in_workspace(|| {
        let authority = fixture.authority();
        let mut log = CheckpointLog::in_memory();
        log.push(0, "synthetic checkpoint prompt".to_string());
        assert!(log.capture(&path, Some(&authority)));
        std::fs::write(&path, b"owned edited bytes").unwrap();
        replace_parent_with_symlink(&parent, &fixture.outside);
        let report = log.restore_files(0, Some(&authority));
        outside.assert_unchanged();
        assert!(report.restored.is_empty());
        assert!(report.removed.is_empty());
        assert!(report.skipped.iter().any(|(skipped, _)| skipped == &path));
    });
}

#[cfg(unix)]
#[test]
fn checkpoint_absent_parent_symlink_cannot_remove_outside() {
    let fixture = Fixture::new();
    let parent = fixture.workspace.join("subdirectory");
    std::fs::create_dir(&parent).unwrap();
    let path = parent.join("created.txt");
    let outside = Sentinel::new(
        fixture.outside.join("created.txt"),
        b"outside sentinel must not be removed",
    );
    fixture.in_workspace(|| {
        let authority = fixture.authority();
        let mut log = CheckpointLog::in_memory();
        log.push(0, "synthetic checkpoint prompt".to_string());
        assert!(log.capture(&path, Some(&authority)));
        assert!(matches!(
            log.checkpoints()[0].files[0].before,
            FileState::Absent
        ));
        std::fs::write(&path, b"owned newly created bytes").unwrap();
        replace_parent_with_symlink(&parent, &fixture.outside);
        let report = log.restore_files(0, Some(&authority));
        outside.assert_unchanged();
        assert!(report.removed.is_empty());
        assert!(report.restored.is_empty());
        assert!(report.skipped.iter().any(|(skipped, _)| skipped == &path));
    });
}

#[test]
fn checkpoint_capture_cannot_copy_unowned_absolute_path() {
    let fixture = Fixture::new();
    let outside = Sentinel::new(
        fixture.outside.join("ordinary.txt"),
        b"synthetic outside bytes must not become checkpoint content",
    );
    fixture.in_workspace(|| {
        let authority = fixture.authority();
        let mut log = CheckpointLog::in_memory();
        log.push(0, "synthetic checkpoint prompt".to_string());
        log.capture(&outside.path, Some(&authority));
        outside.assert_unchanged();
        assert_eq!(log.tracked_files(0), 0);
        assert!(!log
            .memory_blobs
            .values()
            .any(|bytes| bytes == &outside.bytes));
    });
}

#[cfg(unix)]
#[test]
fn checkpoint_capture_cannot_copy_through_outside_parent_symlink() {
    let fixture = Fixture::new();
    let outside = Sentinel::new(
        fixture.outside.join("ordinary.txt"),
        b"synthetic outside bytes must not become checkpoint content",
    );
    let parent = fixture.workspace.join("linked-parent");
    std::os::unix::fs::symlink(&fixture.outside, &parent).unwrap();
    fixture.in_workspace(|| {
        let authority = fixture.authority();
        let mut log = CheckpointLog::in_memory();
        log.push(0, "synthetic checkpoint prompt".to_string());
        log.capture(&parent.join("ordinary.txt"), Some(&authority));
        outside.assert_unchanged();
        assert_eq!(log.tracked_files(0), 0);
        assert!(!log
            .memory_blobs
            .values()
            .any(|bytes| bytes == &outside.bytes));
    });
}

#[test]
fn checkpoint_absolute_digest_cannot_read_outside_storage() {
    let fixture = Fixture::new();
    let target = fixture.workspace.join("ordinary.txt");
    std::fs::write(&target, b"owned current bytes").unwrap();
    let outside = Sentinel::new(
        fixture.outside.join("synthetic-copy.bin"),
        b"synthetic outside bytes must not be published into workspace",
    );
    fixture.in_workspace(|| {
        let authority = fixture.authority();
        let mut log = fixture.load_snapshot(&target, outside.path.to_string_lossy().into_owned());
        let report = log.restore_files(0, Some(&authority));
        outside.assert_unchanged();
        assert_eq!(std::fs::read(&target).unwrap(), b"owned current bytes");
        assert!(report.restored.is_empty());
        assert!(!report.skipped.is_empty() || log.take_unsaved().is_some());
    });
}

#[test]
fn checkpoint_parent_digest_cannot_read_outside_storage() {
    let fixture = Fixture::new();
    let target = fixture.workspace.join("ordinary.txt");
    std::fs::write(&target, b"owned current bytes").unwrap();
    let outside = Sentinel::new(
        fixture.outside.join("synthetic-copy.bin"),
        b"synthetic outside bytes must not be published into workspace",
    );
    fixture.in_workspace(|| {
        let authority = fixture.authority();
        let mut log =
            fixture.load_snapshot(&target, "../../../outside/synthetic-copy.bin".to_string());
        let report = log.restore_files(0, Some(&authority));
        outside.assert_unchanged();
        assert_eq!(std::fs::read(&target).unwrap(), b"owned current bytes");
        assert!(report.restored.is_empty());
        assert!(!report.skipped.is_empty() || log.take_unsaved().is_some());
    });
}

#[test]
fn checkpoint_blob_bytes_must_match_digest_identity() {
    use sha2::{Digest, Sha256};

    let fixture = Fixture::new();
    let target = fixture.workspace.join("ordinary.txt");
    std::fs::write(&target, b"owned current bytes").unwrap();
    let digest = crate::hex::encode(&Sha256::digest(b"expected saved bytes"));
    let blobs = fixture.checkpoint_dir().join("blobs");
    std::fs::create_dir_all(&blobs).unwrap();
    std::fs::write(blobs.join(&digest), b"corrupted synthetic blob bytes").unwrap();
    fixture.in_workspace(|| {
        let authority = fixture.authority();
        let mut log = fixture.load_snapshot(&target, digest);
        let report = log.restore_files(0, Some(&authority));
        assert_eq!(std::fs::read(&target).unwrap(), b"owned current bytes");
        assert!(report.restored.is_empty());
        assert!(!report.skipped.is_empty() || log.take_unsaved().is_some());
    });
}

#[test]
fn checkpoint_valid_persisted_blob_restore_control() {
    use sha2::{Digest, Sha256};

    let fixture = Fixture::new();
    let target = fixture.workspace.join("ordinary.txt");
    std::fs::write(&target, b"owned current bytes").unwrap();
    let before = b"valid persisted saved bytes";
    let digest = crate::hex::encode(&Sha256::digest(before));
    let blobs = fixture.checkpoint_dir().join("blobs");
    std::fs::create_dir_all(&blobs).unwrap();
    std::fs::write(blobs.join(&digest), before).unwrap();
    fixture.in_workspace(|| {
        let authority = fixture.authority();
        let log = fixture.load_snapshot(&target, digest);
        assert_eq!(log.len(), 1);
        assert_eq!(log.tracked_files(0), 1);
        let report = log.restore_files(0, Some(&authority));
        assert_eq!(std::fs::read(&target).unwrap(), before);
        assert_eq!(report.restored, vec![target]);
        assert!(report.removed.is_empty());
        assert!(report.skipped.is_empty());
    });
}

#[cfg(unix)]
#[test]
fn checkpoint_storage_parent_symlink_cannot_publish_blob_outside() {
    let fixture = Fixture::new();
    let path = fixture.workspace.join("ordinary.txt");
    std::fs::write(&path, b"owned bytes before edit").unwrap();
    fixture.in_workspace(|| {
        let authority = fixture.authority();
        let mut log = CheckpointLog::beside(&fixture.session_path());
        log.push(0, "synthetic checkpoint prompt".to_string());
        let blobs = fixture.checkpoint_dir().join("blobs");
        std::fs::create_dir_all(&blobs).unwrap();
        replace_parent_with_symlink(&blobs, &fixture.outside);
        log.capture(&path, Some(&authority));
        assert_eq!(std::fs::read_dir(&fixture.outside).unwrap().count(), 0);
        assert_eq!(std::fs::read(&path).unwrap(), b"owned bytes before edit");
    });
}

fn session_in(fixture: &Fixture) -> crate::agent::AgentSession {
    let context = crate::context::SystemContext {
        cwd: fixture.workspace.to_string_lossy().into_owned(),
        git_branch: None,
        git_status_summary: None,
        git_remote_url: None,
        project_type: None,
        project_language: None,
        ci_providers: Vec::new(),
        monorepo_type: None,
        package_manager: None,
        containerization: Vec::new(),
        editor_configs: Vec::new(),
        os: "test".to_string(),
        shell: "test".to_string(),
    };
    let mut session = crate::agent::AgentSession::new("fixture-local-model:latest", &context, None);
    session.session_persistence = false;
    session.install_workspace_file_authority(fixture.authority());
    session
}

#[test]
fn checkpoint_missing_grant_refuses_capture_and_both_restore_states() {
    let fixture = Fixture::new();
    let path = fixture.workspace.join("ordinary.txt");
    let sentinel = Sentinel::new(path.clone(), b"owned current bytes");
    let mut log = CheckpointLog::in_memory();
    log.push(0, "synthetic checkpoint prompt".to_string());
    log.capture(&path, None);
    assert_eq!(log.tracked_files(0), 0);
    assert!(log.memory_blobs.is_empty());
    let digest = log.store_blob(b"synthetic saved bytes".to_vec()).unwrap();
    log.checkpoints[0].files = vec![FileSnapshot {
        path: path.clone(),
        before: FileState::Contents(digest),
    }];
    let contents = log.restore_files(0, None);
    assert_eq!(contents.skipped.len(), 1);
    sentinel.assert_unchanged();
    log.checkpoints[0].files[0].before = FileState::Absent;
    let absent = log.restore_files(0, None);
    assert_eq!(absent.skipped.len(), 1);
    sentinel.assert_unchanged();
}

#[test]
fn checkpoint_unavailable_grant_allows_empty_assignment_but_never_new_grants() {
    let fixture = Fixture::new();
    let mut session = session_in(&fixture);
    session.workspace_file_authority = Err("synthetic unavailable directory authority".to_string());
    assert!(session.set_additional_context_dirs(Vec::new()).is_ok());
    assert!(session.checkpoint_file_authority().is_none());
    assert!(session.additional_context_dirs().is_empty());
    assert!(session
        .set_additional_context_dirs(vec![fixture.outside])
        .is_err());
    assert!(session.checkpoint_file_authority().is_none());
}

#[test]
fn checkpoint_actual_session_grants_ignore_other_scoped_roots() {
    let fixture = Fixture::new();
    let owned = fixture.workspace.join("ordinary.txt");
    std::fs::write(&owned, b"owned before bytes").unwrap();
    let outside = Sentinel::new(
        fixture.outside.join("outside.txt"),
        b"outside sentinel bytes",
    );
    let mut session = session_in(&fixture);
    session.save_checkpoint();
    crate::path_security::scope_workspace_paths_sync(
        fixture.outside.clone(),
        vec![fixture.outside.clone()],
        || {
            session.note_file_edit_started(
                "outside-call",
                "write_file",
                &serde_json::json!({"path": outside.path}),
                Some(&fixture.outside),
            );
            session.note_file_edit_started(
                "owned-call",
                "write_file",
                &serde_json::json!({"path": owned}),
                Some(&fixture.outside),
            );
            assert_eq!(session.checkpoint_log.tracked_files(0), 1);
            assert!(!session
                .checkpoint_log
                .memory_blobs
                .values()
                .any(|bytes| bytes == &outside.bytes));
            std::fs::write(&owned, b"owned edited bytes").unwrap();
            let outcome = session.rewind_to(0, super::RewindMode::Code).unwrap();
            assert_eq!(outcome.files.unwrap().restored, vec![owned.clone()]);
        },
    );
    outside.assert_unchanged();
    assert_eq!(std::fs::read(owned).unwrap(), b"owned before bytes");
}

#[test]
fn checkpoint_extra_grant_works_then_revocation_refuses_old_and_new_capture() {
    let fixture = Fixture::new();
    let path = fixture.outside.join("ordinary.txt");
    std::fs::write(&path, b"extra before bytes").unwrap();
    let mut session = session_in(&fixture);
    session
        .add_context_dir(fixture.outside.to_str().unwrap())
        .unwrap();
    session.save_checkpoint();
    session.note_file_edit_started(
        "granted-call",
        "write_file",
        &serde_json::json!({"path": path}),
        Some(&fixture.workspace),
    );
    std::fs::write(&path, b"extra edited bytes").unwrap();
    let granted = session
        .rewind_to(0, super::RewindMode::Code)
        .unwrap()
        .files
        .unwrap();
    assert_eq!(granted.restored, vec![path.clone()]);
    std::fs::write(&path, b"revoked current bytes").unwrap();
    session
        .remove_context_dir(fixture.outside.to_str().unwrap())
        .unwrap();
    let revoked = session
        .rewind_to(0, super::RewindMode::Code)
        .unwrap()
        .files
        .unwrap();
    assert_eq!(revoked.skipped.len(), 1);
    assert!(revoked.restored.is_empty());
    assert_eq!(std::fs::read(&path).unwrap(), b"revoked current bytes");
    session.save_checkpoint();
    session.note_file_edit_started(
        "revoked-call",
        "edit_file",
        &serde_json::json!({"path": path}),
        Some(&fixture.workspace),
    );
    assert_eq!(session.checkpoint_log.tracked_files(1), 0);
}

#[cfg(unix)]
#[test]
fn checkpoint_remapped_extra_root_revokes_by_original_grant_name() {
    let fixture = Fixture::new();
    let extra = fixture.store.join("extra");
    std::fs::create_dir(&extra).unwrap();
    let path = extra.join("ordinary.txt");
    std::fs::write(&path, b"extra before bytes").unwrap();
    let outside = Sentinel::new(
        fixture.outside.join("ordinary.txt"),
        b"outside current bytes",
    );
    let mut session = session_in(&fixture);
    session.add_context_dir(extra.to_str().unwrap()).unwrap();
    session.save_checkpoint();
    session.note_file_edit_started(
        "extra-call",
        "write_file",
        &serde_json::json!({"path": path}),
        Some(&fixture.workspace),
    );
    replace_parent_with_symlink(&extra, &fixture.outside);
    session.remove_context_dir(extra.to_str().unwrap()).unwrap();
    assert!(session.additional_context_dirs().is_empty());
    let outcome = session
        .rewind_to(0, super::RewindMode::Code)
        .unwrap()
        .files
        .unwrap();
    assert_eq!(outcome.skipped.len(), 1);
    outside.assert_unchanged();
}

#[test]
fn checkpoint_persisted_workspace_string_cannot_mint_file_authority() {
    let fixture = Fixture::new();
    let outside = Sentinel::new(
        fixture.outside.join("ordinary.txt"),
        b"outside current bytes",
    );
    let mut session = session_in(&fixture);
    let mut managed = crate::runtime::session::ManagedSession::with_messages(
        uuid::Uuid::new_v4().to_string(),
        chrono::Utc::now(),
        session.messages.clone(),
    );
    managed.model = Some(session.model.clone());
    managed.routing_authority = Some(session.current_routing_authority());
    managed.workspace_root = Some(fixture.outside.clone());
    session
        .adopt_managed_session(managed, fixture.session_path())
        .unwrap();
    assert!(session.checkpoint_file_authority().is_none());
    session.save_checkpoint();
    session.note_file_edit_started(
        "persisted-path-call",
        "write_file",
        &serde_json::json!({"path": outside.path}),
        Some(&fixture.outside),
    );
    assert_eq!(session.checkpoint_log.tracked_files(0), 0);
    assert!(session.checkpoint_log.memory_blobs.is_empty());
    outside.assert_unchanged();
}

#[test]
fn checkpoint_failed_edit_comparison_uses_current_grant() {
    let fixture = Fixture::new();
    let path = fixture.outside.join("ordinary.txt");
    std::fs::write(&path, b"extra before bytes").unwrap();
    let mut session = session_in(&fixture);
    session
        .add_context_dir(fixture.outside.to_str().unwrap())
        .unwrap();
    session.save_checkpoint();
    session.note_file_edit_started(
        "unchanged-call",
        "edit_file",
        &serde_json::json!({"path": path}),
        Some(&fixture.workspace),
    );
    session.note_file_edit_finished("unchanged-call", false);
    assert!(session.checkpoint_log.checkpoints()[0].files.is_empty());
    session.note_file_edit_started(
        "revoked-call",
        "edit_file",
        &serde_json::json!({"path": path}),
        Some(&fixture.workspace),
    );
    session
        .remove_context_dir(fixture.outside.to_str().unwrap())
        .unwrap();
    session.note_file_edit_finished("revoked-call", false);
    assert_eq!(session.checkpoint_log.checkpoints()[0].files.len(), 1);
}

#[test]
fn checkpoint_copy_limit_and_eviction_preserve_live_copies() {
    let fixture = Fixture::new();
    let authority = fixture.authority();
    let oversized = fixture.workspace.join("oversized.bin");
    let file = std::fs::File::create(&oversized).unwrap();
    file.set_len(super::MAX_SNAPSHOT_BYTES + 1).unwrap();
    let mut log = CheckpointLog::in_memory();
    log.push(0, "synthetic checkpoint prompt".to_string());
    log.capture(&oversized, Some(&authority));
    assert_eq!(log.tracked_files(0), 0);
    assert!(log.memory_blobs.is_empty());
    let ordinary = fixture.workspace.join("ordinary.txt");
    std::fs::write(&ordinary, b"owned saved bytes").unwrap();
    for count in 1..=super::MAX_CHECKPOINTS {
        log.push(count, "synthetic checkpoint prompt".to_string());
        log.capture(&ordinary, Some(&authority));
    }
    assert_eq!(log.len(), super::MAX_CHECKPOINTS);
    assert_eq!(log.memory_blobs.len(), 1);
    log.truncate(0);
    assert!(log.memory_blobs.is_empty());
}

#[cfg(unix)]
#[test]
fn checkpoint_hardlinked_and_symbolic_leaves_never_copy_or_mutate_outside() {
    let fixture = Fixture::new();
    let authority = fixture.authority();
    let outside = Sentinel::new(
        fixture.outside.join("ordinary.txt"),
        b"outside current bytes",
    );
    for (name, link) in [("hardlink.txt", false), ("symlink.txt", true)] {
        let path = fixture.workspace.join(name);
        if link {
            std::os::unix::fs::symlink(&outside.path, &path).unwrap();
        } else {
            std::fs::hard_link(&outside.path, &path).unwrap();
        }
        let mut log = CheckpointLog::in_memory();
        log.push(0, "synthetic checkpoint prompt".to_string());
        log.capture(&path, Some(&authority));
        assert_eq!(log.tracked_files(0), 0);
        assert!(log.memory_blobs.is_empty());
        let digest = log.store_blob(b"owned saved bytes".to_vec()).unwrap();
        log.checkpoints[0].files[0].before = FileState::Contents(digest);
        assert_eq!(log.restore_files(0, Some(&authority)).skipped.len(), 1);
        log.checkpoints[0].files[0].before = FileState::Absent;
        assert_eq!(log.restore_files(0, Some(&authority)).skipped.len(), 1);
        outside.assert_unchanged();
    }
}

#[cfg(unix)]
#[test]
fn checkpoint_restore_preserves_mode_and_refuses_readonly_file() {
    use std::os::unix::fs::PermissionsExt;
    let fixture = Fixture::new();
    let authority = fixture.authority();
    let path = fixture.workspace.join("ordinary.txt");
    std::fs::write(&path, b"owned before bytes").unwrap();
    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o750)).unwrap();
    let mut log = CheckpointLog::in_memory();
    log.push(0, "synthetic checkpoint prompt".to_string());
    log.capture(&path, Some(&authority));
    std::fs::write(&path, b"owned edited bytes").unwrap();
    assert_eq!(
        log.restore_files(0, Some(&authority)).restored,
        vec![path.clone()]
    );
    assert_eq!(
        std::fs::metadata(&path).unwrap().permissions().mode() & 0o777,
        0o750
    );
    std::fs::write(&path, b"readonly current bytes").unwrap();
    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o400)).unwrap();
    assert_eq!(log.restore_files(0, Some(&authority)).skipped.len(), 1);
    assert_eq!(std::fs::read(&path).unwrap(), b"readonly current bytes");
}

#[cfg(unix)]
#[test]
fn checkpoint_special_file_capture_refuses_without_opening_it() {
    let fixture = Fixture::new();
    let authority = fixture.authority();
    let path = fixture.workspace.join("synthetic.socket");
    let _socket = std::os::unix::net::UnixListener::bind(&path).unwrap();
    let mut log = CheckpointLog::in_memory();
    log.push(0, "synthetic checkpoint prompt".to_string());
    log.capture(&path, Some(&authority));
    assert_eq!(log.tracked_files(0), 0);
    assert!(log.memory_blobs.is_empty());
}

#[cfg(unix)]
#[test]
fn checkpoint_pinned_storage_parent_never_reopens_substituted_name() {
    let fixture = Fixture::new();
    let mut log = CheckpointLog::beside(&fixture.session_path());
    let original = fixture.store.with_file_name("original-store");
    std::fs::rename(&fixture.store, &original).unwrap();
    std::os::unix::fs::symlink(&fixture.outside, &fixture.store).unwrap();
    log.push(0, "synthetic checkpoint prompt".to_string());
    assert_eq!(std::fs::read_dir(&fixture.outside).unwrap().count(), 0);
    assert!(original
        .join(fixture.checkpoint_dir().file_name().unwrap())
        .join("index.json")
        .is_file());
    let reloaded = log.reload_beside(&fixture.session_path());
    assert_eq!(reloaded.len(), 1);
    assert_eq!(std::fs::read_dir(&fixture.outside).unwrap().count(), 0);
}

#[cfg(unix)]
#[test]
fn checkpoint_pinned_blob_gc_cannot_delete_substituted_outside_files() {
    use sha2::{Digest, Sha256};
    let fixture = Fixture::new();
    let authority = fixture.authority();
    let path = fixture.workspace.join("ordinary.txt");
    std::fs::write(&path, b"owned before bytes").unwrap();
    let mut log = CheckpointLog::beside(&fixture.session_path());
    log.push(0, "synthetic checkpoint prompt".to_string());
    log.capture(&path, Some(&authority));
    let digest = crate::hex::encode(&Sha256::digest(b"owned before bytes"));
    let outside = Sentinel::new(fixture.outside.join(&digest), b"outside current bytes");
    let blobs = fixture.checkpoint_dir().join("blobs");
    replace_parent_with_symlink(&blobs, &fixture.outside);
    log.truncate(0);
    outside.assert_unchanged();
    assert!(!blobs
        .with_file_name("original-parent")
        .join(digest)
        .exists());
}

#[cfg(unix)]
#[test]
fn checkpoint_index_failure_keeps_previously_published_blob() {
    use sha2::{Digest, Sha256};
    let fixture = Fixture::new();
    let authority = fixture.authority();
    let path = fixture.workspace.join("ordinary.txt");
    std::fs::write(&path, b"owned before bytes").unwrap();
    let mut log = CheckpointLog::beside(&fixture.session_path());
    log.push(0, "synthetic checkpoint prompt".to_string());
    log.capture(&path, Some(&authority));
    let digest = crate::hex::encode(&Sha256::digest(b"owned before bytes"));
    let index = fixture.checkpoint_dir().join("index.json");
    std::fs::remove_file(&index).unwrap();
    let outside = Sentinel::new(fixture.outside.join("index.json"), b"outside current bytes");
    std::os::unix::fs::symlink(&outside.path, &index).unwrap();
    log.truncate(0);
    outside.assert_unchanged();
    assert!(fixture
        .checkpoint_dir()
        .join("blobs")
        .join(digest)
        .is_file());
    assert!(log.take_unsaved().is_some());
}

#[test]
fn checkpoint_revision_directory_flush_failure_keeps_published_blob() {
    use sha2::{Digest, Sha256};
    let fixture = Fixture::new();
    let authority = fixture.authority();
    let path = fixture.workspace.join("ordinary.txt");
    std::fs::write(&path, b"owned before bytes").unwrap();
    let mut log = CheckpointLog::beside(&fixture.session_path());
    log.push(0, "synthetic checkpoint prompt".to_string());
    log.capture(&path, Some(&authority));
    let digest = crate::hex::encode(&Sha256::digest(b"owned before bytes"));
    let directory = log.storage().unwrap().directory(false).unwrap().unwrap();
    directory.fail_next_directory_sync();
    log.truncate(0);
    let index: CheckpointIndex = serde_json::from_slice(
        &std::fs::read(fixture.checkpoint_dir().join("index.json")).unwrap(),
    )
    .unwrap();
    assert!(index.checkpoints.is_empty());
    assert!(fixture
        .checkpoint_dir()
        .join("blobs")
        .join(digest)
        .is_file());
    assert!(log.take_unsaved().is_some());
}

async fn invoke_fixture_reader(
    workspace: &Path,
    name: &str,
    args: &[(&str, String)],
) -> crate::tools::ToolResult {
    let registry = crate::tools::build_read_only_registry();
    let args = args
        .iter()
        .map(|(key, value)| (key.to_string(), value.clone()))
        .collect();
    crate::path_security::scope_workspace_paths(
        Some(workspace.to_path_buf()),
        Vec::new(),
        registry.get(name).unwrap().invoke(&args, true),
    )
    .await
    .unwrap()
}

#[tokio::test]
async fn checkpoint_revision_private_namespace_refuses_actual_reader_and_writer() {
    let fixture = Fixture::new();
    let private = fixture
        .workspace
        .join(format!(".checkpoint-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir(&private).unwrap();
    let private_path = private.join("contents");
    std::fs::write(&private_path, b"synthetic private bytes").unwrap();
    let ordinary = fixture.workspace.join("ordinary.txt");
    std::fs::write(&ordinary, b"synthetic ordinary bytes").unwrap();
    let allowed = invoke_fixture_reader(
        &fixture.workspace,
        "read_file",
        &[("path", ordinary.to_string_lossy().into_owned())],
    )
    .await;
    let denied = invoke_fixture_reader(
        &fixture.workspace,
        "read_file",
        &[("path", private_path.to_string_lossy().into_owned())],
    )
    .await;
    let write = crate::tools::execute_tool_with_opts(
        &crate::agent::ToolCall {
            name: "write_file".to_string(),
            args: std::collections::HashMap::from([
                (
                    "path".to_string(),
                    private_path.to_string_lossy().into_owned(),
                ),
                ("content".to_string(), "synthetic replacement".to_string()),
            ]),
        },
        &crate::tools::ToolExecOptions {
            require_confirmation: false,
            auto_approve_safe: true,
            auto_approve_edits: true,
            quiet: true,
            approval_callback: None,
            privacy_mode: crate::agent::PrivacyMode::Local,
            workspace_root: Some(fixture.workspace.clone()),
            additional_workspace_roots: Vec::new(),
            mcp_tool_definitions: None,
        },
    )
    .await
    .unwrap();
    let write_control = crate::tools::execute_tool_with_opts(
        &crate::agent::ToolCall {
            name: "write_file".to_string(),
            args: std::collections::HashMap::from([
                ("path".to_string(), ordinary.to_string_lossy().into_owned()),
                (
                    "content".to_string(),
                    "synthetic ordinary replacement".to_string(),
                ),
            ]),
        },
        &crate::tools::ToolExecOptions {
            require_confirmation: false,
            auto_approve_safe: true,
            auto_approve_edits: true,
            quiet: true,
            approval_callback: None,
            privacy_mode: crate::agent::PrivacyMode::Local,
            workspace_root: Some(fixture.workspace.clone()),
            additional_workspace_roots: Vec::new(),
            mcp_tool_definitions: None,
        },
    )
    .await
    .unwrap();
    assert!(allowed.success && allowed.output.contains("synthetic ordinary bytes"));
    assert!(write_control.success);
    assert_eq!(
        std::fs::read(&ordinary).unwrap(),
        b"synthetic ordinary replacement"
    );
    assert!(!denied.success);
    assert!(!denied.output.contains("synthetic private bytes"));
    assert!(!write.success);
    assert_eq!(
        std::fs::read(private_path).unwrap(),
        b"synthetic private bytes"
    );
}

#[cfg(unix)]
#[tokio::test]
async fn checkpoint_revision_storage_digest_and_alias_refuse_actual_reader() {
    use sha2::{Digest, Sha256};
    let fixture = Fixture::new();
    let authority = fixture.authority();
    let sensitive = fixture.workspace.join(".env");
    std::fs::write(&sensitive, b"synthetic private checkpoint payload").unwrap();
    let session = fixture.workspace.join("synthetic-session.json");
    let mut log = CheckpointLog::beside(&session);
    log.push(0, "synthetic checkpoint prompt".to_string());
    log.capture(&sensitive, Some(&authority));
    assert_eq!(log.tracked_files(0), 1);
    let directory = crate::runtime::session_control::checkpoint_dir(&session);
    let digest = crate::hex::encode(&Sha256::digest(b"synthetic private checkpoint payload"));
    let blob = directory.join("blobs").join(digest);
    assert_eq!(
        std::fs::read(&blob).unwrap(),
        b"synthetic private checkpoint payload"
    );
    let alias = fixture.workspace.join("ordinary-alias.txt");
    std::os::unix::fs::symlink(&blob, &alias).unwrap();
    let mut results = Vec::new();
    for path in [&sensitive, &blob, &alias] {
        results.push(
            invoke_fixture_reader(
                &fixture.workspace,
                "read_file",
                &[("path", path.to_string_lossy().into_owned())],
            )
            .await,
        );
    }
    assert!(results.iter().all(|result| !result.success));
    assert!(results.iter().all(|result| !result
        .output
        .contains("synthetic private checkpoint payload")));
}

#[cfg(unix)]
#[tokio::test]
async fn checkpoint_revision_recursive_tools_withhold_private_namespace() {
    let temporary = tempfile::tempdir_in(std::env::current_dir().unwrap()).unwrap();
    let workspace = temporary.path().canonicalize().unwrap();
    let ordinary = workspace.join("ordinary.txt");
    std::fs::write(&ordinary, b"checkpoint_probe ordinary payload").unwrap();
    let private = workspace.join(format!(".checkpoint-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir(&private).unwrap();
    std::fs::write(
        private.join("contents"),
        b"checkpoint_probe private payload",
    )
    .unwrap();
    let checkpoint =
        crate::runtime::session_control::checkpoint_dir(&workspace.join("synthetic-session.json"));
    std::fs::create_dir(&checkpoint).unwrap();
    std::fs::write(
        checkpoint.join("generic.txt"),
        b"checkpoint_probe private payload",
    )
    .unwrap();
    let alias = workspace.join("ordinary-directory-alias");
    std::os::unix::fs::symlink(&checkpoint, &alias).unwrap();
    let mut results = Vec::new();
    for name in ["search_files", "grep_files", "list_directory", "glob"] {
        let pattern = if name == "glob" {
            "**/*"
        } else {
            "checkpoint_probe"
        };
        let result = invoke_fixture_reader(
            &workspace,
            name,
            &[
                ("path", workspace.to_string_lossy().into_owned()),
                ("pattern", pattern.to_string()),
                ("include", "**/*".to_string()),
            ],
        )
        .await;
        results.push((name, result));
    }
    for (name, result) in results {
        assert!(
            result.success,
            "{name} did not reach its successful ordinary control"
        );
        assert!(
            result.output.contains("ordinary.txt"),
            "{name} missed the ordinary control"
        );
        assert!(
            !result.output.contains("private payload"),
            "{name} exposed private bytes"
        );
        assert!(
            !result
                .output
                .contains(private.file_name().unwrap().to_str().unwrap()),
            "{name} exposed a private stage"
        );
        assert!(
            !result
                .output
                .contains(checkpoint.file_name().unwrap().to_str().unwrap()),
            "{name} exposed private storage"
        );
        assert!(
            !result.output.contains("ordinary-directory-alias"),
            "{name} exposed a private alias"
        );
    }
}

#[test]
fn checkpoint_storage_existing_corrupt_blob_cannot_be_trusted_on_capture() {
    use sha2::{Digest, Sha256};
    let fixture = Fixture::new();
    let authority = fixture.authority();
    let path = fixture.workspace.join("ordinary.txt");
    std::fs::write(&path, b"owned before bytes").unwrap();
    let digest = crate::hex::encode(&Sha256::digest(b"owned before bytes"));
    let blobs = fixture.checkpoint_dir().join("blobs");
    std::fs::create_dir_all(&blobs).unwrap();
    std::fs::write(blobs.join(digest), b"synthetic corrupt bytes").unwrap();
    let mut log = CheckpointLog::beside(&fixture.session_path());
    log.push(0, "synthetic checkpoint prompt".to_string());
    log.capture(&path, Some(&authority));
    assert_eq!(log.tracked_files(0), 0);
    assert!(matches!(
        log.checkpoints()[0].files[0].before,
        FileState::Untracked(_)
    ));
}

#[test]
fn checkpoint_unowned_persisted_path_cannot_use_a_valid_blob() {
    use sha2::{Digest, Sha256};
    let fixture = Fixture::new();
    let authority = fixture.authority();
    let outside = Sentinel::new(
        fixture.outside.join("ordinary.txt"),
        b"outside current bytes",
    );
    let saved = b"valid synthetic saved bytes";
    let digest = crate::hex::encode(&Sha256::digest(saved));
    let blobs = fixture.checkpoint_dir().join("blobs");
    std::fs::create_dir_all(&blobs).unwrap();
    std::fs::write(blobs.join(&digest), saved).unwrap();
    let log = fixture.load_snapshot(&outside.path, digest);
    let report = log.restore_files(0, Some(&authority));
    assert_eq!(report.skipped.len(), 1);
    assert!(report.restored.is_empty());
    outside.assert_unchanged();
}

#[test]
fn checkpoint_memory_to_disk_uses_selected_storage_owner_and_reload() {
    let fixture = Fixture::new();
    let authority = fixture.authority();
    let path = fixture.workspace.join("ordinary.txt");
    std::fs::write(&path, b"owned before bytes").unwrap();
    let mut log = CheckpointLog::in_memory();
    log.push(0, "synthetic checkpoint prompt".to_string());
    log.capture(&path, Some(&authority));
    let destination = CheckpointLog::beside(&fixture.session_path());
    let log = log.moved_into(destination);
    assert_eq!(log.len(), 1);
    std::fs::write(&path, b"owned edited bytes").unwrap();
    let reloaded = log.reload_beside(&fixture.session_path());
    assert_eq!(reloaded.len(), 1);
    assert_eq!(
        reloaded.restore_files(0, Some(&authority)).restored,
        vec![path.clone()]
    );
    assert_eq!(std::fs::read(path).unwrap(), b"owned before bytes");
}
