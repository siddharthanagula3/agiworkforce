use super::*;
use chrono::Utc;

/// Get all pre-built AI employees with complete configurations
pub fn get_pre_built_employees() -> Vec<AIEmployee> {
    vec![
        // ===== CUSTOMER SUPPORT EMPLOYEES =====
        create_support_agent(),
        create_email_responder(),
        create_live_chat_bot(),
        create_ticket_triager(),
        // ===== SALES & MARKETING EMPLOYEES =====
        create_lead_qualifier(),
        create_email_campaigner(),
        create_social_media_manager(),
        create_content_writer(),
        // ===== OPERATIONS EMPLOYEES =====
        create_data_entry_specialist(),
        create_invoice_processor(),
        create_expense_reconciler(),
        create_schedule_manager(),
        // ===== DEVELOPMENT EMPLOYEES =====
        create_code_reviewer(),
        create_bug_triager(),
        create_documentation_writer(),
        create_test_runner(),
        // ===== PERSONAL ASSISTANT EMPLOYEES =====
        create_inbox_manager(),
        create_calendar_optimizer(),
        create_task_organizer(),
        create_research_assistant(),
    ]
}

// ===== CUSTOMER SUPPORT EMPLOYEES =====

fn create_support_agent() -> AIEmployee {
    AIEmployee {
        id: "support-agent-001".to_string(),
        name: "Customer Support Agent".to_string(),
        role: EmployeeRole::SupportAgent,
        description: "Handles customer inquiries by searching knowledge bases, drafting personalized responses, and escalating complex issues. Provides 24/7 support coverage.".to_string(),
        capabilities: vec![
            "Search knowledge base for answers".to_string(),
            "Draft personalized email responses".to_string(),
            "Escalate complex issues to human agents".to_string(),
            "Track customer satisfaction metrics".to_string(),
            "Auto-categorize support tickets".to_string(),
        ],
        estimated_time_saved_per_run: 15, // 15 minutes per customer inquiry
        estimated_cost_saved_per_run: 12.50, // $50/hr support agent rate
        demo_workflow: Some(super::demo_workflows::support_agent_demo()),
        required_integrations: vec!["knowledge_base".to_string(), "email".to_string()],
        template_id: Some("support-agent-template".to_string()),
        is_verified: true,
        usage_count: 0,
        avg_rating: 4.8,
        created_at: Utc::now().timestamp(),
        tags: vec!["customer-support".to_string(), "email".to_string(), "24-7".to_string()],
    }
}

fn create_email_responder() -> AIEmployee {
    AIEmployee {
        id: "email-responder-001".to_string(),
        name: "Auto Email Responder".to_string(),
        role: EmployeeRole::EmailResponder,
        description: "Automatically responds to common emails using pre-approved templates, identifies urgent messages, and flags emails requiring human attention.".to_string(),
        capabilities: vec![
            "Auto-respond to common inquiries".to_string(),
            "Detect email sentiment and urgency".to_string(),
            "Apply appropriate email templates".to_string(),
            "Flag emails needing human review".to_string(),
            "Track response times and SLAs".to_string(),
        ],
        estimated_time_saved_per_run: 5, // 5 minutes per email
        estimated_cost_saved_per_run: 4.16, // $50/hr rate
        demo_workflow: Some(super::demo_workflows::email_responder_demo()),
        required_integrations: vec!["email".to_string()],
        template_id: Some("email-responder-template".to_string()),
        is_verified: true,
        usage_count: 0,
        avg_rating: 4.7,
        created_at: Utc::now().timestamp(),
        tags: vec!["email".to_string(), "automation".to_string(), "customer-service".to_string()],
    }
}

