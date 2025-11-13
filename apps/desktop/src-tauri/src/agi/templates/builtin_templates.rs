use super::template_manager::{
    AgentTemplate, DifficultyLevel, TemplateCategory, WorkflowDefinition, WorkflowStep,
};
use std::collections::HashMap;

/// Get all built-in agent templates
pub fn get_builtin_templates() -> Vec<AgentTemplate> {
    vec![
        create_accounts_payable_agent(),
        create_customer_support_agent(),
        create_data_entry_agent(),
        create_email_management_agent(),
        create_social_media_agent(),
        create_lead_qualification_agent(),
        create_code_review_agent(),
        create_testing_agent(),
        create_documentation_agent(),
        create_deployment_agent(),
        create_meeting_scheduler_agent(),
        create_expense_report_agent(),
        create_content_writer_agent(),
        create_job_application_agent(),
        create_research_agent(),
    ]
}

/// 1. Accounts Payable Agent
fn create_accounts_payable_agent() -> AgentTemplate {
    let mut prompts = HashMap::new();
    prompts.insert(
        "system".to_string(),
        "You are an Accounts Payable automation agent. Your role is to process invoices by extracting data, validating against purchase orders, and routing for approval. Always verify invoice details before proceeding.".to_string(),
    );
    prompts.insert(
        "extract_invoice".to_string(),
        "Extract invoice details from the provided document: invoice number, vendor name, date, amount, line items, and payment terms.".to_string(),
    );
    prompts.insert(
        "validate".to_string(),
        "Validate the extracted invoice data against the purchase order. Check for matching PO number, vendor, amounts, and line items.".to_string(),
    );

    let workflow = WorkflowDefinition {
        steps: vec![
            WorkflowStep {
                id: "read_invoice".to_string(),
                name: "Read Invoice File".to_string(),
                description: "Read the invoice PDF or image file".to_string(),
                tool_id: "file_read".to_string(),
                parameters: HashMap::from([("path".to_string(), serde_json::json!("{{invoice_path}}"))]),
                expected_output: "File content or image data".to_string(),
                retry_on_failure: true,
                max_retries: 3,
                timeout_seconds: 30,
            },
            WorkflowStep {
                id: "extract_data".to_string(),
                name: "Extract Invoice Data".to_string(),
                description: "Use OCR to extract text and data from invoice".to_string(),
                tool_id: "image_ocr".to_string(),
                parameters: HashMap::from([("image_path".to_string(), serde_json::json!("{{invoice_path}}"))]),
                expected_output: "Extracted invoice data (JSON)".to_string(),
                retry_on_failure: true,
                max_retries: 2,
                timeout_seconds: 60,
            },
            WorkflowStep {
                id: "query_po".to_string(),
                name: "Query Purchase Order".to_string(),
                description: "Look up matching purchase order in database".to_string(),
                tool_id: "db_query".to_string(),
                parameters: HashMap::from([
                    ("query".to_string(), serde_json::json!("SELECT * FROM purchase_orders WHERE po_number = ?")),
                    ("params".to_string(), serde_json::json!(["{{po_number}}"])),
                ]),
                expected_output: "Purchase order details".to_string(),
                retry_on_failure: true,
                max_retries: 2,
                timeout_seconds: 10,
            },
            WorkflowStep {
                id: "validate".to_string(),
                name: "Validate Invoice".to_string(),
                description: "Compare invoice against PO for discrepancies".to_string(),
                tool_id: "llm_reason".to_string(),
                parameters: HashMap::from([("prompt".to_string(), serde_json::json!("{{validate_prompt}}"))]),
                expected_output: "Validation result with any discrepancies".to_string(),
                retry_on_failure: false,
                max_retries: 1,
                timeout_seconds: 30,
            },
            WorkflowStep {
                id: "route_approval".to_string(),
                name: "Route for Approval".to_string(),
                description: "Send invoice to appropriate approver via email".to_string(),
                tool_id: "email_send".to_string(),
                parameters: HashMap::from([
                    ("to".to_string(), serde_json::json!("{{approver_email}}")),
                    ("subject".to_string(), serde_json::json!("Invoice Approval Required: {{invoice_number}}")),
                    ("body".to_string(), serde_json::json!("{{approval_email_body}}")),
                ]),
                expected_output: "Email sent confirmation".to_string(),
                retry_on_failure: true,
                max_retries: 2,
                timeout_seconds: 15,
            },
        ],
        parallel_execution: false,
        failure_strategy: "stop".to_string(),
    };

    AgentTemplate::new(
        "accounts-payable-agent".to_string(),
        "Accounts Payable Agent".to_string(),
        TemplateCategory::Finance,
        "Automates invoice processing by extracting data, validating against purchase orders, and routing for approval. Handles PDF and image invoices with OCR.".to_string(),
    )
    .with_icon("💰".to_string())
    .with_tools(vec![
        "file_read".to_string(),
        "file_write".to_string(),
        "image_ocr".to_string(),
        "db_query".to_string(),
        "email_send".to_string(),
    ])
    .with_workflow(workflow)
    .with_prompts(prompts)
    .with_success_criteria(vec![
        "Invoice data extracted with >95% confidence".to_string(),
        "PO validation completed".to_string(),
        "Approval email sent successfully".to_string(),
        "Processing time <5 minutes".to_string(),
    ])
    .with_estimated_duration(300000) // 5 minutes
    .with_difficulty(DifficultyLevel::Medium)
}

/// 2. Customer Support Agent
fn create_customer_support_agent() -> AgentTemplate {
    let mut prompts = HashMap::new();
    prompts.insert(
        "system".to_string(),
        "You are a Customer Support automation agent. Your role is to read support tickets, classify them by urgency and category, search the knowledge base for solutions, and draft helpful responses.".to_string(),
    );
    prompts.insert(
        "classify".to_string(),
        "Classify this support ticket by urgency (low/medium/high/critical) and category (technical/billing/product/other). Ticket: {{ticket_content}}".to_string(),
    );
    prompts.insert(
        "search_kb".to_string(),
        "Search the knowledge base for solutions related to: {{ticket_summary}}".to_string(),
    );

    let workflow = WorkflowDefinition {
        steps: vec![
            WorkflowStep {
                id: "read_ticket".to_string(),
                name: "Read Support Ticket".to_string(),
                description: "Fetch ticket from support system via API".to_string(),
                tool_id: "api_call".to_string(),
                parameters: HashMap::from([
                    ("url".to_string(), serde_json::json!("{{support_api_url}}/tickets/{{ticket_id}}")),
                    ("method".to_string(), serde_json::json!("GET")),
                ]),
                expected_output: "Ticket details (subject, body, customer info)".to_string(),
                retry_on_failure: true,
                max_retries: 3,
                timeout_seconds: 15,
            },
            WorkflowStep {
                id: "classify".to_string(),
                name: "Classify Ticket".to_string(),
                description: "Use LLM to classify ticket urgency and category".to_string(),
                tool_id: "llm_reason".to_string(),
                parameters: HashMap::from([("prompt".to_string(), serde_json::json!("{{classify_prompt}}"))]),
                expected_output: "Classification result (urgency, category)".to_string(),
                retry_on_failure: false,
                max_retries: 1,
                timeout_seconds: 20,
            },
            WorkflowStep {
                id: "search_kb".to_string(),
                name: "Search Knowledge Base".to_string(),
                description: "Query knowledge base for relevant articles".to_string(),
                tool_id: "db_query".to_string(),
                parameters: HashMap::from([
                    ("query".to_string(), serde_json::json!("SELECT * FROM kb_articles WHERE content MATCH ? ORDER BY rank LIMIT 5")),
                    ("params".to_string(), serde_json::json!(["{{ticket_keywords}}"])),
                ]),
                expected_output: "Relevant KB articles".to_string(),
                retry_on_failure: true,
                max_retries: 2,
                timeout_seconds: 10,
            },
            WorkflowStep {
                id: "draft_response".to_string(),
                name: "Draft Response".to_string(),
                description: "Generate a helpful response based on KB articles".to_string(),
                tool_id: "llm_reason".to_string(),
                parameters: HashMap::from([
                    ("prompt".to_string(), serde_json::json!("Draft a helpful response to the customer based on these KB articles: {{kb_articles}}")),
                ]),
                expected_output: "Draft response text".to_string(),
                retry_on_failure: false,
                max_retries: 1,
                timeout_seconds: 30,
            },
            WorkflowStep {
                id: "send_response".to_string(),
                name: "Send Response".to_string(),
                description: "Post response to ticket via API".to_string(),
                tool_id: "api_call".to_string(),
                parameters: HashMap::from([
                    ("url".to_string(), serde_json::json!("{{support_api_url}}/tickets/{{ticket_id}}/respond")),
                    ("method".to_string(), serde_json::json!("POST")),
                    ("body".to_string(), serde_json::json!({"response": "{{draft_response}}"})),
                ]),
                expected_output: "Response sent confirmation".to_string(),
                retry_on_failure: true,
                max_retries: 2,
                timeout_seconds: 15,
            },
        ],
        parallel_execution: false,
        failure_strategy: "stop".to_string(),
    };

    AgentTemplate::new(
        "customer-support-agent".to_string(),
        "Customer Support Agent".to_string(),
        TemplateCategory::CustomerService,
        "Automates support ticket handling by classifying tickets, searching the knowledge base, drafting responses, and sending replies. Reduces response time and improves consistency.".to_string(),
    )
    .with_icon("🎧".to_string())
    .with_tools(vec![
        "api_call".to_string(),
        "db_query".to_string(),
        "llm_reason".to_string(),
    ])
    .with_workflow(workflow)
    .with_prompts(prompts)
    .with_success_criteria(vec![
        "Ticket classified correctly".to_string(),
        "Relevant KB articles found".to_string(),
        "Response drafted and sent".to_string(),
        "Response time <2 minutes".to_string(),
    ])
    .with_estimated_duration(120000) // 2 minutes
    .with_difficulty(DifficultyLevel::Easy)
}

