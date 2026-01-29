//! Undo System Tests for AGI Workforce
//!
//! Comprehensive tests for the undo system which is critical for the product's
//! safety guarantees. The undo system enables full autonomy by ensuring all
//! AGI actions can be reversed if something goes wrong.
//!
//! Test coverage includes:
//! - Action recording and storage (ChangeTracker)
//! - Reversion/rollback functionality (UndoManager)
//! - Partial rollback failure handling
//! - Undo stack management
//! - Edge cases and error handling

#[cfg(test)]
#[allow(unused_variables, unused_mut, unused_imports)]
mod tests {
    use crate::core::agent::change_tracker::{Change, ChangeTracker, ChangeType};
    use crate::core::agent::undo_manager::{UndoManager, UndoResult, UndoSummary, UndoableChange};
    use std::collections::HashMap;
    use std::path::PathBuf;
    use std::sync::Arc;
    use tempfile::TempDir;
    use tokio::fs;

    // =========================================================================
    // ChangeTracker Tests - Action Recording and Storage
    // =========================================================================

    #[tokio::test]
    async fn test_change_tracker_creation() {
        let tracker = ChangeTracker::new();
        let changes = tracker.get_all_changes().await;
        assert!(changes.is_empty(), "New tracker should have no changes");
    }

    #[tokio::test]
    async fn test_record_file_created() {
        let tracker = ChangeTracker::new();
        let path = PathBuf::from("/tmp/test_file.txt");
        let content = "Hello, World!".to_string();
        let task_id = "task-123".to_string();

        let change_id = tracker
            .record_file_created(path.clone(), content.clone(), task_id.clone())
            .await;

        assert!(!change_id.is_empty(), "Should return a non-empty change ID");

        let changes = tracker.get_all_changes().await;
        assert_eq!(changes.len(), 1, "Should have exactly one change");

        let change = &changes[0];
        assert_eq!(change.id, change_id);
        assert_eq!(change.task_id, task_id);
        assert_eq!(change.path.as_ref().unwrap(), &path);
        assert!(matches!(change.change_type, ChangeType::FileCreated));
        assert!(change.can_revert, "File creation should be revertible");
        assert!(!change.reverted, "Change should not be marked as reverted");
        assert!(change.before_content.is_none());
        assert_eq!(change.after_content.as_ref().unwrap(), &content);
    }

    #[tokio::test]
    async fn test_record_file_modified() {
        let tracker = ChangeTracker::new();
        let path = PathBuf::from("/tmp/test_file.txt");
        let before = "Original content".to_string();
        let after = "Modified content".to_string();
        let task_id = "task-456".to_string();

        let change_id = tracker
            .record_file_modified(path.clone(), before.clone(), after.clone(), task_id.clone())
            .await;

        let changes = tracker.get_all_changes().await;
        assert_eq!(changes.len(), 1);

        let change = &changes[0];
        assert_eq!(change.id, change_id);
        assert!(matches!(change.change_type, ChangeType::FileModified));
        assert_eq!(change.before_content.as_ref().unwrap(), &before);
        assert_eq!(change.after_content.as_ref().unwrap(), &after);
        assert!(change.can_revert);
    }

    #[tokio::test]
    async fn test_record_file_deleted() {
        let tracker = ChangeTracker::new();
        let path = PathBuf::from("/tmp/deleted_file.txt");
        let content = "Content before deletion".to_string();
        let task_id = "task-789".to_string();

        let change_id = tracker
            .record_file_deleted(path.clone(), content.clone(), task_id.clone())
            .await;

        let changes = tracker.get_all_changes().await;
        assert_eq!(changes.len(), 1);

        let change = &changes[0];
        assert_eq!(change.id, change_id);
        assert!(matches!(change.change_type, ChangeType::FileDeleted));
        assert_eq!(change.before_content.as_ref().unwrap(), &content);
        assert!(change.after_content.is_none());
        assert!(change.can_revert);
    }

