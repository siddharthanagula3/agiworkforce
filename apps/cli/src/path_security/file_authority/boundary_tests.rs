#[cfg(unix)]
use super::{DirectoryAuthority, WorkspaceFileAuthority};

#[cfg(unix)]
#[test]
fn private_revision_replacement_rechecks_content_after_staging() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("instructions.md");
    std::fs::write(&path, "original").unwrap();
    let authority = DirectoryAuthority::open(root.path()).unwrap();
    let leaf = std::path::Path::new("instructions.md");
    let revision = authority.read_file(leaf, 1024).unwrap().unwrap().revision();
    let changed = path.clone();
    *authority.hooks.after_staging_write.lock().unwrap() = Some(Box::new(move || {
        std::fs::write(changed, "external edit").unwrap();
    }));
    assert!(authority
        .replace_private_file_if_revision(leaf, b"my edits", 1024, &revision)
        .is_err());
    assert_eq!(std::fs::read_to_string(path).unwrap(), "external edit");
}

#[cfg(unix)]
#[test]
fn editor_revision_check_detects_a_write_after_the_write_handle_opens() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("notes.txt");
    std::fs::write(&path, "original").unwrap();
    let authority = WorkspaceFileAuthority::new(root.path()).unwrap();
    let (directory, relative) = authority.editor_file("notes.txt").unwrap();
    let revision = directory
        .read_file(&relative, 1024)
        .unwrap()
        .unwrap()
        .revision();
    let later = path.clone();
    *directory.hooks.after_write_open.lock().unwrap() = Some(Box::new(move || {
        std::fs::write(later, "external edit").unwrap()
    }));
    assert!(directory
        .replace_file_if_revision(&relative, b"my edit", 1024, &revision)
        .is_err());
    assert_eq!(std::fs::read_to_string(path).unwrap(), "external edit");
}

#[cfg(unix)]
#[test]
fn editor_revision_write_preserves_the_existing_inode_and_mode_and_refuses_link_replacement() {
    use std::os::unix::fs::{MetadataExt, PermissionsExt};
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("script.sh");
    let outside = tempfile::tempdir().unwrap();
    let secret = outside.path().join("outside.txt");
    std::fs::write(&path, "old\r\n").unwrap();
    std::fs::write(&secret, "outside").unwrap();
    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o750)).unwrap();
    let before = std::fs::metadata(&path).unwrap();
    let authority = WorkspaceFileAuthority::new(root.path()).unwrap();
    let (directory, relative) = authority.editor_file("script.sh").unwrap();
    let revision = directory
        .read_file(&relative, 1024)
        .unwrap()
        .unwrap()
        .revision();
    assert!(directory
        .replace_file_if_revision(&relative, b"new\r\n", 1024, &revision)
        .unwrap());
    let after = std::fs::metadata(&path).unwrap();
    assert_eq!(before.ino(), after.ino());
    assert_eq!(before.permissions().mode(), after.permissions().mode());
    let revision = directory
        .read_file(&relative, 1024)
        .unwrap()
        .unwrap()
        .revision();
    let target = path.clone();
    let secret_link = secret.clone();
    *directory.hooks.before_write_open.lock().unwrap() = Some(Box::new(move || {
        std::fs::remove_file(&target).unwrap();
        std::os::unix::fs::symlink(secret_link, target).unwrap();
    }));
    assert!(directory
        .replace_file_if_revision(&relative, b"replace", 1024, &revision)
        .is_err());
    assert_eq!(std::fs::read_to_string(secret).unwrap(), "outside");
}

#[cfg(unix)]
#[test]
fn directory_grant_rejects_identity_change_during_initial_validation() {
    let temporary = tempfile::tempdir().unwrap();
    let root = temporary.path().canonicalize().unwrap();
    let selected = root.join("selected");
    let outside = root.join("outside");
    std::fs::create_dir(&selected).unwrap();
    std::fs::create_dir(&outside).unwrap();
    let result = DirectoryAuthority::open_validated(&selected, |path| {
        std::fs::rename(path, root.join("original")).unwrap();
        std::os::unix::fs::symlink(&outside, path).unwrap();
        Ok(path.canonicalize().unwrap())
    });
    assert!(result.is_err());
    assert_eq!(std::fs::read_dir(outside).unwrap().count(), 0);
}