/// 3. Data Entry Agent
fn create_data_entry_agent() -> AgentTemplate {
    let mut prompts = HashMap::new();
    prompts.insert(
        "system".to_string(),
        "You are a Data Entry automation agent. Your role is to extract data from source documents, validate it, and enter it into target systems with high accuracy.".to_string(),
    );
    prompts.insert(
        "extract".to_string(),
        "Extract structured data from this document: {{document_content}}. Return as JSON.".to_string(),
    );

    let workflow = WorkflowDefinition {
        steps: vec![
            WorkflowStep {
                id: "read_source".to_string(),
                name: "Read Source Document".to_string(),
                description: "Read the source data file (CSV, Excel, PDF, etc.)".to_string(),
                tool_id: "file_read".to_string(),
                parameters: HashMap::from([("path".to_string(), serde_json::json!("{{source_path}}"))]),
                expected_output: "Source document content".to_string(),
                retry_on_failure: true,
                max_retries: 3,
                timeout_seconds: 30,
            },
            WorkflowStep {
                id: "extract_data".to_string(),
                name: "Extract Data".to_string(),
                description: "Extract structured data from document".to_string(),
                tool_id: "llm_reason".to_string(),
                parameters: HashMap::from([("prompt".to_string(), serde_json::json!("{{extract_prompt}}"))]),
                expected_output: "Extracted data as JSON".to_string(),
                retry_on_failure: true,
                max_retries: 2,
                timeout_seconds: 45,
            },
            WorkflowStep {
                id: "validate".to_string(),
                name: "Validate Data".to_string(),
                description: "Validate extracted data against rules".to_string(),
                tool_id: "llm_reason".to_string(),
                parameters: HashMap::from([
                    ("prompt".to_string(), serde_json::json!("Validate this data against the rules: {{validation_rules}}. Data: {{extracted_data}}")),
                ]),
                expected_output: "Validation report".to_string(),
                retry_on_failure: false,
                max_retries: 1,
                timeout_seconds: 20,
            },
            WorkflowStep {
                id: "navigate_app".to_string(),
                name: "Navigate to Application".to_string(),
                description: "Open target application window".to_string(),
                tool_id: "ui_click".to_string(),
                parameters: HashMap::from([("selector".to_string(), serde_json::json!("{{app_selector}}"))]),
                expected_output: "Application opened".to_string(),
                retry_on_failure: true,
                max_retries: 2,
                timeout_seconds: 10,
            },
            WorkflowStep {
                id: "enter_data".to_string(),
                name: "Enter Data".to_string(),
                description: "Type data into application fields".to_string(),
                tool_id: "ui_type".to_string(),
                parameters: HashMap::from([
                    ("selector".to_string(), serde_json::json!("{{field_selector}}")),
                    ("text".to_string(), serde_json::json!("{{field_value}}")),
                ]),
                expected_output: "Data entered".to_string(),
                retry_on_failure: true,
                max_retries: 3,
                timeout_seconds: 30,
            },
            WorkflowStep {
                id: "verify".to_string(),
                name: "Verify Entry".to_string(),
                description: "Take screenshot and verify data was entered correctly".to_string(),
                tool_id: "ui_screenshot".to_string(),
                parameters: HashMap::new(),
                expected_output: "Screenshot for verification".to_string(),
                retry_on_failure: false,
                max_retries: 1,
                timeout_seconds: 10,
            },
        ],
        parallel_execution: false,
        failure_strategy: "stop".to_string(),
    };

    AgentTemplate::new(
        "data-entry-agent".to_string(),
        "Data Entry Agent".to_string(),
        TemplateCategory::DataEntry,
        "Automates data entry by extracting data from documents, validating it, and entering it into target systems with UI automation. Achieves 99%+ accuracy.".to_string(),
    )
    .with_icon("⌨️".to_string())
    .with_tools(vec![
        "file_read".to_string(),
        "llm_reason".to_string(),
        "ui_click".to_string(),
        "ui_type".to_string(),
        "ui_screenshot".to_string(),
        "image_ocr".to_string(),
    ])
    .with_workflow(workflow)
    .with_prompts(prompts)
    .with_success_criteria(vec![
        "Data extracted with validation".to_string(),
        "All fields entered correctly".to_string(),
        "Verification screenshot captured".to_string(),
        "Accuracy >99%".to_string(),
        "Processing <1 minute per record".to_string(),
    ])
    .with_estimated_duration(60000) // 1 minute per record
    .with_difficulty(DifficultyLevel::Medium)
}