    #[tokio::test]
    async fn test_record_command_executed() {
        let tracker = ChangeTracker::new();
        let command = "echo 'hello'".to_string();
        let working_dir = PathBuf::from("/home/user");
        let task_id = "task-cmd".to_string();

        let change_id = tracker
            .record_command_executed(command.clone(), working_dir.clone(), task_id.clone())
            .await;

        let changes = tracker.get_all_changes().await;
        assert_eq!(changes.len(), 1);

        let change = &changes[0];
        assert_eq!(change.id, change_id);
        assert!(matches!(
            &change.change_type,
            ChangeType::CommandExecuted { command: cmd, .. } if *cmd == command
        ));
        // Commands cannot be automatically undone
        assert!(!change.can_revert, "Command execution should not be auto-revertible");
    }

    #[tokio::test]
    async fn test_record_git_commit() {
        let tracker = ChangeTracker::new();
        let repo_path = PathBuf::from("/home/user/project");
        let hash = "abc123def456".to_string();
        let message = "feat: add new feature".to_string();
        let task_id = "task-git".to_string();

        let change_id = tracker
            .record_git_commit(repo_path.clone(), hash.clone(), message.clone(), task_id.clone())
            .await;

        let changes = tracker.get_all_changes().await;
        assert_eq!(changes.len(), 1);

        let change = &changes[0];
        assert_eq!(change.id, change_id);
        assert!(matches!(
            &change.change_type,
            ChangeType::GitCommit { hash: h, message: m } if *h == hash && *m == message
        ));
        // Git commits should be reverted with git revert, not auto-undone
        assert!(!change.can_revert);
    }

    #[tokio::test]
    async fn test_record_git_checkout() {
        let tracker = ChangeTracker::new();
        let repo_path = PathBuf::from("/home/user/project");
        let branch = "feature/new-branch".to_string();
        let task_id = "task-checkout".to_string();

        let _change_id = tracker
            .record_git_checkout(repo_path.clone(), branch.clone(), task_id.clone())
            .await;

        let changes = tracker.get_all_changes().await;
        assert_eq!(changes.len(), 1);

        let change = &changes[0];
        assert!(matches!(
            &change.change_type,
            ChangeType::GitCheckout { branch: b } if *b == branch
        ));
        assert!(!change.can_revert);
    }

    #[tokio::test]
    async fn test_get_task_changes() {
        let tracker = ChangeTracker::new();

        // Record changes for different tasks
        tracker
            .record_file_created(
                PathBuf::from("/tmp/file1.txt"),
                "content1".to_string(),
                "task-A".to_string(),
            )
            .await;
        tracker
            .record_file_created(
                PathBuf::from("/tmp/file2.txt"),
                "content2".to_string(),
                "task-B".to_string(),
            )
            .await;
        tracker
            .record_file_modified(
                PathBuf::from("/tmp/file3.txt"),
                "before".to_string(),
                "after".to_string(),
                "task-A".to_string(),
            )
            .await;

        let task_a_changes = tracker.get_task_changes("task-A").await;
        assert_eq!(task_a_changes.len(), 2, "Task A should have 2 changes");

        let task_b_changes = tracker.get_task_changes("task-B").await;
        assert_eq!(task_b_changes.len(), 1, "Task B should have 1 change");

        let task_c_changes = tracker.get_task_changes("task-C").await;
        assert!(task_c_changes.is_empty(), "Task C should have no changes");
    }

    #[tokio::test]
    async fn test_get_revertible_changes() {
        let tracker = ChangeTracker::new();

        // Record both revertible and non-revertible changes
        tracker
            .record_file_created(
                PathBuf::from("/tmp/file1.txt"),
                "content1".to_string(),
                "task-1".to_string(),
            )
            .await;
        tracker
            .record_command_executed(
                "ls".to_string(),
                PathBuf::from("/tmp"),
                "task-1".to_string(),
            )
            .await;
        tracker
            .record_file_modified(
                PathBuf::from("/tmp/file2.txt"),
                "before".to_string(),
                "after".to_string(),
                "task-2".to_string(),
            )
            .await;

        // Get all revertible changes
        let revertible = tracker.get_revertible_changes(None).await;
        assert_eq!(
            revertible.len(),
            2,
            "Should have 2 revertible changes (file created and modified)"
        );

        // Get revertible changes for specific task
        let task1_revertible = tracker.get_revertible_changes(Some("task-1")).await;
        assert_eq!(
            task1_revertible.len(),
            1,
            "Task 1 should have 1 revertible change"
        );
    }