#[cfg(unix)]
#[test]
fn directory_grant_parent_swap_after_validation_never_reads_outside() {
    let temporary = tempfile::tempdir().unwrap();
    let root = temporary.path().canonicalize().unwrap();
    let workspace = root.join("workspace");
    let outside = root.join("outside");
    std::fs::create_dir_all(workspace.join("parent")).unwrap();
    std::fs::create_dir(&outside).unwrap();
    std::fs::write(workspace.join("parent/ordinary.txt"), b"owned bytes").unwrap();
    std::fs::write(outside.join("ordinary.txt"), b"outside sentinel bytes").unwrap();
    let authority = WorkspaceFileAuthority::new(&workspace).unwrap();
    let (directory, relative) = authority
        .resolve(&workspace.join("parent/ordinary.txt"))
        .unwrap();
    let parent = workspace.join("parent");
    let outside_target = outside.clone();
    *directory.hooks.before_parent_open.lock().unwrap() = Some(Box::new(move || {
        std::fs::rename(&parent, parent.with_file_name("original-parent")).unwrap();
        std::os::unix::fs::symlink(outside_target, parent).unwrap();
    }));
    assert!(directory.read_file(&relative, 1024).is_err());
    assert_eq!(
        std::fs::read(outside.join("ordinary.txt")).unwrap(),
        b"outside sentinel bytes"
    );
}

#[cfg(unix)]
#[test]
fn directory_grant_logical_nofollow_rejects_leaf_swap_after_stat() {
    let temporary = tempfile::tempdir().unwrap();
    let root = temporary.path().canonicalize().unwrap();
    let workspace = root.join("workspace");
    let outside = root.join("outside.txt");
    std::fs::create_dir(&workspace).unwrap();
    std::fs::write(&outside, b"outside sentinel bytes").unwrap();
    let path = workspace.join("ordinary.txt");
    std::fs::write(&path, b"owned bytes").unwrap();
    let authority = WorkspaceFileAuthority::new(&workspace).unwrap();
    let (directory, relative) = authority.resolve(&path).unwrap();
    let leaf = path.clone();
    let outside_target = outside.clone();
    *directory.hooks.before_leaf_open.lock().unwrap() = Some(Box::new(move || {
        std::fs::remove_file(&leaf).unwrap();
        std::os::unix::fs::symlink(outside_target, leaf).unwrap();
    }));
    assert!(directory.read_file(&relative, 1024).is_err());
    assert_eq!(std::fs::read(outside).unwrap(), b"outside sentinel bytes");
}

#[cfg(unix)]
#[test]
fn directory_grant_staging_write_uses_held_file_not_reopened_name() {
    let temporary = tempfile::tempdir().unwrap();
    let root = temporary.path().canonicalize().unwrap();
    let workspace = root.join("workspace");
    let outside = root.join("outside.txt");
    std::fs::create_dir(&workspace).unwrap();
    std::fs::write(&outside, b"outside sentinel bytes").unwrap();
    let directory = DirectoryAuthority::open(&workspace).unwrap();
    let parent = workspace.clone();
    let outside_target = outside.clone();
    *directory.hooks.after_staging_open.lock().unwrap() = Some(Box::new(move || {
        let stage = std::fs::read_dir(&parent)
            .unwrap()
            .map(Result::unwrap)
            .find(|entry| {
                entry
                    .file_name()
                    .to_string_lossy()
                    .starts_with(".checkpoint-")
            })
            .unwrap()
            .path();
        let stage = if stage.is_dir() {
            stage.join("contents")
        } else {
            stage
        };
        std::fs::remove_file(&stage).unwrap();
        std::os::unix::fs::symlink(outside_target, stage).unwrap();
    }));
    assert!(directory
        .replace_file(
            std::path::Path::new("ordinary.txt"),
            b"saved owned bytes",
            false,
            1024
        )
        .is_err());
    assert_eq!(std::fs::read(outside).unwrap(), b"outside sentinel bytes");
    assert_eq!(std::fs::read_dir(workspace).unwrap().count(), 0);
}

