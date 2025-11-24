use super::employees::get_pre_built_employees;
use super::*;
use rusqlite::Connection;
use std::sync::{Arc, Mutex};

/// AI Employee Registry manages the collection of pre-built employees
pub struct AIEmployeeRegistry {
    db: Arc<Mutex<Connection>>,
}

impl AIEmployeeRegistry {
    /// Create a new registry instance
    pub fn new(db: Arc<Mutex<Connection>>) -> Self {
        Self { db }
    }

    /// Initialize registry with pre-built employees
    pub fn initialize(&self) -> Result<()> {
        let employees = get_pre_built_employees();

        for employee in employees {
            self.register_employee(employee)?;
        }

        tracing::info!(
            "Initialized AI Employee Registry with {} pre-built employees",
            self.count()?
        );
        Ok(())
    }

    /// Register a single employee
    fn register_employee(&self, employee: AIEmployee) -> Result<()> {
        let conn = self
            .db
            .lock()
            .map_err(|e| EmployeeError::DatabaseError(format!("Failed to acquire lock: {}", e)))?;

        // Check if already exists
        let exists: bool = conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM ai_employees WHERE id = ?1",
                [&employee.id],
                |row| row.get(0),
            )
            .unwrap_or(false);

        if exists {
            // Update existing employee
            let capabilities_json =
                serde_json::to_string(&employee.capabilities).unwrap_or_default();
            let demo_json = employee
                .demo_workflow
                .as_ref()
                .and_then(|d| serde_json::to_string(d).ok());
            let integrations_json =
                serde_json::to_string(&employee.required_integrations).unwrap_or_default();
            let tags_json = serde_json::to_string(&employee.tags).unwrap_or_default();

            conn.execute(
                "UPDATE ai_employees SET
                    name = ?2,
                    role = ?3,
                    description = ?4,
                    capabilities = ?5,
                    estimated_time_saved = ?6,
                    estimated_cost_saved = ?7,
                    demo_workflow = ?8,
                    required_integrations = ?9,
                    template_id = ?10,
                    is_verified = ?11,
                    tags = ?12
                 WHERE id = ?1",
                rusqlite::params![
                    employee.id,
                    employee.name,
                    format!("{:?}", employee.role),
                    employee.description,
                    capabilities_json,
                    employee.estimated_time_saved_per_run as i64,
                    employee.estimated_cost_saved_per_run,
                    demo_json,
                    integrations_json,
                    employee.template_id,
                    if employee.is_verified { 1 } else { 0 },
                    tags_json,
                ],
            )
            .map_err(|e| EmployeeError::DatabaseError(e.to_string()))?;
        } else {
            // Insert new employee
            let capabilities_json =
                serde_json::to_string(&employee.capabilities).unwrap_or_default();
            let demo_json = employee
                .demo_workflow
                .as_ref()
                .and_then(|d| serde_json::to_string(d).ok());
            let integrations_json =
                serde_json::to_string(&employee.required_integrations).unwrap_or_default();
            let tags_json = serde_json::to_string(&employee.tags).unwrap_or_default();

            conn.execute(
                "INSERT INTO ai_employees
                 (id, name, role, description, capabilities, estimated_time_saved, estimated_cost_saved,
                  demo_workflow, required_integrations, template_id, is_verified, usage_count, avg_rating, created_at, creator_id, tags)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 0, ?12, ?13, NULL, ?14)",
                rusqlite::params![
                    employee.id,
                    employee.name,
                    format!("{:?}", employee.role),
                    employee.description,
                    capabilities_json,
                    employee.estimated_time_saved_per_run as i64,
                    employee.estimated_cost_saved_per_run,
                    demo_json,
                    integrations_json,
                    employee.template_id,
                    if employee.is_verified { 1 } else { 0 },
                    employee.avg_rating,
                    employee.created_at,
                    tags_json,
                ],
            )
            .map_err(|e| EmployeeError::DatabaseError(e.to_string()))?;
        }

        Ok(())
    }

    /// Get count of registered employees
    pub fn count(&self) -> Result<usize> {
        let conn = self
            .db
            .lock()
            .map_err(|e| EmployeeError::DatabaseError(format!("Failed to acquire lock: {}", e)))?;

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM ai_employees", [], |row| row.get(0))
            .unwrap_or(0);

        Ok(count as usize)
    }

    /// Get all employees
    pub fn get_all(&self) -> Result<Vec<AIEmployee>> {
        let conn = self
            .db
            .lock()
            .map_err(|e| EmployeeError::DatabaseError(format!("Failed to acquire lock: {}", e)))?;

        let mut stmt = conn
            .prepare(
                "SELECT id, name, role, description, capabilities, estimated_time_saved, estimated_cost_saved,
                        demo_workflow, required_integrations, template_id, is_verified, usage_count, avg_rating, created_at, tags
                 FROM ai_employees
                 ORDER BY name",
            )
            .map_err(|e| EmployeeError::DatabaseError(e.to_string()))?;

        let employees = stmt
            .query_map([], |row| {
                let role_str: String = row.get(2)?;
                let capabilities_json: String = row.get(4)?;
                let demo_json: Option<String> = row.get(7)?;
                let integrations_json: String = row.get(8)?;
                let tags_json: String = row.get(14)?;

                let role = parse_role(&role_str);
                let capabilities: Vec<String> =
                    serde_json::from_str(&capabilities_json).unwrap_or_default();
                let demo_workflow: Option<DemoWorkflow> =
                    demo_json.and_then(|json| serde_json::from_str(&json).ok());
                let required_integrations: Vec<String> =
                    serde_json::from_str(&integrations_json).unwrap_or_default();
                let tags: Vec<String> = serde_json::from_str(&tags_json).unwrap_or_default();

                Ok(AIEmployee {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    role,
                    description: row.get(3)?,
                    capabilities,
                    estimated_time_saved_per_run: row.get::<_, i64>(5)? as u64,
                    estimated_cost_saved_per_run: row.get(6)?,
                    demo_workflow,
                    required_integrations,
                    template_id: row.get(9)?,
                    is_verified: row.get::<_, i32>(10)? == 1,
                    usage_count: row.get::<_, i64>(11)? as u64,
                    avg_rating: row.get(12)?,
                    created_at: row.get(13)?,
                    tags,
                })
            })
            .map_err(|e| EmployeeError::DatabaseError(e.to_string()))?;

        let mut result = Vec::new();
        for e in employees.flatten() {
            result.push(e);
        }

        Ok(result)
    }
}