    #[tokio::test]
    async fn test_mark_reverted() {
        let tracker = ChangeTracker::new();

        let change_id = tracker
            .record_file_created(
                PathBuf::from("/tmp/file.txt"),
                "content".to_string(),
                "task-1".to_string(),
            )
            .await;

        // Before marking as reverted
        let revertible = tracker.get_revertible_changes(None).await;
        assert_eq!(revertible.len(), 1);

        // Mark as reverted
        let result = tracker.mark_reverted(&change_id).await;
        assert!(result.is_ok());

        // After marking as reverted
        let revertible = tracker.get_revertible_changes(None).await;
        assert!(revertible.is_empty(), "Should have no revertible changes after marking reverted");

        // Verify the change is marked as reverted
        let changes = tracker.get_all_changes().await;
        assert!(changes[0].reverted);
    }

    #[tokio::test]
    async fn test_mark_reverted_nonexistent() {
        let tracker = ChangeTracker::new();

        let result = tracker.mark_reverted("nonexistent-id").await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Change not found"));
    }

    #[tokio::test]
    async fn test_multiple_changes_ordering() {
        let tracker = ChangeTracker::new();

        // Record changes in sequence
        for i in 0..5 {
            tracker
                .record_file_created(
                    PathBuf::from(format!("/tmp/file{}.txt", i)),
                    format!("content{}", i),
                    "task-order".to_string(),
                )
                .await;
        }

        let changes = tracker.get_all_changes().await;
        assert_eq!(changes.len(), 5);

        // Verify chronological ordering (earlier changes first)
        for i in 0..4 {
            assert!(
                changes[i].timestamp <= changes[i + 1].timestamp,
                "Changes should be in chronological order"
            );
        }
    }

    // =========================================================================
    // UndoManager Tests - Reversion/Rollback Functionality
    // =========================================================================

    #[tokio::test]
    async fn test_undo_manager_creation() {
        let tracker = Arc::new(ChangeTracker::new());
        let manager = UndoManager::new(tracker.clone());

        let summary = manager.get_undo_summary(None).await;
        assert_eq!(summary.total_changes, 0);
        assert_eq!(summary.revertible_changes, 0);
        assert!(summary.recent_changes.is_empty());
    }

    #[tokio::test]
    async fn test_undo_summary() {
        let tracker = Arc::new(ChangeTracker::new());

        // Add various changes
        tracker
            .record_file_created(
                PathBuf::from("/tmp/file1.txt"),
                "content1".to_string(),
                "task-1".to_string(),
            )
            .await;
        tracker
            .record_file_modified(
                PathBuf::from("/tmp/file2.txt"),
                "before".to_string(),
                "after".to_string(),
                "task-1".to_string(),
            )
            .await;
        tracker
            .record_command_executed(
                "ls".to_string(),
                PathBuf::from("/tmp"),
                "task-1".to_string(),
            )
            .await;

        let manager = UndoManager::new(tracker);
        let summary = manager.get_undo_summary(None).await;

        assert_eq!(summary.total_changes, 3);
        assert_eq!(summary.revertible_changes, 2);
        assert!(!summary.changes_by_type.is_empty());
    }

    #[tokio::test]
    async fn test_undo_summary_by_task() {
        let tracker = Arc::new(ChangeTracker::new());

        tracker
            .record_file_created(
                PathBuf::from("/tmp/file1.txt"),
                "content1".to_string(),
                "task-A".to_string(),
            )
            .await;
        tracker
            .record_file_created(
                PathBuf::from("/tmp/file2.txt"),
                "content2".to_string(),
                "task-B".to_string(),
            )
            .await;

        let manager = UndoManager::new(tracker);

        let summary_a = manager.get_undo_summary(Some("task-A")).await;
        assert_eq!(summary_a.revertible_changes, 1);

        let summary_b = manager.get_undo_summary(Some("task-B")).await;
        assert_eq!(summary_b.revertible_changes, 1);

        let summary_all = manager.get_undo_summary(None).await;
        assert_eq!(summary_all.revertible_changes, 2);
    }

