# Agent Templates System

## Overview

The Agent Templates system provides pre-built, industry-specific automation templates that users can install with one click. Inspired by UiPath's 50+ prebuilt agent templates announced in November 2025, this system accelerates user onboarding and enables enterprise-scale automation without requiring extensive configuration.

## Features

- **15 Pre-built Templates**: Covering Finance, Customer Service, Development, Marketing, HR, Operations, and more
- **One-Click Installation**: Install and configure templates in seconds
- **Complete Workflow Definitions**: Each template includes step-by-step workflow execution plans
- **Tool Integration**: Templates automatically use the appropriate AGI tools
- **Success Criteria**: Clear metrics for measuring template execution success
- **Search and Filter**: Find templates by category, name, or description
- **Template Marketplace UI**: Beautiful, intuitive interface for browsing and managing templates

## Architecture

### Backend (Rust)

The template system is implemented in `apps/desktop/src-tauri/src/agi/templates/`:

- **`template_manager.rs`**: Core template management with database operations
- **`builtin_templates.rs`**: Definitions for all 15 built-in templates
- **`mod.rs`**: Module exports

### Database Schema (Migration v23)

```sql
CREATE TABLE agent_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    icon TEXT NOT NULL,
    tools TEXT NOT NULL,
    workflow TEXT NOT NULL,
    default_prompts TEXT NOT NULL,
    success_criteria TEXT NOT NULL,
    estimated_duration_ms INTEGER NOT NULL,
    difficulty_level TEXT NOT NULL CHECK(difficulty_level IN ('easy', 'medium', 'hard')),
    install_count INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
);

CREATE TABLE template_installs (
    user_id TEXT NOT NULL,
    template_id TEXT NOT NULL,
    installed_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, template_id),
    FOREIGN KEY (template_id) REFERENCES agent_templates(id) ON DELETE CASCADE
);
```

### Frontend (TypeScript/React)

- **Types**: `apps/desktop/src/types/templates.ts`
- **Service**: `apps/desktop/src/services/templateService.ts`
- **Store**: `apps/desktop/src/stores/templateStore.ts`
- **Components**: `apps/desktop/src/components/templates/`
  - `TemplateMarketplace.tsx` - Main marketplace UI
  - `TemplateCard.tsx` - Individual template card
  - `TemplateDetails.tsx` - Detailed template view
  - `TemplateInstaller.tsx` - Template configuration and execution

## Available Templates

### 1. Accounts Payable Agent 💰

**Category**: Finance
**Difficulty**: Medium
**Duration**: ~5 minutes

Automates invoice processing by extracting data from PDFs/images, validating against purchase orders, and routing for approval.

**Tools Used**:

- `file_read` - Read invoice files
- `image_ocr` - Extract text from invoice images
- `db_query` - Look up purchase orders
- `llm_reason` - Validate invoice data
- `email_send` - Route for approval

**Workflow**:

1. Read invoice file
2. Extract data using OCR
3. Query purchase order database
4. Validate invoice against PO
5. Route to approver via email

**Success Criteria**:

- Invoice data extracted with >95% confidence
- PO validation completed
- Approval email sent successfully
- Processing time <5 minutes

---

### 2. Customer Support Agent 🎧

**Category**: Customer Service
**Difficulty**: Easy
**Duration**: ~2 minutes

Automates support ticket handling by classifying tickets, searching the knowledge base, and drafting responses.

**Tools Used**:

- `api_call` - Fetch tickets from support system
- `db_query` - Search knowledge base
- `llm_reason` - Classify tickets and draft responses

**Workflow**:

1. Read support ticket
2. Classify by urgency and category
3. Search knowledge base for solutions
4. Draft helpful response
5. Send response to customer

**Success Criteria**:

- Ticket classified correctly
- Relevant KB articles found
- Response drafted and sent
- Response time <2 minutes

---

### 3. Data Entry Agent ⌨️

**Category**: Data Entry
**Difficulty**: Medium
**Duration**: ~1 minute per record

Automates data entry by extracting data from documents, validating it, and entering it into target systems with UI automation.

**Tools Used**:

- `file_read` - Read source documents
- `llm_reason` - Extract and validate data
- `ui_click` - Navigate to application
- `ui_type` - Enter data into fields
- `ui_screenshot` - Verify entry

**Workflow**:

1. Read source document
2. Extract structured data
3. Validate data against rules
4. Navigate to target application
5. Enter data into fields
6. Verify entry with screenshot

**Success Criteria**:

- Data extracted with validation
- All fields entered correctly
- Verification screenshot captured
- Accuracy >99%
- Processing <1 minute per record

---

### 4. Email Management Agent 📧

**Category**: Operations
**Difficulty**: Easy
**Duration**: ~10 minutes

