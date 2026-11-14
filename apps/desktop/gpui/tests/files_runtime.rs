use agiworkforce_app_server::{DeveloperSessionClientError, DeveloperSessionHostError};
use agiworkforce_desktop_gpui::{
    config::{NativeContracts, Settings},
    editor::FileEditor,
    editor_recovery::EditorRecovery,
    runtime::{consent_timestamp_ms, RuntimeSession},
};
use agiworkforce_protocol::{
    developer_session::{method, DeveloperWorkspaceIdentity},
    instruction_settings::*,
    workspace_files::*,
};
use std::{collections::HashSet, path::PathBuf};

fn unavailable<T>(result: Result<T, DeveloperSessionClientError>) {
    assert!(
        matches!(result, Err(DeveloperSessionClientError::Remote {code, ..}) if code == DeveloperSessionHostError::unavailable("").code())
    );
}

#[tokio::test]
#[ignore = "run through the isolated packaged file editor runner"]
async fn real_workspace_editor_instruction_settings_scopes_conflicts_and_account_isolation() {
    assert_eq!(std::env::var("AGI_GPUI_FILES_FIXTURE").as_deref(), Ok("1"));
    let binary = PathBuf::from(std::env::var_os("AGI_GPUI_TEST_RUNTIME").unwrap());
    let repo = tempfile::tempdir().unwrap();
    std::fs::create_dir(repo.path().join(".git")).unwrap();
    let contracts = NativeContracts::load().unwrap();
    let session = RuntimeSession::connect(
        &binary,
        repo.path(),
        consent_timestamp_ms().unwrap(),
        &contracts,
        Settings::load().unwrap(),
    )
    .await
    .unwrap();
    assert!(session.capabilities().settings_instructions);
    let client = session.client();
    let root: DeveloperWorkspaceIdentity = client
        .request(method::WORKSPACE_IDENTITY, serde_json::json!({}))
        .await
        .unwrap();
    let project_params = InstructionSettingsReadParams {
        root_key: root.root_key.clone(),
        scope: InstructionSettingsScope::Project,
    };
    let project: InstructionSettingsSnapshot = client
        .request(method::SETTINGS_INSTRUCTIONS_READ, project_params.clone())
        .await
        .unwrap();
    assert_eq!(project.revision, None);
    assert!(!repo.path().join(".agiworkforce").exists());
    let config_before = std::fs::read(&project.profile.config_path).unwrap();
    let request = InstructionSettingsWriteParams {
        root_key: root.root_key.clone(),
        scope: project.scope,
        revision: project.revision,
        text: "\u{feff}folder 東京\r\n🦀".into(),
    };
    let saved: InstructionSettingsWriteResponse = client
        .request(method::SETTINGS_INSTRUCTIONS_WRITE, request.clone())
        .await
        .unwrap();
    assert!(saved.saved);
    assert_eq!(
        std::fs::read_to_string(&saved.current.path).unwrap(),
        request.text
    );
    let user_params = InstructionSettingsReadParams {
        root_key: root.root_key.clone(),
        scope: InstructionSettingsScope::User,
    };
    let user: InstructionSettingsSnapshot = client
        .request(method::SETTINGS_INSTRUCTIONS_READ, user_params)
        .await
        .unwrap();
    let user_saved: InstructionSettingsWriteResponse = client
        .request(
            method::SETTINGS_INSTRUCTIONS_WRITE,
            InstructionSettingsWriteParams {
                root_key: root.root_key.clone(),
                scope: user.scope,
                revision: user.revision,
                text: "profile settings fixture".into(),
            },
        )
        .await
        .unwrap();
    assert!(user_saved.saved);
    assert_ne!(saved.current.path, user_saved.current.path);
    let sources: agiworkforce_protocol::developer_session::ContextInstructionsResponse = client
        .request(
            method::CONTEXT_INSTRUCTIONS,
            agiworkforce_protocol::developer_session::ContextInstructionsParams { cwd: None },
        )
        .await
        .unwrap();
    assert!(sources
        .files
        .iter()
        .any(|source| source.path == saved.current.path));
    assert!(sources
        .files
        .iter()
        .any(|source| source.path == user_saved.current.path));
    std::fs::write(&saved.current.path, "external instructions").unwrap();
    let conflict: InstructionSettingsWriteResponse = client
        .request(
            method::SETTINGS_INSTRUCTIONS_WRITE,
            InstructionSettingsWriteParams {
                revision: saved.current.revision,
                text: "my next edits".into(),
                ..request.clone()
            },
        )
        .await
        .unwrap();
    assert!(!conflict.saved);
    assert_eq!(conflict.current.text, "external instructions");
    let accepted: InstructionSettingsWriteResponse = client
        .request(
            method::SETTINGS_INSTRUCTIONS_WRITE,
            InstructionSettingsWriteParams {
                revision: conflict.current.revision,
                text: "my next edits".into(),
                ..request.clone()
            },
        )
        .await
        .unwrap();
    assert!(accepted.saved);
    assert_eq!(
        std::fs::read(&project.profile.config_path).unwrap(),
        config_before
    );
    let cleared: InstructionSettingsWriteResponse = client
        .request(
            method::SETTINGS_INSTRUCTIONS_WRITE,
            InstructionSettingsWriteParams {
                root_key: root.root_key.clone(),
                scope: InstructionSettingsScope::User,
                revision: user_saved.current.revision,
                text: String::new(),
            },
        )
        .await
        .unwrap();
    assert!(cleared.saved && PathBuf::from(&cleared.current.path).is_file());
    let _: agiworkforce_protocol::developer_session::SettingsReadResponse = client
        .request(
            method::SETTINGS_WRITE,
            agiworkforce_protocol::developer_session::SettingsWriteParams {
                user_instructions: Some(String::new()),
                ..Default::default()
            },
        )
        .await
        .unwrap();
    assert!(!PathBuf::from(&cleared.current.path).exists());
    let account = RuntimeSession::connect_account(&binary, &contracts, Settings::load().unwrap())
        .await
        .unwrap();
    assert!(!account.capabilities().settings_instructions);
    unavailable(
        account
            .client()
            .request::<InstructionSettingsSnapshot>(
                method::SETTINGS_INSTRUCTIONS_READ,
                project_params,
            )
            .await,
    );
    unavailable(
        account
            .client()
            .request::<InstructionSettingsWriteResponse>(
                method::SETTINGS_INSTRUCTIONS_WRITE,
                request,
            )
            .await,
    );
    account.shutdown().await.unwrap();
    session.shutdown().await.unwrap();
}

