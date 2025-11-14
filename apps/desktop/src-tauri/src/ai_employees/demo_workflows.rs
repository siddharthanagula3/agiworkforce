use super::*;

/// Demo workflow for Support Agent
pub fn support_agent_demo() -> DemoWorkflow {
    let mut step1_input = HashMap::new();
    step1_input.insert("query".to_string(), "refund policy".to_string());

    let mut step2_input = HashMap::new();
    step2_input.insert("template".to_string(), "refund_response".to_string());
    step2_input.insert("customer_name".to_string(), "John Doe".to_string());

    DemoWorkflow {
        title: "Handle Refund Request".to_string(),
        steps: vec![
            DemoStep {
                description: "Search knowledge base for refund policy".to_string(),
                tool: "knowledge_base_search".to_string(),
                input: step1_input,
                expected_result: "Found refund policy: 30-day money-back guarantee".to_string(),
            },
            DemoStep {
                description: "Draft personalized response".to_string(),
                tool: "email_draft".to_string(),
                input: step2_input,
                expected_result:
                    "Generated email: 'Dear John, We offer a 30-day money-back guarantee...'"
                        .to_string(),
            },
        ],
        sample_input: "Customer inquiry: 'What is your refund policy?'".to_string(),
        expected_output: "Draft email sent to agent for review with refund policy details"
            .to_string(),
        duration_seconds: 15,
    }
}

/// Demo workflow for Email Responder
pub fn email_responder_demo() -> DemoWorkflow {
    let mut step1_input = HashMap::new();
    step1_input.insert(
        "email_content".to_string(),
        "What are your business hours?".to_string(),
    );

    let mut step2_input = HashMap::new();
    step2_input.insert("template_id".to_string(), "business_hours".to_string());

    DemoWorkflow {
        title: "Auto-Respond to Business Hours Inquiry".to_string(),
        steps: vec![
            DemoStep {
                description: "Classify email intent".to_string(),
                tool: "email_classifier".to_string(),
                input: step1_input,
                expected_result: "Category: Business Hours Inquiry, Urgency: Low".to_string(),
            },
            DemoStep {
                description: "Apply template and send response".to_string(),
                tool: "email_auto_respond".to_string(),
                input: step2_input,
                expected_result: "Sent: 'We're open Monday-Friday, 9am-5pm EST...'".to_string(),
            },
        ],
        sample_input: "Email: 'What are your business hours?'".to_string(),
        expected_output: "Auto-response sent with business hours information".to_string(),
        duration_seconds: 10,
    }
}

/// Demo workflow for Live Chat Bot
pub fn live_chat_bot_demo() -> DemoWorkflow {
    let mut step1_input = HashMap::new();
    step1_input.insert(
        "message".to_string(),
        "My product won't turn on".to_string(),
    );

    let mut step2_input = HashMap::new();
    step2_input.insert(
        "steps".to_string(),
        "troubleshooting_power_issues".to_string(),
    );

    DemoWorkflow {
        title: "Troubleshoot Product Issue".to_string(),
        steps: vec![
            DemoStep {
                description: "Identify issue type".to_string(),
                tool: "issue_classifier".to_string(),
                input: step1_input,
                expected_result: "Issue: Power/Startup Problem".to_string(),
            },
            DemoStep {
                description: "Guide through troubleshooting".to_string(),
                tool: "troubleshooting_guide".to_string(),
                input: step2_input,
                expected_result:
                    "Sent troubleshooting steps: 1. Check power cable... 2. Try different outlet..."
                        .to_string(),
            },
        ],
        sample_input: "Chat: 'My product won't turn on, help!'".to_string(),
        expected_output: "Provided troubleshooting steps; escalated to agent after 3 attempts"
            .to_string(),
        duration_seconds: 20,
    }
}