    #[tokio::test]
    async fn test_undo_file_created() {
        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("created_file.txt");

        // Create the file
        fs::write(&file_path, "test content").await.unwrap();
        assert!(file_path.exists());

        let tracker = Arc::new(ChangeTracker::new());
        let change_id = tracker
            .record_file_created(
                file_path.clone(),
                "test content".to_string(),
                "task-create".to_string(),
            )
            .await;

        let manager = UndoManager::new(tracker);
        let result = manager.undo_change(&change_id).await;

        assert!(result.is_ok());
        let undo_result = result.unwrap();
        assert!(undo_result.success);
        assert_eq!(undo_result.change_type, "FileCreated");
        assert!(!file_path.exists(), "File should be deleted after undo");
    }

    #[tokio::test]
    async fn test_undo_file_modified() {
        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("modified_file.txt");

        let original_content = "original content";
        let modified_content = "modified content";

        // Create file with modified content (simulating the current state)
        fs::write(&file_path, modified_content).await.unwrap();

        let tracker = Arc::new(ChangeTracker::new());
        let change_id = tracker
            .record_file_modified(
                file_path.clone(),
                original_content.to_string(),
                modified_content.to_string(),
                "task-modify".to_string(),
            )
            .await;

        let manager = UndoManager::new(tracker);
        let result = manager.undo_change(&change_id).await;

        assert!(result.is_ok());
        let undo_result = result.unwrap();
        assert!(undo_result.success);
        assert_eq!(undo_result.change_type, "FileModified");

        // Verify content was restored
        let restored_content = fs::read_to_string(&file_path).await.unwrap();
        assert_eq!(restored_content, original_content);
    }

    #[tokio::test]
    async fn test_undo_file_deleted() {
        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("deleted_file.txt");

        let original_content = "content before deletion";

        // File should not exist (it was deleted)
        assert!(!file_path.exists());

        let tracker = Arc::new(ChangeTracker::new());
        let change_id = tracker
            .record_file_deleted(
                file_path.clone(),
                original_content.to_string(),
                "task-delete".to_string(),
            )
            .await;

        let manager = UndoManager::new(tracker);
        let result = manager.undo_change(&change_id).await;

        assert!(result.is_ok());
        let undo_result = result.unwrap();
        assert!(undo_result.success);
        assert_eq!(undo_result.change_type, "FileDeleted");

        // Verify file was restored
        assert!(file_path.exists());
        let restored_content = fs::read_to_string(&file_path).await.unwrap();
        assert_eq!(restored_content, original_content);
    }

    #[tokio::test]
    async fn test_undo_last() {
        let temp_dir = TempDir::new().unwrap();
        let file1 = temp_dir.path().join("file1.txt");
        let file2 = temp_dir.path().join("file2.txt");

        // Create both files
        fs::write(&file1, "content1").await.unwrap();
        fs::write(&file2, "content2").await.unwrap();

        let tracker = Arc::new(ChangeTracker::new());
        tracker
            .record_file_created(file1.clone(), "content1".to_string(), "task-1".to_string())
            .await;
        tracker
            .record_file_created(file2.clone(), "content2".to_string(), "task-1".to_string())
            .await;

        let manager = UndoManager::new(tracker);

        // Undo last should undo the most recent (file2)
        let result = manager.undo_last(None).await;
        assert!(result.is_ok());

        assert!(file1.exists(), "file1 should still exist");
        assert!(!file2.exists(), "file2 should be deleted");
    }

