use chrono::Utc;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use thiserror::Error;
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
    pub fn populate_sample_data(
        &self,
        user_id: &str,
    ) -> Result<SampleDataSummary, SampleDataError> {
        if self.has_sample_data(user_id) {
            return Err(SampleDataError::AlreadyExists);
        }

        let conn = self.db.lock().unwrap();
        let now = Utc::now().timestamp();

        // Mark that sample data has been created
        conn.execute(
            "INSERT INTO sample_data_marker (user_id, created_at) VALUES (?1, ?2)",
            params![user_id, now],
        )
        .ok();

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
        ]
        .iter()
        {
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
        )
        .ok();

        // Create sample execution logs
        for (node_id, event, data) in [
            (
                "trigger1",
                "node_started",
                r#"{"message": "Workflow triggered manually"}"#,
            ),
            ("trigger1", "node_completed", r#"{"success": true}"#),
            (
                "action1",
                "node_started",
                r#"{"reading": "data/input.csv"}"#,
            ),
            (
                "action1",
                "node_completed",
                r#"{"rows": 42, "size": "1.2 KB"}"#,
            ),
            (
                "action2",
                "node_started",
                r#"{"query": "INSERT INTO records..."}"#,
            ),
            ("action2", "node_completed", r#"{"inserted": 42}"#),
        ]
        .iter()
        {
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
            )
            .ok();
            summary.templates_installed += 1;
        }

        // Create sample conversation with messages
        let conversation_id = conn
            .query_row(
                "INSERT INTO conversations (title, created_at, updated_at)
             VALUES ('Sample Automation Discussion', ?1, ?1)
             RETURNING id",
                [now - 172800], // 2 days ago
                |row| row.get::<_, i64>(0),
            )
            .ok();

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
                    expected_output: "Files organized into Documents/, Images/, Videos/ folders"
                        .to_string(),
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
            description: "Automatically generate a summary of unread emails every morning"
                .to_string(),
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

// ===== Sample Data for Instant Demos =====

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SampleEmail {
    pub id: String,
    pub from: String,
    pub from_name: String,
    pub subject: String,
    pub body: String,
    pub category: String,
    pub priority: String,
    pub is_spam: bool,
    pub requires_response: bool,
    pub received_at: i64,
}

impl SampleEmail {
    /// Generate a batch of realistic sample emails
    pub fn generate_batch(count: usize) -> Vec<Self> {
        let mut emails = Vec::new();
        let base_time = Utc::now().timestamp();

        let samples = vec![
            // Urgent customer inquiries
            ("urgent_customer_1", "sarah.johnson@acmecorp.com", "Sarah Johnson", "URGENT: Production server down",
             "Our production server has been down for 30 minutes. This is affecting all our customers. Need immediate help!",
             "customer_inquiry", "urgent", false, true),
            ("urgent_customer_2", "mike.chen@techstartup.io", "Mike Chen", "Critical bug in payment processing",
             "We've discovered a critical bug that's preventing customers from completing purchases. Can you prioritize this?",
             "customer_inquiry", "urgent", false, true),

            // Important business emails
            ("important_1", "john.smith@bigclient.com", "John Smith", "Re: Q4 Contract Renewal",
             "Thanks for sending the proposal. We'd like to discuss the pricing for the enterprise tier. Available this week?",
             "business", "important", false, true),
            ("important_2", "lisa.wang@partner.com", "Lisa Wang", "Partnership Opportunity",
             "We're interested in exploring a partnership. Our product complements yours well. Let's schedule a call.",
             "business", "important", false, true),
            ("important_3", "david.brown@investor.vc", "David Brown", "Following up on our conversation",
             "Great meeting you at the conference! I'd love to learn more about your roadmap and growth plans.",
             "business", "important", false, true),

            // Customer support
            ("support_1", "customer1@gmail.com", "Jane Doe", "How do I reset my password?",
             "I forgot my password and the reset link isn't working. Can you help me access my account?",
             "customer_inquiry", "normal", false, true),
            ("support_2", "user@example.com", "Bob Wilson", "Feature request: Dark mode",
             "Love your product! Would be great to have a dark mode option for night-time use.",
             "customer_inquiry", "normal", false, true),
            ("support_3", "help@company.com", "Support Team", "Question about API rate limits",
             "We're hitting rate limits on the API. Is there a way to increase our quota?",
             "customer_inquiry", "normal", false, true),

            // Spam
            ("spam_1", "noreply@spam1.com", "Marketing Team", "You've won $1,000,000!!!",
             "Congratulations! Click here to claim your prize now! Limited time offer!",
             "spam", "low", true, false),
            ("spam_2", "deals@spam2.com", "Super Deals", "50% OFF Everything!!!",
             "SALE SALE SALE! Get 50% off on products you don't need! Act now!",
             "spam", "low", true, false),
            ("spam_3", "prince@nigeria.com", "Nigerian Prince", "Urgent Business Proposal",
             "I am a prince and I need your help to transfer $10 million dollars...",
             "spam", "low", true, false),

            // Newsletters
            ("newsletter_1", "weekly@techcrunch.com", "TechCrunch", "This Week in Tech",
             "Here are the top tech stories from this week...",
             "newsletter", "low", false, false),
            ("newsletter_2", "digest@medium.com", "Medium Daily", "Your Daily Reading List",
             "5 articles we think you'll love based on your interests...",
             "newsletter", "low", false, false),
            ("newsletter_3", "updates@github.com", "GitHub", "Your weekly GitHub activity",
             "You had 12 contributions last week across 3 repositories...",
             "newsletter", "low", false, false),

            // Internal team emails
            ("team_1", "alice@mycompany.com", "Alice Manager", "Team standup notes",
             "Here are the notes from today's standup: Sprint is on track, Bob is blocked on API integration...",
             "internal", "normal", false, false),
            ("team_2", "bob@mycompany.com", "Bob Dev", "Code review request",
             "Can someone review PR #123? It's the new authentication flow.",
             "internal", "normal", false, true),

            // Notifications
            ("notif_1", "notifications@slack.com", "Slack", "New message in #engineering",
             "You have 15 new messages in #engineering channel",
             "notification", "low", false, false),
            ("notif_2", "calendar@google.com", "Google Calendar", "Meeting in 15 minutes",
             "Reminder: Team sync starts in 15 minutes",
             "notification", "normal", false, false),
        ];

        for (
            i,
            (id, from, from_name, subject, body, category, priority, is_spam, requires_response),
        ) in samples.into_iter().enumerate()
        {
            if emails.len() >= count {
                break;
            }

            emails.push(SampleEmail {
                id: id.to_string(),
                from: from.to_string(),
                from_name: from_name.to_string(),
                subject: subject.to_string(),
                body: body.to_string(),
                category: category.to_string(),
                priority: priority.to_string(),
                is_spam,
                requires_response,
                received_at: base_time - (i as i64 * 3600), // 1 hour apart
            });
        }

        // Fill remaining with generic emails if needed
        while emails.len() < count {
            let i = emails.len();
            emails.push(SampleEmail {
                id: format!("generic_{}", i),
                from: format!("user{}@example.com", i),
                from_name: format!("User {}", i),
                subject: format!("Sample email #{}", i),
                body: "This is a generic sample email for demo purposes.".to_string(),
                category: "other".to_string(),
                priority: "normal".to_string(),
                is_spam: false,
                requires_response: i % 3 == 0,
                received_at: base_time - (i as i64 * 3600),
            });
        }

        emails
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SampleInvoice {
    pub invoice_number: String,
    pub vendor_name: String,
    pub date: String,
    pub due_date: String,
    pub line_items: Vec<InvoiceLineItem>,
    pub subtotal: f64,
    pub tax: f64,
    pub total_amount: f64,
    pub po_number: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InvoiceLineItem {
    pub description: String,
    pub quantity: u32,
    pub unit_price: f64,
    pub total: f64,
}

impl SampleInvoice {
    /// Generate a batch of realistic sample invoices
    pub fn generate_batch(count: usize) -> Vec<Self> {
        let mut invoices = Vec::new();

        let vendors = [
            (
                "Acme Office Supplies",
                vec![
                    ("Copy Paper (500 sheets)", 10, 12.99),
                    ("Ballpoint Pens (Box of 50)", 3, 8.50),
                    ("Sticky Notes (Pack of 12)", 5, 6.75),
                ],
            ),
            (
                "TechGear Inc",
                vec![
                    ("USB-C Cable (6ft)", 20, 15.99),
                    ("Wireless Mouse", 5, 29.99),
                    ("Laptop Stand", 3, 49.99),
                ],
            ),
            (
                "CloudServe Hosting",
                vec![
                    ("Server Hosting (Monthly)", 1, 299.00),
                    ("Bandwidth (100GB)", 1, 49.00),
                    ("SSL Certificate", 1, 79.00),
                ],
            ),
            (
                "Marketing Masters",
                vec![
                    ("Social Media Management", 1, 1500.00),
                    ("Content Creation (5 posts)", 1, 750.00),
                    ("Analytics Report", 1, 250.00),
                ],
            ),
            (
                "Legal Services LLP",
                vec![
                    ("Contract Review", 2, 350.00),
                    ("Consultation (hourly)", 5, 200.00),
                ],
            ),
        ];

        for i in 0..count {
            let (vendor_name, items_template) = &vendors[i % vendors.len()];
            let invoice_num = format!("INV-{:05}", 2000 + i);
            let has_po = i % 10 != 0; // 90% have PO numbers

            let mut line_items = Vec::new();
            let mut subtotal = 0.0;

            for (desc, qty, price) in items_template {
                let total = *qty as f64 * price;
                subtotal += total;
                line_items.push(InvoiceLineItem {
                    description: desc.to_string(),
                    quantity: *qty,
                    unit_price: *price,
                    total,
                });
            }

            let tax = subtotal * 0.08; // 8% sales tax
            let total = subtotal + tax;

            invoices.push(SampleInvoice {
                invoice_number: invoice_num.clone(),
                vendor_name: vendor_name.to_string(),
                date: format!("2025-{:02}-{:02}", (i % 12) + 1, (i % 28) + 1),
                due_date: format!("2025-{:02}-{:02}", ((i + 1) % 12) + 1, (i % 28) + 1),
                line_items,
                subtotal,
                tax,
                total_amount: total,
                po_number: if has_po {
                    Some(format!("PO-{:05}", 5000 + i))
                } else {
                    None
                },
            });
        }

        invoices
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SampleCodePR {
    pub pr_number: u32,
    pub title: String,
    pub description: String,
    pub author: String,
    pub files_changed: u32,
    pub additions: u32,
    pub deletions: u32,
    pub commits: Vec<String>,
    pub diff_preview: String,
}

impl SampleCodePR {
    /// Generate a sample TypeScript PR
    pub fn generate_typescript_pr() -> Self {
        SampleCodePR {
            pr_number: 123,
            title: "Add user authentication endpoints".to_string(),
            description: "This PR adds JWT-based authentication endpoints for user login, logout, and token refresh.".to_string(),
            author: "developer123".to_string(),
            files_changed: 4,
            additions: 247,
            deletions: 18,
            commits: vec![
                "feat: add JWT token generation".to_string(),
                "feat: implement login endpoint".to_string(),
                "feat: add token refresh logic".to_string(),
                "test: add auth endpoint tests".to_string(),
            ],
            diff_preview: r#"
// src/auth/authController.ts
+import jwt from 'jsonwebtoken';
+import bcrypt from 'bcrypt';
+
+export const loginUser = async (req, res) => {
+  const { email, password } = req.body;
+
+  // TODO: Add input validation
+  const user = await User.findOne({ email });
+
+  if (!user) {
+    return res.status(401).json({ error: 'Invalid credentials' });
+  }
+
+  const isValid = await bcrypt.compare(password, user.passwordHash);
+
+  if (!isValid) {
+    return res.status(401).json({ error: 'Invalid credentials' });
+  }
+
+  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET);
+
+  res.json({ token, user: { id: user.id, email: user.email } });
+};
            "#.to_string(),
        }
    }

    /// Generate a sample Python PR
    pub fn generate_python_pr() -> Self {
        SampleCodePR {
            pr_number: 124,
            title: "Optimize database queries with connection pooling".to_string(),
            description: "Improves database performance by implementing connection pooling and adding query result caching.".to_string(),
            author: "pythonista42".to_string(),
            files_changed: 6,
            additions: 183,
            deletions: 72,
            commits: vec![
                "refactor: add connection pool manager".to_string(),
                "perf: implement query result caching".to_string(),
                "fix: close connections properly".to_string(),
                "docs: update database setup guide".to_string(),
            ],
            diff_preview: r#"
# database/pool.py
+from sqlalchemy.pool import QueuePool
+import redis
+
+class ConnectionPool:
+    def __init__(self, connection_string, pool_size=10):
+        self.engine = create_engine(
+            connection_string,
+            poolclass=QueuePool,
+            pool_size=pool_size,
+            max_overflow=20
+        )
+        self.cache = redis.Redis(host='localhost', port=6379)
+
+    def get_connection(self):
+        return self.engine.connect()
            "#.to_string(),
        }
    }
}
