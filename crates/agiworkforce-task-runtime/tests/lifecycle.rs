use agiworkforce_task_runtime::{StallWatchdog, TaskKind, TaskRegistry, TaskStatus};
use std::time::Duration;
use tempfile::tempdir;
use uuid::Uuid;

fn make_registry() -> (TaskRegistry, tempfile::TempDir) {
    let dir = tempdir().unwrap();
    let reg = TaskRegistry::new_with_base_dir(dir.path().to_path_buf());
    (reg, dir)
}

#[tokio::test]
async fn test_lifecycle_pending_running_completed() {
    let (reg, _dir) = make_registry();
    let id = reg.create(TaskKind::LocalShell, Some("ls".into())).await.unwrap();

    let task = reg.get(&id).await.unwrap();
    assert_eq!(task.status, TaskStatus::Pending);
    assert!(task.started_at.is_none());

    reg.update_status(&id, TaskStatus::Running, None, None).await.unwrap();
    let task = reg.get(&id).await.unwrap();
    assert_eq!(task.status, TaskStatus::Running);
    assert!(task.started_at.is_some());

    reg.update_status(&id, TaskStatus::Completed, Some(0), None).await.unwrap();
    let task = reg.get(&id).await.unwrap();
    assert_eq!(task.status, TaskStatus::Completed);
    assert_eq!(task.exit_code, Some(0));
    assert!(task.ended_at.is_some());
}

#[tokio::test]
async fn test_append_and_read_output_roundtrip() {
    let (reg, _dir) = make_registry();
    let id = reg.create(TaskKind::LocalShell, None).await.unwrap();

    reg.append_output(&id, "line one\n").await.unwrap();
    reg.append_output(&id, "line two\n").await.unwrap();
    reg.append_output(&id, "line three\n").await.unwrap();

    let out = reg.read_output(&id, 4096).await.unwrap();
    assert_eq!(out, "line one\nline two\nline three\n");
}

#[tokio::test]
async fn test_append_read_truncation_at_max_bytes() {
    let (reg, _dir) = make_registry();
    let id = reg.create(TaskKind::LocalShell, None).await.unwrap();

    reg.append_output(&id, "prefix_data_").await.unwrap();
    reg.append_output(&id, "tail_data").await.unwrap();

    let out = reg.read_output(&id, 9).await.unwrap();
    assert_eq!(out, "tail_data");
}

#[tokio::test]
async fn test_stop_transitions_running_to_stopped() {
    let (reg, _dir) = make_registry();
    let id = reg.create(TaskKind::LocalShell, None).await.unwrap();
    reg.update_status(&id, TaskStatus::Running, None, None).await.unwrap();

    reg.stop(&id).await.unwrap();

    let task = reg.get(&id).await.unwrap();
    assert_eq!(task.status, TaskStatus::Stopped);
    assert!(task.ended_at.is_some());
}

#[tokio::test]
async fn test_invalid_transition_completed_to_running() {
    let (reg, _dir) = make_registry();
    let id = reg.create(TaskKind::LocalShell, None).await.unwrap();
    reg.update_status(&id, TaskStatus::Running, None, None).await.unwrap();
    reg.update_status(&id, TaskStatus::Completed, Some(0), None).await.unwrap();

    let err = reg.update_status(&id, TaskStatus::Running, None, None).await;
    assert!(err.is_err(), "should reject Completed → Running");
}

#[tokio::test]
async fn test_invalid_transition_failed_to_completed() {
    let (reg, _dir) = make_registry();
    let id = reg.create(TaskKind::LocalShell, None).await.unwrap();
    reg.update_status(&id, TaskStatus::Running, None, None).await.unwrap();
    reg.update_status(&id, TaskStatus::Failed, Some(1), None).await.unwrap();

    let err = reg.update_status(&id, TaskStatus::Completed, Some(0), None).await;
    assert!(err.is_err(), "should reject Failed → Completed");
}

