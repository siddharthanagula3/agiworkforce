use super::process_reasoning::{ProcessType, Strategy};
use super::ResourceUsage;
use anyhow::{anyhow, Result};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// ProcessTemplate - Complete template defining how to execute a process
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessTemplate {
    pub id: String,
    pub process_type: ProcessType,
    pub name: String,
    pub description: String,
    pub typical_steps: Vec<ProcessStep>,
    pub success_criteria: Vec<SuccessCriterion>,
    pub required_tools: Vec<String>,
    pub expected_duration_ms: u64,
    pub risk_factors: Vec<RiskFactor>,
    pub best_practices: Vec<String>,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessStep {
    pub step_number: usize,
    pub name: String,
    pub description: String,
    pub tool_id: String,
    pub parameters_template: serde_json::Value,
    pub estimated_duration_ms: u64,
    pub optional: bool,
    pub dependencies: Vec<usize>, // Step numbers this depends on
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SuccessCriterion {
    pub name: String,
    pub description: String,
    pub metric_name: String,
    pub target_value: f64,
    pub operator: ComparisonOperator,
    pub critical: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ComparisonOperator {
    GreaterThan,
    GreaterThanOrEqual,
    LessThan,
    LessThanOrEqual,
    Equal,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RiskFactor {
    pub name: String,
    pub description: String,
    pub severity: RiskSeverity,
    pub mitigation: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum RiskSeverity {
    Low,
    Medium,
    High,
    Critical,
}

/// ProcessOntology - Knowledge base of process templates
pub struct ProcessOntology {
    db_path: String,
    templates: HashMap<ProcessType, ProcessTemplate>,
}

impl ProcessOntology {
    pub fn new(db_path: String) -> Result<Self> {
        let mut ontology = Self {
            db_path: db_path.clone(),
            templates: HashMap::new(),
        };

        // Initialize default templates
        ontology.initialize_default_templates()?;

        // Load templates from database
        ontology.load_templates_from_db()?;

        Ok(ontology)
    }

    /// Initialize default process templates
    fn initialize_default_templates(&mut self) -> Result<()> {
        // AccountsPayable template
        self.templates.insert(
            ProcessType::AccountsPayable,
            ProcessTemplate {
                id: "template_accounts_payable".to_string(),
                process_type: ProcessType::AccountsPayable,
                name: "Accounts Payable Processing".to_string(),
                description: "Process invoices, verify payments, and update financial records".to_string(),
                typical_steps: vec![
                    ProcessStep {
                        step_number: 1,
                        name: "Extract Invoice Data".to_string(),
                        description: "Read and extract data from invoice documents".to_string(),
                        tool_id: "document_read".to_string(),
                        parameters_template: serde_json::json!({"file_path": "{invoice_path}"}),
                        estimated_duration_ms: 5000,
                        optional: false,
                        dependencies: vec![],
                    },
                    ProcessStep {
                        step_number: 2,
                        name: "Verify Invoice Data".to_string(),
                        description: "Check invoice against purchase orders and contracts".to_string(),
                        tool_id: "db_query".to_string(),
                        parameters_template: serde_json::json!({"database_id": "erp", "query": "SELECT * FROM purchase_orders WHERE po_number = ?"}),
                        estimated_duration_ms: 3000,
                        optional: false,
                        dependencies: vec![1],
                    },
                    ProcessStep {
                        step_number: 3,
                        name: "Update Accounting System".to_string(),
                        description: "Record invoice in accounting system".to_string(),
                        tool_id: "api_call".to_string(),
                        parameters_template: serde_json::json!({"method": "POST", "endpoint": "/api/invoices"}),
                        estimated_duration_ms: 4000,
                        optional: false,
                        dependencies: vec![2],
                    },
                    ProcessStep {
                        step_number: 4,
                        name: "Send Confirmation Email".to_string(),
                        description: "Notify stakeholders of invoice processing".to_string(),
                        tool_id: "email_send".to_string(),
                        parameters_template: serde_json::json!({"to": "{vendor_email}", "subject": "Invoice Processed"}),
                        estimated_duration_ms: 2000,
                        optional: true,
                        dependencies: vec![3],
                    },
                ],
                success_criteria: vec![
                    SuccessCriterion {
                        name: "Data Accuracy".to_string(),
                        description: "Invoice data extracted with high accuracy".to_string(),
                        metric_name: "data_accuracy".to_string(),
                        target_value: 0.98,
                        operator: ComparisonOperator::GreaterThanOrEqual,
                        critical: true,
                    },
                    SuccessCriterion {
                        name: "Processing Time".to_string(),
                        description: "Invoice processed within time limit".to_string(),
                        metric_name: "processing_time".to_string(),
                        target_value: 120.0,
                        operator: ComparisonOperator::LessThanOrEqual,
                        critical: false,
                    },
                ],
                required_tools: vec!["document_read".to_string(), "db_query".to_string(), "api_call".to_string()],
                expected_duration_ms: 14000,
                risk_factors: vec![
                    RiskFactor {
                        name: "OCR Errors".to_string(),
                        description: "Document scanning may produce incorrect data".to_string(),
                        severity: RiskSeverity::Medium,
                        mitigation: "Use multiple OCR engines and confidence thresholds".to_string(),
                    },
                    RiskFactor {
                        name: "Duplicate Payment".to_string(),
                        description: "Same invoice may be processed twice".to_string(),
                        severity: RiskSeverity::High,
                        mitigation: "Check for existing invoice records before processing".to_string(),
                    },
                ],
                best_practices: vec![
                    "Always verify vendor information against approved vendor list".to_string(),
                    "Flag invoices over threshold for manual review".to_string(),
                    "Maintain audit trail of all processing steps".to_string(),
                ],
                created_at: chrono::Utc::now().timestamp(),
            },
        );

        // CustomerSupport template
        self.templates.insert(
            ProcessType::CustomerSupport,
            ProcessTemplate {
                id: "template_customer_support".to_string(),
                process_type: ProcessType::CustomerSupport,
                name: "Customer Support Ticket Processing".to_string(),
                description: "Triage, analyze, and respond to customer support tickets".to_string(),
                typical_steps: vec![
                    ProcessStep {
                        step_number: 1,
                        name: "Fetch New Tickets".to_string(),
                        description: "Retrieve unprocessed support tickets".to_string(),
                        tool_id: "api_call".to_string(),
                        parameters_template: serde_json::json!({"method": "GET", "endpoint": "/api/tickets?status=new"}),
                        estimated_duration_ms: 3000,
                        optional: false,
                        dependencies: vec![],
                    },
                    ProcessStep {
                        step_number: 2,
                        name: "Categorize Ticket".to_string(),
                        description: "Classify ticket by type and priority".to_string(),
                        tool_id: "llm_reason".to_string(),
                        parameters_template: serde_json::json!({"prompt": "Categorize this support ticket: {ticket_content}"}),
                        estimated_duration_ms: 5000,
                        optional: false,
                        dependencies: vec![1],
                    },
                    ProcessStep {
                        step_number: 3,
                        name: "Generate Response".to_string(),
                        description: "Draft appropriate response to customer".to_string(),
                        tool_id: "llm_reason".to_string(),
                        parameters_template: serde_json::json!({"prompt": "Draft response to: {ticket_content}"}),
                        estimated_duration_ms: 8000,
                        optional: false,
                        dependencies: vec![2],
                    },
                    ProcessStep {
                        step_number: 4,
                        name: "Update Ticket System".to_string(),
                        description: "Record response and update ticket status".to_string(),
                        tool_id: "api_call".to_string(),
                        parameters_template: serde_json::json!({"method": "PUT", "endpoint": "/api/tickets/{ticket_id}"}),
                        estimated_duration_ms: 2000,
                        optional: false,
                        dependencies: vec![3],
                    },
                ],
                success_criteria: vec![
                    SuccessCriterion {
                        name: "Response Quality".to_string(),
                        description: "Response is helpful and accurate".to_string(),
                        metric_name: "response_quality".to_string(),
                        target_value: 0.85,
                        operator: ComparisonOperator::GreaterThanOrEqual,
                        critical: true,
                    },
                ],
                required_tools: vec!["api_call".to_string(), "llm_reason".to_string()],
                expected_duration_ms: 18000,
                risk_factors: vec![
                    RiskFactor {
                        name: "Incorrect Classification".to_string(),
                        description: "Ticket may be misclassified".to_string(),
                        severity: RiskSeverity::Medium,
                        mitigation: "Use confidence scores and escalate low-confidence cases".to_string(),
                    },
                ],
                best_practices: vec![
                    "Always maintain empathetic tone in responses".to_string(),
                    "Include relevant documentation links".to_string(),
                    "Escalate critical issues immediately".to_string(),
                ],
                created_at: chrono::Utc::now().timestamp(),
            },
        );

        // DataEntry template
        self.templates.insert(
            ProcessType::DataEntry,
            ProcessTemplate {
                id: "template_data_entry".to_string(),
                process_type: ProcessType::DataEntry,
                name: "Structured Data Entry".to_string(),
                description: "Enter data into databases or spreadsheets with high accuracy".to_string(),
                typical_steps: vec![
                    ProcessStep {
                        step_number: 1,
                        name: "Read Source Data".to_string(),
                        description: "Extract data from source document or form".to_string(),
                        tool_id: "file_read".to_string(),
                        parameters_template: serde_json::json!({"path": "{source_path}"}),
                        estimated_duration_ms: 2000,
                        optional: false,
                        dependencies: vec![],
                    },
                    ProcessStep {
                        step_number: 2,
                        name: "Validate Data".to_string(),
                        description: "Check data format and completeness".to_string(),
                        tool_id: "llm_reason".to_string(),
                        parameters_template: serde_json::json!({"prompt": "Validate this data: {data}"}),
                        estimated_duration_ms: 3000,
                        optional: false,
                        dependencies: vec![1],
                    },
                    ProcessStep {
                        step_number: 3,
                        name: "Insert into Database".to_string(),
                        description: "Write validated data to target database".to_string(),
                        tool_id: "db_execute".to_string(),
                        parameters_template: serde_json::json!({"connection_id": "{db_id}", "sql": "INSERT INTO..."}),
                        estimated_duration_ms: 4000,
                        optional: false,
                        dependencies: vec![2],
                    },
                ],
                success_criteria: vec![
                    SuccessCriterion {
                        name: "Data Accuracy".to_string(),
                        description: "Data entered without errors".to_string(),
                        metric_name: "data_accuracy".to_string(),
                        target_value: 0.99,
                        operator: ComparisonOperator::GreaterThanOrEqual,
                        critical: true,
                    },
                ],
                required_tools: vec!["file_read".to_string(), "db_execute".to_string()],
                expected_duration_ms: 9000,
                risk_factors: vec![
                    RiskFactor {
                        name: "Data Corruption".to_string(),
                        description: "Invalid data may corrupt database".to_string(),
                        severity: RiskSeverity::High,
                        mitigation: "Use database transactions and rollback on errors".to_string(),
                    },
                ],
                best_practices: vec![
                    "Always use parameterized queries to prevent SQL injection".to_string(),
                    "Validate data types before insertion".to_string(),
                    "Log all data entry operations for audit".to_string(),
                ],
                created_at: chrono::Utc::now().timestamp(),
            },
        );

        // EmailManagement template
        self.templates.insert(
            ProcessType::EmailManagement,
            ProcessTemplate {
                id: "template_email_management".to_string(),
                process_type: ProcessType::EmailManagement,
                name: "Email Organization and Response".to_string(),
                description: "Categorize emails and draft responses".to_string(),
                typical_steps: vec![
                    ProcessStep {
                        step_number: 1,
                        name: "Fetch Unread Emails".to_string(),
                        description: "Retrieve unread emails from inbox".to_string(),
                        tool_id: "email_fetch".to_string(),
                        parameters_template: serde_json::json!({"account_id": "{account}", "limit": 50}),
                        estimated_duration_ms: 4000,
                        optional: false,
                        dependencies: vec![],
                    },
                    ProcessStep {
                        step_number: 2,
                        name: "Categorize Emails".to_string(),
                        description: "Classify emails by priority and type".to_string(),
                        tool_id: "llm_reason".to_string(),
                        parameters_template: serde_json::json!({"prompt": "Categorize: {email_subject}"}),
                        estimated_duration_ms: 3000,
                        optional: false,
                        dependencies: vec![1],
                    },
                    ProcessStep {
                        step_number: 3,
                        name: "Draft Response".to_string(),
                        description: "Generate appropriate email response".to_string(),
                        tool_id: "llm_reason".to_string(),
                        parameters_template: serde_json::json!({"prompt": "Draft response to: {email_content}"}),
                        estimated_duration_ms: 5000,
                        optional: true,
                        dependencies: vec![2],
                    },
                ],
                success_criteria: vec![
                    SuccessCriterion {
                        name: "Categorization Accuracy".to_string(),
                        description: "Emails correctly categorized".to_string(),
                        metric_name: "categorization_accuracy".to_string(),
                        target_value: 0.92,
                        operator: ComparisonOperator::GreaterThanOrEqual,
                        critical: true,
                    },
                ],
                required_tools: vec!["email_fetch".to_string(), "llm_reason".to_string()],
                expected_duration_ms: 12000,
                risk_factors: vec![],
                best_practices: vec![
                    "Never send emails without human review for sensitive topics".to_string(),
                    "Maintain professional tone in all communications".to_string(),
                ],
                created_at: chrono::Utc::now().timestamp(),
            },
        );

        // CodeReview template
        self.templates.insert(
            ProcessType::CodeReview,
            ProcessTemplate {
                id: "template_code_review".to_string(),
                process_type: ProcessType::CodeReview,
                name: "Pull Request Code Review".to_string(),
                description: "Analyze code changes for quality, security, and best practices".to_string(),
                typical_steps: vec![
                    ProcessStep {
                        step_number: 1,
                        name: "Fetch PR Changes".to_string(),
                        description: "Get code diff from pull request".to_string(),
                        tool_id: "api_call".to_string(),
                        parameters_template: serde_json::json!({"method": "GET", "endpoint": "/repos/{repo}/pulls/{pr}/files"}),
                        estimated_duration_ms: 5000,
                        optional: false,
                        dependencies: vec![],
                    },
                    ProcessStep {
                        step_number: 2,
                        name: "Analyze Code Quality".to_string(),
                        description: "Check for code smells and anti-patterns".to_string(),
                        tool_id: "code_analyze".to_string(),
                        parameters_template: serde_json::json!({"code": "{diff}"}),
                        estimated_duration_ms: 10000,
                        optional: false,
                        dependencies: vec![1],
                    },
                    ProcessStep {
                        step_number: 3,
                        name: "Security Scan".to_string(),
                        description: "Check for security vulnerabilities".to_string(),
                        tool_id: "llm_reason".to_string(),
                        parameters_template: serde_json::json!({"prompt": "Identify security issues in: {code}"}),
                        estimated_duration_ms: 8000,
                        optional: false,
                        dependencies: vec![1],
                    },
                    ProcessStep {
                        step_number: 4,
                        name: "Generate Review Comments".to_string(),
                        description: "Create detailed review feedback".to_string(),
                        tool_id: "llm_reason".to_string(),
                        parameters_template: serde_json::json!({"prompt": "Generate code review for: {analysis}"}),
                        estimated_duration_ms: 7000,
                        optional: false,
                        dependencies: vec![2, 3],
                    },
                ],
                success_criteria: vec![
                    SuccessCriterion {
                        name: "Review Completeness".to_string(),
                        description: "All critical issues identified".to_string(),
                        metric_name: "review_completeness".to_string(),
                        target_value: 0.90,
                        operator: ComparisonOperator::GreaterThanOrEqual,
                        critical: true,
                    },
                ],
                required_tools: vec!["api_call".to_string(), "code_analyze".to_string(), "llm_reason".to_string()],
                expected_duration_ms: 30000,
                risk_factors: vec![
                    RiskFactor {
                        name: "False Positives".to_string(),
                        description: "May flag valid code as problematic".to_string(),
                        severity: RiskSeverity::Low,
                        mitigation: "Use confidence scores and allow overrides".to_string(),
                    },
                ],
                best_practices: vec![
                    "Focus on high-impact issues first".to_string(),
                    "Provide constructive feedback with examples".to_string(),
                    "Check test coverage for new code".to_string(),
                ],
                created_at: chrono::Utc::now().timestamp(),
            },
        );

        // Save all templates to database
        for template in self.templates.values() {
            self.save_template_to_db(template)?;
        }

        Ok(())
    }

    /// Load templates from database
    fn load_templates_from_db(&mut self) -> Result<()> {
        let conn = Connection::open(&self.db_path)?;

        let mut stmt = conn.prepare(
            "SELECT id, process_type, name, description, typical_steps, success_criteria,
                    required_tools, expected_duration_ms, risk_factors, best_practices, created_at
             FROM process_templates"
        )?;

        let templates = stmt.query_map([], |row| {
            let process_type_str: String = row.get(1)?;
            let process_type = ProcessType::from_str(&process_type_str)
                .ok_or_else(|| rusqlite::Error::InvalidQuery)?;

            let typical_steps_json: String = row.get(4)?;
            let typical_steps: Vec<ProcessStep> = serde_json::from_str(&typical_steps_json)
                .map_err(|_| rusqlite::Error::InvalidQuery)?;

            let success_criteria_json: String = row.get(5)?;
            let success_criteria: Vec<SuccessCriterion> = serde_json::from_str(&success_criteria_json)
                .map_err(|_| rusqlite::Error::InvalidQuery)?;

            let required_tools_json: String = row.get(6)?;
            let required_tools: Vec<String> = serde_json::from_str(&required_tools_json)
                .map_err(|_| rusqlite::Error::InvalidQuery)?;

            let risk_factors_json: String = row.get(8)?;
            let risk_factors: Vec<RiskFactor> = serde_json::from_str(&risk_factors_json)
                .map_err(|_| rusqlite::Error::InvalidQuery)?;

            let best_practices_json: String = row.get(9)?;
            let best_practices: Vec<String> = serde_json::from_str(&best_practices_json)
                .map_err(|_| rusqlite::Error::InvalidQuery)?;

            Ok(ProcessTemplate {
                id: row.get(0)?,
                process_type,
                name: row.get(2)?,
                description: row.get(3)?,
                typical_steps,
                success_criteria,
                required_tools,
                expected_duration_ms: row.get::<_, i64>(7)? as u64,
                risk_factors,
                best_practices,
                created_at: row.get(10)?,
            })
        })?;

        for template_result in templates {
            if let Ok(template) = template_result {
                self.templates.insert(template.process_type, template);
            }
        }

        Ok(())
    }

    /// Save a template to the database
    fn save_template_to_db(&self, template: &ProcessTemplate) -> Result<()> {
        let conn = Connection::open(&self.db_path)?;

        conn.execute(
            "INSERT OR REPLACE INTO process_templates
             (id, process_type, name, description, typical_steps, success_criteria,
              required_tools, expected_duration_ms, risk_factors, best_practices, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                template.id,
                template.process_type.as_str(),
                template.name,
                template.description,
                serde_json::to_string(&template.typical_steps)?,
                serde_json::to_string(&template.success_criteria)?,
                serde_json::to_string(&template.required_tools)?,
                template.expected_duration_ms as i64,
                serde_json::to_string(&template.risk_factors)?,
                serde_json::to_string(&template.best_practices)?,
                template.created_at,
            ],
        )?;

        Ok(())
    }

    /// Get a template by process type
    pub fn get_template(&self, process_type: ProcessType) -> Option<&ProcessTemplate> {
        self.templates.get(&process_type)
    }

    /// Get all templates
    pub fn get_all_templates(&self) -> Vec<&ProcessTemplate> {
        self.templates.values().collect()
    }

    /// Get best practices for a process type
    pub fn get_best_practices(&self, process_type: ProcessType) -> Vec<String> {
        self.templates
            .get(&process_type)
            .map(|t| t.best_practices.clone())
            .unwrap_or_default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_comparison_operator() {
        assert!(matches!(ComparisonOperator::GreaterThan, ComparisonOperator::GreaterThan));
    }

    #[test]
    fn test_risk_severity() {
        assert!(matches!(RiskSeverity::High, RiskSeverity::High));
    }
}