/// Demo workflow for Ticket Triager
pub fn ticket_triager_demo() -> DemoWorkflow {
    let mut step1_input = HashMap::new();
    step1_input.insert(
        "ticket_content".to_string(),
        "Critical: Production database down!".to_string(),
    );

    DemoWorkflow {
        title: "Triage Critical Incident".to_string(),
        steps: vec![DemoStep {
            description: "Analyze and categorize ticket".to_string(),
            tool: "ticket_analyzer".to_string(),
            input: step1_input,
            expected_result: "Category: Infrastructure, Severity: P0 (Critical), Team: DevOps"
                .to_string(),
        }],
        sample_input: "Ticket: 'Critical: Production database down!'".to_string(),
        expected_output: "Routed to DevOps team as P0 priority with SMS alert".to_string(),
        duration_seconds: 5,
    }
}

/// Demo workflow for Lead Qualifier
pub fn lead_qualifier_demo() -> DemoWorkflow {
    let mut step1_input = HashMap::new();
    step1_input.insert("company".to_string(), "Acme Corp".to_string());
    step1_input.insert("email".to_string(), "john@acme.com".to_string());

    let mut step2_input = HashMap::new();
    step2_input.insert("criteria".to_string(), "BANT".to_string());

    DemoWorkflow {
        title: "Qualify Inbound Lead".to_string(),
        steps: vec![
            DemoStep {
                description: "Enrich contact data".to_string(),
                tool: "data_enrichment".to_string(),
                input: step1_input,
                expected_result: "Found: 500 employees, $50M revenue, Tech industry".to_string(),
            },
            DemoStep {
                description: "Score lead quality".to_string(),
                tool: "lead_scorer".to_string(),
                input: step2_input,
                expected_result: "Score: 85/100 (High-quality lead)".to_string(),
            },
        ],
        sample_input: "Lead form: Name: John Doe, Company: Acme Corp, Interest: Enterprise plan"
            .to_string(),
        expected_output: "Qualified lead added to CRM with 85/100 score, assigned to sales rep"
            .to_string(),
        duration_seconds: 25,
    }
}

/// Demo workflow for Email Campaigner
pub fn email_campaigner_demo() -> DemoWorkflow {
    let mut step1_input = HashMap::new();
    step1_input.insert("campaign_type".to_string(), "product_launch".to_string());
    step1_input.insert("audience".to_string(), "enterprise_customers".to_string());

    DemoWorkflow {
        title: "Launch Product Announcement Campaign".to_string(),
        steps: vec![DemoStep {
            description: "Generate personalized email copy".to_string(),
            tool: "email_generator".to_string(),
            input: step1_input,
            expected_result: "Generated 3 email variants with A/B test subject lines".to_string(),
        }],
        sample_input: "Campaign: Announce new Enterprise feature to 5,000 customers".to_string(),
        expected_output:
            "Campaign created with 3 variants, scheduled for optimal send time (Tue 10am)"
                .to_string(),
        duration_seconds: 30,
    }
}

/// Demo workflow for Social Media Manager
pub fn social_media_manager_demo() -> DemoWorkflow {
    let mut step1_input = HashMap::new();
    step1_input.insert("topic".to_string(), "product_feature".to_string());
    step1_input.insert("platform".to_string(), "linkedin".to_string());

    DemoWorkflow {
        title: "Create and Schedule LinkedIn Post".to_string(),
        steps: vec![DemoStep {
            description: "Generate engaging post".to_string(),
            tool: "social_post_generator".to_string(),
            input: step1_input,
            expected_result:
                "Post: 'Excited to announce our new AI-powered feature...' (280 chars)".to_string(),
        }],
        sample_input: "Task: Create LinkedIn post about new AI feature".to_string(),
        expected_output: "Post drafted and scheduled for Thu 2pm (optimal engagement time)"
            .to_string(),
        duration_seconds: 15,
    }
}

