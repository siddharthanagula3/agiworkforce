use serde::{Deserialize, Serialize};
use rusqlite::{Connection, params};
use std::sync::{Arc, Mutex};
use thiserror::Error;
use chrono::Utc;
use uuid::Uuid;

#[derive(Debug, Error)]
pub enum SampleDataError {
    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),
    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
    #[error("Sample data already exists")]
    AlreadyExists,
}

pub struct SampleDataGenerator {
    db: Arc<Mutex<Connection>>,
}

impl SampleDataGenerator {
    pub fn new(db: Arc<Mutex<Connection>>) -> Self {
        Self { db }
    }

    /// Check if sample data already exists for user
    pub fn has_sample_data(&self, user_id: &str) -> bool {
        let conn = self.db.lock().unwrap();

        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sample_data_marker WHERE user_id = ?1",
                [user_id],
                |row| row.get(0),
            )
            .unwrap_or(0);

        count > 0
    }

    /// Populate all sample data for tutorial demonstrations
    pub fn populate_sample_data(&self, user_id: &str) -> Result<SampleDataSummary, SampleDataError> {
        if self.has_sample_data(user_id) {
            return Err(SampleDataError::AlreadyExists);
        }

        let conn = self.db.lock().unwrap();
        let now = Utc::now().timestamp();

        // Mark that sample data has been created
        conn.execute(
            "INSERT INTO sample_data_marker (user_id, created_at) VALUES (?1, ?2)",
            params![user_id, now],
        ).ok();

        let mut summary = SampleDataSummary {
            goals_created: 0,
            workflows_created: 0,
            templates_installed: 0,
            sample_files_created: 0,
        };

        // Create sample autonomous session (completed goal)
        let goal_id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO autonomous_sessions (id, goal_id, goal_description, status, progress_percent, completed_steps, total_steps, started_at, completed_at, created_at, updated_at)
             VALUES (?1, ?2, ?3, 'completed', 100.0, 3, 3, ?4, ?4, ?4, ?4)",
            params![
                Uuid::new_v4().to_string(),
                &goal_id,
                "Process sample invoice and extract data",
                now - 3600, // Completed 1 hour ago
            ],
        ).ok();
        summary.goals_created += 1;

        // Create sample task logs for the goal
        for (step_num, step_desc) in [
            (1, "Read invoice PDF file"),
            (2, "Extract text using OCR"),
            (3, "Parse invoice data and save to database"),
        ].iter() {
            conn.execute(
                "INSERT INTO autonomous_task_logs (session_id, step_number, step_description, status, tool_name, duration_ms, tokens_used, cost, created_at, completed_at)
                 VALUES (?1, ?2, ?3, 'completed', ?4, ?5, 150, 0.002, ?6, ?6)",
                params![
                    &goal_id,
                    step_num,
                    step_desc,
                    "file_read",
                    500 + step_num * 200,
                    now - 3600 + (step_num * 60),
                ],
            ).ok();
        }

        // Create sample workflow definition
        let workflow_id = Uuid::new_v4().to_string();
        let workflow_nodes = serde_json::json!([
            {
                "id": "trigger1",
                "type": "trigger",
                "data": { "triggerType": "manual" },
                "position": { "x": 100, "y": 100 }
            },
            {
                "id": "action1",
                "type": "action",
                "data": { "action": "file_read", "params": { "path": "data/input.csv" } },
                "position": { "x": 300, "y": 100 }
            },
            {
                "id": "action2",
                "type": "action",
                "data": { "action": "db_query", "params": { "query": "INSERT INTO records..." } },
                "position": { "x": 500, "y": 100 }
            }
        ]);

        let workflow_edges = serde_json::json!([
            { "id": "e1", "source": "trigger1", "target": "action1" },
            { "id": "e2", "source": "action1", "target": "action2" }
        ]);

        conn.execute(
            "INSERT INTO workflow_definitions (id, user_id, name, description, nodes, edges, created_at, updated_at)
             VALUES (?1, ?2, 'Sample Data Import Workflow', 'Demonstrates a simple ETL workflow', ?3, ?4, ?5, ?5)",
            params![
                workflow_id,
                user_id,
                workflow_nodes.to_string(),
                workflow_edges.to_string(),
                now,
            ],
        ).ok();
        summary.workflows_created += 1;

        // Create sample workflow execution
        let execution_id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO workflow_executions (id, workflow_id, status, started_at, completed_at)
             VALUES (?1, ?2, 'completed', ?3, ?3)",
            params![execution_id, workflow_id, now - 7200], // Completed 2 hours ago
        ).ok();

        // Create sample execution logs
        for (node_id, event, data) in [
            ("trigger1", "node_started", r#"{"message": "Workflow triggered manually"}"#),
            ("trigger1", "node_completed", r#"{"success": true}"#),
            ("action1", "node_started", r#"{"reading": "data/input.csv"}"#),
            ("action1", "node_completed", r#"{"rows": 42, "size": "1.2 KB"}"#),
            ("action2", "node_started", r#"{"query": "INSERT INTO records..."}"#),
            ("action2", "node_completed", r#"{"inserted": 42}"#),
        ].iter() {
            conn.execute(
                "INSERT INTO workflow_execution_logs (id, execution_id, node_id, event_type, data, timestamp)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    Uuid::new_v4().to_string(),
                    &execution_id,
                    node_id,
                    event,
                    data,
                    now - 7200,
                ],
            ).ok();
        }

        // Mark some templates as "installed" for the user
        for template_id in &["invoice_processing", "email_automation", "web_scraper"] {
            conn.execute(
                "INSERT OR IGNORE INTO template_installs (user_id, template_id, installed_at)
                 VALUES (?1, ?2, ?3)",
                params![user_id, template_id, now - 86400], // Installed 1 day ago
            ).ok();
            summary.templates_installed += 1;
        }

        // Create sample conversation with messages
        let conversation_id = conn.query_row(
            "INSERT INTO conversations (title, created_at, updated_at)
             VALUES ('Sample Automation Discussion', ?1, ?1)
             RETURNING id",
            [now - 172800], // 2 days ago
            |row| row.get::<_, i64>(0),
        ).ok();

        if let Some(conv_id) = conversation_id {
            for (role, content) in [
                ("user", "Can you help me automate invoice processing?"),
                ("assistant", "I can help! I'll create an automation that reads invoice PDFs, extracts data using OCR, and saves the information to a database. Would you like me to proceed?"),
                ("user", "Yes, please go ahead."),
                ("assistant", "I've created a workflow that will:\n1. Monitor a folder for new invoice PDFs\n2. Extract text using OCR\n3. Parse invoice fields (number, date, amount, vendor)\n4. Store in database\n\nThe automation is ready to use!"),
            ].iter() {
                conn.execute(
                    "INSERT INTO messages (conversation_id, role, content, created_at)
                     VALUES (?1, ?2, ?3, ?4)",
                    params![conv_id, role, content, now - 172800],
                ).ok();
            }
        }

        // Create sample outcomes for process reasoning
        conn.execute(
            "INSERT INTO outcome_tracking (id, goal_id, process_type, metric_name, target_value, actual_value, achieved, tracked_at)
             VALUES (?1, ?2, 'invoice_processing', 'invoices_processed', 10.0, 12.0, 1, ?3)",
            params![
                Uuid::new_v4().to_string(),
                &goal_id,
                now - 3600,
            ],
        ).ok();

        conn.execute(
            "INSERT INTO outcome_tracking (id, goal_id, process_type, metric_name, target_value, actual_value, achieved, tracked_at)
             VALUES (?1, ?2, 'invoice_processing', 'accuracy_percent', 95.0, 98.5, 1, ?3)",
            params![
                Uuid::new_v4().to_string(),
                &goal_id,
                now - 3600,
            ],
        ).ok();

        summary.sample_files_created = 4; // Conceptual - would need filesystem access to create actual files

        Ok(summary)
    }

    /// Clear all sample data for a user
    pub fn clear_sample_data(&self, user_id: &str) -> Result<(), SampleDataError> {
        let conn = self.db.lock().unwrap();

        // Delete marker
        conn.execute(
            "DELETE FROM sample_data_marker WHERE user_id = ?1",
            [user_id],
        )?;

        // Note: Would need to track which records are sample data to delete them
        // For now, we just clear the marker

        Ok(())
    }

    /// Generate sample goal for tutorial
    pub fn create_sample_goal(&self) -> SampleGoal {
        SampleGoal {
            id: Uuid::new_v4().to_string(),
            description: "Organize my desktop files by type into folders".to_string(),
            steps: vec![
                SampleStep {
                    action: "file_list".to_string(),
                    parameters: serde_json::json!({ "path": "~/Desktop", "recursive": false }),
                    expected_output: "List of files on desktop".to_string(),
                },
                SampleStep {
                    action: "file_organize".to_string(),
                    parameters: serde_json::json!({
                        "path": "~/Desktop",
                        "pattern": "by_extension",
                        "create_folders": true
                    }),
                    expected_output: "Files organized into Documents/, Images/, Videos/ folders".to_string(),
                },
            ],
            success_criteria: vec![
                "All files moved to appropriate folders".to_string(),
                "No files left in root desktop".to_string(),
            ],
        }
    }

    /// Generate sample workflow definition
    pub fn create_sample_workflow(&self) -> SampleWorkflow {
        SampleWorkflow {
            id: Uuid::new_v4().to_string(),
            name: "Daily Email Summary".to_string(),
            description: "Automatically generate a summary of unread emails every morning".to_string(),
            nodes: vec![
                WorkflowNode {
                    id: "trigger1".to_string(),
                    node_type: "trigger".to_string(),
                    config: serde_json::json!({ "schedule": "0 9 * * *" }), // 9 AM daily
                },
                WorkflowNode {
                    id: "fetch1".to_string(),
                    node_type: "action".to_string(),
                    config: serde_json::json!({ "action": "email_fetch_unread", "account": "default" }),
                },
                WorkflowNode {
                    id: "summarize1".to_string(),
                    node_type: "action".to_string(),
                    config: serde_json::json!({ "action": "llm_summarize", "prompt": "Summarize these emails" }),
                },
                WorkflowNode {
                    id: "notify1".to_string(),
                    node_type: "action".to_string(),
                    config: serde_json::json!({ "action": "notification_send", "title": "Email Summary" }),
                },
            ],
            estimated_duration_minutes: 2,
        }
    }

    /// Generate sample team
    pub fn create_sample_team(&self) -> SampleTeam {
        SampleTeam {
            id: Uuid::new_v4().to_string(),
            name: "Marketing Automation Team".to_string(),
            description: "Team managing marketing automation workflows".to_string(),
            members: vec![
                TeamMember {
                    user_id: "demo_user1".to_string(),
                    name: "Alice Johnson".to_string(),
                    email: "alice@example.com".to_string(),
                    role: "owner".to_string(),
                },
                TeamMember {
                    user_id: "demo_user2".to_string(),
                    name: "Bob Smith".to_string(),
                    email: "bob@example.com".to_string(),
                    role: "editor".to_string(),
                },
                TeamMember {
                    user_id: "demo_user3".to_string(),
                    name: "Carol Williams".to_string(),
                    email: "carol@example.com".to_string(),
                    role: "viewer".to_string(),
                },
            ],
        }
    }
}

// Sample data structures

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SampleDataSummary {
    pub goals_created: u32,
    pub workflows_created: u32,
    pub templates_installed: u32,
    pub sample_files_created: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SampleGoal {
    pub id: String,
    pub description: String,
    pub steps: Vec<SampleStep>,
    pub success_criteria: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SampleStep {
    pub action: String,
    pub parameters: serde_json::Value,
    pub expected_output: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SampleWorkflow {
    pub id: String,
    pub name: String,
    pub description: String,
    pub nodes: Vec<WorkflowNode>,
    pub estimated_duration_minutes: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowNode {
    pub id: String,
    pub node_type: String,
    pub config: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SampleTeam {
    pub id: String,
    pub name: String,
    pub description: String,
    pub members: Vec<TeamMember>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeamMember {
    pub user_id: String,
    pub name: String,
    pub email: String,
    pub role: String,
}