#[cfg(unix)]
#[test]
fn directory_grant_keeps_opened_identity_without_regranting_replacement() {
    let temporary = tempfile::tempdir().unwrap();
    let root = temporary.path().canonicalize().unwrap();
    let workspace = root.join("workspace");
    let original = root.join("original");
    std::fs::create_dir(&workspace).unwrap();
    std::fs::write(workspace.join("ordinary.txt"), b"owned bytes").unwrap();
    let authority = WorkspaceFileAuthority::new(&workspace).unwrap();
    std::fs::rename(&workspace, &original).unwrap();
    std::fs::create_dir(&workspace).unwrap();
    std::fs::write(workspace.join("ordinary.txt"), b"replacement bytes").unwrap();
    let (directory, relative) = authority.resolve(&workspace.join("ordinary.txt")).unwrap();
    assert_eq!(
        directory.read_file(&relative, 1024).unwrap().unwrap().bytes,
        b"owned bytes"
    );
    directory
        .replace_file(&relative, b"restored owned bytes", false, 1024)
        .unwrap();
    assert_eq!(
        std::fs::read(original.join("ordinary.txt")).unwrap(),
        b"restored owned bytes"
    );
    assert_eq!(
        std::fs::read(workspace.join("ordinary.txt")).unwrap(),
        b"replacement bytes"
    );
}

#[cfg(unix)]
#[test]
fn additional_grant_same_name_cannot_implicitly_regrant_another_directory() {
    let temporary = tempfile::tempdir().unwrap();
    let root = temporary.path().canonicalize().unwrap();
    let workspace = root.join("workspace");
    let extra = root.join("extra");
    std::fs::create_dir(&workspace).unwrap();
    std::fs::create_dir(&extra).unwrap();
    let mut authority = WorkspaceFileAuthority::new(&workspace).unwrap();
    authority.add(&extra).unwrap();
    std::fs::rename(&extra, root.join("original-extra")).unwrap();
    std::fs::create_dir(&extra).unwrap();
    assert!(authority.add(&extra).is_err());
    authority.remove(&extra).unwrap();
    assert!(authority.additional().is_empty());
}

#[cfg(unix)]
#[test]
fn directory_grant_publication_rejects_staging_hardlink_before_bytes() {
    let temporary = tempfile::tempdir().unwrap();
    let root = temporary.path().canonicalize().unwrap();
    let workspace = root.join("workspace");
    let outside = root.join("outside.bin");
    std::fs::create_dir(&workspace).unwrap();
    let directory = DirectoryAuthority::open(&workspace).unwrap();
    let parent = workspace.clone();
    let outside_target = outside.clone();
    *directory.hooks.after_staging_open.lock().unwrap() = Some(Box::new(move || {
        let stage = std::fs::read_dir(&parent)
            .unwrap()
            .map(Result::unwrap)
            .find(|entry| {
                entry
                    .file_name()
                    .to_string_lossy()
                    .starts_with(".checkpoint-")
            })
            .unwrap()
            .path();
        let stage = if stage.is_dir() {
            stage.join("contents")
        } else {
            stage
        };
        std::fs::hard_link(stage, outside_target).unwrap();
    }));
    let published = directory.replace_file(
        std::path::Path::new("ordinary.txt"),
        b"saved owned bytes",
        false,
        1024,
    );
    assert!(outside.exists());
    assert_eq!(std::fs::read(&outside).unwrap(), Vec::<u8>::new());
    assert!(published.is_err());
    assert!(!workspace.join("ordinary.txt").exists());
}

#[cfg(unix)]
#[test]
fn directory_grant_publication_rejects_staging_hardlink_before_publish() {
    use std::os::unix::fs::PermissionsExt;
    let temporary = tempfile::tempdir().unwrap();
    let root = temporary.path().canonicalize().unwrap();
    let workspace = root.join("workspace");
    let outside = root.join("outside.bin");
    std::fs::create_dir(&workspace).unwrap();
    let directory = DirectoryAuthority::open(&workspace).unwrap();
    let parent = workspace.clone();
    let target = outside.clone();
    *directory.hooks.after_staging_write.lock().unwrap() = Some(Box::new(move || {
        let stage = std::fs::read_dir(&parent)
            .unwrap()
            .map(Result::unwrap)
            .find(|entry| {
                entry
                    .file_name()
                    .to_string_lossy()
                    .starts_with(".checkpoint-")
            })
            .unwrap()
            .path();
        assert!(stage.is_dir());
        assert_eq!(
            std::fs::metadata(&stage).unwrap().permissions().mode() & 0o777,
            0o700
        );
        let file = stage.join("contents");
        assert_eq!(std::fs::read(&file).unwrap(), b"saved owned bytes");
        std::fs::hard_link(file, target).unwrap();
    }));
    assert!(directory
        .replace_file(
            std::path::Path::new("ordinary.txt"),
            b"saved owned bytes",
            false,
            1024
        )
        .is_err());
    assert!(directory
        .hooks
        .after_staging_write
        .lock()
        .unwrap()
        .is_none());
    assert!(!workspace.join("ordinary.txt").exists());
    assert_eq!(std::fs::read(outside).unwrap(), b"saved owned bytes");
    assert_eq!(std::fs::read_dir(workspace).unwrap().count(), 0);
}

