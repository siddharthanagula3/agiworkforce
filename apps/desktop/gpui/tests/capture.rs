use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

use agiworkforce_desktop_gpui::capture::*;
use agiworkforce_desktop_gpui::chat_upload::{limits, ChatUpload};
use agiworkforce_protocol::account_cloud::{CloudHistoryAttachment, CloudHistoryAttachmentKind};

fn write(path: &Path, bytes: usize) {
    std::fs::write(path, vec![b'a'; bytes]).unwrap();
}

fn attachment(size: u64) -> CloudHistoryAttachment {
    let asset = uuid::Uuid::new_v4().to_string();
    CloudHistoryAttachment {
        id: asset.clone(),
        asset_id: asset,
        kind: CloudHistoryAttachmentKind::File,
        name: "earlier.txt".into(),
        size: Some(size),
        mime_type: Some("text/plain".into()),
    }
}

#[test]
fn capture_root_is_scoped_to_the_desktop_name() {
    let temp = tempfile::tempdir().unwrap();
    let root = capture_root(temp.path(), "Desktop").unwrap();
    assert_eq!(root, temp.path().join("Desktop").join("captures"));
    for name in ["", " ", "a/b", "a\\b", "..", ".", "a\0b"] {
        assert!(capture_root(temp.path(), name).is_err(), "{name:?}");
    }
    assert!(capture_root(Path::new("relative"), "Desktop").is_err());
}

#[test]
fn capture_folder_is_private_and_removed_when_dropped() {
    let temp = tempfile::tempdir().unwrap();
    let root = capture_root(temp.path(), "Desktop").unwrap();
    let dir = CaptureDir::create(&root).unwrap();
    let file = dir.file("Screenshot.png").unwrap();
    write(&file, 4);
    let folder = dir.path().to_path_buf();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mode = std::fs::metadata(&folder).unwrap().permissions().mode();
        assert_eq!(mode & 0o777, 0o700);
    }
    assert!(file.starts_with(&folder));
    drop(dir);
    assert!(!folder.exists());
    assert!(!file.exists());
    assert!(root.exists());
}

#[test]
fn capture_file_names_cannot_escape_the_folder() {
    let temp = tempfile::tempdir().unwrap();
    let dir = CaptureDir::create(temp.path()).unwrap();
    for name in ["", ".", "..", "../x.png", "a/b.png", "a\\b.png", "a\nb.png"] {
        assert!(dir.file(name).is_err(), "{name:?}");
    }
}

#[test]
fn stale_sweep_removes_only_old_capture_folders() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("captures");
    let old = CaptureDir::create(&root).unwrap();
    let old_path = old.path().to_path_buf();
    std::mem::forget(old);
    let unrelated = root.join("keep-me");
    std::fs::create_dir(&unrelated).unwrap();
    let stray_file = root.join(uuid::Uuid::new_v4().to_string());
    write(&stray_file, 1);
    let future = SystemTime::now() + Duration::from_secs(60);
    assert_eq!(sweep_stale(&root, SystemTime::UNIX_EPOCH).unwrap(), 0);
    assert!(old_path.exists());
    assert_eq!(sweep_stale(&root, future).unwrap(), 1);
    assert!(!old_path.exists());
    assert!(unrelated.exists());
    assert!(stray_file.exists());
    assert_eq!(
        sweep_stale(&temp.path().join("missing"), future).unwrap(),
        0
    );
}

#[test]
fn screenshot_command_is_interactive_silent_and_absolute() {
    let output = PathBuf::from("/private/capture/Screenshot.png");
    let (program, arguments) = screenshot_command(&output);
    assert_eq!(program, PathBuf::from("/usr/sbin/screencapture"));
    #[cfg(unix)]
    assert!(program.is_absolute());
    assert_eq!(
        arguments,
        ["-i", "-x", "-t", "png", "/private/capture/Screenshot.png"]
            .map(std::ffi::OsString::from)
            .to_vec()
    );
    assert_eq!(screenshot_supported(), cfg!(target_os = "macos"));
}

#[test]
fn screenshot_name_is_a_png_with_the_local_time() {
    let at = chrono::TimeZone::with_ymd_and_hms(&chrono::Local, 2026, 11, 11, 9, 5, 7).unwrap();
    assert_eq!(screenshot_name(at), "Screenshot 2026-11-11 at 09.05.07.png");
}

#[test]
fn screenshot_outcome_requires_a_written_file_and_a_clean_exit() {
    let temp = tempfile::tempdir().unwrap();
    let file = temp.path().join("shot.png");
    assert_eq!(
        screenshot_outcome(true, &file),
        ScreenshotOutcome::Cancelled
    );
    assert_eq!(
        screenshot_outcome(false, &file),
        ScreenshotOutcome::Cancelled
    );
    write(&file, 0);
    assert!(matches!(
        screenshot_outcome(true, &file),
        ScreenshotOutcome::Failed(_)
    ));
    write(&file, 8);
    assert!(matches!(
        screenshot_outcome(false, &file),
        ScreenshotOutcome::Failed(_)
    ));
    assert_eq!(screenshot_outcome(true, &file), ScreenshotOutcome::Captured);
    assert!(matches!(
        screenshot_outcome(true, temp.path()),
        ScreenshotOutcome::Failed(_)
    ));
}

#[test]
fn a_single_regular_file_is_accepted_once_even_when_repeated() {
    let temp = tempfile::tempdir().unwrap();
    let file = temp.path().join("notes.txt");
    write(&file, 12);
    let dropped = dropped_file(&[file.clone(), file.clone()], &ChatUpload::default()).unwrap();
    assert_eq!(
        dropped,
        DroppedFile {
            path: file.to_str().unwrap().to_owned(),
            byte_count: 12
        }
    );
}

#[test]
fn drops_refuse_folders_links_multiple_and_empty() {
    let temp = tempfile::tempdir().unwrap();
    let upload = ChatUpload::default();
    let first = temp.path().join("a.txt");
    let second = temp.path().join("b.txt");
    write(&first, 1);
    write(&second, 1);
    assert!(dropped_file(&[], &upload).is_err());
    assert!(dropped_file(&[first.clone(), second], &upload).is_err());
    assert!(dropped_file(&[temp.path().to_path_buf()], &upload).is_err());
    assert!(dropped_file(&[temp.path().join("missing.txt")], &upload).is_err());
    assert!(dropped_file(&[PathBuf::from("relative.txt")], &upload).is_err());
    let empty = temp.path().join("empty.txt");
    write(&empty, 0);
    assert!(dropped_file(&[empty], &upload).is_err());
    #[cfg(unix)]
    {
        let link = temp.path().join("link.txt");
        std::os::unix::fs::symlink(&first, &link).unwrap();
        assert!(dropped_file(&[link], &upload).is_err());
    }
}

#[test]
fn drops_follow_the_upload_owner_limits() {
    let limits = limits().unwrap();
    let temp = tempfile::tempdir().unwrap();
    let too_large = temp.path().join("large.txt");
    std::fs::File::create(&too_large)
        .unwrap()
        .set_len(limits.max_bytes + 1)
        .unwrap();
    assert!(dropped_file(&[too_large], &ChatUpload::default()).is_err());

    let small = temp.path().join("small.txt");
    write(&small, 1);
    let full = ChatUpload {
        files: (0..limits.max_count).map(|_| attachment(1)).collect(),
        ..Default::default()
    };
    assert!(dropped_file(std::slice::from_ref(&small), &full).is_err());

    let heavy = ChatUpload {
        files: vec![attachment(limits.max_message_bytes)],
        ..Default::default()
    };
    assert!(dropped_file(&[small], &heavy).is_err());
}