/// 4. Email Management Agent
fn create_email_management_agent() -> AgentTemplate {
    let mut prompts = HashMap::new();
    prompts.insert(
        "system".to_string(),
        "You are an Email Management agent. Your role is to sort emails, prioritize them, draft responses, and maintain inbox organization.".to_string(),
    );
    prompts.insert(
        "prioritize".to_string(),
        "Analyze these emails and prioritize them (urgent/high/medium/low): {{emails}}".to_string(),
    );
    prompts.insert(
        "draft".to_string(),
        "Draft a professional response to this email: {{email_content}}. Context: {{context}}".to_string(),
    );

    let workflow = WorkflowDefinition {
        steps: vec![
            WorkflowStep {
                id: "fetch_emails".to_string(),
                name: "Fetch Unread Emails".to_string(),
                description: "Connect to IMAP and fetch unread emails".to_string(),
                tool_id: "email_fetch".to_string(),
                parameters: HashMap::from([
                    ("folder".to_string(), serde_json::json!("INBOX")),
                    ("filter".to_string(), serde_json::json!("UNSEEN")),
                ]),
                expected_output: "List of unread emails".to_string(),
                retry_on_failure: true,
                max_retries: 3,
                timeout_seconds: 30,
            },
            WorkflowStep {
                id: "prioritize".to_string(),
                name: "Prioritize Emails".to_string(),
                description: "Use LLM to prioritize emails by urgency".to_string(),
                tool_id: "llm_reason".to_string(),
                parameters: HashMap::from([("prompt".to_string(), serde_json::json!("{{prioritize_prompt}}"))]),
                expected_output: "Prioritized email list".to_string(),
                retry_on_failure: false,
                max_retries: 1,
                timeout_seconds: 30,
            },
            WorkflowStep {
                id: "draft_responses".to_string(),
                name: "Draft Responses".to_string(),
                description: "Draft responses for high-priority emails".to_string(),
                tool_id: "llm_reason".to_string(),
                parameters: HashMap::from([("prompt".to_string(), serde_json::json!("{{draft_prompt}}"))]),
                expected_output: "Draft responses".to_string(),
                retry_on_failure: false,
                max_retries: 1,
                timeout_seconds: 60,
            },
            WorkflowStep {
                id: "send_responses".to_string(),
                name: "Send Responses".to_string(),
                description: "Send drafted responses via SMTP".to_string(),
                tool_id: "email_send".to_string(),
                parameters: HashMap::from([
                    ("to".to_string(), serde_json::json!("{{recipient_email}}")),
                    ("subject".to_string(), serde_json::json!("Re: {{original_subject}}")),
                    ("body".to_string(), serde_json::json!("{{draft_body}}")),
                ]),
                expected_output: "Emails sent".to_string(),
                retry_on_failure: true,
                max_retries: 2,
                timeout_seconds: 30,
            },
            WorkflowStep {
                id: "archive".to_string(),
                name: "Archive Processed Emails".to_string(),
                description: "Move processed emails to archive folder".to_string(),
                tool_id: "email_move".to_string(),
                parameters: HashMap::from([
                    ("folder".to_string(), serde_json::json!("Archive")),
                    ("email_ids".to_string(), serde_json::json!("{{processed_ids}}")),
                ]),
                expected_output: "Emails archived".to_string(),
                retry_on_failure: false,
                max_retries: 1,
                timeout_seconds: 15,
            },
        ],
        parallel_execution: false,
        failure_strategy: "continue".to_string(),
    };

    AgentTemplate::new(
        "email-management-agent".to_string(),
        "Email Management Agent".to_string(),
        TemplateCategory::Operations,
        "Automates email inbox management by sorting, prioritizing, drafting responses, and archiving. Achieves inbox zero efficiently.".to_string(),
    )
    .with_icon("📧".to_string())
    .with_tools(vec![
        "email_fetch".to_string(),
        "email_send".to_string(),
        "email_move".to_string(),
        "llm_reason".to_string(),
    ])
    .with_workflow(workflow)
    .with_prompts(prompts)
    .with_success_criteria(vec![
        "All emails processed".to_string(),
        "Responses drafted for urgent emails".to_string(),
        "Inbox organized".to_string(),
        "Processing time <10 minutes".to_string(),
    ])
    .with_estimated_duration(600000) // 10 minutes
    .with_difficulty(DifficultyLevel::Easy)
}

/// 5. Social Media Agent
fn create_social_media_agent() -> AgentTemplate {
    let mut prompts = HashMap::new();
    prompts.insert(
        "system".to_string(),
        "You are a Social Media automation agent. Your role is to generate engaging posts, schedule them, monitor engagement, and respond to interactions.".to_string(),
    );
    prompts.insert(
        "generate".to_string(),
        "Generate an engaging social media post about {{topic}}. Platform: {{platform}}. Tone: {{tone}}. Include relevant hashtags.".to_string(),
    );

    let workflow = WorkflowDefinition {
        steps: vec![
            WorkflowStep {
                id: "research".to_string(),
                name: "Research Topic".to_string(),
                description: "Gather information about the topic".to_string(),
                tool_id: "browser_extract".to_string(),
                parameters: HashMap::from([
                    ("url".to_string(), serde_json::json!("{{research_url}}")),
                    ("selector".to_string(), serde_json::json!("article, .content")),
                ]),
                expected_output: "Research content".to_string(),
                retry_on_failure: true,
                max_retries: 2,
                timeout_seconds: 30,
            },
            WorkflowStep {
                id: "generate_post".to_string(),
                name: "Generate Post".to_string(),
                description: "Create engaging social media post".to_string(),
                tool_id: "llm_reason".to_string(),
                parameters: HashMap::from([("prompt".to_string(), serde_json::json!("{{generate_prompt}}"))]),
                expected_output: "Social media post text".to_string(),
                retry_on_failure: false,
                max_retries: 1,
                timeout_seconds: 30,
            },
            WorkflowStep {
                id: "schedule_post".to_string(),
                name: "Schedule Post".to_string(),
                description: "Schedule post via social media API".to_string(),
                tool_id: "api_call".to_string(),
                parameters: HashMap::from([
                    ("url".to_string(), serde_json::json!("{{social_api_url}}/posts")),
                    ("method".to_string(), serde_json::json!("POST")),
                    ("body".to_string(), serde_json::json!({"text": "{{post_text}}", "scheduled_at": "{{schedule_time}}"})),
                ]),
                expected_output: "Post scheduled".to_string(),
                retry_on_failure: true,
                max_retries: 2,
                timeout_seconds: 15,
            },
            WorkflowStep {
                id: "monitor".to_string(),
                name: "Monitor Engagement".to_string(),
                description: "Check post engagement metrics".to_string(),
                tool_id: "api_call".to_string(),
                parameters: HashMap::from([
                    ("url".to_string(), serde_json::json!("{{social_api_url}}/posts/{{post_id}}/metrics")),
                    ("method".to_string(), serde_json::json!("GET")),
                ]),
                expected_output: "Engagement metrics".to_string(),
                retry_on_failure: true,
                max_retries: 2,
                timeout_seconds: 10,
            },
        ],
        parallel_execution: false,
        failure_strategy: "continue".to_string(),
    };

    AgentTemplate::new(
        "social-media-agent".to_string(),
        "Social Media Agent".to_string(),
        TemplateCategory::Marketing,
        "Automates social media posting by researching topics, generating engaging content, scheduling posts, and monitoring engagement. Supports Twitter, LinkedIn, and more.".to_string(),
    )
    .with_icon("📱".to_string())
    .with_tools(vec![
        "api_call".to_string(),
        "llm_reason".to_string(),
        "browser_extract".to_string(),
        "file_read".to_string(),
    ])
    .with_workflow(workflow)
    .with_prompts(prompts)
    .with_success_criteria(vec![
        "Post generated".to_string(),
        "Post scheduled successfully".to_string(),
        "Engagement monitoring active".to_string(),
    ])
    .with_estimated_duration(180000) // 3 minutes
    .with_difficulty(DifficultyLevel::Easy)
}