Automates email inbox management by sorting, prioritizing, drafting responses, and archiving.

**Tools Used**:

- `email_fetch` - Connect to IMAP and fetch emails
- `llm_reason` - Prioritize and draft responses
- `email_send` - Send responses via SMTP
- `email_move` - Archive processed emails

**Workflow**:

1. Fetch unread emails
2. Prioritize by urgency
3. Draft responses for high-priority emails
4. Send responses
5. Archive processed emails

**Success Criteria**:

- All emails processed
- Responses drafted for urgent emails
- Inbox organized
- Processing time <10 minutes

---

### 5. Social Media Agent 📱

**Category**: Marketing
**Difficulty**: Easy
**Duration**: ~3 minutes

Automates social media posting by researching topics, generating content, scheduling posts, and monitoring engagement.

**Tools Used**:

- `browser_extract` - Research topics
- `llm_reason` - Generate engaging posts
- `api_call` - Schedule posts via social media APIs

**Workflow**:

1. Research topic
2. Generate engaging post
3. Schedule post via API
4. Monitor engagement metrics

**Success Criteria**:

- Post generated
- Post scheduled successfully
- Engagement monitoring active

---

### 6. Lead Qualification Agent 🎯

**Category**: Marketing
**Difficulty**: Medium
**Duration**: ~30 seconds per lead

Automates lead qualification by scoring leads, enriching data, and routing qualified leads to sales.

**Tools Used**:

- `api_call` - Fetch leads from CRM, enrich data
- `llm_reason` - Score leads
- `db_query` - Look up lead history

**Workflow**:

1. Fetch new leads from CRM
2. Score lead using AI
3. Enrich lead data from external APIs
4. Update CRM with score and enriched data
5. Route qualified leads to sales rep

**Success Criteria**:

- Lead scored accurately
- Data enriched
- CRM updated
- Qualified leads routed to sales
- Processing <30 seconds per lead

---

### 7. Code Review Agent 🔍

**Category**: Development
**Difficulty**: Hard
**Duration**: ~5 minutes

Automates code review by analyzing pull requests, checking test coverage, and posting constructive feedback.

**Tools Used**:

- `api_call` - Fetch PR from GitHub API
- `file_read` - Read changed files
- `llm_reason` - Analyze code quality
- `code_execute` - Run tests

**Workflow**:

1. Fetch pull request from GitHub
2. Read changed files
3. Analyze code for correctness, performance, security
4. Check test coverage
5. Post review feedback to GitHub

**Success Criteria**:

- PR analyzed
- Tests checked
- Review feedback posted
- Review time <5 minutes

---

### 8. Testing Agent 🧪

**Category**: Development
**Difficulty**: Medium
**Duration**: ~5 minutes

Automates test generation by analyzing code, creating comprehensive tests, running them, and reporting coverage.

**Tools Used**:

- `file_read` - Read source code
- `llm_reason` - Generate tests
- `file_write` - Save test files
- `code_execute` - Run tests and coverage

**Workflow**:

1. Read source code
2. Generate comprehensive unit tests
3. Write test file
4. Run tests
5. Report coverage

**Success Criteria**:

- Tests generated
- Tests pass
- Coverage >80%
- Time <5 minutes

---

### 9. Documentation Agent 📚

**Category**: Development
**Difficulty**: Easy
**Duration**: ~3 minutes

Automates documentation by analyzing code, extracting API information, and generating markdown documentation.

**Tools Used**:

- `file_read` - Read source files
- `llm_reason` - Extract API and generate docs
- `file_write` - Save documentation

**Workflow**:

1. Read source files
2. Analyze and extract public APIs
3. Generate comprehensive documentation
4. Write documentation to README.md

**Success Criteria**:

- API extracted
- Documentation generated
- Markdown file created
- Complete coverage

---

### 10. Deployment Agent 🚀

**Category**: Deployment
**Difficulty**: Hard
**Duration**: ~10 minutes

Automates deployment by running tests, building the application, deploying to cloud providers, and verifying deployment.

**Tools Used**:

- `code_execute` - Run tests and build
- `api_call` - Deploy via cloud provider APIs

**Workflow**:

1. Run test suite
2. Build production bundle
3. Deploy to cloud provider (AWS, Vercel, etc.)
4. Verify deployment with health check

**Success Criteria**:

- Tests passed
- Build successful
- Deployment successful
- Health check passed

---

### 11. Meeting Scheduler Agent 📅

**Category**: Operations
**Difficulty**: Easy
**Duration**: ~2 minutes

Automates meeting scheduling by checking availability, proposing times, creating events, and sending invitations.

**Tools Used**:

- `calendar_query` - Check calendar availability
- `llm_reason` - Propose optimal meeting times
- `calendar_create` - Create calendar events
- `email_send` - Send invitations