fn create_live_chat_bot() -> AIEmployee {
    AIEmployee {
        id: "live-chat-bot-001".to_string(),
        name: "Live Chat Bot".to_string(),
        role: EmployeeRole::LiveChatBot,
        description: "Provides real-time chat support, answers FAQs, guides customers through troubleshooting, and seamlessly transfers to human agents when needed.".to_string(),
        capabilities: vec![
            "Real-time chat conversations".to_string(),
            "Answer FAQs instantly".to_string(),
            "Guide through troubleshooting steps".to_string(),
            "Transfer to human agents".to_string(),
            "Multi-language support".to_string(),
        ],
        estimated_time_saved_per_run: 10, // 10 minutes per chat session
        estimated_cost_saved_per_run: 8.33, // $50/hr rate
        demo_workflow: Some(super::demo_workflows::live_chat_bot_demo()),
        required_integrations: vec!["live_chat".to_string(), "knowledge_base".to_string()],
        template_id: Some("live-chat-bot-template".to_string()),
        is_verified: true,
        usage_count: 0,
        avg_rating: 4.6,
        created_at: Utc::now().timestamp(),
        tags: vec!["chat".to_string(), "real-time".to_string(), "customer-support".to_string()],
    }
}

fn create_ticket_triager() -> AIEmployee {
    AIEmployee {
        id: "ticket-triager-001".to_string(),
        name: "Support Ticket Triager".to_string(),
        role: EmployeeRole::TicketTriager,
        description: "Automatically categorizes support tickets, assigns priority levels, routes to appropriate teams, and identifies duplicate issues.".to_string(),
        capabilities: vec![
            "Auto-categorize tickets by type".to_string(),
            "Assign priority (P0-P4)".to_string(),
            "Route to appropriate team".to_string(),
            "Detect duplicate tickets".to_string(),
            "Suggest relevant KB articles".to_string(),
        ],
        estimated_time_saved_per_run: 3, // 3 minutes per ticket
        estimated_cost_saved_per_run: 2.50, // $50/hr rate
        demo_workflow: Some(super::demo_workflows::ticket_triager_demo()),
        required_integrations: vec!["ticketing_system".to_string()],
        template_id: Some("ticket-triager-template".to_string()),
        is_verified: true,
        usage_count: 0,
        avg_rating: 4.9,
        created_at: Utc::now().timestamp(),
        tags: vec!["tickets".to_string(), "triage".to_string(), "automation".to_string()],
    }
}

// ===== SALES & MARKETING EMPLOYEES =====

fn create_lead_qualifier() -> AIEmployee {
    AIEmployee {
        id: "lead-qualifier-001".to_string(),
        name: "Lead Qualifier".to_string(),
        role: EmployeeRole::LeadQualifier,
        description: "Automatically scores leads based on qualification criteria, enriches contact data from public sources, and sends qualified leads to sales team.".to_string(),
        capabilities: vec![
            "Score leads using BANT framework".to_string(),
            "Enrich contact data from LinkedIn, databases".to_string(),
            "Send to CRM with qualification notes".to_string(),
            "Schedule follow-up reminders".to_string(),
            "Track lead conversion rates".to_string(),
        ],
        estimated_time_saved_per_run: 20, // 20 minutes per lead
        estimated_cost_saved_per_run: 20.00, // $60/hr sales rep rate
        demo_workflow: Some(super::demo_workflows::lead_qualifier_demo()),
        required_integrations: vec!["crm".to_string(), "email".to_string()],
        template_id: Some("lead-qualifier-template".to_string()),
        is_verified: true,
        usage_count: 0,
        avg_rating: 4.8,
        created_at: Utc::now().timestamp(),
        tags: vec!["sales".to_string(), "leads".to_string(), "crm".to_string()],
    }
}

fn create_email_campaigner() -> AIEmployee {
    AIEmployee {
        id: "email-campaigner-001".to_string(),
        name: "Email Campaign Manager".to_string(),
        role: EmployeeRole::EmailCampaigner,
        description: "Drafts personalized email campaigns, segments contact lists, schedules sends, and tracks open/click rates.".to_string(),
        capabilities: vec![
            "Generate personalized email copy".to_string(),
            "Segment lists by criteria".to_string(),
            "Schedule optimal send times".to_string(),
            "Track engagement metrics".to_string(),
            "A/B test subject lines".to_string(),
        ],
        estimated_time_saved_per_run: 60, // 1 hour per campaign
        estimated_cost_saved_per_run: 50.00, // $50/hr marketing rate
        demo_workflow: Some(super::demo_workflows::email_campaigner_demo()),
        required_integrations: vec!["email".to_string(), "marketing_automation".to_string()],
        template_id: Some("email-campaigner-template".to_string()),
        is_verified: true,
        usage_count: 0,
        avg_rating: 4.7,
        created_at: Utc::now().timestamp(),
        tags: vec!["marketing".to_string(), "email".to_string(), "campaigns".to_string()],
    }
}