/// 6. Lead Qualification Agent
fn create_lead_qualification_agent() -> AgentTemplate {
    let mut prompts = HashMap::new();
    prompts.insert(
        "system".to_string(),
        "You are a Lead Qualification agent. Your role is to fetch leads from CRM, score them based on criteria, enrich their data, and route qualified leads to sales.".to_string(),
    );
    prompts.insert(
        "score".to_string(),
        "Score this lead (0-100) based on: company size, budget, authority, need, timeline. Lead: {{lead_data}}".to_string(),
    );

    let workflow = WorkflowDefinition {
        steps: vec![
            WorkflowStep {
                id: "fetch_leads".to_string(),
                name: "Fetch New Leads".to_string(),
                description: "Get new leads from CRM via API".to_string(),
                tool_id: "api_call".to_string(),
                parameters: HashMap::from([
                    ("url".to_string(), serde_json::json!("{{crm_api_url}}/leads?status=new")),
                    ("method".to_string(), serde_json::json!("GET")),
                ]),
                expected_output: "List of new leads".to_string(),
                retry_on_failure: true,
                max_retries: 3,
                timeout_seconds: 20,
            },
            WorkflowStep {
                id: "score_lead".to_string(),
                name: "Score Lead".to_string(),
                description: "Calculate lead score using LLM".to_string(),
                tool_id: "llm_reason".to_string(),
                parameters: HashMap::from([("prompt".to_string(), serde_json::json!("{{score_prompt}}"))]),
                expected_output: "Lead score (0-100)".to_string(),
                retry_on_failure: false,
                max_retries: 1,
                timeout_seconds: 20,
            },
            WorkflowStep {
                id: "enrich".to_string(),
                name: "Enrich Lead Data".to_string(),
                description: "Fetch additional company data from enrichment API".to_string(),
                tool_id: "api_call".to_string(),
                parameters: HashMap::from([
                    ("url".to_string(), serde_json::json!("{{enrichment_api_url}}/companies/{{company_domain}}")),
                    ("method".to_string(), serde_json::json!("GET")),
                ]),
                expected_output: "Enriched company data".to_string(),
                retry_on_failure: true,
                max_retries: 2,
                timeout_seconds: 15,
            },
            WorkflowStep {
                id: "update_crm".to_string(),
                name: "Update CRM".to_string(),
                description: "Update lead record with score and enriched data".to_string(),
                tool_id: "api_call".to_string(),
                parameters: HashMap::from([
                    ("url".to_string(), serde_json::json!("{{crm_api_url}}/leads/{{lead_id}}")),
                    ("method".to_string(), serde_json::json!("PATCH")),
                    ("body".to_string(), serde_json::json!({"score": "{{lead_score}}", "enriched_data": "{{enriched_data}}"})),
                ]),
                expected_output: "CRM updated".to_string(),
                retry_on_failure: true,
                max_retries: 2,
                timeout_seconds: 10,
            },
            WorkflowStep {
                id: "route_to_sales".to_string(),
                name: "Route to Sales".to_string(),
                description: "Assign high-score leads to sales rep".to_string(),
                tool_id: "api_call".to_string(),
                parameters: HashMap::from([
                    ("url".to_string(), serde_json::json!("{{crm_api_url}}/leads/{{lead_id}}/assign")),
                    ("method".to_string(), serde_json::json!("POST")),
                    ("body".to_string(), serde_json::json!({"sales_rep_id": "{{rep_id}}"})),
                ]),
                expected_output: "Lead assigned".to_string(),
                retry_on_failure: true,
                max_retries: 2,
                timeout_seconds: 10,
            },
        ],
        parallel_execution: false,
        failure_strategy: "continue".to_string(),
    };

    AgentTemplate::new(
        "lead-qualification-agent".to_string(),
        "Lead Qualification Agent".to_string(),
        TemplateCategory::Marketing,
        "Automates lead qualification by scoring leads, enriching data from external sources, and routing qualified leads to sales. Integrates with major CRMs.".to_string(),
    )
    .with_icon("🎯".to_string())
    .with_tools(vec![
        "api_call".to_string(),
        "llm_reason".to_string(),
        "db_query".to_string(),
    ])
    .with_workflow(workflow)
    .with_prompts(prompts)
    .with_success_criteria(vec![
        "Lead scored accurately".to_string(),
        "Data enriched".to_string(),
        "CRM updated".to_string(),
        "Qualified leads routed to sales".to_string(),
        "Processing <30 seconds per lead".to_string(),
    ])
    .with_estimated_duration(30000) // 30 seconds per lead
    .with_difficulty(DifficultyLevel::Medium)
}

/// 7. Code Review Agent
fn create_code_review_agent() -> AgentTemplate {
    let mut prompts = HashMap::new();
    prompts.insert(
        "system".to_string(),
        "You are a Code Review agent. Your role is to analyze pull requests, check code quality, verify tests, and provide constructive feedback.".to_string(),
    );
    prompts.insert(
        "review".to_string(),
        "Review this code for: correctness, performance, security, readability, test coverage. Code: {{code_diff}}".to_string(),
    );

    let workflow = WorkflowDefinition {
        steps: vec![
            WorkflowStep {
                id: "fetch_pr".to_string(),
                name: "Fetch Pull Request".to_string(),
                description: "Get PR details from GitHub API".to_string(),
                tool_id: "api_call".to_string(),
                parameters: HashMap::from([
                    ("url".to_string(), serde_json::json!("https://api.github.com/repos/{{owner}}/{{repo}}/pulls/{{pr_number}}")),
                    ("method".to_string(), serde_json::json!("GET")),
                    ("headers".to_string(), serde_json::json!({"Authorization": "token {{github_token}}"})),
                ]),
                expected_output: "PR details and file changes".to_string(),
                retry_on_failure: true,
                max_retries: 3,
                timeout_seconds: 20,
            },
            WorkflowStep {
                id: "read_files".to_string(),
                name: "Read Changed Files".to_string(),
                description: "Read content of changed files".to_string(),
                tool_id: "file_read".to_string(),
                parameters: HashMap::from([("path".to_string(), serde_json::json!("{{file_path}}"))]),
                expected_output: "File contents".to_string(),
                retry_on_failure: true,
                max_retries: 2,
                timeout_seconds: 30,
            },
            WorkflowStep {
                id: "analyze_code".to_string(),
                name: "Analyze Code".to_string(),
                description: "Use LLM to analyze code quality".to_string(),
                tool_id: "llm_reason".to_string(),
                parameters: HashMap::from([("prompt".to_string(), serde_json::json!("{{review_prompt}}"))]),
                expected_output: "Code review analysis".to_string(),
                retry_on_failure: false,
                max_retries: 1,
                timeout_seconds: 60,
            },
            WorkflowStep {
                id: "check_tests".to_string(),
                name: "Check Tests".to_string(),
                description: "Verify test coverage and results".to_string(),
                tool_id: "code_execute".to_string(),
                parameters: HashMap::from([
                    ("command".to_string(), serde_json::json!("npm test -- --coverage")),
                    ("cwd".to_string(), serde_json::json!("{{repo_path}}")),
                ]),
                expected_output: "Test results and coverage".to_string(),
                retry_on_failure: false,
                max_retries: 1,
                timeout_seconds: 120,
            },
            WorkflowStep {
                id: "post_comment".to_string(),
                name: "Post Review Comment".to_string(),
                description: "Post review feedback to GitHub PR".to_string(),
                tool_id: "api_call".to_string(),
                parameters: HashMap::from([
                    ("url".to_string(), serde_json::json!("https://api.github.com/repos/{{owner}}/{{repo}}/pulls/{{pr_number}}/reviews")),
                    ("method".to_string(), serde_json::json!("POST")),
                    ("headers".to_string(), serde_json::json!({"Authorization": "token {{github_token}}"})),
                    ("body".to_string(), serde_json::json!({"body": "{{review_comment}}", "event": "COMMENT"})),
                ]),
                expected_output: "Comment posted".to_string(),
                retry_on_failure: true,
                max_retries: 2,
                timeout_seconds: 15,
            },
        ],
        parallel_execution: false,
        failure_strategy: "continue".to_string(),
    };

    AgentTemplate::new(
        "code-review-agent".to_string(),
        "Code Review Agent".to_string(),
        TemplateCategory::Development,
        "Automates code review by analyzing pull requests, checking test coverage, identifying issues, and posting constructive feedback. Integrates with GitHub.".to_string(),
    )
    .with_icon("🔍".to_string())
    .with_tools(vec![
        "api_call".to_string(),
        "file_read".to_string(),
        "llm_reason".to_string(),
        "code_execute".to_string(),
    ])
    .with_workflow(workflow)
    .with_prompts(prompts)
    .with_success_criteria(vec![
        "PR analyzed".to_string(),
        "Tests checked".to_string(),
        "Review feedback posted".to_string(),
        "Review time <5 minutes".to_string(),
    ])
    .with_estimated_duration(300000) // 5 minutes
    .with_difficulty(DifficultyLevel::Hard)
}