#[tokio::test]
#[ignore = "run through the isolated packaged file editor runner"]
async fn real_workspace_editor_recovery_browser_discovers_missing_files_and_never_replaces_a_copy()
{
    assert_eq!(std::env::var("AGI_GPUI_FILES_FIXTURE").as_deref(), Ok("1"));
    let binary = PathBuf::from(std::env::var_os("AGI_GPUI_TEST_RUNTIME").unwrap());
    let repo = tempfile::tempdir().unwrap();
    std::fs::create_dir(repo.path().join("nested")).unwrap();
    std::fs::write(repo.path().join("nested/old.txt"), "original\r\n").unwrap();
    let contracts = NativeContracts::load().unwrap();
    let session = RuntimeSession::connect(
        &binary,
        repo.path(),
        consent_timestamp_ms().unwrap(),
        &contracts,
        Settings::load().unwrap(),
    )
    .await
    .unwrap();
    assert!(session.capabilities().workspace_file_recovery_browser);
    let client = session.client();
    let root: DeveloperWorkspaceIdentity = client
        .request(method::WORKSPACE_IDENTITY, serde_json::json!({}))
        .await
        .unwrap();
    let target = WorkspaceFileParams {
        root_key: root.root_key.clone(),
        path: "nested/old.txt".into(),
    };
    let file: WorkspaceFileResponse = client
        .request(method::WORKSPACE_FILE_READ, target.clone())
        .await
        .unwrap();
    let empty: WorkspaceFileRecoverySnapshot = client
        .request(method::WORKSPACE_FILE_RECOVERY_READ, target.clone())
        .await
        .unwrap();
    let saved: WorkspaceFileRecoveryWriteResponse = client
        .request(
            method::WORKSPACE_FILE_RECOVERY_WRITE,
            WorkspaceFileRecoveryWriteParams {
                root_key: root.root_key.clone(),
                path: target.path.clone(),
                epoch: empty.epoch,
                revision: None,
                change: WorkspaceFileRecoveryChange::Set {
                    value: WorkspaceFileRecovery {
                        base_revision: file.revision,
                        content: "\u{feff}retained 東京\r\n🦀".into(),
                    },
                },
            },
        )
        .await
        .unwrap();
    assert!(saved.accepted);
    std::fs::rename(repo.path().join("nested"), repo.path().join("moved")).unwrap();
    let listed: WorkspaceFileRecoveryListResponse = client
        .request(
            method::WORKSPACE_FILE_RECOVERY_LIST,
            WorkspaceFileRecoveryListParams {
                root_key: root.root_key.clone(),
            },
        )
        .await
        .unwrap();
    assert_eq!(listed.entries.len(), 1);
    assert_eq!(listed.entries[0].path, target.path);
    assert!(!listed.entries[0].source_available);
    let snapshot: WorkspaceFileRecoverySnapshot = client
        .request(method::WORKSPACE_FILE_RECOVERY_READ, target.clone())
        .await
        .unwrap();
    let params = WorkspaceFileRecoveryRestoreParams {
        root_key: root.root_key.clone(),
        path: target.path.clone(),
        epoch: snapshot.epoch.clone(),
        revision: snapshot.revision.clone().unwrap(),
        destination: "rescued.txt".into(),
    };
    let copied: WorkspaceFileRecoveryRestoreResponse = client
        .request(method::WORKSPACE_FILE_RECOVERY_RESTORE, params.clone())
        .await
        .unwrap();
    assert_eq!(copied.source_revision, params.revision);
    assert_eq!(
        std::fs::read_to_string(repo.path().join("rescued.txt")).unwrap(),
        "\u{feff}retained 東京\r\n🦀"
    );
    let refused = client
        .request::<WorkspaceFileRecoveryRestoreResponse>(
            method::WORKSPACE_FILE_RECOVERY_RESTORE,
            params.clone(),
        )
        .await
        .unwrap_err();
    let DeveloperSessionClientError::Remote {
        data: Some(data), ..
    } = refused
    else {
        panic!("The copy refusal lost its typed receipt");
    };
    let failure: WorkspaceFileRecoveryRestoreFailure = serde_json::from_value(data).unwrap();
    assert!(!failure.uncertain);
    assert_eq!(failure.destination, params.destination);
    assert_eq!(failure.root_key, params.root_key);
    let unchanged: WorkspaceFileRecoverySnapshot = client
        .request(method::WORKSPACE_FILE_RECOVERY_READ, target.clone())
        .await
        .unwrap();
    assert_eq!(unchanged, snapshot);
    let updated: WorkspaceFileRecoveryWriteResponse = client
        .request(
            method::WORKSPACE_FILE_RECOVERY_WRITE,
            WorkspaceFileRecoveryWriteParams {
                root_key: root.root_key.clone(),
                path: target.path.clone(),
                epoch: snapshot.epoch,
                revision: snapshot.revision,
                change: WorkspaceFileRecoveryChange::Set {
                    value: WorkspaceFileRecovery {
                        base_revision: "a".repeat(64),
                        content: "newer retained text".into(),
                    },
                },
            },
        )
        .await
        .unwrap();
    assert!(updated.accepted);
    let stale = WorkspaceFileRecoveryRestoreParams {
        destination: "must-not-exist.txt".into(),
        ..params.clone()
    };
    assert!(client
        .request::<WorkspaceFileRecoveryRestoreResponse>(
            method::WORKSPACE_FILE_RECOVERY_RESTORE,
            stale
        )
        .await
        .is_err());
    assert!(!repo.path().join("must-not-exist.txt").exists());
    let account = RuntimeSession::connect_account(&binary, &contracts, Settings::load().unwrap())
        .await
        .unwrap();
    assert!(!account.capabilities().workspace_file_recovery_browser);
    unavailable(
        account
            .client()
            .request::<WorkspaceFileRecoveryListResponse>(
                method::WORKSPACE_FILE_RECOVERY_LIST,
                WorkspaceFileRecoveryListParams {
                    root_key: root.root_key,
                },
            )
            .await,
    );
    unavailable(
        account
            .client()
            .request::<WorkspaceFileRecoveryRestoreResponse>(
                method::WORKSPACE_FILE_RECOVERY_RESTORE,
                params,
            )
            .await,
    );
    account.shutdown().await.unwrap();
    session.shutdown().await.unwrap();
    assert_eq!(
        std::fs::read_to_string(repo.path().join("moved/old.txt")).unwrap(),
        "original\r\n"
    );
}

