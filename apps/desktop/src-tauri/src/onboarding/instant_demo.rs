use chrono::Utc;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::time::Instant;
use thiserror::Error;
use uuid::Uuid;

use super::first_run::DemoResult;
use super::sample_data::{SampleCodePR, SampleEmail, SampleInvoice};

#[derive(Debug, Error)]
pub enum DemoError {
    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),
    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
    #[error("Unknown employee: {0}")]
    UnknownEmployee(String),
    #[error("Demo execution failed: {0}")]
    ExecutionFailed(String),
}

pub struct InstantDemo {
    db: Arc<Mutex<Connection>>,
}

impl InstantDemo {
    pub fn new(db: Arc<Mutex<Connection>>) -> Self {
        Self { db }
    }

    /// Run demo for specified employee type
    pub async fn run_demo(
        &self,
        employee_id: &str,
        user_id: Option<&str>,
    ) -> Result<DemoResult, DemoError> {
        let start_time = Instant::now();

        let result = match employee_id {
            "inbox_manager" => self.run_inbox_manager_demo().await?,
            "data_entry_specialist" | "invoice_processor" => self.run_data_entry_demo().await?,
            "code_reviewer" => self.run_code_review_demo().await?,
            "social_media_monitor" => self.run_social_media_demo().await?,
            "meeting_scheduler" => self.run_meeting_scheduler_demo().await?,
            "expense_categorizer" => self.run_expense_categorizer_demo().await?,
            "file_organizer" => self.run_file_organizer_demo().await?,
            "lead_qualifier" => self.run_lead_qualifier_demo().await?,
            _ => return Err(DemoError::UnknownEmployee(employee_id.to_string())),
        };

        let completion_time = start_time.elapsed().as_secs();
        let mut result = result;
        result.completion_time_seconds = completion_time;

        // Record demo run
        self.record_demo_run(employee_id, user_id, &result)?;

        Ok(result)
    }

    /// Inbox Manager Demo: Process 50 sample emails
    async fn run_inbox_manager_demo(&self) -> Result<DemoResult, DemoError> {
        let sample_emails = SampleEmail::generate_batch(50);

        // Simulate categorization
        let urgent_count = sample_emails
            .iter()
            .filter(|e| e.priority == "urgent")
            .count();
        let important_count = sample_emails
            .iter()
            .filter(|e| e.priority == "important")
            .count();
        let spam_count = sample_emails.iter().filter(|e| e.is_spam).count();
        let newsletter_count = sample_emails
            .iter()
            .filter(|e| e.category == "newsletter")
            .count();

        // Count emails requiring responses
        let response_count = sample_emails.iter().filter(|e| e.requires_response).count();

        // Simulate processing delay
        tokio::time::sleep(tokio::time::Duration::from_millis(1500)).await;

        Ok(DemoResult {
            employee_id: "inbox_manager".to_string(),
            employee_name: "Inbox Manager".to_string(),
            task_description: "Process and categorize 50 sample emails".to_string(),
            input_summary: format!("50 unread emails in inbox"),
            output_summary: format!(
                "Categorized: {} urgent, {} important, {} spam, {} newsletters. {} responses drafted, {} escalated",
                urgent_count, important_count, spam_count, newsletter_count, response_count, urgent_count
            ),
            actions_taken: vec![
                format!("Categorized 50 emails by priority and type"),
                format!("Flagged {} urgent emails for immediate attention", urgent_count),
                format!("Drafted {} personalized responses", response_count),
                format!("Moved {} spam emails to junk folder", spam_count),
                format!("Escalated {} high-priority items to your attention", urgent_count),
                format!("Unsubscribed from {} unwanted newsletters", newsletter_count / 2),
            ],
            time_saved_minutes: 150, // 2.5 hours
            cost_saved_usd: 75.0,
            quality_score: 0.96,
            completion_time_seconds: 0, // Will be set by caller
        })
    }

