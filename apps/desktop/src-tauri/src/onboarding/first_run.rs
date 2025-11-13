use serde::{Deserialize, Serialize};
use rusqlite::{Connection, params};
use std::sync::{Arc, Mutex};
use thiserror::Error;
use chrono::Utc;
use uuid::Uuid;

use super::sample_data::SampleDataGenerator;
use crate::agi::AIEmployee;

#[derive(Debug, Error)]
pub enum FirstRunError {
    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),
    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
    #[error("Session not found")]
    SessionNotFound,
    #[error("Demo execution failed: {0}")]
    DemoFailed(String),
}

pub struct FirstRunExperience {
    db: Arc<Mutex<Connection>>,
    sample_data: SampleDataGenerator,
}

impl FirstRunExperience {
    pub fn new(db: Arc<Mutex<Connection>>) -> Self {
        let sample_data = SampleDataGenerator::new(db.clone());
        Self { db, sample_data }
    }

    /// Check if user has completed first run
    pub fn has_completed_first_run(&self, user_id: &str) -> bool {
        let conn = self.db.lock().unwrap();

        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM first_run_sessions WHERE user_id = ?1 AND completed_at IS NOT NULL",
                [user_id],
                |row| row.get(0),
            )
            .unwrap_or(0);

        count > 0
    }

    /// Start a new first-run experience session
    pub fn start(&self, user_id: &str, user_role: Option<&str>) -> Result<FirstRunSession, FirstRunError> {
        let now = Utc::now().timestamp();
        let session_id = Uuid::new_v4().to_string();

        // Get recommended employees based on user role
        let recommended_employees = self.get_recommended_employees(user_role.unwrap_or("general"));

        let session = FirstRunSession {
            id: session_id.clone(),
            user_id: user_id.to_string(),
            step: OnboardingStep::Welcome,
            recommended_employees: recommended_employees.clone(),
            demo_results: None,
            time_to_value_seconds: 0,
            selected_employee_id: None,
            started_at: now,
        };

        // Save session to database
        let conn = self.db.lock().unwrap();
        conn.execute(
            "INSERT INTO first_run_sessions (id, user_id, started_at, step, recommended_employees, selected_employee_id, demo_results, time_to_value_seconds, hired_employee)
             VALUES (?1, ?2, ?3, ?4, ?5, NULL, NULL, 0, 0)",
            params![
                &session_id,
                user_id,
                now,
                serde_json::to_string(&session.step)?,
                serde_json::to_string(&recommended_employees)?,
            ],
        )?;

        Ok(session)
    }

    /// Get recommended AI employees based on user role
    fn get_recommended_employees(&self, user_role: &str) -> Vec<AIEmployeeRecommendation> {
        match user_role {
            "founder" | "ceo" | "executive" => vec![
                AIEmployeeRecommendation {
                    id: "inbox_manager".to_string(),
                    name: "Inbox Manager".to_string(),
                    description: "Categorizes emails, drafts responses, and escalates urgent items".to_string(),
                    estimated_time_saved_per_run: 150, // 2.5 hours
                    estimated_cost_saved_per_run: 75.0,
                    demo_duration_seconds: 30,
                    match_score: 95,
                },
                AIEmployeeRecommendation {
                    id: "meeting_scheduler".to_string(),
                    name: "Meeting Scheduler".to_string(),
                    description: "Finds optimal meeting times, sends invites, handles conflicts".to_string(),
                    estimated_time_saved_per_run: 45,
                    estimated_cost_saved_per_run: 22.5,
                    demo_duration_seconds: 25,
                    match_score: 88,
                },
                AIEmployeeRecommendation {
                    id: "report_generator".to_string(),
                    name: "Report Generator".to_string(),
                    description: "Compiles data from multiple sources into formatted reports".to_string(),
                    estimated_time_saved_per_run: 120,
                    estimated_cost_saved_per_run: 60.0,
                    demo_duration_seconds: 35,
                    match_score: 82,
                },
            ],
            "developer" | "engineer" => vec![
                AIEmployeeRecommendation {
                    id: "code_reviewer".to_string(),
                    name: "Code Reviewer".to_string(),
                    description: "Reviews PRs, suggests improvements, finds bugs and style issues".to_string(),
                    estimated_time_saved_per_run: 30,
                    estimated_cost_saved_per_run: 25.0,
                    demo_duration_seconds: 20,
                    match_score: 98,
                },
                AIEmployeeRecommendation {
                    id: "bug_investigator".to_string(),
                    name: "Bug Investigator".to_string(),
                    description: "Analyzes error logs, traces issues, suggests fixes".to_string(),
                    estimated_time_saved_per_run: 60,
                    estimated_cost_saved_per_run: 50.0,
                    demo_duration_seconds: 40,
                    match_score: 90,
                },
                AIEmployeeRecommendation {
                    id: "documentation_writer".to_string(),
                    name: "Documentation Writer".to_string(),
                    description: "Generates API docs, README files, code comments".to_string(),
                    estimated_time_saved_per_run: 90,
                    estimated_cost_saved_per_run: 45.0,
                    demo_duration_seconds: 30,
                    match_score: 85,
                },
            ],
            "marketer" | "marketing" => vec![
                AIEmployeeRecommendation {
                    id: "social_media_monitor".to_string(),
                    name: "Social Media Monitor".to_string(),
                    description: "Tracks mentions, analyzes sentiment, drafts responses".to_string(),
                    estimated_time_saved_per_run: 120,
                    estimated_cost_saved_per_run: 60.0,
                    demo_duration_seconds: 35,
                    match_score: 95,
                },
                AIEmployeeRecommendation {
                    id: "content_creator".to_string(),
                    name: "Content Creator".to_string(),
                    description: "Generates blog posts, social content, newsletters".to_string(),
                    estimated_time_saved_per_run: 180,
                    estimated_cost_saved_per_run: 90.0,
                    demo_duration_seconds: 45,
                    match_score: 92,
                },
                AIEmployeeRecommendation {
                    id: "analytics_reporter".to_string(),
                    name: "Analytics Reporter".to_string(),
                    description: "Pulls metrics, creates visualizations, identifies trends".to_string(),
                    estimated_time_saved_per_run: 90,
                    estimated_cost_saved_per_run: 45.0,
                    demo_duration_seconds: 30,
                    match_score: 88,
                },
            ],
            "sales" | "bizdev" => vec![
                AIEmployeeRecommendation {
                    id: "lead_qualifier".to_string(),
                    name: "Lead Qualifier".to_string(),
                    description: "Researches leads, scores opportunities, drafts outreach".to_string(),
                    estimated_time_saved_per_run: 60,
                    estimated_cost_saved_per_run: 30.0,
                    demo_duration_seconds: 25,
                    match_score: 93,
                },
                AIEmployeeRecommendation {
                    id: "crm_updater".to_string(),
                    name: "CRM Updater".to_string(),
                    description: "Updates contact info, logs interactions, sets reminders".to_string(),
                    estimated_time_saved_per_run: 45,
                    estimated_cost_saved_per_run: 22.5,
                    demo_duration_seconds: 20,
                    match_score: 87,
                },
                AIEmployeeRecommendation {
                    id: "proposal_writer".to_string(),
                    name: "Proposal Writer".to_string(),
                    description: "Creates customized proposals, contracts, presentations".to_string(),
                    estimated_time_saved_per_run: 120,
                    estimated_cost_saved_per_run: 60.0,
                    demo_duration_seconds: 40,
                    match_score: 90,
                },
            ],
            "accountant" | "finance" => vec![
                AIEmployeeRecommendation {
                    id: "invoice_processor".to_string(),
                    name: "Invoice Processor".to_string(),
                    description: "Extracts data from invoices, validates, enters into system".to_string(),
                    estimated_time_saved_per_run: 90,
                    estimated_cost_saved_per_run: 45.0,
                    demo_duration_seconds: 25,
                    match_score: 96,
                },
                AIEmployeeRecommendation {
                    id: "expense_categorizer".to_string(),
                    name: "Expense Categorizer".to_string(),
                    description: "Reviews receipts, categorizes expenses, flags anomalies".to_string(),
                    estimated_time_saved_per_run: 60,
                    estimated_cost_saved_per_run: 30.0,
                    demo_duration_seconds: 20,
                    match_score: 91,
                },
                AIEmployeeRecommendation {
                    id: "reconciliation_assistant".to_string(),
                    name: "Reconciliation Assistant".to_string(),
                    description: "Matches transactions, identifies discrepancies, suggests fixes".to_string(),
                    estimated_time_saved_per_run: 120,
                    estimated_cost_saved_per_run: 60.0,
                    demo_duration_seconds: 35,
                    match_score: 89,
                },
            ],
            _ => vec![
                AIEmployeeRecommendation {
                    id: "data_entry_specialist".to_string(),
                    name: "Data Entry Specialist".to_string(),
                    description: "Processes documents, extracts data, enters into databases".to_string(),
                    estimated_time_saved_per_run: 90,
                    estimated_cost_saved_per_run: 45.0,
                    demo_duration_seconds: 25,
                    match_score: 85,
                },
                AIEmployeeRecommendation {
                    id: "inbox_manager".to_string(),
                    name: "Inbox Manager".to_string(),
                    description: "Categorizes emails, drafts responses, and escalates urgent items".to_string(),
                    estimated_time_saved_per_run: 150,
                    estimated_cost_saved_per_run: 75.0,
                    demo_duration_seconds: 30,
                    match_score: 80,
                },
                AIEmployeeRecommendation {
                    id: "file_organizer".to_string(),
                    name: "File Organizer".to_string(),
                    description: "Organizes files by type, renames consistently, removes duplicates".to_string(),
                    estimated_time_saved_per_run: 45,
                    estimated_cost_saved_per_run: 22.5,
                    demo_duration_seconds: 20,
                    match_score: 75,
                },
            ],
        }
    }

    /// Update session step
    pub fn update_step(&self, session_id: &str, step: OnboardingStep) -> Result<(), FirstRunError> {
        let conn = self.db.lock().unwrap();
        conn.execute(
            "UPDATE first_run_sessions SET step = ?1, updated_at = ?2 WHERE id = ?3",
            params![serde_json::to_string(&step)?, Utc::now().timestamp(), session_id],
        )?;
        Ok(())
    }

    /// Select an employee for demo
    pub fn select_employee(&self, session_id: &str, employee_id: &str) -> Result<(), FirstRunError> {
        let conn = self.db.lock().unwrap();
        conn.execute(
            "UPDATE first_run_sessions SET selected_employee_id = ?1, updated_at = ?2 WHERE id = ?3",
            params![employee_id, Utc::now().timestamp(), session_id],
        )?;
        Ok(())
    }

    /// Record demo results
    pub fn record_demo_results(&self, session_id: &str, results: &DemoResult) -> Result<(), FirstRunError> {
        let started_at = {
            let conn = self.db.lock().unwrap();
            let started_at: i64 = conn.query_row(
                "SELECT started_at FROM first_run_sessions WHERE id = ?1",
                [session_id],
                |row| row.get(0),
            )?;
            started_at
        };

        let time_to_value = (Utc::now().timestamp() - started_at) as u64;

        let conn = self.db.lock().unwrap();
        conn.execute(
            "UPDATE first_run_sessions SET demo_results = ?1, time_to_value_seconds = ?2, updated_at = ?3 WHERE id = ?4",
            params![
                serde_json::to_string(results)?,
                time_to_value as i64,
                Utc::now().timestamp(),
                session_id
            ],
        )?;

        Ok(())
    }

    /// Mark employee as hired
    pub fn mark_employee_hired(&self, session_id: &str) -> Result<(), FirstRunError> {
        let conn = self.db.lock().unwrap();
        conn.execute(
            "UPDATE first_run_sessions SET hired_employee = 1, updated_at = ?1 WHERE id = ?2",
            params![Utc::now().timestamp(), session_id],
        )?;
        Ok(())
    }

    /// Complete the first-run experience
    pub fn complete(&self, session_id: &str) -> Result<(), FirstRunError> {
        let conn = self.db.lock().unwrap();
        let now = Utc::now().timestamp();
        conn.execute(
            "UPDATE first_run_sessions SET completed_at = ?1, step = ?2, updated_at = ?1 WHERE id = ?3",
            params![now, serde_json::to_string(&OnboardingStep::Completed)?, session_id],
        )?;
        Ok(())
    }

    /// Get session by ID
    pub fn get_session(&self, session_id: &str) -> Result<FirstRunSession, FirstRunError> {
        let conn = self.db.lock().unwrap();

        let (id, user_id, step_json, recommended_json, demo_json, time_to_value, selected_employee_id, started_at):
            (String, String, String, String, Option<String>, i64, Option<String>, i64) = conn.query_row(
            "SELECT id, user_id, step, recommended_employees, demo_results, time_to_value_seconds, selected_employee_id, started_at
             FROM first_run_sessions WHERE id = ?1",
            [session_id],
            |row| Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
                row.get(5)?,
                row.get(6)?,
                row.get(7)?,
            )),
        )?;

        Ok(FirstRunSession {
            id,
            user_id,
            step: serde_json::from_str(&step_json)?,
            recommended_employees: serde_json::from_str(&recommended_json)?,
            demo_results: demo_json.as_ref().map(|s| serde_json::from_str(s)).transpose()?,
            time_to_value_seconds: time_to_value as u64,
            selected_employee_id,
            started_at,
        })
    }

    /// Get first-run statistics
    pub fn get_statistics(&self) -> Result<FirstRunStatistics, FirstRunError> {
        let conn = self.db.lock().unwrap();

        let total_sessions: i64 = conn.query_row(
            "SELECT COUNT(*) FROM first_run_sessions",
            [],
            |row| row.get(0),
        ).unwrap_or(0);

        let completed_sessions: i64 = conn.query_row(
            "SELECT COUNT(*) FROM first_run_sessions WHERE completed_at IS NOT NULL",
            [],
            |row| row.get(0),
        ).unwrap_or(0);

        let hired_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM first_run_sessions WHERE hired_employee = 1",
            [],
            |row| row.get(0),
        ).unwrap_or(0);

        let avg_time_to_value: f64 = conn.query_row(
            "SELECT AVG(time_to_value_seconds) FROM first_run_sessions WHERE completed_at IS NOT NULL",
            [],
            |row| row.get(0),
        ).unwrap_or(0.0);

        Ok(FirstRunStatistics {
            total_sessions: total_sessions as u32,
            completed_sessions: completed_sessions as u32,
            completion_rate: if total_sessions > 0 {
                (completed_sessions as f64 / total_sessions as f64) * 100.0
            } else {
                0.0
            },
            hired_count: hired_count as u32,
            hire_rate: if completed_sessions > 0 {
                (hired_count as f64 / completed_sessions as f64) * 100.0
            } else {
                0.0
            },
            average_time_to_value_seconds: avg_time_to_value as u64,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FirstRunSession {
    pub id: String,
    pub user_id: String,
    pub step: OnboardingStep,
    pub recommended_employees: Vec<AIEmployeeRecommendation>,
    pub demo_results: Option<DemoResult>,
    pub time_to_value_seconds: u64,
    pub selected_employee_id: Option<String>,
    pub started_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum OnboardingStep {
    Welcome,
    ChooseEmployee,
    RunningDemo,
    ViewingResults,
    QuickSetup,
    AssignFirstTask,
    Completed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AIEmployeeRecommendation {
    pub id: String,
    pub name: String,
    pub description: String,
    pub estimated_time_saved_per_run: u64, // minutes
    pub estimated_cost_saved_per_run: f64, // USD
    pub demo_duration_seconds: u64,
    pub match_score: u32, // 0-100
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DemoResult {
    pub employee_id: String,
    pub employee_name: String,
    pub task_description: String,
    pub input_summary: String,
    pub output_summary: String,
    pub actions_taken: Vec<String>,
    pub time_saved_minutes: u64,
    pub cost_saved_usd: f64,
    pub quality_score: f64,
    pub completion_time_seconds: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FirstRunStatistics {
    pub total_sessions: u32,
    pub completed_sessions: u32,
    pub completion_rate: f64,
    pub hired_count: u32,
    pub hire_rate: f64,
    pub average_time_to_value_seconds: u64,
}