/// 8. Testing Agent
fn create_testing_agent() -> AgentTemplate {
    let mut prompts = HashMap::new();
    prompts.insert(
        "system".to_string(),
        "You are a Testing automation agent. Your role is to generate tests, run them, report coverage, and fix failing tests.".to_string(),
    );
    prompts.insert(
        "generate".to_string(),
        "Generate comprehensive unit tests for this function: {{function_code}}. Include edge cases and error handling.".to_string(),
    );

    let workflow = WorkflowDefinition {
        steps: vec![
            WorkflowStep {
                id: "read_code".to_string(),
                name: "Read Source Code".to_string(),
                description: "Read the file to be tested".to_string(),
                tool_id: "file_read".to_string(),
                parameters: HashMap::from([("path".to_string(), serde_json::json!("{{source_path}}"))]),
                expected_output: "Source code content".to_string(),
                retry_on_failure: true,
                max_retries: 2,
                timeout_seconds: 20,
            },
            WorkflowStep {
                id: "generate_tests".to_string(),
                name: "Generate Tests".to_string(),
                description: "Use LLM to generate comprehensive tests".to_string(),
                tool_id: "llm_reason".to_string(),
                parameters: HashMap::from([("prompt".to_string(), serde_json::json!("{{generate_prompt}}"))]),
                expected_output: "Test code".to_string(),
                retry_on_failure: false,
                max_retries: 1,
                timeout_seconds: 60,
            },
            WorkflowStep {
                id: "write_tests".to_string(),
                name: "Write Test File".to_string(),
                description: "Save generated tests to file".to_string(),
                tool_id: "file_write".to_string(),
                parameters: HashMap::from([
                    ("path".to_string(), serde_json::json!("{{test_path}}")),
                    ("content".to_string(), serde_json::json!("{{test_code}}")),
                ]),
                expected_output: "Test file created".to_string(),
                retry_on_failure: true,
                max_retries: 2,
                timeout_seconds: 10,
            },
            WorkflowStep {
                id: "run_tests".to_string(),
                name: "Run Tests".to_string(),
                description: "Execute test suite".to_string(),
                tool_id: "code_execute".to_string(),
                parameters: HashMap::from([
                    ("command".to_string(), serde_json::json!("npm test -- {{test_file}}")),
                    ("cwd".to_string(), serde_json::json!("{{project_path}}")),
                ]),
                expected_output: "Test results".to_string(),
                retry_on_failure: false,
                max_retries: 1,
                timeout_seconds: 120,
            },
            WorkflowStep {
                id: "report_coverage".to_string(),
                name: "Report Coverage".to_string(),
                description: "Generate coverage report".to_string(),
                tool_id: "code_execute".to_string(),
                parameters: HashMap::from([
                    ("command".to_string(), serde_json::json!("npm test -- --coverage")),
                    ("cwd".to_string(), serde_json::json!("{{project_path}}")),
                ]),
                expected_output: "Coverage report".to_string(),
                retry_on_failure: false,
                max_retries: 1,
                timeout_seconds: 120,
            },
        ],
        parallel_execution: false,
        failure_strategy: "continue".to_string(),
    };

    AgentTemplate::new(
        "testing-agent".to_string(),
        "Testing Agent".to_string(),
        TemplateCategory::Development,
        "Automates test generation by analyzing code, creating comprehensive tests, running them, and reporting coverage. Aims for 80%+ coverage.".to_string(),
    )
    .with_icon("🧪".to_string())
    .with_tools(vec![
        "file_read".to_string(),
        "file_write".to_string(),
        "llm_reason".to_string(),
        "code_execute".to_string(),
    ])
    .with_workflow(workflow)
    .with_prompts(prompts)
    .with_success_criteria(vec![
        "Tests generated".to_string(),
        "Tests pass".to_string(),
        "Coverage >80%".to_string(),
        "Time <5 minutes".to_string(),
    ])
    .with_estimated_duration(300000) // 5 minutes
    .with_difficulty(DifficultyLevel::Medium)
}

/// 9. Documentation Agent
fn create_documentation_agent() -> AgentTemplate {
    let mut prompts = HashMap::new();
    prompts.insert(
        "system".to_string(),
        "You are a Documentation agent. Your role is to read code, extract API information, generate comprehensive documentation, and format it as markdown.".to_string(),
    );
    prompts.insert(
        "document".to_string(),
        "Generate comprehensive documentation for this code including: purpose, parameters, return values, examples, and edge cases. Code: {{code}}".to_string(),
    );

    let workflow = WorkflowDefinition {
        steps: vec![
            WorkflowStep {
                id: "read_code".to_string(),
                name: "Read Source Files".to_string(),
                description: "Read all source files in directory".to_string(),
                tool_id: "file_read".to_string(),
                parameters: HashMap::from([("path".to_string(), serde_json::json!("{{source_dir}}"))]),
                expected_output: "Source code files".to_string(),
                retry_on_failure: true,
                max_retries: 2,
                timeout_seconds: 30,
            },
            WorkflowStep {
                id: "analyze_api".to_string(),
                name: "Analyze API".to_string(),
                description: "Extract functions, classes, and their signatures".to_string(),
                tool_id: "llm_reason".to_string(),
                parameters: HashMap::from([
                    ("prompt".to_string(), serde_json::json!("Extract all public APIs from this code: {{code}}")),
                ]),
                expected_output: "API structure".to_string(),
                retry_on_failure: false,
                max_retries: 1,
                timeout_seconds: 45,
            },
            WorkflowStep {
                id: "generate_docs".to_string(),
                name: "Generate Documentation".to_string(),
                description: "Create markdown documentation".to_string(),
                tool_id: "llm_reason".to_string(),
                parameters: HashMap::from([("prompt".to_string(), serde_json::json!("{{document_prompt}}"))]),
                expected_output: "Markdown documentation".to_string(),
                retry_on_failure: false,
                max_retries: 1,
                timeout_seconds: 90,
            },
            WorkflowStep {
                id: "write_docs".to_string(),
                name: "Write Documentation File".to_string(),
                description: "Save documentation to README.md".to_string(),
                tool_id: "file_write".to_string(),
                parameters: HashMap::from([
                    ("path".to_string(), serde_json::json!("{{output_path}}/README.md")),
                    ("content".to_string(), serde_json::json!("{{documentation}}")),
                ]),
                expected_output: "Documentation file created".to_string(),
                retry_on_failure: true,
                max_retries: 2,
                timeout_seconds: 10,
            },
        ],
        parallel_execution: false,
        failure_strategy: "stop".to_string(),
    };

    AgentTemplate::new(
        "documentation-agent".to_string(),
        "Documentation Agent".to_string(),
        TemplateCategory::Development,
        "Automates documentation by analyzing code, extracting API information, and generating comprehensive markdown documentation with examples.".to_string(),
    )
    .with_icon("📚".to_string())
    .with_tools(vec![
        "file_read".to_string(),
        "file_write".to_string(),
        "llm_reason".to_string(),
    ])
    .with_workflow(workflow)
    .with_prompts(prompts)
    .with_success_criteria(vec![
        "API extracted".to_string(),
        "Documentation generated".to_string(),
        "Markdown file created".to_string(),
        "Complete coverage".to_string(),
    ])
    .with_estimated_duration(180000) // 3 minutes
    .with_difficulty(DifficultyLevel::Easy)
}