**Workflow**:

1. Check calendar availability for all attendees
2. Propose optimal meeting times
3. Create calendar event
4. Send email invitations

**Success Criteria**:

- Availability checked
- Optimal time found
- Event created
- Invites sent

---

### 12. Expense Report Agent 🧾

**Category**: Finance
**Difficulty**: Easy
**Duration**: ~3 minutes

Automates expense reporting by scanning receipts, extracting data, categorizing expenses, and submitting reports.

**Tools Used**:

- `image_ocr` - Scan receipts
- `llm_reason` - Extract and categorize data
- `db_execute` - Save to database
- `api_call` - Submit expense report

**Workflow**:

1. Scan receipt images with OCR
2. Extract expense data (merchant, date, amount)
3. Categorize expense
4. Save to database
5. Submit expense report via API

**Success Criteria**:

- Receipt scanned
- Data extracted
- Expense categorized
- Report submitted

---

### 13. Content Writer Agent ✍️

**Category**: Content
**Difficulty**: Medium
**Duration**: ~10 minutes

Automates content creation by researching topics, creating outlines, writing articles, editing for quality, and publishing.

**Tools Used**:

- `browser_extract` - Research topics
- `llm_reason` - Create outline, write, and edit content
- `api_call` - Publish to CMS

**Workflow**:

1. Research topic from web sources
2. Create detailed outline
3. Write content based on outline
4. Edit and refine content
5. Publish to content platform

**Success Criteria**:

- Research completed
- Content written
- Quality edited
- Published to platform

---

### 14. Job Application Agent 💼

**Category**: HR
**Difficulty**: Medium
**Duration**: ~5 minutes per application

Automates job applications by finding postings, tailoring resumes, filling applications, and tracking status.

**Tools Used**:

- `browser_extract` - Search job postings
- `file_read` - Read resume
- `llm_reason` - Tailor resume
- `browser_navigate` - Navigate to application
- `ui_type` - Fill application form
- `db_execute` - Track application status

**Workflow**:

1. Search job postings on job boards
2. Read candidate's resume
3. Tailor resume for specific job
4. Navigate to application page
5. Fill application form
6. Track application status

**Success Criteria**:

- Jobs found
- Resume tailored
- Application submitted
- Status tracked

---

### 15. Research Agent 🔬

**Category**: Research
**Difficulty**: Medium
**Duration**: ~10 minutes

Automates research by searching sources, extracting information, synthesizing findings, and creating reports.

**Tools Used**:

- `browser_extract` - Search and extract information
- `llm_reason` - Analyze and synthesize findings
- `file_write` - Create research report

**Workflow**:

1. Search information sources
2. Extract relevant information
3. Analyze data and extract insights
4. Synthesize findings
5. Create comprehensive research report

**Success Criteria**:

- Multiple sources searched
- Information extracted
- Findings synthesized
- Report created

---

## Usage Guide

### Installing a Template

1. Open the Template Marketplace from the main navigation
2. Browse or search for templates
3. Click on a template card to view details
4. Click "Install" to add the template to your library
5. The template is now available in your "Installed" view

### Executing a Template

1. Navigate to "Show Installed" in the marketplace
2. Select the template you want to execute
3. Click "Execute" in the template details sidebar
4. Fill in any required parameters
5. Review the workflow preview
6. Click "Execute Template" to start execution
7. View execution results and logs

### Searching and Filtering

- **Search**: Use the search bar to find templates by name or description
- **Category Filter**: Click category buttons to filter by specific industries
- **Installed View**: Toggle to see only your installed templates

## Template Development Guide

### Creating a Custom Template

To create a custom template, follow this structure:

```rust
use crate::agi::templates::{
    AgentTemplate, DifficultyLevel, TemplateCategory,
    WorkflowDefinition, WorkflowStep,
};
use std::collections::HashMap;

fn create_my_custom_template() -> AgentTemplate {
    let mut prompts = HashMap::new();
    prompts.insert(
        "system".to_string(),
        "System prompt for the agent...".to_string(),
    );

    let workflow = WorkflowDefinition {
        steps: vec![
            WorkflowStep {
                id: "step1".to_string(),
                name: "Step Name".to_string(),
                description: "What this step does".to_string(),
                tool_id: "tool_name".to_string(),
                parameters: HashMap::from([
                    ("param".to_string(), serde_json::json!("value"))
                ]),
                expected_output: "Expected result".to_string(),
                retry_on_failure: true,
                max_retries: 2,
                timeout_seconds: 30,
            },
        ],
        parallel_execution: false,
        failure_strategy: "stop".to_string(),
    };

    AgentTemplate::new(
        "my-template-id".to_string(),
        "My Template Name".to_string(),
        TemplateCategory::Operations,
        "Template description".to_string(),
    )
    .with_icon("🔧".to_string())
    .with_tools(vec!["tool1".to_string(), "tool2".to_string()])
    .with_workflow(workflow)
    .with_prompts(prompts)
    .with_success_criteria(vec![
        "Criterion 1".to_string(),
        "Criterion 2".to_string(),
    ])
    .with_estimated_duration(60000) // milliseconds
    .with_difficulty(DifficultyLevel::Medium)
}
```