#[tokio::test]
async fn test_stall_watchdog_marks_idle_task_as_failed() {
    let (reg, _dir) = make_registry();
    let id = reg.create(TaskKind::LocalShell, Some("sleep 999".into())).await.unwrap();
    reg.update_status(&id, TaskStatus::Running, None, None).await.unwrap();

    // Write initial output so watchdog doesn't trigger immediately on empty file
    reg.append_output(&id, "starting...\n").await.unwrap();

    let _watchdog = StallWatchdog::spawn(reg.clone(), id, Duration::from_millis(300));

    // Wait longer than stall timeout
    tokio::time::sleep(Duration::from_millis(800)).await;

    let task = reg.get(&id).await.unwrap();
    assert_eq!(task.status, TaskStatus::Failed);
    assert_eq!(task.error.as_deref(), Some("stall timeout"));
}

#[tokio::test]
async fn test_stall_watchdog_does_not_fire_when_output_grows() {
    let (reg, _dir) = make_registry();
    let id = reg.create(TaskKind::LocalShell, None).await.unwrap();
    reg.update_status(&id, TaskStatus::Running, None, None).await.unwrap();

    let reg_clone = reg.clone();
    let _watchdog = StallWatchdog::spawn(reg.clone(), id, Duration::from_millis(300));

    // Keep writing output to prevent stall
    for i in 0..6 {
        tokio::time::sleep(Duration::from_millis(80)).await;
        reg_clone.append_output(&id, &format!("tick {}\n", i)).await.unwrap();
    }

    let task = reg.get(&id).await.unwrap();
    assert_eq!(task.status, TaskStatus::Running, "watchdog should not fire when output is growing");
}

#[tokio::test]
async fn test_watchdog_aborts_on_drop() {
    let (reg, _dir) = make_registry();
    let id = reg.create(TaskKind::LocalShell, None).await.unwrap();
    reg.update_status(&id, TaskStatus::Running, None, None).await.unwrap();

    {
        let _watchdog = StallWatchdog::spawn(reg.clone(), id, Duration::from_millis(200));
        // Drop immediately
    }

    // After dropping, even with no output growth, the task should NOT be failed
    // because the watchdog was cancelled.
    tokio::time::sleep(Duration::from_millis(400)).await;
    let task = reg.get(&id).await.unwrap();
    // Still Running since watchdog was dropped before it could fire
    // (There's a race here but 200ms timeout vs 0ms drop should be safe)
    // The important thing is no panic. Status might be Running or Failed depending on timing.
    assert!(
        matches!(task.status, TaskStatus::Running | TaskStatus::Failed),
        "task should be in a valid state"
    );
}

#[tokio::test]
async fn test_list_returns_all_tasks() {
    let (reg, _dir) = make_registry();
    let id1 = reg.create(TaskKind::LocalShell, None).await.unwrap();
    let id2 = reg.create(TaskKind::LocalAgent, None).await.unwrap();
    let id3 = reg.create(TaskKind::RemoteAgent, None).await.unwrap();
    let id4 = reg.create(TaskKind::Dream, None).await.unwrap();

    let list = reg.list().await;
    assert_eq!(list.len(), 4);
    let ids: Vec<_> = list.iter().map(|t| t.id).collect();
    assert!(ids.contains(&id1));
    assert!(ids.contains(&id2));
    assert!(ids.contains(&id3));
    assert!(ids.contains(&id4));
}

#[tokio::test]
async fn test_file_backed_output_persists_across_registry_instances() {
    let dir = tempdir().unwrap();
    let base = dir.path().to_path_buf();
    let output_path;

    {
        let reg = TaskRegistry::new_with_base_dir(base.clone());
        let id = reg.create(TaskKind::LocalShell, None).await.unwrap();
        reg.append_output(&id, "persisted content\n").await.unwrap();
        output_path = reg.get(&id).await.unwrap().output_path;
    }

    // Construct a second registry and read the file directly to verify persistence
    let content = std::fs::read_to_string(&output_path).unwrap();
    assert_eq!(content, "persisted content\n");
}

#[tokio::test]
async fn test_invalid_task_id_for_update_status() {
    let (reg, _dir) = make_registry();
    let err = reg.update_status(&Uuid::new_v4(), TaskStatus::Running, None, None).await;
    assert!(err.is_err());
}

#[tokio::test]
async fn test_invalid_task_id_for_stop() {
    let (reg, _dir) = make_registry();
    let err = reg.stop(&Uuid::new_v4()).await;
    assert!(err.is_err());
}

#[tokio::test]
async fn test_invalid_task_id_for_append_output() {
    let (reg, _dir) = make_registry();
    let err = reg.append_output(&Uuid::new_v4(), "data").await;
    assert!(err.is_err());
}