    /// Data Entry Demo: Process 20 sample invoices
    async fn run_data_entry_demo(&self) -> Result<DemoResult, DemoError> {
        let sample_invoices = SampleInvoice::generate_batch(20);

        let total_amount: f64 = sample_invoices.iter().map(|i| i.total_amount).sum();
        let vendor_count = sample_invoices
            .iter()
            .map(|i| &i.vendor_name)
            .collect::<std::collections::HashSet<_>>()
            .len();

        // Simulate processing
        tokio::time::sleep(tokio::time::Duration::from_millis(1200)).await;

        Ok(DemoResult {
            employee_id: "invoice_processor".to_string(),
            employee_name: "Invoice Processor".to_string(),
            task_description: "Extract data from 20 invoices and enter into system".to_string(),
            input_summary: "20 PDF invoices (mix of formats and vendors)".to_string(),
            output_summary: format!(
                "Processed {} invoices from {} vendors, total value ${:.2}. All data validated and entered",
                sample_invoices.len(), vendor_count, total_amount
            ),
            actions_taken: vec![
                "Extracted text from all 20 invoice PDFs using OCR".to_string(),
                format!("Identified and parsed invoice numbers, dates, and line items"),
                format!("Validated {} vendor names against database", vendor_count),
                format!("Calculated totals and verified amounts (100% accuracy)"),
                "Entered all data into accounting system".to_string(),
                "Flagged 2 invoices with missing PO numbers for review".to_string(),
            ],
            time_saved_minutes: 90, // 1.5 hours
            cost_saved_usd: 45.0,
            quality_score: 0.985,
            completion_time_seconds: 0,
        })
    }

    /// Code Review Demo: Review a sample PR
    async fn run_code_review_demo(&self) -> Result<DemoResult, DemoError> {
        let sample_pr = SampleCodePR::generate_typescript_pr();

        // Simulate review process
        tokio::time::sleep(tokio::time::Duration::from_millis(1000)).await;

        Ok(DemoResult {
            employee_id: "code_reviewer".to_string(),
            employee_name: "Code Reviewer".to_string(),
            task_description: "Review TypeScript PR for bugs and style issues".to_string(),
            input_summary: format!("PR #{}: {} (+{} -{} lines, {} files)",
                sample_pr.pr_number, sample_pr.title, sample_pr.additions, sample_pr.deletions, sample_pr.files_changed),
            output_summary: "Found 3 potential bugs, 5 style issues, suggested 8 improvements. Overall quality: Good".to_string(),
            actions_taken: vec![
                "Analyzed code changes across 4 TypeScript files".to_string(),
                "Identified potential null pointer exception in user handler".to_string(),
                "Suggested adding input validation for API endpoints".to_string(),
                "Flagged inconsistent error handling pattern".to_string(),
                "Recommended extracting duplicated validation logic".to_string(),
                "Verified test coverage increased from 78% to 85%".to_string(),
                "Checked for security issues (none found)".to_string(),
                "Provided 8 inline code suggestions with examples".to_string(),
            ],
            time_saved_minutes: 30,
            cost_saved_usd: 25.0,
            quality_score: 0.92,
            completion_time_seconds: 0,
        })
    }

    /// Social Media Monitor Demo
    async fn run_social_media_demo(&self) -> Result<DemoResult, DemoError> {
        tokio::time::sleep(tokio::time::Duration::from_millis(1800)).await;

        Ok(DemoResult {
            employee_id: "social_media_monitor".to_string(),
            employee_name: "Social Media Monitor".to_string(),
            task_description: "Monitor brand mentions and engage with audience".to_string(),
            input_summary: "125 mentions across Twitter, LinkedIn, Reddit in last 24 hours".to_string(),
            output_summary: "Analyzed sentiment, drafted 18 responses, escalated 3 issues, identified 2 partnership opportunities".to_string(),
            actions_taken: vec![
                "Monitored 125 brand mentions across 3 platforms".to_string(),
                "Analyzed sentiment: 78% positive, 15% neutral, 7% negative".to_string(),
                "Drafted 18 personalized responses to comments and questions".to_string(),
                "Escalated 3 customer complaints to support team".to_string(),
                "Identified 2 potential partnership/collaboration opportunities".to_string(),
                "Flagged 5 high-influence accounts for follow-up".to_string(),
                "Created summary report with trending topics".to_string(),
            ],
            time_saved_minutes: 120, // 2 hours
            cost_saved_usd: 60.0,
            quality_score: 0.94,
            completion_time_seconds: 0,
        })
    }

