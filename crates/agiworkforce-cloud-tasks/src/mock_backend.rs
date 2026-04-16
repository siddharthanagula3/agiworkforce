use agiworkforce_cloud_tasks_client::ApplyOutcome;
use agiworkforce_cloud_tasks_client::ApplyStatus;
use agiworkforce_cloud_tasks_client::AttemptStatus;
use agiworkforce_cloud_tasks_client::CloudBackend;
use agiworkforce_cloud_tasks_client::CloudTaskError;
use agiworkforce_cloud_tasks_client::CreatedTask;
use agiworkforce_cloud_tasks_client::DiffSummary;
use agiworkforce_cloud_tasks_client::Result;
use agiworkforce_cloud_tasks_client::TaskId;
use agiworkforce_cloud_tasks_client::TaskListPage;
use agiworkforce_cloud_tasks_client::TaskStatus;
use agiworkforce_cloud_tasks_client::TaskSummary;
use agiworkforce_cloud_tasks_client::TaskText;
use agiworkforce_cloud_tasks_client::TurnAttempt;
use chrono::Utc;

#[derive(Clone, Default)]
pub struct MockClient;

#[async_trait::async_trait]
impl CloudBackend for MockClient {
    async fn list_tasks(
        &self,
        env: Option<&str>,
        _limit: Option<i64>,
        _cursor: Option<&str>,
    ) -> Result<TaskListPage> {
        let rows = match env {
            Some("env-A") => vec![("T-2000", "A: First", TaskStatus::Ready)],
            Some("env-B") => vec![
                ("T-3000", "B: One", TaskStatus::Ready),
                ("T-3001", "B: Two", TaskStatus::Pending),
            ],
            _ => vec![
                ("T-1000", "Update README formatting", TaskStatus::Ready),
                ("T-1001", "Fix clippy warnings in core", TaskStatus::Pending),
                ("T-1002", "Add contributing guide", TaskStatus::Ready),
            ],
        };
        let environment_id = env.map(str::to_string);
        let environment_label = match env {
            Some("env-A") => Some("Env A".to_string()),
            Some("env-B") => Some("Env B".to_string()),
            Some(other) => Some(other.to_string()),
            None => Some("Global".to_string()),
        };
        let mut tasks = Vec::new();
        for (id_str, title, status) in rows {
            let id = TaskId(id_str.to_string());
            let diff = mock_diff_for(&id);
            let (files_changed, lines_added, lines_removed) = count_from_unified(&diff);
            tasks.push(TaskSummary {
                id,
                title: title.to_string(),
                status,
                updated_at: Utc::now(),
                environment_id: environment_id.clone(),
                environment_label: environment_label.clone(),
                summary: DiffSummary {
                    files_changed,
                    lines_added,
                    lines_removed,
                },
                is_review: false,
                attempt_total: Some(if id_str == "T-1000" { 2 } else { 1 }),
            });
        }
        Ok(TaskListPage {
            tasks,
            cursor: None,
        })
    }

    async fn get_task_summary(&self, id: TaskId) -> Result<TaskSummary> {
        self.list_tasks(None, None, None)
            .await?
            .tasks
            .into_iter()
            .find(|task| task.id == id)
            .ok_or_else(|| CloudTaskError::Msg(format!("Task {} not found (mock)", id.0)))
    }

    async fn get_task_diff(&self, id: TaskId) -> Result<Option<String>> {
        Ok(Some(mock_diff_for(&id)))
    }

    async fn get_task_messages(&self, _id: TaskId) -> Result<Vec<String>> {
        Ok(vec![
            "Mock assistant output: this task contains no diff.".to_string(),
        ])
    }

    async fn get_task_text(&self, _id: TaskId) -> Result<TaskText> {
        Ok(TaskText {
            prompt: Some("Why is there no diff?".to_string()),
            messages: vec!["Mock assistant output: this task contains no diff.".to_string()],
            turn_id: Some("mock-turn".to_string()),
            sibling_turn_ids: Vec::new(),
            attempt_placement: Some(0),
            attempt_status: AttemptStatus::Completed,
        })
    }

    async fn list_sibling_attempts(
        &self,
        task: TaskId,
        _turn_id: String,
    ) -> Result<Vec<TurnAttempt>> {
        if task.0 == "T-1000" {
            return Ok(vec![TurnAttempt {
                turn_id: "T-1000-attempt-2".to_string(),
                attempt_placement: Some(1),
                created_at: Some(Utc::now()),
                status: AttemptStatus::Completed,
                diff: Some(mock_diff_for(&task)),
                messages: vec!["Mock alternate attempt".to_string()],
            }]);
        }
        Ok(Vec::new())
    }

    async fn apply_task_preflight(
        &self,
        id: TaskId,
        _diff_override: Option<String>,
    ) -> Result<ApplyOutcome> {
        Ok(ApplyOutcome {
            applied: false,
            status: ApplyStatus::Success,
            message: format!("Preflight passed for task {} (mock)", id.0),
            skipped_paths: Vec::new(),
            conflict_paths: Vec::new(),
        })
    }

    async fn apply_task(&self, id: TaskId, _diff_override: Option<String>) -> Result<ApplyOutcome> {
        Ok(ApplyOutcome {
            applied: true,
            status: ApplyStatus::Success,
            message: format!("Applied task {} locally (mock)", id.0),
            skipped_paths: Vec::new(),
            conflict_paths: Vec::new(),
        })
    }

    async fn create_task(
        &self,
        env_id: &str,
        prompt: &str,
        git_ref: &str,
        qa_mode: bool,
        best_of_n: usize,
    ) -> Result<CreatedTask> {
        let _ = (env_id, prompt, git_ref, qa_mode, best_of_n);
        Ok(CreatedTask {
            id: TaskId(format!("task_local_{}", Utc::now().timestamp_millis())),
        })
    }
}

fn mock_diff_for(id: &TaskId) -> String {
    match id.0.as_str() {
        "T-1000" => "diff --git a/README.md b/README.md\nindex 000000..111111 100644\n--- a/README.md\n+++ b/README.md\n@@ -1,2 +1,3 @@\n Intro\n-Hello\n+Hello, world!\n+Task: T-1000\n".to_string(),
        "T-1001" => "diff --git a/core/src/lib.rs b/core/src/lib.rs\nindex 000000..111111 100644\n--- a/core/src/lib.rs\n+++ b/core/src/lib.rs\n@@ -1,2 +1,1 @@\n-use foo;\n use bar;\n".to_string(),
        _ => "diff --git a/CONTRIBUTING.md b/CONTRIBUTING.md\nindex 000000..111111 100644\n--- /dev/null\n+++ b/CONTRIBUTING.md\n@@ -0,0 +1,3 @@\n+## Contributing\n+Please open PRs.\n+Thanks!\n".to_string(),
    }
}

fn count_from_unified(diff: &str) -> (usize, usize, usize) {
    let mut files_changed = 1;
    let mut added = 0;
    let mut removed = 0;
    for line in diff.lines() {
        if line.starts_with("diff --git") {
            files_changed = files_changed.max(1);
            continue;
        }
        if line.starts_with("+++") || line.starts_with("---") || line.starts_with("@@") {
            continue;
        }
        match line.as_bytes().first() {
            Some(b'+') => added += 1,
            Some(b'-') => removed += 1,
            _ => {}
        }
    }
    (files_changed, added, removed)
}