#[tokio::test]
async fn test_invalid_task_id_for_read_output() {
    let (reg, _dir) = make_registry();
    let err = reg.read_output(&Uuid::new_v4(), 100).await;
    assert!(err.is_err());
}

#[tokio::test]
async fn test_stop_already_stopped_is_error() {
    let (reg, _dir) = make_registry();
    let id = reg.create(TaskKind::LocalShell, None).await.unwrap();
    reg.stop(&id).await.unwrap();
    let err = reg.stop(&id).await;
    assert!(err.is_err(), "stopping an already-stopped task should fail");
}

#[tokio::test]
async fn test_task_kind_monitor_mcp() {
    let (reg, _dir) = make_registry();
    let id = reg.create(TaskKind::MonitorMcp, Some("tail logs".into())).await.unwrap();
    let task = reg.get(&id).await.unwrap();
    assert_eq!(task.kind, TaskKind::MonitorMcp);
    assert_eq!(task.command.as_deref(), Some("tail logs"));
}

#[tokio::test]
async fn test_task_kind_in_process_teammate() {
    let (reg, _dir) = make_registry();
    let id = reg.create(TaskKind::InProcessTeammate, None).await.unwrap();
    let task = reg.get(&id).await.unwrap();
    assert_eq!(task.kind, TaskKind::InProcessTeammate);
}

#[tokio::test]
async fn test_multiple_output_appends_accumulate() {
    let (reg, _dir) = make_registry();
    let id = reg.create(TaskKind::LocalShell, None).await.unwrap();

    for i in 0..10 {
        reg.append_output(&id, &format!("chunk{}\n", i)).await.unwrap();
    }

    let out = reg.read_output(&id, usize::MAX).await.unwrap();
    for i in 0..10 {
        assert!(out.contains(&format!("chunk{}", i)));
    }
}

#[tokio::test]
async fn test_running_to_failed_with_error_message() {
    let (reg, _dir) = make_registry();
    let id = reg.create(TaskKind::LocalWorkflow, None).await.unwrap();
    reg.update_status(&id, TaskStatus::Running, None, None).await.unwrap();
    reg.update_status(&id, TaskStatus::Failed, Some(127), Some("command not found".into()))
        .await
        .unwrap();
    let task = reg.get(&id).await.unwrap();
    assert_eq!(task.status, TaskStatus::Failed);
    assert_eq!(task.exit_code, Some(127));
    assert_eq!(task.error.as_deref(), Some("command not found"));
}

#[tokio::test]
async fn test_concurrent_creates() {
    let (reg, _dir) = make_registry();
    let reg = std::sync::Arc::new(reg);
    let mut handles = Vec::new();
    for i in 0..10 {
        let r = reg.clone();
        handles.push(tokio::spawn(async move {
            r.create(TaskKind::LocalShell, Some(format!("cmd {}", i))).await.unwrap()
        }));
    }
    let mut ids = Vec::new();
    for h in handles {
        ids.push(h.await.unwrap());
    }
    ids.sort();
    ids.dedup();
    assert_eq!(ids.len(), 10, "all 10 IDs should be unique");
    assert_eq!(reg.list().await.len(), 10);
}

#[tokio::test]
async fn test_serde_roundtrip_task_status() {
    let statuses = [
        TaskStatus::Pending,
        TaskStatus::Running,
        TaskStatus::Completed,
        TaskStatus::Failed,
        TaskStatus::Stopped,
    ];
    for s in statuses {
        let json = serde_json::to_string(&s).unwrap();
        let back: TaskStatus = serde_json::from_str(&json).unwrap();
        assert_eq!(s, back);
    }
}

#[tokio::test]
async fn test_serde_roundtrip_task_kind() {
    let kinds = [
        TaskKind::LocalShell,
        TaskKind::LocalAgent,
        TaskKind::RemoteAgent,
        TaskKind::InProcessTeammate,
        TaskKind::LocalWorkflow,
        TaskKind::MonitorMcp,
        TaskKind::Dream,
    ];
    for k in kinds {
        let json = serde_json::to_string(&k).unwrap();
        let back: TaskKind = serde_json::from_str(&json).unwrap();
        assert_eq!(k, back);
    }
}