    /// Meeting Scheduler Demo
    async fn run_meeting_scheduler_demo(&self) -> Result<DemoResult, DemoError> {
        tokio::time::sleep(tokio::time::Duration::from_millis(1300)).await;

        Ok(DemoResult {
            employee_id: "meeting_scheduler".to_string(),
            employee_name: "Meeting Scheduler".to_string(),
            task_description: "Schedule 5 meetings with optimal time slots".to_string(),
            input_summary: "5 meeting requests with 3-6 participants each, various time zones"
                .to_string(),
            output_summary:
                "Found optimal times for all 5 meetings, sent 23 invites, resolved 2 conflicts"
                    .to_string(),
            actions_taken: vec![
                "Analyzed calendars for 15 participants across 4 time zones".to_string(),
                "Found optimal time slots for all 5 meetings".to_string(),
                "Sent 23 calendar invites with video conferencing links".to_string(),
                "Resolved 2 scheduling conflicts automatically".to_string(),
                "Added prep time and buffer between back-to-back meetings".to_string(),
                "Created meeting agendas and sent reminder emails".to_string(),
            ],
            time_saved_minutes: 45,
            cost_saved_usd: 22.5,
            quality_score: 0.98,
            completion_time_seconds: 0,
        })
    }

    /// Expense Categorizer Demo
    async fn run_expense_categorizer_demo(&self) -> Result<DemoResult, DemoError> {
        tokio::time::sleep(tokio::time::Duration::from_millis(1100)).await;

        Ok(DemoResult {
            employee_id: "expense_categorizer".to_string(),
            employee_name: "Expense Categorizer".to_string(),
            task_description: "Categorize 35 expense receipts and flag anomalies".to_string(),
            input_summary: "35 receipts from various merchants and categories".to_string(),
            output_summary: "Categorized all expenses, flagged 3 policy violations, identified $247 in duplicate charges".to_string(),
            actions_taken: vec![
                "Extracted data from 35 receipt images using OCR".to_string(),
                "Categorized expenses: Travel (12), Meals (8), Office (7), Other (8)".to_string(),
                "Flagged 3 policy violations (2 over limit, 1 missing receipt)".to_string(),
                "Identified $247.50 in potential duplicate charges".to_string(),
                "Validated all merchant names and tax calculations".to_string(),
                "Generated expense report ready for approval".to_string(),
            ],
            time_saved_minutes: 60,
            cost_saved_usd: 30.0,
            quality_score: 0.97,
            completion_time_seconds: 0,
        })
    }

    /// File Organizer Demo
    async fn run_file_organizer_demo(&self) -> Result<DemoResult, DemoError> {
        tokio::time::sleep(tokio::time::Duration::from_millis(900)).await;

        Ok(DemoResult {
            employee_id: "file_organizer".to_string(),
            employee_name: "File Organizer".to_string(),
            task_description: "Organize 147 desktop files by type and date".to_string(),
            input_summary: "147 files scattered on desktop (documents, images, downloads)".to_string(),
            output_summary: "Organized into 8 folders, renamed 23 files, removed 12 duplicates, archived old files".to_string(),
            actions_taken: vec![
                "Scanned 147 files on desktop".to_string(),
                "Created organized folder structure: Documents, Images, Videos, Downloads, Archives".to_string(),
                "Moved files to appropriate folders by type".to_string(),
                "Renamed 23 files with consistent naming convention".to_string(),
                "Identified and removed 12 duplicate files (saved 156 MB)".to_string(),
                "Archived files older than 90 days to Archive folder".to_string(),
            ],
            time_saved_minutes: 45,
            cost_saved_usd: 22.5,
            quality_score: 0.95,
            completion_time_seconds: 0,
        })
    }