#[tokio::test]
#[ignore = "run through the isolated packaged file editor runner"]
async fn real_workspace_editor_recovery_survives_process_restart_and_refuses_stale_replay() {
    assert_eq!(std::env::var("AGI_GPUI_FILES_FIXTURE").as_deref(), Ok("1"));
    let binary = PathBuf::from(std::env::var_os("AGI_GPUI_TEST_RUNTIME").unwrap());
    let repo = tempfile::tempdir().unwrap();
    let path = repo.path().join("recovery.txt");
    std::fs::write(&path, "original\r\n🦀").unwrap();
    let contracts = NativeContracts::load().unwrap();
    let session = RuntimeSession::connect(
        &binary,
        repo.path(),
        consent_timestamp_ms().unwrap(),
        &contracts,
        Settings::load().unwrap(),
    )
    .await
    .unwrap();
    assert!(session.capabilities().workspace_file_recovery);
    let client = session.client();
    let root: DeveloperWorkspaceIdentity = client
        .request(method::WORKSPACE_IDENTITY, serde_json::json!({}))
        .await
        .unwrap();
    let target = WorkspaceFileParams {
        root_key: root.root_key.clone(),
        path: "recovery.txt".into(),
    };
    let file: WorkspaceFileResponse = client
        .request(method::WORKSPACE_FILE_READ, target.clone())
        .await
        .unwrap();
    let snapshot: WorkspaceFileRecoverySnapshot = client
        .request(method::WORKSPACE_FILE_RECOVERY_READ, target.clone())
        .await
        .unwrap();
    let request = WorkspaceFileRecoveryWriteParams {
        root_key: target.root_key.clone(),
        path: target.path.clone(),
        epoch: snapshot.epoch.clone(),
        revision: None,
        change: WorkspaceFileRecoveryChange::Set {
            value: WorkspaceFileRecovery {
                base_revision: file.revision.clone(),
                content: "unsaved\r\n🦀 café".into(),
            },
        },
    };
    let saved: WorkspaceFileRecoveryWriteResponse = client
        .request(method::WORKSPACE_FILE_RECOVERY_WRITE, request.clone())
        .await
        .unwrap();
    assert!(saved.accepted);
    assert_eq!(std::fs::read_to_string(&path).unwrap(), file.content);
    session.shutdown().await.unwrap();

    let restarted = RuntimeSession::connect(
        &binary,
        repo.path(),
        consent_timestamp_ms().unwrap(),
        &contracts,
        Settings::load().unwrap(),
    )
    .await
    .unwrap();
    let client = restarted.client();
    let retained: WorkspaceFileRecoverySnapshot = client
        .request(method::WORKSPACE_FILE_RECOVERY_READ, target.clone())
        .await
        .unwrap();
    assert_eq!(retained, saved.current);
    std::fs::write(&path, "externally changed file").unwrap();
    let changed: WorkspaceFileResponse = client
        .request(method::WORKSPACE_FILE_READ, target.clone())
        .await
        .unwrap();
    let mut review = EditorRecovery::default();
    review
        .observe(&changed, &changed.content, retained.clone())
        .unwrap();
    assert!(review.review.is_some());
    assert!(review.begin(&changed, &changed.content).unwrap().is_none());
    assert!(client
        .request::<WorkspaceFileWriteResponse>(
            method::WORKSPACE_FILE_WRITE,
            WorkspaceFileWriteParams {
                root_key: target.root_key.clone(),
                path: target.path.clone(),
                revision: file.revision,
                content: retained.recovery.as_ref().unwrap().content.clone(),
            }
        )
        .await
        .is_err());
    assert_eq!(
        std::fs::read_to_string(&path).unwrap(),
        "externally changed file"
    );
    let cleared: WorkspaceFileRecoveryWriteResponse = client
        .request(
            method::WORKSPACE_FILE_RECOVERY_WRITE,
            WorkspaceFileRecoveryWriteParams {
                root_key: target.root_key.clone(),
                path: target.path.clone(),
                epoch: retained.epoch,
                revision: retained.revision,
                change: WorkspaceFileRecoveryChange::Clear,
            },
        )
        .await
        .unwrap();
    assert!(cleared.accepted);
    let replay: WorkspaceFileRecoveryWriteResponse = client
        .request(method::WORKSPACE_FILE_RECOVERY_WRITE, request.clone())
        .await
        .unwrap();
    assert!(!replay.accepted && replay.current.recovery.is_none());
    restarted.shutdown().await.unwrap();
    let account = RuntimeSession::connect_account(&binary, &contracts, Settings::load().unwrap())
        .await
        .unwrap();
    assert!(!account.capabilities().workspace_file_recovery);
    unavailable(
        account
            .client()
            .request::<WorkspaceFileRecoverySnapshot>(method::WORKSPACE_FILE_RECOVERY_READ, target)
            .await,
    );
    unavailable(
        account
            .client()
            .request::<WorkspaceFileRecoveryWriteResponse>(
                method::WORKSPACE_FILE_RECOVERY_WRITE,
                request,
            )
            .await,
    );
    account.shutdown().await.unwrap();
}