fn create_social_media_manager() -> AIEmployee {
    AIEmployee {
        id: "social-media-manager-001".to_string(),
        name: "Social Media Manager".to_string(),
        role: EmployeeRole::SocialMediaManager,
        description: "Creates and schedules social media posts, responds to mentions and comments, tracks engagement metrics across platforms.".to_string(),
        capabilities: vec![
            "Generate engaging post content".to_string(),
            "Schedule posts across platforms".to_string(),
            "Respond to mentions and DMs".to_string(),
            "Track engagement and reach".to_string(),
            "Identify trending topics".to_string(),
        ],
        estimated_time_saved_per_run: 45, // 45 minutes per day
        estimated_cost_saved_per_run: 37.50, // $50/hr rate
        demo_workflow: Some(super::demo_workflows::social_media_manager_demo()),
        required_integrations: vec!["twitter".to_string(), "linkedin".to_string(), "facebook".to_string()],
        template_id: Some("social-media-manager-template".to_string()),
        is_verified: true,
        usage_count: 0,
        avg_rating: 4.6,
        created_at: Utc::now().timestamp(),
        tags: vec!["social-media".to_string(), "marketing".to_string(), "content".to_string()],
    }
}

fn create_content_writer() -> AIEmployee {
    AIEmployee {
        id: "content-writer-001".to_string(),
        name: "Content Writer".to_string(),
        role: EmployeeRole::ContentWriter,
        description: "Generates blog posts, product descriptions, social media content, and marketing copy in your brand voice.".to_string(),
        capabilities: vec![
            "Write SEO-optimized blog posts".to_string(),
            "Generate product descriptions".to_string(),
            "Create social media captions".to_string(),
            "Draft email newsletter content".to_string(),
            "Match brand voice and tone".to_string(),
        ],
        estimated_time_saved_per_run: 120, // 2 hours per piece
        estimated_cost_saved_per_run: 150.00, // $75/hr writer rate
        demo_workflow: Some(super::demo_workflows::content_writer_demo()),
        required_integrations: vec![],
        template_id: Some("content-writer-template".to_string()),
        is_verified: true,
        usage_count: 0,
        avg_rating: 4.8,
        created_at: Utc::now().timestamp(),
        tags: vec!["content".to_string(), "writing".to_string(), "seo".to_string()],
    }
}

// ===== OPERATIONS EMPLOYEES =====

fn create_data_entry_specialist() -> AIEmployee {
    AIEmployee {
        id: "data-entry-specialist-001".to_string(),
        name: "Data Entry Specialist".to_string(),
        role: EmployeeRole::DataEntry,
        description: "Extracts data from documents (PDFs, images, forms), validates entries, and inputs into databases or spreadsheets with high accuracy.".to_string(),
        capabilities: vec![
            "OCR text extraction from documents".to_string(),
            "Validate data against rules".to_string(),
            "Input to databases/spreadsheets".to_string(),
            "Detect and flag anomalies".to_string(),
            "Generate data quality reports".to_string(),
        ],
        estimated_time_saved_per_run: 30, // 30 minutes per batch
        estimated_cost_saved_per_run: 15.00, // $30/hr data entry rate
        demo_workflow: Some(super::demo_workflows::data_entry_demo()),
        required_integrations: vec!["ocr".to_string(), "database".to_string()],
        template_id: Some("data-entry-template".to_string()),
        is_verified: true,
        usage_count: 0,
        avg_rating: 4.9,
        created_at: Utc::now().timestamp(),
        tags: vec!["data-entry".to_string(), "ocr".to_string(), "automation".to_string()],
    }
}