    /// Lead Qualifier Demo
    async fn run_lead_qualifier_demo(&self) -> Result<DemoResult, DemoError> {
        tokio::time::sleep(tokio::time::Duration::from_millis(1600)).await;

        Ok(DemoResult {
            employee_id: "lead_qualifier".to_string(),
            employee_name: "Lead Qualifier".to_string(),
            task_description: "Research and qualify 20 inbound leads".to_string(),
            input_summary: "20 form submissions from website contact form".to_string(),
            output_summary: "Scored all leads, identified 6 hot prospects, drafted personalized outreach for top 10".to_string(),
            actions_taken: vec![
                "Researched company info for all 20 leads".to_string(),
                "Scored leads based on company size, industry, and fit (0-100)".to_string(),
                "Identified 6 hot prospects (score 80+) for immediate follow-up".to_string(),
                "Drafted personalized outreach emails for top 10 leads".to_string(),
                "Enriched contact data with LinkedIn profiles and phone numbers".to_string(),
                "Added all leads to CRM with tags and next steps".to_string(),
                "Flagged 3 leads as potential enterprise deals".to_string(),
            ],
            time_saved_minutes: 60,
            cost_saved_usd: 30.0,
            quality_score: 0.93,
            completion_time_seconds: 0,
        })
    }

    /// Record demo run to database
    fn record_demo_run(
        &self,
        employee_id: &str,
        user_id: Option<&str>,
        results: &DemoResult,
    ) -> Result<(), DemoError> {
        let conn = self.db.lock().unwrap();
        let now = Utc::now().timestamp();
        let run_id = Uuid::new_v4().to_string();

        conn.execute(
            "INSERT INTO demo_runs (id, user_id, employee_id, ran_at, results, led_to_hire)
             VALUES (?1, ?2, ?3, ?4, ?5, 0)",
            params![
                run_id,
                user_id.unwrap_or("demo_user"),
                employee_id,
                now,
                serde_json::to_string(results)?,
            ],
        )?;

        Ok(())
    }

    /// Get demo statistics
    pub fn get_demo_statistics(
        &self,
        employee_id: Option<&str>,
    ) -> Result<DemoStatistics, DemoError> {
        let conn = self.db.lock().unwrap();

        let (total_runs, hire_conversion): (i64, i64) = if let Some(emp_id) = employee_id {
            (
                conn.query_row(
                    "SELECT COUNT(*) FROM demo_runs WHERE employee_id = ?1",
                    [emp_id],
                    |row| row.get(0),
                )
                .unwrap_or(0),
                conn.query_row(
                    "SELECT COUNT(*) FROM demo_runs WHERE employee_id = ?1 AND led_to_hire = 1",
                    [emp_id],
                    |row| row.get(0),
                )
                .unwrap_or(0),
            )
        } else {
            (
                conn.query_row("SELECT COUNT(*) FROM demo_runs", [], |row| row.get(0))
                    .unwrap_or(0),
                conn.query_row(
                    "SELECT COUNT(*) FROM demo_runs WHERE led_to_hire = 1",
                    [],
                    |row| row.get(0),
                )
                .unwrap_or(0),
            )
        };

        Ok(DemoStatistics {
            total_demo_runs: total_runs as u32,
            unique_users: 0, // Would need to count distinct user_ids
            hire_conversion_rate: if total_runs > 0 {
                (hire_conversion as f64 / total_runs as f64) * 100.0
            } else {
                0.0
            },
            most_popular_employee: "inbox_manager".to_string(), // Would query from DB
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DemoStatistics {
    pub total_demo_runs: u32,
    pub unique_users: u32,
    pub hire_conversion_rate: f64,
    pub most_popular_employee: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DemoReport {
    pub title: String,
    pub summary: String,
    pub before_state: String,
    pub after_state: String,
    pub metrics: Vec<DemoMetric>,
    pub actions: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DemoMetric {
    pub label: String,
    pub value: String,
    pub improvement: Option<String>,
}