/// Demo workflow for Content Writer
pub fn content_writer_demo() -> DemoWorkflow {
    let mut step1_input = HashMap::new();
    step1_input.insert("topic".to_string(), "AI automation benefits".to_string());
    step1_input.insert("target_length".to_string(), "1200".to_string());
    step1_input.insert(
        "seo_keywords".to_string(),
        "AI automation, productivity, efficiency".to_string(),
    );

    DemoWorkflow {
        title: "Write SEO Blog Post".to_string(),
        steps: vec![DemoStep {
            description: "Generate SEO-optimized blog post".to_string(),
            tool: "blog_writer".to_string(),
            input: step1_input,
            expected_result:
                "Generated 1,200-word post: 'How AI Automation Boosts Productivity by 40%'"
                    .to_string(),
        }],
        sample_input:
            "Brief: Write blog post about AI automation benefits (1200 words, SEO-optimized)"
                .to_string(),
        expected_output: "Blog post generated with title, sections, and meta description"
            .to_string(),
        duration_seconds: 45,
    }
}

/// Demo workflow for Data Entry Specialist
pub fn data_entry_demo() -> DemoWorkflow {
    let mut step1_input = HashMap::new();
    step1_input.insert("document_path".to_string(), "invoice.pdf".to_string());

    let mut step2_input = HashMap::new();
    step2_input.insert("database".to_string(), "customers".to_string());

    DemoWorkflow {
        title: "Extract Data from Form and Input to Database".to_string(),
        steps: vec![
            DemoStep {
                description: "OCR text extraction".to_string(),
                tool: "ocr_extractor".to_string(),
                input: step1_input,
                expected_result: "Extracted: Name, Address, Phone, Email (95% confidence)"
                    .to_string(),
            },
            DemoStep {
                description: "Validate and input to database".to_string(),
                tool: "database_insert".to_string(),
                input: step2_input,
                expected_result: "Inserted 1 record into customers table".to_string(),
            },
        ],
        sample_input: "50 PDF forms with customer information".to_string(),
        expected_output:
            "Processed 50 forms, inserted 48 records, flagged 2 for review (low confidence)"
                .to_string(),
        duration_seconds: 20,
    }
}

/// Demo workflow for Invoice Processor
pub fn invoice_processor_demo() -> DemoWorkflow {
    let mut step1_input = HashMap::new();
    step1_input.insert("invoice_pdf".to_string(), "invoice_12345.pdf".to_string());

    DemoWorkflow {
        title: "Process Vendor Invoice".to_string(),
        steps: vec![DemoStep {
            description: "Extract invoice data".to_string(),
            tool: "invoice_ocr".to_string(),
            input: step1_input,
            expected_result: "Vendor: Acme Supplies, Amount: $1,245.00, Due: 2025-12-15"
                .to_string(),
        }],
        sample_input: "Invoice PDF from vendor".to_string(),
        expected_output:
            "Invoice validated against PO #54321, added to QuickBooks, approval requested"
                .to_string(),
        duration_seconds: 12,
    }
}

/// Demo workflow for Expense Reconciler
pub fn expense_reconciler_demo() -> DemoWorkflow {
    let mut step1_input = HashMap::new();
    step1_input.insert("receipt_image".to_string(), "receipt.jpg".to_string());
    step1_input.insert("card_last4".to_string(), "1234".to_string());

    DemoWorkflow {
        title: "Reconcile Business Expense".to_string(),
        steps: vec![
            DemoStep {
                description: "Match receipt to transaction".to_string(),
                tool: "expense_matcher".to_string(),
                input: step1_input,
                expected_result: "Matched: $45.67 at Starbucks on 2025-11-13 (Card ending 1234)".to_string(),
            },
        ],
        sample_input: "20 receipts and credit card statement".to_string(),
        expected_output: "Matched 18/20 receipts, categorized expenses, flagged 2 policy violations (over meal limit)".to_string(),
        duration_seconds: 18,
    }
}