fn create_invoice_processor() -> AIEmployee {
    AIEmployee {
        id: "invoice-processor-001".to_string(),
        name: "Invoice Processor".to_string(),
        role: EmployeeRole::InvoiceProcessor,
        description: "Reads invoices, extracts key fields (amount, date, vendor), validates against POs, and updates accounting system.".to_string(),
        capabilities: vec![
            "Extract invoice data (OCR)".to_string(),
            "Match to purchase orders".to_string(),
            "Validate amounts and dates".to_string(),
            "Update accounting software".to_string(),
            "Flag discrepancies for review".to_string(),
        ],
        estimated_time_saved_per_run: 10, // 10 minutes per invoice
        estimated_cost_saved_per_run: 10.00, // $60/hr accounting rate
        demo_workflow: Some(super::demo_workflows::invoice_processor_demo()),
        required_integrations: vec!["ocr".to_string(), "accounting".to_string()],
        template_id: Some("invoice-processor-template".to_string()),
        is_verified: true,
        usage_count: 0,
        avg_rating: 4.8,
        created_at: Utc::now().timestamp(),
        tags: vec!["accounting".to_string(), "invoices".to_string(), "finance".to_string()],
    }
}

fn create_expense_reconciler() -> AIEmployee {
    AIEmployee {
        id: "expense-reconciler-001".to_string(),
        name: "Expense Reconciler".to_string(),
        role: EmployeeRole::ExpenseReconciler,
        description: "Matches receipts to credit card transactions, categorizes expenses, flags policy violations, and generates expense reports.".to_string(),
        capabilities: vec![
            "Match receipts to transactions".to_string(),
            "Auto-categorize expenses".to_string(),
            "Detect policy violations".to_string(),
            "Generate expense reports".to_string(),
            "Track spending by category".to_string(),
        ],
        estimated_time_saved_per_run: 20, // 20 minutes per report
        estimated_cost_saved_per_run: 20.00, // $60/hr accounting rate
        demo_workflow: Some(super::demo_workflows::expense_reconciler_demo()),
        required_integrations: vec!["ocr".to_string(), "accounting".to_string(), "banking".to_string()],
        template_id: Some("expense-reconciler-template".to_string()),
        is_verified: true,
        usage_count: 0,
        avg_rating: 4.7,
        created_at: Utc::now().timestamp(),
        tags: vec!["expenses".to_string(), "accounting".to_string(), "finance".to_string()],
    }
}

fn create_schedule_manager() -> AIEmployee {
    AIEmployee {
        id: "schedule-manager-001".to_string(),
        name: "Schedule Manager".to_string(),
        role: EmployeeRole::ScheduleManager,
        description: "Optimizes calendars by finding meeting times, scheduling across time zones, handling conflicts, and sending reminders.".to_string(),
        capabilities: vec![
            "Find optimal meeting times".to_string(),
            "Handle time zone conversions".to_string(),
            "Resolve calendar conflicts".to_string(),
            "Send meeting reminders".to_string(),
            "Optimize schedule for deep work".to_string(),
        ],
        estimated_time_saved_per_run: 15, // 15 minutes per scheduling task
        estimated_cost_saved_per_run: 12.50, // $50/hr admin rate
        demo_workflow: Some(super::demo_workflows::schedule_manager_demo()),
        required_integrations: vec!["calendar".to_string(), "email".to_string()],
        template_id: Some("schedule-manager-template".to_string()),
        is_verified: true,
        usage_count: 0,
        avg_rating: 4.9,
        created_at: Utc::now().timestamp(),
        tags: vec!["calendar".to_string(), "scheduling".to_string(), "productivity".to_string()],
    }
}

// ===== DEVELOPMENT EMPLOYEES =====

fn create_code_reviewer() -> AIEmployee {
    AIEmployee {
        id: "code-reviewer-001".to_string(),
        name: "Code Reviewer".to_string(),
        role: EmployeeRole::CodeReviewer,
        description: "Reviews pull requests for code quality, security issues, style violations, and suggests improvements following best practices.".to_string(),
        capabilities: vec![
            "Review PRs for quality and security".to_string(),
            "Check code style compliance".to_string(),
            "Suggest performance improvements".to_string(),
            "Identify potential bugs".to_string(),
            "Generate review comments".to_string(),
        ],
        estimated_time_saved_per_run: 30, // 30 minutes per PR
        estimated_cost_saved_per_run: 50.00, // $100/hr developer rate
        demo_workflow: Some(super::demo_workflows::code_reviewer_demo()),
        required_integrations: vec!["github".to_string(), "gitlab".to_string()],
        template_id: Some("code-reviewer-template".to_string()),
        is_verified: true,
        usage_count: 0,
        avg_rating: 4.7,
        created_at: Utc::now().timestamp(),
        tags: vec!["code-review".to_string(), "development".to_string(), "quality".to_string()],
    }
}