    #[tokio::test]
    async fn test_undo_last_by_task() {
        let temp_dir = TempDir::new().unwrap();
        let file_a = temp_dir.path().join("file_a.txt");
        let file_b = temp_dir.path().join("file_b.txt");

        fs::write(&file_a, "content_a").await.unwrap();
        fs::write(&file_b, "content_b").await.unwrap();

        let tracker = Arc::new(ChangeTracker::new());
        tracker
            .record_file_created(
                file_a.clone(),
                "content_a".to_string(),
                "task-A".to_string(),
            )
            .await;
        tracker
            .record_file_created(
                file_b.clone(),
                "content_b".to_string(),
                "task-B".to_string(),
            )
            .await;

        let manager = UndoManager::new(tracker);

        // Undo last for task-A should only affect file_a
        let result = manager.undo_last(Some("task-A")).await;
        assert!(result.is_ok());

        assert!(!file_a.exists(), "file_a should be deleted");
        assert!(file_b.exists(), "file_b should still exist");
    }

    #[tokio::test]
    async fn test_undo_task_all_changes() {
        let temp_dir = TempDir::new().unwrap();
        let files: Vec<PathBuf> = (0..3)
            .map(|i| temp_dir.path().join(format!("task_file_{}.txt", i)))
            .collect();

        // Create all files
        for (i, file) in files.iter().enumerate() {
            fs::write(file, format!("content_{}", i)).await.unwrap();
        }

        let tracker = Arc::new(ChangeTracker::new());
        for (i, file) in files.iter().enumerate() {
            tracker
                .record_file_created(
                    file.clone(),
                    format!("content_{}", i),
                    "task-batch".to_string(),
                )
                .await;
        }

        let manager = UndoManager::new(tracker);
        let results = manager.undo_task("task-batch").await;

        assert!(results.is_ok());
        let undo_results = results.unwrap();
        assert_eq!(undo_results.len(), 3);
        assert!(undo_results.iter().all(|r| r.success));

        // Verify all files are deleted
        for file in &files {
            assert!(!file.exists(), "All files should be deleted");
        }
    }

    // =========================================================================
    // Partial Rollback Failure Handling Tests
    // =========================================================================

    #[tokio::test]
    async fn test_undo_already_reverted() {
        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("already_reverted.txt");

        fs::write(&file_path, "content").await.unwrap();

        let tracker = Arc::new(ChangeTracker::new());
        let change_id = tracker
            .record_file_created(
                file_path.clone(),
                "content".to_string(),
                "task-1".to_string(),
            )
            .await;

        let manager = UndoManager::new(tracker.clone());

        // First undo should succeed
        let result1 = manager.undo_change(&change_id).await;
        assert!(result1.is_ok());

        // Second undo should fail (already reverted)
        let result2 = manager.undo_change(&change_id).await;
        assert!(result2.is_err());
        assert!(result2.unwrap_err().contains("already been reverted"));
    }

    #[tokio::test]
    async fn test_undo_nonexistent_change() {
        let tracker = Arc::new(ChangeTracker::new());
        let manager = UndoManager::new(tracker);

        let result = manager.undo_change("nonexistent-change-id").await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Change not found"));
    }

    #[tokio::test]
    async fn test_undo_non_revertible_change() {
        let tracker = Arc::new(ChangeTracker::new());
        let change_id = tracker
            .record_command_executed(
                "rm -rf /".to_string(),
                PathBuf::from("/tmp"),
                "task-cmd".to_string(),
            )
            .await;

        let manager = UndoManager::new(tracker);
        let result = manager.undo_change(&change_id).await;

        assert!(result.is_err());
        assert!(result.unwrap_err().contains("cannot be reverted"));
    }

    #[tokio::test]
    async fn test_undo_file_already_deleted() {
        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("already_gone.txt");

        // Record creation but don't actually create the file
        // (simulating file was manually deleted)
        let tracker = Arc::new(ChangeTracker::new());
        let change_id = tracker
            .record_file_created(
                file_path.clone(),
                "content".to_string(),
                "task-1".to_string(),
            )
            .await;

        let manager = UndoManager::new(tracker);
        let result = manager.undo_change(&change_id).await;

        // Should succeed with a message that file was already deleted
        assert!(result.is_ok());
        let undo_result = result.unwrap();
        assert!(undo_result.success);
        assert!(undo_result.message.contains("already deleted"));
    }

