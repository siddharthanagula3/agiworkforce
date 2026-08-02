use agiworkforce_app_server::DeveloperSessionHost;
use agiworkforce_cli::app_server::CliDeveloperSessionHost;
use agiworkforce_cli::config::CliConfig;
use agiworkforce_cli::runtime::session_control::{ManagedSessionReference, ManagedSessionStore};
use agiworkforce_protocol::developer_session::{
    AppServerClientInfo, DeveloperSessionSource, ThreadForkParams, ThreadIdParams,
    ThreadListParams, ThreadStartParams, ThreadStatus, TurnStartParams,
};
use tempfile::tempdir;

#[tokio::test]
async fn cli_and_vscode_share_one_persisted_thread_store() {
    let temp = tempdir().expect("temp store");
    let workspace = std::env::current_dir().expect("workspace");
    let store = ManagedSessionStore::new(temp.path().to_path_buf());
    let host = CliDeveloperSessionHost::new_with_store(
        CliConfig::default(),
        workspace.clone(),
        store,
        false,
    )
    .expect("host");

    let started = host
        .start_thread(
            ThreadStartParams {
                model: None,
                provider: None,
                cwd: Some(workspace.display().to_string()),
                title: Some("Fix the parser".to_string()),
            },
            AppServerClientInfo {
                name: "agi_vscode".to_string(),
                title: "AGI for VS Code".to_string(),
                version: "0.3.0".to_string(),
            },
        )
        .await
        .expect("start thread");
    assert_eq!(started.title, "Fix the parser");
    assert_eq!(started.created_by, DeveloperSessionSource::Vscode);

    let readable = host
        .read_thread(ThreadIdParams {
            thread_id: started.id.clone(),
        })
        .await
        .expect("read thread");
    assert_eq!(readable.thread.id, started.id);
    assert!(
        readable
            .messages
            .iter()
            .all(|message| message.role != "system"),
        "internal system instructions must never cross the app-server boundary"
    );

    let listed = host
        .list_threads(ThreadListParams::default())
        .await
        .expect("list threads");
    assert_eq!(listed.threads.len(), 1);
    assert_eq!(listed.threads[0].id, started.id);

    let resumed = host
        .resume_thread(ThreadIdParams {
            thread_id: started.id.clone(),
        })
        .await
        .expect("resume thread");
    assert_eq!(resumed.id, started.id);

    let forked = host
        .fork_thread(
            ThreadForkParams {
                thread_id: started.id,
                title: Some("Try another approach".to_string()),
            },
            AppServerClientInfo {
                name: "agi_vscode".to_string(),
                title: "AGI for VS Code".to_string(),
                version: "0.3.0".to_string(),
            },
        )
        .await
        .expect("fork thread");
    assert_ne!(forked.id, resumed.id);
    assert_eq!(forked.title, "Try another approach");
    assert_eq!(forked.created_by, DeveloperSessionSource::Vscode);

    host.archive_thread(ThreadIdParams {
        thread_id: forked.id.clone(),
    })
    .await
    .expect("archive thread");
    let visible = host
        .list_threads(ThreadListParams::default())
        .await
        .expect("list visible");
    assert_eq!(visible.threads.len(), 1);

    let with_archived = host
        .list_threads(ThreadListParams {
            include_archived: true,
            ..ThreadListParams::default()
        })
        .await
        .expect("list archived");
    assert_eq!(with_archived.threads.len(), 2);
    assert_eq!(
        with_archived
            .threads
            .iter()
            .find(|thread| thread.id == forked.id)
            .expect("forked thread")
            .status,
        ThreadStatus::Archived
    );
}