fn create_bug_triager() -> AIEmployee {
    AIEmployee {
        id: "bug-triager-001".to_string(),
        name: "Bug Triager".to_string(),
        role: EmployeeRole::BugTriager,
        description: "Automatically categorizes bug reports, assigns severity levels, detects duplicates, and routes to appropriate team members.".to_string(),
        capabilities: vec![
            "Categorize bugs by type".to_string(),
            "Assign severity (Critical/High/Medium/Low)".to_string(),
            "Detect duplicate issues".to_string(),
            "Route to appropriate developer".to_string(),
            "Extract error logs and stack traces".to_string(),
        ],
        estimated_time_saved_per_run: 10, // 10 minutes per bug
        estimated_cost_saved_per_run: 16.67, // $100/hr developer rate
        demo_workflow: Some(super::demo_workflows::bug_triager_demo()),
        required_integrations: vec!["github".to_string(), "jira".to_string()],
        template_id: Some("bug-triager-template".to_string()),
        is_verified: true,
        usage_count: 0,
        avg_rating: 4.8,
        created_at: Utc::now().timestamp(),
        tags: vec!["bugs".to_string(), "triage".to_string(), "development".to_string()],
    }
}

fn create_documentation_writer() -> AIEmployee {
    AIEmployee {
        id: "documentation-writer-001".to_string(),
        name: "Documentation Writer".to_string(),
        role: EmployeeRole::DocumentationWriter,
        description: "Generates technical documentation from code comments, creates API docs, writes README files, and maintains internal wikis.".to_string(),
        capabilities: vec![
            "Generate API documentation".to_string(),
            "Write README files".to_string(),
            "Create code examples".to_string(),
            "Update wikis and knowledge bases".to_string(),
            "Extract docs from code comments".to_string(),
        ],
        estimated_time_saved_per_run: 60, // 1 hour per doc
        estimated_cost_saved_per_run: 75.00, // $75/hr technical writer rate
        demo_workflow: Some(super::demo_workflows::documentation_writer_demo()),
        required_integrations: vec!["github".to_string()],
        template_id: Some("documentation-writer-template".to_string()),
        is_verified: true,
        usage_count: 0,
        avg_rating: 4.6,
        created_at: Utc::now().timestamp(),
        tags: vec!["documentation".to_string(), "development".to_string(), "technical-writing".to_string()],
    }
}

fn create_test_runner() -> AIEmployee {
    AIEmployee {
        id: "test-runner-001".to_string(),
        name: "Automated Test Runner".to_string(),
        role: EmployeeRole::TestRunner,
        description: "Runs test suites automatically, reports failures with context, suggests fixes, and tracks test coverage trends.".to_string(),
        capabilities: vec![
            "Run test suites on schedule".to_string(),
            "Report failures with stack traces".to_string(),
            "Suggest fixes for common failures".to_string(),
            "Track test coverage over time".to_string(),
            "Integrate with CI/CD pipelines".to_string(),
        ],
        estimated_time_saved_per_run: 20, // 20 minutes per test run
        estimated_cost_saved_per_run: 33.33, // $100/hr developer rate
        demo_workflow: Some(super::demo_workflows::test_runner_demo()),
        required_integrations: vec!["github".to_string(), "ci_cd".to_string()],
        template_id: Some("test-runner-template".to_string()),
        is_verified: true,
        usage_count: 0,
        avg_rating: 4.9,
        created_at: Utc::now().timestamp(),
        tags: vec!["testing".to_string(), "development".to_string(), "ci-cd".to_string()],
    }
}

// ===== PERSONAL ASSISTANT EMPLOYEES =====