### Adding Template to System

1. Add your template function to `builtin_templates.rs`
2. Add it to the `get_builtin_templates()` function
3. Restart the application to load the new template

## API Reference

### Tauri Commands

All template operations are exposed via Tauri commands:

```typescript
// Get all templates
await invoke('get_all_templates'): Promise<AgentTemplate[]>

// Get template by ID
await invoke('get_template_by_id', { id: string }): Promise<AgentTemplate | null>

// Get templates by category
await invoke('get_templates_by_category', { category: string }): Promise<AgentTemplate[]>

// Install template
await invoke('install_template', { template_id: string }): Promise<void>

// Uninstall template
await invoke('uninstall_template', { template_id: string }): Promise<void>

// Get installed templates
await invoke('get_installed_templates'): Promise<AgentTemplate[]>

// Search templates
await invoke('search_templates', { query: string }): Promise<AgentTemplate[]>

// Execute template
await invoke('execute_template', {
  template_id: string,
  params: Record<string, string>
}): Promise<string>

// Get categories
await invoke('get_template_categories'): Promise<string[]>
```

### TypeScript Service

The `TemplateService` class provides a convenient wrapper:

```typescript
import { TemplateService } from '../services/templateService';

// Fetch all templates
const templates = await TemplateService.getAllTemplates();

// Install a template
await TemplateService.installTemplate('accounts-payable-agent');

// Execute a template
const result = await TemplateService.executeTemplate('data-entry-agent', {
  source_path: '/path/to/data.csv',
  target_app: 'ERP System',
});
```

### Zustand Store

The template store manages UI state:

```typescript
import { useTemplateStore } from '../stores/templateStore';

function MyComponent() {
  const { templates, isLoading, fetchTemplates, installTemplate, selectTemplate } =
    useTemplateStore();

  useEffect(() => {
    fetchTemplates();
  }, []);

  // ... component logic
}
```

## Best Practices

### Template Design

1. **Clear Naming**: Use descriptive names that explain what the template does
2. **Comprehensive Description**: Provide detailed information about use cases
3. **Realistic Estimates**: Set accurate duration and success criteria
4. **Error Handling**: Include retry logic for unreliable operations
5. **Validation**: Validate inputs before execution
6. **Logging**: Log all steps for debugging

### Workflow Design

1. **Atomic Steps**: Break down complex operations into small, manageable steps
2. **Clear Dependencies**: Ensure steps execute in the correct order
3. **Timeout Management**: Set appropriate timeouts for each step
4. **Failure Strategies**: Choose appropriate failure strategies (stop/continue/retry)
5. **Output Validation**: Verify expected outputs at each step

### Security

1. **Input Sanitization**: Validate and sanitize all user inputs
2. **Permission Checks**: Verify user has necessary permissions
3. **Secrets Management**: Never store API keys in templates
4. **Audit Logging**: Log all template executions for audit trails

## Troubleshooting

### Common Issues

**Template not appearing in marketplace**:

- Verify the template is added to `get_builtin_templates()`
- Check database migration v23 has been applied
- Restart the application

**Execution fails with parameter errors**:

- Ensure all required parameters are provided
- Check parameter names match workflow definitions
- Verify parameter values are valid

**Tool not found errors**:

- Verify the tool ID matches registered tools
- Check tool dependencies are installed
- Ensure tool has necessary permissions

**Performance issues**:

- Review timeout settings for long-running operations
- Consider parallel execution for independent steps
- Optimize workflow step dependencies

## Future Enhancements

- **Template Versioning**: Track template versions and allow updates
- **Custom Template Builder**: UI for creating custom templates without code
- **Template Sharing**: Share templates within teams or publicly
- **Analytics Dashboard**: Track template usage, success rates, and performance
- **Template Recommendations**: AI-powered template suggestions based on user workflows
- **Marketplace Integration**: External template marketplace with community contributions

## Support

For issues, questions, or feature requests related to Agent Templates:

1. Check this documentation
2. Review the [GitHub Issues](https://github.com/your-org/agiworkforce-desktop-app/issues)
3. Join our Discord community
4. Contact support@agiworkforce.com

---

Last Updated: 2025-11-13
Version: 1.0.0