/// 10. Deployment Agent
fn create_deployment_agent() -> AgentTemplate {
    let mut prompts = HashMap::new();
    prompts.insert(
        "system".to_string(),
        "You are a Deployment automation agent. Your role is to run tests, build the application, deploy it to production, verify it's working, and rollback if needed.".to_string(),
    );

    let workflow = WorkflowDefinition {
        steps: vec![
            WorkflowStep {
                id: "run_tests".to_string(),
                name: "Run Test Suite".to_string(),
                description: "Execute all tests before deployment".to_string(),
                tool_id: "code_execute".to_string(),
                parameters: HashMap::from([
                    ("command".to_string(), serde_json::json!("npm test")),
                    ("cwd".to_string(), serde_json::json!("{{project_path}}")),
                ]),
                expected_output: "Test results (must pass)".to_string(),
                retry_on_failure: false,
                max_retries: 1,
                timeout_seconds: 300,
            },
            WorkflowStep {
                id: "build".to_string(),
                name: "Build Application".to_string(),
                description: "Build production bundle".to_string(),
                tool_id: "code_execute".to_string(),
                parameters: HashMap::from([
                    ("command".to_string(), serde_json::json!("npm run build")),
                    ("cwd".to_string(), serde_json::json!("{{project_path}}")),
                ]),
                expected_output: "Build artifacts".to_string(),
                retry_on_failure: true,
                max_retries: 2,
                timeout_seconds: 600,
            },
            WorkflowStep {
                id: "deploy".to_string(),
                name: "Deploy to Production".to_string(),
                description: "Deploy via cloud provider API".to_string(),
                tool_id: "api_call".to_string(),
                parameters: HashMap::from([
                    ("url".to_string(), serde_json::json!("{{deploy_api_url}}/deployments")),
                    ("method".to_string(), serde_json::json!("POST")),
                    ("body".to_string(), serde_json::json!({"project": "{{project_id}}", "files": "{{build_dir}}"})),
                ]),
                expected_output: "Deployment ID and URL".to_string(),
                retry_on_failure: true,
                max_retries: 2,
                timeout_seconds: 120,
            },
            WorkflowStep {
                id: "verify".to_string(),
                name: "Verify Deployment".to_string(),
                description: "Check that deployed site is responding".to_string(),
                tool_id: "api_call".to_string(),
                parameters: HashMap::from([
                    ("url".to_string(), serde_json::json!("{{production_url}}/health")),
                    ("method".to_string(), serde_json::json!("GET")),
                ]),
                expected_output: "Health check response".to_string(),
                retry_on_failure: true,
                max_retries: 3,
                timeout_seconds: 30,
            },
        ],
        parallel_execution: false,
        failure_strategy: "stop".to_string(),
    };

    AgentTemplate::new(
        "deployment-agent".to_string(),
        "Deployment Agent".to_string(),
        TemplateCategory::Deployment,
        "Automates deployment by running tests, building the application, deploying to cloud providers (AWS, Vercel, etc.), and verifying the deployment.".to_string(),
    )
    .with_icon("🚀".to_string())
    .with_tools(vec![
        "code_execute".to_string(),
        "api_call".to_string(),
        "file_read".to_string(),
    ])
    .with_workflow(workflow)
    .with_prompts(prompts)
    .with_success_criteria(vec![
        "Tests passed".to_string(),
        "Build successful".to_string(),
        "Deployment successful".to_string(),
        "Health check passed".to_string(),
    ])
    .with_estimated_duration(600000) // 10 minutes
    .with_difficulty(DifficultyLevel::Hard)
}

/// 11. Meeting Scheduler Agent
fn create_meeting_scheduler_agent() -> AgentTemplate {
    let mut prompts = HashMap::new();
    prompts.insert(
        "system".to_string(),
        "You are a Meeting Scheduler agent. Your role is to check calendar availability, propose meeting times, send invites, and confirm attendees.".to_string(),
    );
    prompts.insert(
        "propose_times".to_string(),
        "Analyze these calendars and propose 3 optimal meeting times for {{duration}} minutes. Attendees: {{attendees}}. Preference: {{time_preference}}".to_string(),
    );

    let workflow = WorkflowDefinition {
        steps: vec![
            WorkflowStep {
                id: "check_availability".to_string(),
                name: "Check Calendar Availability".to_string(),
                description: "Fetch calendar data for all attendees".to_string(),
                tool_id: "calendar_query".to_string(),
                parameters: HashMap::from([
                    ("attendees".to_string(), serde_json::json!("{{attendee_emails}}")),
                    ("start_date".to_string(), serde_json::json!("{{search_start}}")),
                    ("end_date".to_string(), serde_json::json!("{{search_end}}")),
                ]),
                expected_output: "Availability data for all attendees".to_string(),
                retry_on_failure: true,
                max_retries: 3,
                timeout_seconds: 30,
            },
            WorkflowStep {
                id: "propose_times".to_string(),
                name: "Propose Meeting Times".to_string(),
                description: "Find optimal times when all are available".to_string(),
                tool_id: "llm_reason".to_string(),
                parameters: HashMap::from([("prompt".to_string(), serde_json::json!("{{propose_times_prompt}}"))]),
                expected_output: "3 proposed meeting times".to_string(),
                retry_on_failure: false,
                max_retries: 1,
                timeout_seconds: 20,
            },
            WorkflowStep {
                id: "create_event".to_string(),
                name: "Create Calendar Event".to_string(),
                description: "Create meeting event on organizer's calendar".to_string(),
                tool_id: "calendar_create".to_string(),
                parameters: HashMap::from([
                    ("title".to_string(), serde_json::json!("{{meeting_title}}")),
                    ("start_time".to_string(), serde_json::json!("{{selected_time}}")),
                    ("duration".to_string(), serde_json::json!("{{duration}}")),
                    ("attendees".to_string(), serde_json::json!("{{attendee_emails}}")),
                    ("description".to_string(), serde_json::json!("{{meeting_description}}")),
                ]),
                expected_output: "Event ID and calendar link".to_string(),
                retry_on_failure: true,
                max_retries: 2,
                timeout_seconds: 20,
            },
            WorkflowStep {
                id: "send_invites".to_string(),
                name: "Send Invites".to_string(),
                description: "Send email invitations to attendees".to_string(),
                tool_id: "email_send".to_string(),
                parameters: HashMap::from([
                    ("to".to_string(), serde_json::json!("{{attendee_emails}}")),
                    ("subject".to_string(), serde_json::json!("Meeting Invitation: {{meeting_title}}")),
                    ("body".to_string(), serde_json::json!("{{invite_body}}")),
                ]),
                expected_output: "Invites sent".to_string(),
                retry_on_failure: true,
                max_retries: 2,
                timeout_seconds: 30,
            },
        ],
        parallel_execution: false,
        failure_strategy: "stop".to_string(),
    };

    AgentTemplate::new(
        "meeting-scheduler-agent".to_string(),
        "Meeting Scheduler Agent".to_string(),
        TemplateCategory::Operations,
        "Automates meeting scheduling by checking calendar availability, proposing optimal times, creating events, and sending invitations. Integrates with Google Calendar and Outlook.".to_string(),
    )
    .with_icon("📅".to_string())
    .with_tools(vec![
        "calendar_query".to_string(),
        "calendar_create".to_string(),
        "email_send".to_string(),
        "llm_reason".to_string(),
    ])
    .with_workflow(workflow)
    .with_prompts(prompts)
    .with_success_criteria(vec![
        "Availability checked".to_string(),
        "Optimal time found".to_string(),
        "Event created".to_string(),
        "Invites sent".to_string(),
    ])
    .with_estimated_duration(120000) // 2 minutes
    .with_difficulty(DifficultyLevel::Easy)
}