#[tokio::test]
async fn auto_model_selection_is_resolved_before_a_thread_is_persisted() {
    const REQUESTED_MODEL: &str = "auto-balanced";

    let temp = tempdir().expect("temp store");
    let workspace = std::env::current_dir().expect("workspace");
    let store = ManagedSessionStore::new(temp.path().to_path_buf());
    let mut config = CliConfig::default();
    config.default.provider = "anthropic".to_string();
    let host =
        CliDeveloperSessionHost::new_with_store(config, workspace.clone(), store.clone(), false)
            .expect("host");

    let started = host
        .start_thread(
            ThreadStartParams {
                model: Some(REQUESTED_MODEL.to_string()),
                provider: None,
                cwd: Some(workspace.display().to_string()),
                title: Some("Resolve Auto".to_string()),
            },
            AppServerClientInfo {
                name: "agi_vscode".to_string(),
                title: "AGI for VS Code".to_string(),
                version: "0.3.0".to_string(),
            },
        )
        .await
        .expect("start auto thread");

    // Presentation clients retain the user's Auto selection so subsequent
    // turns keep routing through the same policy instead of pinning the first
    // concrete route. Execution authority is persisted separately below.
    assert_eq!(started.model.as_deref(), Some(REQUESTED_MODEL));

    let expected = agiworkforce_cli::model_catalog::resolve_auto_model(
        REQUESTED_MODEL,
        agiworkforce_model_registry::RoutingTaskType::Coding,
        "byok",
        agiworkforce_model_registry::TrustMode::Byok,
    )
    .expect("catalog-backed BYOK coding route");
    let persisted = store
        .load(ManagedSessionReference::SessionId(started.id))
        .expect("persisted auto thread");
    let persisted_model = persisted.model.expect("concrete persisted model");
    assert_eq!(persisted_model, expected.provider_model_id);
    assert!(!agiworkforce_model_registry::is_auto_routing_selection(
        &persisted_model
    ));
    let auto_routing = persisted.auto_routing.expect("persisted Auto metadata");
    assert_eq!(auto_routing.selection, REQUESTED_MODEL);
    assert_eq!(auto_routing.model_key, expected.model_key);
}

#[tokio::test]
async fn a_workspace_scoped_host_cannot_fork_or_archive_another_workspace_thread() {
    let temp = tempdir().expect("temp store");
    let workspace_a = tempdir().expect("workspace A");
    let workspace_b = tempdir().expect("workspace B");
    let store = ManagedSessionStore::new(temp.path().to_path_buf());
    let host_a = CliDeveloperSessionHost::new_with_store(
        CliConfig::default(),
        workspace_a.path().to_path_buf(),
        store.clone(),
        false,
    )
    .expect("host A");
    let host_b = CliDeveloperSessionHost::new_with_store(
        CliConfig::default(),
        workspace_b.path().to_path_buf(),
        store,
        false,
    )
    .expect("host B");
    let client = AppServerClientInfo {
        name: "agi_vscode".to_string(),
        title: "AGI for VS Code".to_string(),
        version: "0.3.0".to_string(),
    };

    let thread = host_a
        .start_thread(
            ThreadStartParams {
                model: None,
                provider: None,
                cwd: Some(workspace_a.path().display().to_string()),
                title: Some("Workspace A".to_string()),
            },
            client.clone(),
        )
        .await
        .expect("workspace A thread");

    let fork_error = host_b
        .fork_thread(
            ThreadForkParams {
                thread_id: thread.id.clone(),
                title: None,
            },
            client,
        )
        .await
        .expect_err("a host must not fork a thread owned by a different workspace");
    assert!(
        !fork_error
            .message()
            .contains(&workspace_a.path().display().to_string()),
        "cross-workspace errors must not disclose the owning workspace path"
    );
    assert!(
        host_b
            .archive_thread(ThreadIdParams {
                thread_id: thread.id.clone(),
            })
            .await
            .is_err(),
        "a host must not archive a thread owned by a different workspace"
    );
    let leaked = host_b
        .list_threads(ThreadListParams::default())
        .await
        .expect("workspace B list");
    assert!(
        leaked.threads.is_empty(),
        "a workspace host must never enumerate another workspace's threads"
    );
    assert_eq!(
        host_a
            .resume_thread(ThreadIdParams {
                thread_id: thread.id,
            })
            .await
            .expect("workspace A still owns thread")
            .status,
        ThreadStatus::Idle
    );
}

#[tokio::test]
async fn a_turn_rejects_context_files_outside_its_workspace() {
    let session_store = tempdir().expect("session store");
    let workspace = tempdir().expect("workspace");
    let outside = tempfile::NamedTempFile::new().expect("outside context file");
    let host = CliDeveloperSessionHost::new_with_store(
        CliConfig::default(),
        workspace.path().to_path_buf(),
        ManagedSessionStore::new(session_store.path().to_path_buf()),
        false,
    )
    .expect("host");
    let thread = host
        .start_thread(
            ThreadStartParams {
                model: None,
                provider: None,
                cwd: Some(workspace.path().display().to_string()),
                title: Some("Scoped context".to_string()),
            },
            AppServerClientInfo {
                name: "agi_vscode".to_string(),
                title: "AGI for VS Code".to_string(),
                version: "0.3.0".to_string(),
            },
        )
        .await
        .expect("thread");
    let params: TurnStartParams = serde_json::from_value(serde_json::json!({
        "threadId": thread.id,
        "input": [{"type": "text", "text": "inspect it"}],
        "contextFiles": [outside.path()]
    }))
    .expect("turn params");

    let error = host
        .start_turn(params)
        .await
        .expect_err("out-of-workspace context must be rejected before inference");
    assert!(error.message().contains("outside the app-server workspace"));
}