/// Demo workflow for Schedule Manager
pub fn schedule_manager_demo() -> DemoWorkflow {
    let mut step1_input = HashMap::new();
    step1_input.insert("attendees".to_string(), "5".to_string());
    step1_input.insert("duration".to_string(), "60".to_string());
    step1_input.insert("time_zones".to_string(), "EST, PST, GMT".to_string());

    DemoWorkflow {
        title: "Find Meeting Time Across Time Zones".to_string(),
        steps: vec![DemoStep {
            description: "Find optimal meeting slot".to_string(),
            tool: "meeting_scheduler".to_string(),
            input: step1_input,
            expected_result: "Found: Thu 2pm EST / 11am PST / 7pm GMT (all attendees available)"
                .to_string(),
        }],
        sample_input: "Schedule 1-hour meeting with 5 people across 3 time zones".to_string(),
        expected_output: "Meeting scheduled Thu 2pm EST, invites sent, calendar holds placed"
            .to_string(),
        duration_seconds: 10,
    }
}

/// Demo workflow for Code Reviewer
pub fn code_reviewer_demo() -> DemoWorkflow {
    let mut step1_input = HashMap::new();
    step1_input.insert("pr_number".to_string(), "123".to_string());
    step1_input.insert("repo".to_string(), "company/backend".to_string());

    DemoWorkflow {
        title: "Review Pull Request".to_string(),
        steps: vec![DemoStep {
            description: "Analyze code changes".to_string(),
            tool: "code_analyzer".to_string(),
            input: step1_input,
            expected_result:
                "Found: 2 style issues, 1 security concern (SQL injection risk), 3 suggestions"
                    .to_string(),
        }],
        sample_input: "PR #123: Add user authentication endpoint (150 lines changed)".to_string(),
        expected_output: "Review posted with 6 comments: 2 blocking issues, 4 suggestions"
            .to_string(),
        duration_seconds: 25,
    }
}

/// Demo workflow for Bug Triager
pub fn bug_triager_demo() -> DemoWorkflow {
    let mut step1_input = HashMap::new();
    step1_input.insert(
        "issue_description".to_string(),
        "App crashes when uploading large files".to_string(),
    );
    step1_input.insert(
        "stack_trace".to_string(),
        "OutOfMemoryError at FileUploader.java:45".to_string(),
    );

    DemoWorkflow {
        title: "Triage Bug Report".to_string(),
        steps: vec![DemoStep {
            description: "Categorize and assign severity".to_string(),
            tool: "bug_analyzer".to_string(),
            input: step1_input,
            expected_result:
                "Category: File Upload, Severity: High, Component: Storage, Assignee: @john"
                    .to_string(),
        }],
        sample_input: "Bug report: App crashes on large file upload".to_string(),
        expected_output:
            "Categorized as High severity, assigned to Storage team, linked to similar issue #456"
                .to_string(),
        duration_seconds: 8,
    }
}

/// Demo workflow for Documentation Writer
pub fn documentation_writer_demo() -> DemoWorkflow {
    let mut step1_input = HashMap::new();
    step1_input.insert("code_file".to_string(), "api/users.ts".to_string());

    DemoWorkflow {
        title: "Generate API Documentation".to_string(),
        steps: vec![DemoStep {
            description: "Extract and document API endpoints".to_string(),
            tool: "api_doc_generator".to_string(),
            input: step1_input,
            expected_result:
                "Generated docs for 5 endpoints: GET/POST /users, GET/PUT/DELETE /users/:id"
                    .to_string(),
        }],
        sample_input: "Source file: api/users.ts with 5 REST endpoints".to_string(),
        expected_output:
            "API docs generated with endpoint descriptions, parameters, responses, examples"
                .to_string(),
        duration_seconds: 35,
    }
}

/// Demo workflow for Test Runner
pub fn test_runner_demo() -> DemoWorkflow {
    let mut step1_input = HashMap::new();
    step1_input.insert("test_suite".to_string(), "integration_tests".to_string());
    step1_input.insert("branch".to_string(), "feature/new-api".to_string());

    DemoWorkflow {
        title: "Run Integration Test Suite".to_string(),
        steps: vec![DemoStep {
            description: "Execute tests and analyze failures".to_string(),
            tool: "test_executor".to_string(),
            input: step1_input,
            expected_result: "Ran 45 tests: 43 passed, 2 failed (auth timeout, DB connection)"
                .to_string(),
        }],
        sample_input: "Run integration tests on feature branch".to_string(),
        expected_output:
            "Test report: 43/45 passed (95%), 2 failures with suggested fixes, coverage: 87%"
                .to_string(),
        duration_seconds: 40,
    }
}