#[tokio::test]
#[ignore = "run through the isolated packaged file editor runner"]
async fn real_workspace_editor_pages_reads_saves_conflicts_and_refuses_escapes() {
    assert_eq!(std::env::var("AGI_GPUI_FILES_FIXTURE").as_deref(), Ok("1"));
    let binary = PathBuf::from(std::env::var_os("AGI_GPUI_TEST_RUNTIME").unwrap());
    let repo = tempfile::tempdir().unwrap();
    let outside = tempfile::tempdir().unwrap();
    std::fs::create_dir(repo.path().join("src")).unwrap();
    let path = repo.path().join("src/note.txt");
    let original = "\u{feff}first\r\nsecond 🦀\r\n";
    std::fs::write(&path, original).unwrap();
    std::fs::write(repo.path().join(".env"), "SECRET=fixture").unwrap();
    std::fs::write(repo.path().join("binary.dat"), b"\0binary").unwrap();
    std::fs::write(repo.path().join("readonly.txt"), "read only").unwrap();
    std::fs::write(repo.path().join("invalid.dat"), [0xff, 0xfe]).unwrap();
    std::fs::write(
        repo.path().join("large.txt"),
        vec![b'x'; MAX_EDITOR_TEXT_BYTES + 1],
    )
    .unwrap();
    std::fs::write(
        repo.path().join("limit.txt"),
        "🦀".repeat(MAX_EDITOR_TEXT_BYTES / 4),
    )
    .unwrap();
    std::fs::write(outside.path().join("outside.txt"), "outside").unwrap();
    for index in 0..WORKSPACE_DIRECTORY_PAGE_SIZE + 5 {
        std::fs::write(repo.path().join(format!("file-{index:04}")), "text").unwrap();
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::symlink;
        use std::os::unix::fs::PermissionsExt;
        std::fs::write(repo.path().join("back\\slash"), "unsupported name").unwrap();
        assert!(std::process::Command::new("mkfifo")
            .arg(repo.path().join("pipe"))
            .status()
            .unwrap()
            .success());
        std::fs::set_permissions(
            repo.path().join("readonly.txt"),
            std::fs::Permissions::from_mode(0o444),
        )
        .unwrap();
        symlink(outside.path(), repo.path().join("escape")).unwrap();
        std::fs::hard_link(
            outside.path().join("outside.txt"),
            repo.path().join("hardlink.txt"),
        )
        .unwrap();
        #[cfg(not(target_os = "macos"))]
        std::fs::write(
            repo.path().join({
                use std::os::unix::ffi::OsStringExt;
                std::ffi::OsString::from_vec(vec![0xff])
            }),
            "invalid name",
        )
        .unwrap();
    }
    let contracts = NativeContracts::load().unwrap();
    let session = RuntimeSession::connect(
        &binary,
        repo.path(),
        consent_timestamp_ms().unwrap(),
        &contracts,
        Settings::load().unwrap(),
    )
    .await
    .unwrap();
    assert!(session.capabilities().workspace_files);
    let client = session.client();
    let root: DeveloperWorkspaceIdentity = client
        .request(method::WORKSPACE_IDENTITY, serde_json::json!({}))
        .await
        .unwrap();
    let mut editor = FileEditor {
        root: Some(root.clone()),
        ..Default::default()
    };
    let mut after = None;
    let mut names = HashSet::new();
    let mut pages = 0;
    loop {
        let params = WorkspaceDirectoryParams {
            root_key: root.root_key.clone(),
            path: String::new(),
            after: after.clone(),
        };
        let page: WorkspaceDirectoryResponse = client
            .request(method::WORKSPACE_FILES_LIST, params.clone())
            .await
            .unwrap();
        editor.accept_directory(&params, page.clone()).unwrap();
        assert!(page.entries.len() <= WORKSPACE_DIRECTORY_PAGE_SIZE);
        pages += 1;
        #[cfg(all(unix, not(target_os = "macos")))]
        assert_eq!(page.omitted_names, 2);
        #[cfg(target_os = "macos")]
        assert_eq!(page.omitted_names, 1);
        for entry in &page.entries {
            assert!(names.insert(entry.name.clone()));
            if entry.name == ".env" || entry.name == "escape" {
                assert!(entry.blocked);
            }
        }
        after = page.next_after;
        if after.is_none() {
            break;
        }
        assert!(pages < 4);
    }
    assert_eq!(pages, 2);
    assert!(names.contains("src"));
    assert!(names.contains("file-0204"));
    let params = WorkspaceFileParams {
        root_key: root.root_key.clone(),
        path: "src/note.txt".into(),
    };
    let file: WorkspaceFileResponse = client
        .request(method::WORKSPACE_FILE_READ, params.clone())
        .await
        .unwrap();
    assert_eq!(file.content.as_bytes(), original.as_bytes());
    editor.accept_file(&params, file).unwrap();
    let changed = "\u{feff}edited\r\nUnicode 東京\r\n";
    let write = editor.write_params(changed.into()).unwrap();
    #[cfg(unix)]
    let metadata = {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o750)).unwrap();
        std::fs::metadata(&path).unwrap()
    };
    let response: WorkspaceFileWriteResponse = client
        .request(method::WORKSPACE_FILE_WRITE, write.clone())
        .await
        .unwrap();
    assert!(response.changed);
    editor.accept_save(write.clone(), response).unwrap();
    assert!(!editor.dirty(changed));
    assert_eq!(std::fs::read(&path).unwrap(), changed.as_bytes());
    #[cfg(unix)]
    {
        use std::os::unix::fs::{MetadataExt, PermissionsExt};
        let saved = std::fs::metadata(&path).unwrap();
        assert_eq!(metadata.ino(), saved.ino());
        assert_eq!(metadata.permissions().mode(), saved.permissions().mode());
    }
    let replay: WorkspaceFileWriteResponse = client
        .request(method::WORKSPACE_FILE_WRITE, write.clone())
        .await
        .unwrap();
    assert!(!replay.changed);
    let stale = editor.write_params("my unsaved text".into()).unwrap();
    std::fs::write(&path, "later external change").unwrap();
    assert!(client
        .request::<WorkspaceFileWriteResponse>(method::WORKSPACE_FILE_WRITE, stale)
        .await
        .is_err());
    assert!(editor.dirty("my unsaved text"));
    assert_eq!(
        std::fs::read_to_string(&path).unwrap(),
        "later external change"
    );
    for path in [
        "../outside.txt",
        "/etc/passwd",
        "src/../src/note.txt",
        ".env",
        "binary.dat",
        "invalid.dat",
        "large.txt",
    ] {
        assert!(
            client
                .request::<WorkspaceFileResponse>(
                    method::WORKSPACE_FILE_READ,
                    WorkspaceFileParams {
                        root_key: root.root_key.clone(),
                        path: path.into()
                    }
                )
                .await
                .is_err(),
            "{path}"
        );
    }
    #[cfg(unix)]
    for path in ["escape/outside.txt", "hardlink.txt", "pipe"] {
        assert!(client
            .request::<WorkspaceFileResponse>(
                method::WORKSPACE_FILE_READ,
                WorkspaceFileParams {
                    root_key: root.root_key.clone(),
                    path: path.into()
                }
            )
            .await
            .is_err());
    }
    let limit: WorkspaceFileResponse = client
        .request(
            method::WORKSPACE_FILE_READ,
            WorkspaceFileParams {
                root_key: root.root_key.clone(),
                path: "limit.txt".into(),
            },
        )
        .await
        .unwrap();
    #[cfg(unix)]
    {
        let readonly: WorkspaceFileResponse = client
            .request(
                method::WORKSPACE_FILE_READ,
                WorkspaceFileParams {
                    root_key: root.root_key.clone(),
                    path: "readonly.txt".into(),
                },
            )
            .await
            .unwrap();
        assert!(client
            .request::<WorkspaceFileWriteResponse>(
                method::WORKSPACE_FILE_WRITE,
                WorkspaceFileWriteParams {
                    root_key: root.root_key.clone(),
                    path: "readonly.txt".into(),
                    revision: readonly.revision,
                    content: "overwrite".into()
                }
            )
            .await
            .is_err());
        assert_eq!(
            std::fs::read_to_string(repo.path().join("readonly.txt")).unwrap(),
            "read only"
        );
    }
    assert_eq!(limit.content.len(), MAX_EDITOR_TEXT_BYTES);
    assert!(client
        .request::<WorkspaceFileWriteResponse>(
            method::WORKSPACE_FILE_WRITE,
            WorkspaceFileWriteParams {
                root_key: root.root_key.clone(),
                path: "limit.txt".into(),
                revision: limit.revision,
                content: "x".repeat(MAX_EDITOR_TEXT_BYTES + 1)
            }
        )
        .await
        .is_err());
    assert!(client
        .request::<WorkspaceFileResponse>(
            method::WORKSPACE_FILE_READ,
            WorkspaceFileParams {
                root_key: "another-root".into(),
                path: params.path.clone()
            }
        )
        .await
        .is_err());
    std::fs::remove_file(&path).unwrap();
    assert!(client
        .request::<WorkspaceFileWriteResponse>(method::WORKSPACE_FILE_WRITE, write)
        .await
        .is_err());
    assert!(!path.exists());
    session.shutdown().await.unwrap();
    let account = RuntimeSession::connect_account(&binary, &contracts, Settings::load().unwrap())
        .await
        .unwrap();
    assert!(!account.capabilities().workspace_files);
    unavailable(
        account
            .client()
            .request::<WorkspaceFileWriteResponse>(
                method::WORKSPACE_FILE_WRITE,
                WorkspaceFileWriteParams {
                    root_key: root.root_key.clone(),
                    path: "readonly.txt".into(),
                    revision: "ungranted".into(),
                    content: "must not write".into(),
                },
            )
            .await,
    );
    unavailable(
        account
            .client()
            .request::<WorkspaceFileResponse>(method::WORKSPACE_FILE_READ, params)
            .await,
    );
    unavailable(
        account
            .client()
            .request::<WorkspaceDirectoryResponse>(
                method::WORKSPACE_FILES_LIST,
                WorkspaceDirectoryParams {
                    root_key: root.root_key,
                    path: String::new(),
                    after: None,
                },
            )
            .await,
    );
    account.shutdown().await.unwrap();
    assert_eq!(
        std::fs::read_to_string(outside.path().join("outside.txt")).unwrap(),
        "outside"
    );
}