#[cfg(target_os = "macos")]
#[test]
fn directory_grant_publication_respects_target_write_deny_acl() {
    let temporary = tempfile::tempdir().unwrap();
    let root = temporary.path().canonicalize().unwrap();
    let path = root.join("ordinary.txt");
    std::fs::write(&path, b"owned current bytes").unwrap();
    let status = std::process::Command::new("/bin/chmod")
        .arg("+a")
        .arg("everyone deny write")
        .arg(&path)
        .status()
        .unwrap();
    assert!(status.success());
    assert_eq!(std::fs::read(&path).unwrap(), b"owned current bytes");
    assert!(std::fs::OpenOptions::new().write(true).open(&path).is_err());
    assert!(!std::fs::metadata(&path).unwrap().permissions().readonly());
    let control = root.join("parent-write-control.txt");
    std::fs::write(&control, b"owned parent permits new files").unwrap();
    std::fs::remove_file(control).unwrap();
    let directory = DirectoryAuthority::open(&root).unwrap();
    assert!(directory
        .replace_file(
            std::path::Path::new("ordinary.txt"),
            b"saved owned bytes",
            false,
            1024
        )
        .is_err());
    assert_eq!(std::fs::read(path).unwrap(), b"owned current bytes");
}

#[cfg(target_os = "macos")]
#[test]
fn checkpoint_revision_preserves_existing_inode_and_acl() {
    use std::os::unix::fs::MetadataExt;
    let temporary = tempfile::tempdir().unwrap();
    let root = temporary.path().canonicalize().unwrap();
    let path = root.join("ordinary.txt");
    std::fs::write(&path, b"owned current bytes").unwrap();
    let status = std::process::Command::new("/bin/chmod")
        .arg("+a")
        .arg("everyone deny append")
        .arg(&path)
        .status()
        .unwrap();
    assert!(status.success());
    assert!(std::fs::OpenOptions::new().write(true).open(&path).is_ok());
    assert!(std::fs::OpenOptions::new()
        .append(true)
        .open(&path)
        .is_err());
    let original = std::fs::metadata(&path).unwrap();
    let directory = DirectoryAuthority::open(&root).unwrap();
    assert!(directory
        .replace_file(
            std::path::Path::new("ordinary.txt"),
            b"saved owned bytes",
            false,
            1024
        )
        .unwrap());
    assert_eq!(std::fs::read(&path).unwrap(), b"saved owned bytes");
    let restored = std::fs::metadata(&path).unwrap();
    assert_eq!(
        (restored.dev(), restored.ino()),
        (original.dev(), original.ino())
    );
    assert!(std::fs::OpenOptions::new()
        .append(true)
        .open(&path)
        .is_err());
}

#[cfg(unix)]
#[test]
fn directory_grant_write_open_rejects_substituted_leaf() {
    let temporary = tempfile::tempdir().unwrap();
    let root = temporary.path().canonicalize().unwrap();
    let path = root.join("ordinary.txt");
    let outside = root.join("outside.txt");
    std::fs::write(&path, b"owned current bytes").unwrap();
    std::fs::write(&outside, b"outside sentinel bytes").unwrap();
    let directory = DirectoryAuthority::open(&root).unwrap();
    let leaf = path.clone();
    let target = outside.clone();
    *directory.hooks.before_write_open.lock().unwrap() = Some(Box::new(move || {
        std::fs::remove_file(&leaf).unwrap();
        std::os::unix::fs::symlink(target, leaf).unwrap();
    }));
    assert!(directory
        .replace_file(
            std::path::Path::new("ordinary.txt"),
            b"saved owned bytes",
            false,
            1024
        )
        .is_err());
    assert!(directory.hooks.before_write_open.lock().unwrap().is_none());
    assert!(path.is_symlink());
    assert_eq!(std::fs::read(outside).unwrap(), b"outside sentinel bytes");
}