fn create_inbox_manager() -> AIEmployee {
    AIEmployee {
        id: "inbox-manager-001".to_string(),
        name: "Inbox Manager".to_string(),
        role: EmployeeRole::InboxManager,
        description: "Organizes email inbox by auto-filing, archiving, flagging important messages, and drafting quick replies.".to_string(),
        capabilities: vec![
            "Auto-file emails to folders".to_string(),
            "Archive low-priority messages".to_string(),
            "Flag urgent emails".to_string(),
            "Draft quick replies".to_string(),
            "Unsubscribe from spam".to_string(),
        ],
        estimated_time_saved_per_run: 30, // 30 minutes per day
        estimated_cost_saved_per_run: 25.00, // $50/hr rate
        demo_workflow: Some(super::demo_workflows::inbox_manager_demo()),
        required_integrations: vec!["email".to_string()],
        template_id: Some("inbox-manager-template".to_string()),
        is_verified: true,
        usage_count: 0,
        avg_rating: 4.8,
        created_at: Utc::now().timestamp(),
        tags: vec!["email".to_string(), "productivity".to_string(), "personal-assistant".to_string()],
    }
}

fn create_calendar_optimizer() -> AIEmployee {
    AIEmployee {
        id: "calendar-optimizer-001".to_string(),
        name: "Calendar Optimizer".to_string(),
        role: EmployeeRole::CalendarOptimizer,
        description: "Optimizes your calendar for productivity by blocking focus time, consolidating meetings, and suggesting better scheduling.".to_string(),
        capabilities: vec![
            "Block focus/deep work time".to_string(),
            "Consolidate back-to-back meetings".to_string(),
            "Suggest schedule improvements".to_string(),
            "Add buffer time between meetings".to_string(),
            "Analyze time allocation".to_string(),
        ],
        estimated_time_saved_per_run: 20, // 20 minutes per week
        estimated_cost_saved_per_run: 16.67, // $50/hr rate
        demo_workflow: Some(super::demo_workflows::calendar_optimizer_demo()),
        required_integrations: vec!["calendar".to_string()],
        template_id: Some("calendar-optimizer-template".to_string()),
        is_verified: true,
        usage_count: 0,
        avg_rating: 4.7,
        created_at: Utc::now().timestamp(),
        tags: vec!["calendar".to_string(), "productivity".to_string(), "time-management".to_string()],
    }
}

fn create_task_organizer() -> AIEmployee {
    AIEmployee {
        id: "task-organizer-001".to_string(),
        name: "Task Organizer".to_string(),
        role: EmployeeRole::TaskOrganizer,
        description: "Organizes tasks by priority, breaks down large projects into steps, sets deadlines, and sends reminders.".to_string(),
        capabilities: vec![
            "Prioritize tasks by urgency/impact".to_string(),
            "Break projects into actionable steps".to_string(),
            "Set realistic deadlines".to_string(),
            "Send task reminders".to_string(),
            "Track completion rates".to_string(),
        ],
        estimated_time_saved_per_run: 25, // 25 minutes per planning session
        estimated_cost_saved_per_run: 20.83, // $50/hr rate
        demo_workflow: Some(super::demo_workflows::task_organizer_demo()),
        required_integrations: vec!["task_management".to_string()],
        template_id: Some("task-organizer-template".to_string()),
        is_verified: true,
        usage_count: 0,
        avg_rating: 4.8,
        created_at: Utc::now().timestamp(),
        tags: vec!["tasks".to_string(), "productivity".to_string(), "project-management".to_string()],
    }
}

fn create_research_assistant() -> AIEmployee {
    AIEmployee {
        id: "research-assistant-001".to_string(),
        name: "Research Assistant".to_string(),
        role: EmployeeRole::ResearchAssistant,
        description: "Conducts research on topics, summarizes findings, cites sources, and compiles comprehensive reports.".to_string(),
        capabilities: vec![
            "Search multiple sources".to_string(),
            "Summarize key findings".to_string(),
            "Cite sources properly".to_string(),
            "Compile research reports".to_string(),
            "Fact-check information".to_string(),
        ],
        estimated_time_saved_per_run: 90, // 90 minutes per research task
        estimated_cost_saved_per_run: 75.00, // $50/hr rate
        demo_workflow: Some(super::demo_workflows::research_assistant_demo()),
        required_integrations: vec!["web_search".to_string()],
        template_id: Some("research-assistant-template".to_string()),
        is_verified: true,
        usage_count: 0,
        avg_rating: 4.9,
        created_at: Utc::now().timestamp(),
        tags: vec!["research".to_string(), "analysis".to_string(), "reports".to_string()],
    }
}