/// 12. Expense Report Agent
fn create_expense_report_agent() -> AgentTemplate {
    let mut prompts = HashMap::new();
    prompts.insert(
        "system".to_string(),
        "You are an Expense Report agent. Your role is to scan receipts, extract expense data, categorize expenses, and submit complete expense reports.".to_string(),
    );
    prompts.insert(
        "categorize".to_string(),
        "Categorize this expense: {{expense_description}}. Amount: {{amount}}. Vendor: {{vendor}}. Categories: Travel, Meals, Lodging, Supplies, Other.".to_string(),
    );

    let workflow = WorkflowDefinition {
        steps: vec![
            WorkflowStep {
                id: "scan_receipts".to_string(),
                name: "Scan Receipt Images".to_string(),
                description: "Use OCR to extract text from receipt images".to_string(),
                tool_id: "image_ocr".to_string(),
                parameters: HashMap::from([("image_path".to_string(), serde_json::json!("{{receipt_path}}"))]),
                expected_output: "Extracted receipt text".to_string(),
                retry_on_failure: true,
                max_retries: 2,
                timeout_seconds: 60,
            },
            WorkflowStep {
                id: "extract_data".to_string(),
                name: "Extract Expense Data".to_string(),
                description: "Parse merchant, date, amount, items from receipt".to_string(),
                tool_id: "llm_reason".to_string(),
                parameters: HashMap::from([
                    ("prompt".to_string(), serde_json::json!("Extract expense details (merchant, date, amount, items) from this receipt: {{receipt_text}}")),
                ]),
                expected_output: "Structured expense data".to_string(),
                retry_on_failure: false,
                max_retries: 1,
                timeout_seconds: 30,
            },
            WorkflowStep {
                id: "categorize".to_string(),
                name: "Categorize Expense".to_string(),
                description: "Assign expense category".to_string(),
                tool_id: "llm_reason".to_string(),
                parameters: HashMap::from([("prompt".to_string(), serde_json::json!("{{categorize_prompt}}"))]),
                expected_output: "Expense category".to_string(),
                retry_on_failure: false,
                max_retries: 1,
                timeout_seconds: 15,
            },
            WorkflowStep {
                id: "save_to_db".to_string(),
                name: "Save to Database".to_string(),
                description: "Insert expense record into database".to_string(),
                tool_id: "db_execute".to_string(),
                parameters: HashMap::from([
                    ("query".to_string(), serde_json::json!("INSERT INTO expenses (date, merchant, amount, category, receipt_path) VALUES (?, ?, ?, ?, ?)")),
                    ("params".to_string(), serde_json::json!(["{{date}}", "{{merchant}}", "{{amount}}", "{{category}}", "{{receipt_path}}"])),
                ]),
                expected_output: "Expense saved".to_string(),
                retry_on_failure: true,
                max_retries: 2,
                timeout_seconds: 10,
            },
            WorkflowStep {
                id: "submit_report".to_string(),
                name: "Submit Expense Report".to_string(),
                description: "Submit report via expense management API".to_string(),
                tool_id: "api_call".to_string(),
                parameters: HashMap::from([
                    ("url".to_string(), serde_json::json!("{{expense_api_url}}/reports")),
                    ("method".to_string(), serde_json::json!("POST")),
                    ("body".to_string(), serde_json::json!({"expenses": "{{expense_data}}"})),
                ]),
                expected_output: "Report submitted".to_string(),
                retry_on_failure: true,
                max_retries: 2,
                timeout_seconds: 20,
            },
        ],
        parallel_execution: false,
        failure_strategy: "stop".to_string(),
    };

    AgentTemplate::new(
        "expense-report-agent".to_string(),
        "Expense Report Agent".to_string(),
        TemplateCategory::Finance,
        "Automates expense reporting by scanning receipts with OCR, extracting and categorizing data, and submitting complete expense reports to accounting systems.".to_string(),
    )
    .with_icon("🧾".to_string())
    .with_tools(vec![
        "image_ocr".to_string(),
        "llm_reason".to_string(),
        "db_execute".to_string(),
        "api_call".to_string(),
        "file_read".to_string(),
    ])
    .with_workflow(workflow)
    .with_prompts(prompts)
    .with_success_criteria(vec![
        "Receipt scanned".to_string(),
        "Data extracted".to_string(),
        "Expense categorized".to_string(),
        "Report submitted".to_string(),
    ])
    .with_estimated_duration(180000) // 3 minutes
    .with_difficulty(DifficultyLevel::Easy)
}

/// 13. Content Writer Agent
fn create_content_writer_agent() -> AgentTemplate {
    let mut prompts = HashMap::new();
    prompts.insert(
        "system".to_string(),
        "You are a Content Writer agent. Your role is to research topics, create outlines, write engaging content, edit for quality, and publish to content platforms.".to_string(),
    );
    prompts.insert(
        "research".to_string(),
        "Research the topic '{{topic}}' and provide key points, statistics, and relevant information for a {{content_type}}.".to_string(),
    );
    prompts.insert(
        "write".to_string(),
        "Write a {{content_type}} about {{topic}}. Tone: {{tone}}. Length: {{word_count}} words. Include these key points: {{key_points}}".to_string(),
    );

    let workflow = WorkflowDefinition {
        steps: vec![
            WorkflowStep {
                id: "research".to_string(),
                name: "Research Topic".to_string(),
                description: "Gather information from web sources".to_string(),
                tool_id: "browser_extract".to_string(),
                parameters: HashMap::from([
                    ("url".to_string(), serde_json::json!("https://www.google.com/search?q={{topic}}")),
                    ("selector".to_string(), serde_json::json!(".search-result")),
                ]),
                expected_output: "Research data and sources".to_string(),
                retry_on_failure: true,
                max_retries: 2,
                timeout_seconds: 45,
            },
            WorkflowStep {
                id: "outline".to_string(),
                name: "Create Outline".to_string(),
                description: "Generate content outline".to_string(),
                tool_id: "llm_reason".to_string(),
                parameters: HashMap::from([
                    ("prompt".to_string(), serde_json::json!("Create a detailed outline for a {{content_type}} about {{topic}}")),
                ]),
                expected_output: "Content outline".to_string(),
                retry_on_failure: false,
                max_retries: 1,
                timeout_seconds: 30,
            },
            WorkflowStep {
                id: "write".to_string(),
                name: "Write Content".to_string(),
                description: "Generate full content based on outline".to_string(),
                tool_id: "llm_reason".to_string(),
                parameters: HashMap::from([("prompt".to_string(), serde_json::json!("{{write_prompt}}"))]),
                expected_output: "Written content".to_string(),
                retry_on_failure: false,
                max_retries: 1,
                timeout_seconds: 120,
            },
            WorkflowStep {
                id: "edit".to_string(),
                name: "Edit and Refine".to_string(),
                description: "Review and improve content quality".to_string(),
                tool_id: "llm_reason".to_string(),
                parameters: HashMap::from([
                    ("prompt".to_string(), serde_json::json!("Review and edit this content for clarity, grammar, and engagement: {{content}}")),
                ]),
                expected_output: "Edited content".to_string(),
                retry_on_failure: false,
                max_retries: 1,
                timeout_seconds: 60,
            },
            WorkflowStep {
                id: "publish".to_string(),
                name: "Publish Content".to_string(),
                description: "Post to content platform via API".to_string(),
                tool_id: "api_call".to_string(),
                parameters: HashMap::from([
                    ("url".to_string(), serde_json::json!("{{cms_api_url}}/posts")),
                    ("method".to_string(), serde_json::json!("POST")),
                    ("body".to_string(), serde_json::json!({"title": "{{title}}", "content": "{{final_content}}", "status": "draft"})),
                ]),
                expected_output: "Content published".to_string(),
                retry_on_failure: true,
                max_retries: 2,
                timeout_seconds: 20,
            },
        ],
        parallel_execution: false,
        failure_strategy: "continue".to_string(),
    };

    AgentTemplate::new(
        "content-writer-agent".to_string(),
        "Content Writer Agent".to_string(),
        TemplateCategory::Content,
        "Automates content creation by researching topics, creating outlines, writing engaging articles, editing for quality, and publishing to CMS platforms.".to_string(),
    )
    .with_icon("✍️".to_string())
    .with_tools(vec![
        "llm_reason".to_string(),
        "browser_extract".to_string(),
        "api_call".to_string(),
        "file_write".to_string(),
    ])
    .with_workflow(workflow)
    .with_prompts(prompts)
    .with_success_criteria(vec![
        "Research completed".to_string(),
        "Content written".to_string(),
        "Quality edited".to_string(),
        "Published to platform".to_string(),
    ])
    .with_estimated_duration(600000) // 10 minutes
    .with_difficulty(DifficultyLevel::Medium)
}