#[cfg(unix)]
#[test]
fn directory_grant_held_writer_never_reopens_substituted_name() {
    let temporary = tempfile::tempdir().unwrap();
    let root = temporary.path().canonicalize().unwrap();
    let path = root.join("ordinary.txt");
    let original = root.join("held-original.txt");
    let outside = root.join("outside.txt");
    std::fs::write(&path, b"owned current bytes").unwrap();
    std::fs::write(&outside, b"outside sentinel bytes").unwrap();
    let directory = DirectoryAuthority::open(&root).unwrap();
    let leaf = path.clone();
    let retained = original.clone();
    let target = outside.clone();
    *directory.hooks.after_write_open.lock().unwrap() = Some(Box::new(move || {
        std::fs::rename(&leaf, retained).unwrap();
        std::os::unix::fs::symlink(target, leaf).unwrap();
    }));
    assert!(directory
        .replace_file(
            std::path::Path::new("ordinary.txt"),
            b"saved owned bytes",
            false,
            1024
        )
        .is_err());
    assert!(directory.hooks.after_write_open.lock().unwrap().is_none());
    assert_eq!(std::fs::read(original).unwrap(), b"owned current bytes");
    assert_eq!(std::fs::read(outside).unwrap(), b"outside sentinel bytes");
}

#[cfg(unix)]
#[test]
fn directory_grant_existing_write_only_and_large_edits_restore_original_inode() {
    use std::os::unix::fs::{MetadataExt, PermissionsExt};
    let temporary = tempfile::tempdir().unwrap();
    let root = temporary.path().canonicalize().unwrap();
    let path = root.join("ordinary.txt");
    std::fs::write(&path, b"owned current bytes").unwrap();
    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o200)).unwrap();
    let original = std::fs::metadata(&path).unwrap();
    assert!(std::fs::File::open(&path).is_err());
    let directory = DirectoryAuthority::open(&root).unwrap();
    assert!(directory
        .replace_file(
            std::path::Path::new("ordinary.txt"),
            b"saved owned bytes",
            false,
            8
        )
        .is_err());
    assert!(directory
        .replace_file(
            std::path::Path::new("ordinary.txt"),
            b"saved owned bytes",
            false,
            1024
        )
        .unwrap());
    assert_eq!(std::fs::metadata(&path).unwrap().ino(), original.ino());
    assert_eq!(
        std::fs::metadata(&path).unwrap().permissions().mode() & 0o777,
        0o200
    );
    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600)).unwrap();
    assert_eq!(std::fs::read(&path).unwrap(), b"saved owned bytes");
    std::fs::OpenOptions::new()
        .write(true)
        .open(&path)
        .unwrap()
        .set_len(2048)
        .unwrap();
    assert!(directory
        .replace_file(
            std::path::Path::new("ordinary.txt"),
            b"saved owned bytes",
            false,
            1024
        )
        .unwrap());
    assert_eq!(std::fs::metadata(&path).unwrap().ino(), original.ino());
    assert_eq!(std::fs::read(path).unwrap(), b"saved owned bytes");
}