/// Helper function to parse role string
fn parse_role(role_str: &str) -> EmployeeRole {
    match role_str {
        "SupportAgent" => EmployeeRole::SupportAgent,
        "EmailResponder" => EmployeeRole::EmailResponder,
        "LiveChatBot" => EmployeeRole::LiveChatBot,
        "TicketTriager" => EmployeeRole::TicketTriager,
        "LeadQualifier" => EmployeeRole::LeadQualifier,
        "EmailCampaigner" => EmployeeRole::EmailCampaigner,
        "SocialMediaManager" => EmployeeRole::SocialMediaManager,
        "ContentWriter" => EmployeeRole::ContentWriter,
        "DataEntry" => EmployeeRole::DataEntry,
        "InvoiceProcessor" => EmployeeRole::InvoiceProcessor,
        "ExpenseReconciler" => EmployeeRole::ExpenseReconciler,
        "ScheduleManager" => EmployeeRole::ScheduleManager,
        "CodeReviewer" => EmployeeRole::CodeReviewer,
        "BugTriager" => EmployeeRole::BugTriager,
        "DocumentationWriter" => EmployeeRole::DocumentationWriter,
        "TestRunner" => EmployeeRole::TestRunner,
        "InboxManager" => EmployeeRole::InboxManager,
        "CalendarOptimizer" => EmployeeRole::CalendarOptimizer,
        "TaskOrganizer" => EmployeeRole::TaskOrganizer,
        "ResearchAssistant" => EmployeeRole::ResearchAssistant,
        _ => EmployeeRole::SupportAgent, // Default
    }
}