    #[tokio::test]
    async fn test_undo_deleted_file_path_exists() {
        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("conflict_file.txt");

        let original_content = "original content";
        let new_content = "new conflicting content";

        // Create a file at the same path (simulating conflict)
        fs::write(&file_path, new_content).await.unwrap();

        let tracker = Arc::new(ChangeTracker::new());
        let change_id = tracker
            .record_file_deleted(
                file_path.clone(),
                original_content.to_string(),
                "task-1".to_string(),
            )
            .await;

        let manager = UndoManager::new(tracker);
        let result = manager.undo_change(&change_id).await;

        // Should fail because path already exists
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("already exists"));

        // Original conflicting content should be preserved
        let content = fs::read_to_string(&file_path).await.unwrap();
        assert_eq!(content, new_content);
    }

    #[tokio::test]
    async fn test_undo_modified_file_validates_before_content() {
        // This test verifies that the ChangeTracker API requires proper before_content
        // for file modifications. The undo system depends on this being present
        // to restore the original file content.
        let tracker = Arc::new(ChangeTracker::new());

        // Record a proper modification with before_content
        let change_id = tracker
            .record_file_modified(
                PathBuf::from("/tmp/test.txt"),
                "before".to_string(),
                "after".to_string(),
                "task-1".to_string(),
            )
            .await;

        let changes = tracker.get_all_changes().await;
        let change = changes.iter().find(|c| c.id == change_id).unwrap();

        // Verify before_content is captured
        assert!(
            change.before_content.is_some(),
            "File modification must capture before_content for undo"
        );
    }

    #[tokio::test]
    async fn test_undo_task_partial_failure() {
        let temp_dir = TempDir::new().unwrap();
        let file1 = temp_dir.path().join("file1.txt");
        let file2 = temp_dir.path().join("file2.txt");

        // Create only file1 (file2 doesn't exist, simulating external deletion)
        fs::write(&file1, "content1").await.unwrap();

        let tracker = Arc::new(ChangeTracker::new());
        tracker
            .record_file_created(
                file1.clone(),
                "content1".to_string(),
                "task-partial".to_string(),
            )
            .await;
        tracker
            .record_file_created(
                file2.clone(),
                "content2".to_string(),
                "task-partial".to_string(),
            )
            .await;

        let manager = UndoManager::new(tracker);
        let results = manager.undo_task("task-partial").await;

        assert!(results.is_ok());
        let undo_results = results.unwrap();
        assert_eq!(undo_results.len(), 2);

        // Both should succeed - file1 is deleted, file2 was already missing
        assert!(undo_results.iter().all(|r| r.success));
    }

    #[tokio::test]
    async fn test_undo_task_empty() {
        let tracker = Arc::new(ChangeTracker::new());
        let manager = UndoManager::new(tracker);

        let result = manager.undo_task("nonexistent-task").await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("No revertible changes"));
    }

    // =========================================================================
    // Undo Stack Management Tests
    // =========================================================================

    #[tokio::test]
    async fn test_undo_preserves_order() {
        let tracker = Arc::new(ChangeTracker::new());

        // Record changes in order
        for i in 0..5 {
            tracker
                .record_file_created(
                    PathBuf::from(format!("/tmp/file{}.txt", i)),
                    format!("content{}", i),
                    "task-order".to_string(),
                )
                .await;
        }

        let changes = tracker.get_all_changes().await;
        assert_eq!(changes.len(), 5);

        // Verify ordering preserved
        for i in 0..changes.len() - 1 {
            assert!(
                changes[i].timestamp <= changes[i + 1].timestamp,
                "Changes should maintain chronological order"
            );
        }
    }

    #[tokio::test]
    async fn test_undo_summary_changes_by_type() {
        let tracker = Arc::new(ChangeTracker::new());

        // Mix of different change types
        tracker
            .record_file_created(
                PathBuf::from("/tmp/f1.txt"),
                "c1".to_string(),
                "task".to_string(),
            )
            .await;
        tracker
            .record_file_created(
                PathBuf::from("/tmp/f2.txt"),
                "c2".to_string(),
                "task".to_string(),
            )
            .await;
        tracker
            .record_file_modified(
                PathBuf::from("/tmp/f3.txt"),
                "before".to_string(),
                "after".to_string(),
                "task".to_string(),
            )
            .await;
        tracker
            .record_file_deleted(
                PathBuf::from("/tmp/f4.txt"),
                "deleted".to_string(),
                "task".to_string(),
            )
            .await;

        let manager = UndoManager::new(tracker);
        let summary = manager.get_undo_summary(None).await;

        assert_eq!(summary.total_changes, 4);
        assert_eq!(summary.revertible_changes, 4);

        // Check type breakdown
        assert!(summary.changes_by_type.contains_key("FileCreated"));
        assert!(summary.changes_by_type.contains_key("FileModified"));
        assert!(summary.changes_by_type.contains_key("FileDeleted"));
    }

    #[tokio::test]
    async fn test_undoable_change_from_change() {
        let change = Change::new(
            ChangeType::FileCreated,
            Some(PathBuf::from("/tmp/test.txt")),
            "task-123".to_string(),
            None,
            Some("content".to_string()),
        );

        let undoable: UndoableChange = UndoableChange::from(&change);

        assert_eq!(undoable.id, change.id);
        assert_eq!(undoable.task_id, "task-123");
        assert!(undoable.description.contains("Created file"));
        assert!(undoable.description.contains("/tmp/test.txt"));
    }

    #[tokio::test]
    async fn test_recent_changes_limit() {
        let tracker = Arc::new(ChangeTracker::new());

        // Add more than 10 changes
        for i in 0..15 {
            tracker
                .record_file_created(
                    PathBuf::from(format!("/tmp/file{}.txt", i)),
                    format!("content{}", i),
                    "task-many".to_string(),
                )
                .await;
        }

        let manager = UndoManager::new(tracker);
        let summary = manager.get_undo_summary(None).await;

        // Recent changes should be limited to 10
        assert_eq!(summary.recent_changes.len(), 10);
        assert_eq!(summary.total_changes, 15);
    }

    // =========================================================================
    // Directory Undo Tests
    // =========================================================================

    #[tokio::test]
    async fn test_directory_change_type_exists() {
        // This test verifies that DirectoryCreated and DirectoryDeleted change types
        // exist and can be used. The undo system supports these for directory operations.
        let change = Change::new(
            ChangeType::DirectoryCreated,
            Some(PathBuf::from("/tmp/test_dir")),
            "task-dir".to_string(),
            None,
            None,
        );

        assert!(matches!(change.change_type, ChangeType::DirectoryCreated));
        assert!(change.can_revert, "Directory creation should be marked as revertible");

        let delete_change = Change::new(
            ChangeType::DirectoryDeleted,
            Some(PathBuf::from("/tmp/deleted_dir")),
            "task-dir".to_string(),
            None,
            None,
        );

        assert!(matches!(delete_change.change_type, ChangeType::DirectoryDeleted));
    }

    #[tokio::test]
    async fn test_concurrent_undo_operations() {
        let temp_dir = TempDir::new().unwrap();
        let tracker = Arc::new(ChangeTracker::new());

        // Create multiple files and record changes
        let mut change_ids = Vec::new();
        for i in 0..5 {
            let file = temp_dir.path().join(format!("concurrent_{}.txt", i));
            fs::write(&file, format!("content{}", i)).await.unwrap();

            let id = tracker
                .record_file_created(
                    file,
                    format!("content{}", i),
                    "task-concurrent".to_string(),
                )
                .await;
            change_ids.push(id);
        }

        let manager = Arc::new(UndoManager::new(tracker));

        // Spawn concurrent undo operations
        let mut handles = Vec::new();
        for id in change_ids {
            let manager_clone = manager.clone();
            let handle = tokio::spawn(async move { manager_clone.undo_change(&id).await });
            handles.push(handle);
        }

        // Wait for all to complete
        for handle in handles {
            let result = handle.await.unwrap();
            assert!(result.is_ok(), "Concurrent undo should succeed");
        }
    }

    // =========================================================================
    // Edge Cases and Error Handling
    // =========================================================================

    #[tokio::test]
    async fn test_change_with_no_path() {
        // Create a change with None path to verify the data structure handles it
        let change = Change::new(
            ChangeType::FileCreated,
            None, // No path
            "task-no-path".to_string(),
            None,
            Some("content".to_string()),
        );

        // Verify the change was created but has no path
        assert!(change.path.is_none());
        assert!(change.can_revert);
        assert!(!change.id.is_empty());
    }

    #[tokio::test]
    async fn test_undo_with_special_characters_in_path() {
        let temp_dir = TempDir::new().unwrap();
        let special_file = temp_dir.path().join("file with spaces & special!.txt");

        fs::write(&special_file, "special content").await.unwrap();
        assert!(special_file.exists());

        let tracker = Arc::new(ChangeTracker::new());
        let change_id = tracker
            .record_file_created(
                special_file.clone(),
                "special content".to_string(),
                "task-special".to_string(),
            )
            .await;

        let manager = UndoManager::new(tracker);
        let result = manager.undo_change(&change_id).await;

        assert!(result.is_ok());
        assert!(!special_file.exists());
    }

    #[tokio::test]
    async fn test_undo_with_unicode_content() {
        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("unicode.txt");

        let unicode_content = "Hello, World!\n\
            \u{4e2d}\u{6587} (Chinese)\n\
            \u{65e5}\u{672c}\u{8a9e} (Japanese)\n\
            \u{d55c}\u{ad6d}\u{c5b4} (Korean)\n\
            \u{0420}\u{0443}\u{0441}\u{0441}\u{043a}\u{0438}\u{0439} (Russian)\n\
            \u{1f600}\u{1f603}\u{1f604} (Emojis)";

        let modified_content = "Modified content";
        fs::write(&file_path, modified_content).await.unwrap();

        let tracker = Arc::new(ChangeTracker::new());
        let change_id = tracker
            .record_file_modified(
                file_path.clone(),
                unicode_content.to_string(),
                modified_content.to_string(),
                "task-unicode".to_string(),
            )
            .await;

        let manager = UndoManager::new(tracker);
        let result = manager.undo_change(&change_id).await;

        assert!(result.is_ok());
        let restored = fs::read_to_string(&file_path).await.unwrap();
        assert_eq!(restored, unicode_content);
    }

    #[tokio::test]
    async fn test_undo_large_file() {
        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("large_file.txt");

        // Create content with ~1MB size
        let large_content: String = "x".repeat(1024 * 1024);
        let modified_content = "small";

        fs::write(&file_path, modified_content).await.unwrap();

        let tracker = Arc::new(ChangeTracker::new());
        let change_id = tracker
            .record_file_modified(
                file_path.clone(),
                large_content.clone(),
                modified_content.to_string(),
                "task-large".to_string(),
            )
            .await;

        let manager = UndoManager::new(tracker);
        let result = manager.undo_change(&change_id).await;

        assert!(result.is_ok());
        let restored = fs::read_to_string(&file_path).await.unwrap();
        assert_eq!(restored.len(), large_content.len());
    }

    #[tokio::test]
    async fn test_undo_restore_creates_parent_directories() {
        let temp_dir = TempDir::new().unwrap();
        let nested_path = temp_dir.path().join("deep/nested/path/file.txt");

        let content = "nested content";

        let tracker = Arc::new(ChangeTracker::new());
        let change_id = tracker
            .record_file_deleted(nested_path.clone(), content.to_string(), "task-nested".to_string())
            .await;

        let manager = UndoManager::new(tracker);
        let result = manager.undo_change(&change_id).await;

        assert!(result.is_ok());
        assert!(nested_path.exists());
        let restored = fs::read_to_string(&nested_path).await.unwrap();
        assert_eq!(restored, content);
    }
}