/// Demo workflow for Inbox Manager
pub fn inbox_manager_demo() -> DemoWorkflow {
    let mut step1_input = HashMap::new();
    step1_input.insert("inbox_count".to_string(), "50".to_string());

    DemoWorkflow {
        title: "Process Inbox (50 emails)".to_string(),
        steps: vec![
            DemoStep {
                description: "Categorize and organize emails".to_string(),
                tool: "email_organizer".to_string(),
                input: step1_input,
                expected_result: "Processed 50 emails: 30 archived, 15 filed, 5 flagged urgent".to_string(),
            },
        ],
        sample_input: "Inbox with 50 unread emails".to_string(),
        expected_output: "Inbox cleaned: 30 archived, 15 filed to folders, 5 flagged for review, 12 quick replies drafted".to_string(),
        duration_seconds: 20,
    }
}

/// Demo workflow for Calendar Optimizer
pub fn calendar_optimizer_demo() -> DemoWorkflow {
    let mut step1_input = HashMap::new();
    step1_input.insert("calendar_id".to_string(), "primary".to_string());
    step1_input.insert("optimization_type".to_string(), "focus_time".to_string());

    DemoWorkflow {
        title: "Optimize Calendar for Focus Time".to_string(),
        steps: vec![DemoStep {
            description: "Analyze and optimize schedule".to_string(),
            tool: "calendar_optimizer".to_string(),
            input: step1_input,
            expected_result: "Blocked 2-hour focus time: Mon/Wed/Fri 9-11am, moved 3 meetings"
                .to_string(),
        }],
        sample_input: "Calendar with scattered meetings and no focus blocks".to_string(),
        expected_output:
            "Optimized: Added 6hrs/week focus time, consolidated meetings, added 15-min buffers"
                .to_string(),
        duration_seconds: 12,
    }
}

/// Demo workflow for Task Organizer
pub fn task_organizer_demo() -> DemoWorkflow {
    let mut step1_input = HashMap::new();
    step1_input.insert("project".to_string(), "Q4 Marketing Campaign".to_string());

    DemoWorkflow {
        title: "Break Down Project into Tasks".to_string(),
        steps: vec![
            DemoStep {
                description: "Create task breakdown".to_string(),
                tool: "task_planner".to_string(),
                input: step1_input,
                expected_result: "Created 12 tasks across 4 phases with dependencies and deadlines".to_string(),
            },
        ],
        sample_input: "Project: Launch Q4 marketing campaign".to_string(),
        expected_output: "Project broken into 12 tasks, prioritized by impact, deadlines set, dependencies mapped".to_string(),
        duration_seconds: 15,
    }
}

/// Demo workflow for Research Assistant
pub fn research_assistant_demo() -> DemoWorkflow {
    let mut step1_input = HashMap::new();
    step1_input.insert(
        "topic".to_string(),
        "AI automation market trends 2025".to_string(),
    );
    step1_input.insert("sources".to_string(), "10".to_string());

    DemoWorkflow {
        title: "Research Market Trends".to_string(),
        steps: vec![DemoStep {
            description: "Conduct research and summarize".to_string(),
            tool: "research_engine".to_string(),
            input: step1_input,
            expected_result:
                "Researched 10 sources, extracted 5 key trends, compiled 2-page report".to_string(),
        }],
        sample_input: "Research: AI automation market trends for 2025".to_string(),
        expected_output:
            "Report: 5 key trends identified, 15 sources cited, market size forecast included"
                .to_string(),
        duration_seconds: 60,
    }
}