/// 14. Job Application Agent
fn create_job_application_agent() -> AgentTemplate {
    let mut prompts = HashMap::new();
    prompts.insert(
        "system".to_string(),
        "You are a Job Application agent. Your role is to find relevant job postings, tailor resumes and cover letters, fill out applications, and track application status.".to_string(),
    );
    prompts.insert(
        "tailor_resume".to_string(),
        "Tailor this resume for the job posting. Job: {{job_description}}. Resume: {{resume}}. Highlight relevant skills and experience.".to_string(),
    );

    let workflow = WorkflowDefinition {
        steps: vec![
            WorkflowStep {
                id: "search_jobs".to_string(),
                name: "Search Job Postings".to_string(),
                description: "Find jobs matching criteria on job boards".to_string(),
                tool_id: "browser_extract".to_string(),
                parameters: HashMap::from([
                    ("url".to_string(), serde_json::json!("https://www.linkedin.com/jobs/search/?keywords={{keywords}}")),
                    ("selector".to_string(), serde_json::json!(".job-card")),
                ]),
                expected_output: "List of job postings".to_string(),
                retry_on_failure: true,
                max_retries: 2,
                timeout_seconds: 45,
            },
            WorkflowStep {
                id: "read_resume".to_string(),
                name: "Read Resume".to_string(),
                description: "Load candidate's resume".to_string(),
                tool_id: "file_read".to_string(),
                parameters: HashMap::from([("path".to_string(), serde_json::json!("{{resume_path}}"))]),
                expected_output: "Resume content".to_string(),
                retry_on_failure: true,
                max_retries: 2,
                timeout_seconds: 15,
            },
            WorkflowStep {
                id: "tailor_resume".to_string(),
                name: "Tailor Resume".to_string(),
                description: "Customize resume for specific job".to_string(),
                tool_id: "llm_reason".to_string(),
                parameters: HashMap::from([("prompt".to_string(), serde_json::json!("{{tailor_resume_prompt}}"))]),
                expected_output: "Tailored resume".to_string(),
                retry_on_failure: false,
                max_retries: 1,
                timeout_seconds: 60,
            },
            WorkflowStep {
                id: "navigate_application".to_string(),
                name: "Navigate to Application".to_string(),
                description: "Open job application page".to_string(),
                tool_id: "browser_navigate".to_string(),
                parameters: HashMap::from([("url".to_string(), serde_json::json!("{{application_url}}"))]),
                expected_output: "Application page loaded".to_string(),
                retry_on_failure: true,
                max_retries: 2,
                timeout_seconds: 30,
            },
            WorkflowStep {
                id: "fill_application".to_string(),
                name: "Fill Application Form".to_string(),
                description: "Auto-fill application fields".to_string(),
                tool_id: "ui_type".to_string(),
                parameters: HashMap::from([
                    ("selector".to_string(), serde_json::json!("{{field_selector}}")),
                    ("text".to_string(), serde_json::json!("{{field_value}}")),
                ]),
                expected_output: "Application filled".to_string(),
                retry_on_failure: true,
                max_retries: 3,
                timeout_seconds: 120,
            },
            WorkflowStep {
                id: "track_status".to_string(),
                name: "Track Application".to_string(),
                description: "Save application details to tracking database".to_string(),
                tool_id: "db_execute".to_string(),
                parameters: HashMap::from([
                    ("query".to_string(), serde_json::json!("INSERT INTO job_applications (company, position, applied_date, status) VALUES (?, ?, ?, ?)")),
                    ("params".to_string(), serde_json::json!(["{{company}}", "{{position}}", "{{today}}", "applied"])),
                ]),
                expected_output: "Application tracked".to_string(),
                retry_on_failure: true,
                max_retries: 2,
                timeout_seconds: 10,
            },
        ],
        parallel_execution: false,
        failure_strategy: "continue".to_string(),
    };

    AgentTemplate::new(
        "job-application-agent".to_string(),
        "Job Application Agent".to_string(),
        TemplateCategory::HR,
        "Automates job applications by finding relevant postings, tailoring resumes, filling out application forms, and tracking application status. Saves hours per application.".to_string(),
    )
    .with_icon("💼".to_string())
    .with_tools(vec![
        "browser_navigate".to_string(),
        "browser_extract".to_string(),
        "file_read".to_string(),
        "llm_reason".to_string(),
        "ui_type".to_string(),
        "db_execute".to_string(),
    ])
    .with_workflow(workflow)
    .with_prompts(prompts)
    .with_success_criteria(vec![
        "Jobs found".to_string(),
        "Resume tailored".to_string(),
        "Application submitted".to_string(),
        "Status tracked".to_string(),
    ])
    .with_estimated_duration(300000) // 5 minutes per application
    .with_difficulty(DifficultyLevel::Medium)
}

/// 15. Research Agent
fn create_research_agent() -> AgentTemplate {
    let mut prompts = HashMap::new();
    prompts.insert(
        "system".to_string(),
        "You are a Research agent. Your role is to search multiple sources, extract relevant information, synthesize findings, and create comprehensive research reports.".to_string(),
    );
    prompts.insert(
        "synthesize".to_string(),
        "Synthesize these research findings into a coherent summary: {{findings}}. Focus on key insights and actionable recommendations.".to_string(),
    );

    let workflow = WorkflowDefinition {
        steps: vec![
            WorkflowStep {
                id: "search_sources".to_string(),
                name: "Search Information Sources".to_string(),
                description: "Search web for relevant information".to_string(),
                tool_id: "browser_extract".to_string(),
                parameters: HashMap::from([
                    ("url".to_string(), serde_json::json!("https://www.google.com/search?q={{research_query}}")),
                    ("selector".to_string(), serde_json::json!(".search-result")),
                ]),
                expected_output: "Search results".to_string(),
                retry_on_failure: true,
                max_retries: 2,
                timeout_seconds: 45,
            },
            WorkflowStep {
                id: "extract_info".to_string(),
                name: "Extract Information".to_string(),
                description: "Visit top sources and extract key information".to_string(),
                tool_id: "browser_extract".to_string(),
                parameters: HashMap::from([
                    ("url".to_string(), serde_json::json!("{{source_url}}")),
                    ("selector".to_string(), serde_json::json!("article, .content, main")),
                ]),
                expected_output: "Extracted content from sources".to_string(),
                retry_on_failure: true,
                max_retries: 2,
                timeout_seconds: 60,
            },
            WorkflowStep {
                id: "analyze_data".to_string(),
                name: "Analyze Data".to_string(),
                description: "Use LLM to analyze and extract key insights".to_string(),
                tool_id: "llm_reason".to_string(),
                parameters: HashMap::from([
                    ("prompt".to_string(), serde_json::json!("Analyze this research data and extract key insights: {{research_data}}")),
                ]),
                expected_output: "Key insights and findings".to_string(),
                retry_on_failure: false,
                max_retries: 1,
                timeout_seconds: 90,
            },
            WorkflowStep {
                id: "synthesize".to_string(),
                name: "Synthesize Findings".to_string(),
                description: "Create comprehensive synthesis".to_string(),
                tool_id: "llm_reason".to_string(),
                parameters: HashMap::from([("prompt".to_string(), serde_json::json!("{{synthesize_prompt}}"))]),
                expected_output: "Research synthesis".to_string(),
                retry_on_failure: false,
                max_retries: 1,
                timeout_seconds: 120,
            },
            WorkflowStep {
                id: "create_report".to_string(),
                name: "Create Research Report".to_string(),
                description: "Format findings as markdown report".to_string(),
                tool_id: "file_write".to_string(),
                parameters: HashMap::from([
                    ("path".to_string(), serde_json::json!("{{output_path}}/research-report.md")),
                    ("content".to_string(), serde_json::json!("# Research Report: {{topic}}\n\n{{synthesis}}\n\n## Sources\n{{sources}}")),
                ]),
                expected_output: "Report file created".to_string(),
                retry_on_failure: true,
                max_retries: 2,
                timeout_seconds: 15,
            },
        ],
        parallel_execution: false,
        failure_strategy: "continue".to_string(),
    };

    AgentTemplate::new(
        "research-agent".to_string(),
        "Research Agent".to_string(),
        TemplateCategory::Research,
        "Automates research by searching multiple sources, extracting relevant information, synthesizing findings, and creating comprehensive reports. Saves hours of manual research.".to_string(),
    )
    .with_icon("🔬".to_string())
    .with_tools(vec![
        "browser_extract".to_string(),
        "api_call".to_string(),
        "llm_reason".to_string(),
        "file_write".to_string(),
    ])
    .with_workflow(workflow)
    .with_prompts(prompts)
    .with_success_criteria(vec![
        "Multiple sources searched".to_string(),
        "Information extracted".to_string(),
        "Findings synthesized".to_string(),
        "Report created".to_string(),
    ])
    .with_estimated_duration(600000) // 10 minutes
    .with_difficulty(DifficultyLevel::Medium)
}