#[cfg(unix)]
#[test]
fn directory_sync_retains_granted_identity_after_path_substitution() {
    use std::os::unix::fs::MetadataExt;
    let temporary = tempfile::tempdir().unwrap();
    let root = temporary.path().canonicalize().unwrap();
    let selected = root.join("selected");
    let original = root.join("original");
    let outside = root.join("outside");
    std::fs::create_dir(&selected).unwrap();
    std::fs::create_dir(&outside).unwrap();
    std::fs::write(selected.join("owned.txt"), b"owned bytes").unwrap();
    std::fs::write(outside.join("sentinel.txt"), b"outside bytes").unwrap();
    let authority = DirectoryAuthority::open(&selected).unwrap();
    let held = authority.file.metadata().unwrap();
    let observed = std::sync::Arc::new(std::sync::Mutex::new(None));
    let receipt = observed.clone();
    *authority.hooks.before_directory_sync.lock().unwrap() = Some(Box::new(move |file| {
        let metadata = file.metadata().unwrap();
        #[cfg(target_os = "linux")]
        let readable = !nix::fcntl::OFlag::from_bits_truncate(
            nix::fcntl::fcntl(file, nix::fcntl::FcntlArg::F_GETFL).unwrap(),
        )
        .contains(nix::fcntl::OFlag::O_PATH);
        #[cfg(not(target_os = "linux"))]
        let readable = true;
        *receipt.lock().unwrap() = Some((metadata.dev(), metadata.ino(), readable));
    }));
    std::fs::rename(&selected, &original).unwrap();
    std::os::unix::fs::symlink(&outside, &selected).unwrap();
    authority.sync_directory().unwrap();
    assert_eq!(
        *observed.lock().unwrap(),
        Some((held.dev(), held.ino(), true))
    );
    let synchronized = authority.file.metadata().unwrap();
    assert_eq!(synchronized.dev(), held.dev());
    assert_eq!(synchronized.ino(), held.ino());
    assert_ne!(
        synchronized.ino(),
        std::fs::metadata(&selected).unwrap().ino()
    );
    assert_eq!(
        std::fs::read(original.join("owned.txt")).unwrap(),
        b"owned bytes"
    );
    assert_eq!(
        std::fs::read(outside.join("sentinel.txt")).unwrap(),
        b"outside bytes"
    );
    assert_eq!(std::fs::read_dir(&outside).unwrap().count(), 1);
    authority.fail_next_directory_sync();
    assert!(authority.sync_directory().is_err());
}

#[cfg(unix)]
#[test]
fn project_upload_selected_file_refuses_changes_after_the_picker_and_preserves_exact_bytes() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("selected.txt");
    let expected = b"\xef\xbb\xbforiginal\r\n";
    std::fs::write(&path, expected).unwrap();
    std::fs::OpenOptions::new()
        .write(true)
        .open(&path)
        .unwrap()
        .set_times(
            std::fs::FileTimes::new()
                .set_modified(std::time::UNIX_EPOCH - std::time::Duration::from_secs(1)),
        )
        .unwrap();
    let authority = DirectoryAuthority::open(root.path()).unwrap();
    let decision = chrono::Utc::now().timestamp_millis();
    assert_eq!(
        authority
            .read_selected_file(std::path::Path::new("selected.txt"), 1024, decision)
            .unwrap()
            .unwrap()
            .bytes,
        expected
    );
    let future = std::time::UNIX_EPOCH + std::time::Duration::from_millis((decision + 1000) as u64);
    std::fs::OpenOptions::new()
        .write(true)
        .open(&path)
        .unwrap()
        .set_times(std::fs::FileTimes::new().set_modified(future))
        .unwrap();
    assert!(authority
        .read_selected_file(std::path::Path::new("selected.txt"), 1024, decision)
        .err()
        .unwrap()
        .to_string()
        .contains("picker"));
}

#[cfg(unix)]
#[test]
fn project_upload_selected_file_rejects_identity_swaps_and_linked_or_special_files() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("selected.txt");
    let outside = root.path().join("other.txt");
    std::fs::write(&path, "selected").unwrap();
    std::fs::write(&outside, "other").unwrap();
    let authority = DirectoryAuthority::open(root.path()).unwrap();
    let next = path.clone();
    let replaced = outside.clone();
    *authority.hooks.before_leaf_open.lock().unwrap() = Some(Box::new(move || {
        std::fs::remove_file(&next).unwrap();
        std::fs::rename(replaced, next).unwrap();
    }));
    assert!(authority
        .read_selected_file(
            std::path::Path::new("selected.txt"),
            1024,
            chrono::Utc::now().timestamp_millis()
        )
        .is_err());
    std::fs::hard_link(&path, root.path().join("hard.txt")).unwrap();
    std::os::unix::fs::symlink(&path, root.path().join("link.txt")).unwrap();
    nix::unistd::mkfifo(&root.path().join("pipe.txt"), nix::sys::stat::Mode::S_IRUSR).unwrap();
    for name in [
        "selected.txt",
        "hard.txt",
        "link.txt",
        "pipe.txt",
        "../selected.txt",
    ] {
        assert!(
            authority
                .read_selected_file(
                    std::path::Path::new(name),
                    1024,
                    chrono::Utc::now().timestamp_millis()
                )
                .is_err(),
            "{name}"
        );
    }
}
