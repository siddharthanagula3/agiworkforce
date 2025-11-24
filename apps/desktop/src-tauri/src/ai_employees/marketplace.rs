use super::*;
use rusqlite::Connection;
use std::sync::{Arc, Mutex};

/// Employee Marketplace for browsing, searching, and publishing employees
pub struct EmployeeMarketplace {
    db: Arc<Mutex<Connection>>,
}

impl EmployeeMarketplace {
    /// Create a new marketplace instance
    pub fn new(db: Arc<Mutex<Connection>>) -> Self {
        Self { db }
    }

    /// Get featured employees (top-rated, most-used)
    pub fn get_featured_employees(&self) -> Result<Vec<AIEmployee>> {
        let conn = self
            .db
            .lock()
            .map_err(|e| EmployeeError::DatabaseError(format!("Failed to acquire lock: {}", e)))?;

        let mut stmt = conn
            .prepare(
                "SELECT id, name, role, description, capabilities, estimated_time_saved, estimated_cost_saved,
                        demo_workflow, required_integrations, template_id, is_verified, usage_count, avg_rating, created_at, tags
                 FROM ai_employees
                 WHERE is_verified = 1
                 ORDER BY (avg_rating * 0.5 + usage_count * 0.5) DESC
                 LIMIT 10",
            )
            .map_err(|e| EmployeeError::DatabaseError(e.to_string()))?;

        let employees = stmt
            .query_map([], |row| self.row_to_employee(row))
            .map_err(|e| EmployeeError::DatabaseError(e.to_string()))?;

        let mut result = Vec::new();
        for e in employees.flatten() {
            result.push(e);
        }

        Ok(result)
    }

    /// Search employees by query and filters
    pub fn search_employees(
        &self,
        query: &str,
        filters: EmployeeFilters,
    ) -> Result<Vec<AIEmployee>> {
        let conn = self
            .db
            .lock()
            .map_err(|e| EmployeeError::DatabaseError(format!("Failed to acquire lock: {}", e)))?;

        let mut sql = String::from(
            "SELECT id, name, role, description, capabilities, estimated_time_saved, estimated_cost_saved,
                    demo_workflow, required_integrations, template_id, is_verified, usage_count, avg_rating, created_at, tags
             FROM ai_employees WHERE 1=1",
        );

        // Apply filters
        if !query.is_empty() {
            sql.push_str(" AND (name LIKE '%");
            sql.push_str(query);
            sql.push_str("%' OR description LIKE '%");
            sql.push_str(query);
            sql.push_str("%' OR tags LIKE '%");
            sql.push_str(query);
            sql.push_str("%')");
        }

        if filters.verified_only {
            sql.push_str(" AND is_verified = 1");
        }

        if let Some(min_rating) = filters.min_rating {
            sql.push_str(&format!(" AND avg_rating >= {}", min_rating));
        }

        sql.push_str(" ORDER BY avg_rating DESC, usage_count DESC");

        let mut stmt = conn
            .prepare(&sql)
            .map_err(|e| EmployeeError::DatabaseError(e.to_string()))?;

        let employees = stmt
            .query_map([], |row| self.row_to_employee(row))
            .map_err(|e| EmployeeError::DatabaseError(e.to_string()))?;

        let mut result = Vec::new();
        for emp in employees {
            if let Ok(e) = emp {
                // Apply filters that can't be done in SQL easily
                let mut include = true;

                if !filters.roles.is_empty() && !filters.roles.contains(&e.role) {
                    include = false;
                }

                if !filters.tags.is_empty() {
                    let has_tag = filters.tags.iter().any(|tag| e.tags.contains(tag));
                    if !has_tag {
                        include = false;
                    }
                }

                if !filters.required_integrations.is_empty() {
                    let has_integration = filters
                        .required_integrations
                        .iter()
                        .any(|int| e.required_integrations.contains(int));
                    if !has_integration {
                        include = false;
                    }
                }

                if include {
                    result.push(e);
                }
            }
        }

        Ok(result)
    }

    /// Get employee by ID
    pub fn get_employee_by_id(&self, employee_id: &str) -> Result<AIEmployee> {
        let conn = self
            .db
            .lock()
            .map_err(|e| EmployeeError::DatabaseError(format!("Failed to acquire lock: {}", e)))?;

        let result = conn.query_row(
            "SELECT id, name, role, description, capabilities, estimated_time_saved, estimated_cost_saved,
                    demo_workflow, required_integrations, template_id, is_verified, usage_count, avg_rating, created_at, tags
             FROM ai_employees WHERE id = ?1",
            [employee_id],
            |row| self.row_to_employee(row),
        );

        result.map_err(|e| EmployeeError::NotFound(format!("Employee {}: {}", employee_id, e)))
    }

    /// Get statistics for an employee
    pub fn get_employee_stats(&self, employee_id: &str) -> Result<EmployeeStats> {
        let conn = self
            .db
            .lock()
            .map_err(|e| EmployeeError::DatabaseError(format!("Failed to acquire lock: {}", e)))?;

        // Get aggregate stats
        let (total_hires, total_tasks, total_time_mins, total_cost, avg_rating): (
            i64,
            i64,
            i64,
            f64,
            f64,
        ) = conn
            .query_row(
                "SELECT
                    COUNT(DISTINCT ue.id) as total_hires,
                    SUM(ue.tasks_completed) as total_tasks,
                    SUM(ue.time_saved_minutes) as total_time,
                    SUM(ue.cost_saved_usd) as total_cost,
                    (SELECT avg_rating FROM ai_employees WHERE id = ?1) as avg_rating
                 FROM user_employees ue
                 WHERE ue.employee_id = ?1",
                [employee_id],
                |row| {
                    Ok((
                        row.get(0).unwrap_or(0),
                        row.get(1).unwrap_or(0),
                        row.get(2).unwrap_or(0),
                        row.get(3).unwrap_or(0.0),
                        row.get(4).unwrap_or(0.0),
                    ))
                },
            )
            .unwrap_or((0, 0, 0, 0.0, 0.0));

        Ok(EmployeeStats {
            total_hires: total_hires as u64,
            total_tasks_completed: total_tasks as u64,
            total_time_saved_hours: total_time_mins as f64 / 60.0,
            total_cost_saved_usd: total_cost,
            avg_rating,
            testimonials: Vec::new(),    // TODO: Implement testimonials
            recent_activity: Vec::new(), // TODO: Implement activity log
        })
    }

    /// Publish a new employee (created by user)
    pub fn publish_employee(&self, employee: AIEmployee, creator_id: &str) -> Result<String> {
        let conn = self
            .db
            .lock()
            .map_err(|e| EmployeeError::DatabaseError(format!("Failed to acquire lock: {}", e)))?;

        let capabilities_json = serde_json::to_string(&employee.capabilities).unwrap_or_default();
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
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
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
                employee.usage_count as i64,
                employee.avg_rating,
                employee.created_at,
                creator_id,
                tags_json,
            ],
        )
        .map_err(|e| EmployeeError::DatabaseError(e.to_string()))?;

        Ok(employee.id)
    }

    /// Update an existing employee configuration
    pub fn update_employee(&self, employee_id: &str, employee: AIEmployee) -> Result<()> {
        let conn = self
            .db
            .lock()
            .map_err(|e| EmployeeError::DatabaseError(format!("Failed to acquire lock: {}", e)))?;

        // First verify the employee exists
        let exists: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM ai_employees WHERE id = ?1",
                [employee_id],
                |row| row.get::<_, i64>(0).map(|count| count > 0),
            )
            .map_err(|e| EmployeeError::DatabaseError(e.to_string()))?;

        if !exists {
            return Err(EmployeeError::NotFound(format!(
                "Employee {} not found",
                employee_id
            )));
        }

        let capabilities_json = serde_json::to_string(&employee.capabilities).unwrap_or_default();
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
                tags = ?11
             WHERE id = ?1",
            rusqlite::params![
                employee_id,
                employee.name,
                format!("{:?}", employee.role),
                employee.description,
                capabilities_json,
                employee.estimated_time_saved_per_run as i64,
                employee.estimated_cost_saved_per_run,
                demo_json,
                integrations_json,
                employee.template_id,
                tags_json,
            ],
        )
        .map_err(|e| EmployeeError::DatabaseError(e.to_string()))?;

        Ok(())
    }

    /// Delete a custom employee
    pub fn delete_employee(&self, employee_id: &str) -> Result<()> {
        let conn = self
            .db
            .lock()
            .map_err(|e| EmployeeError::DatabaseError(format!("Failed to acquire lock: {}", e)))?;

        // First verify the employee exists
        let exists: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM ai_employees WHERE id = ?1",
                [employee_id],
                |row| row.get::<_, i64>(0).map(|count| count > 0),
            )
            .map_err(|e| EmployeeError::DatabaseError(e.to_string()))?;

        if !exists {
            return Err(EmployeeError::NotFound(format!(
                "Employee {} not found",
                employee_id
            )));
        }

        // Delete the employee (this will cascade to user_employees if FK constraints are set)
        conn.execute("DELETE FROM ai_employees WHERE id = ?1", [employee_id])
            .map_err(|e| EmployeeError::DatabaseError(e.to_string()))?;

        Ok(())
    }

    /// Publish employee to marketplace with metadata
    pub fn publish_to_marketplace(
        &self,
        employee_id: &str,
        creator_id: &str,
        is_public: bool,
    ) -> Result<String> {
        let conn = self
            .db
            .lock()
            .map_err(|e| EmployeeError::DatabaseError(format!("Failed to acquire lock: {}", e)))?;

        // First verify the employee exists and belongs to the creator
        let (exists, current_creator): (bool, Option<String>) = conn
            .query_row(
                "SELECT COUNT(*), creator_id FROM ai_employees WHERE id = ?1 GROUP BY creator_id",
                [employee_id],
                |row| {
                    Ok((
                        row.get::<_, i64>(0).map(|count| count > 0).unwrap_or(false),
                        row.get::<_, Option<String>>(1).ok().flatten(),
                    ))
                },
            )
            .unwrap_or((false, None));

        if !exists {
            return Err(EmployeeError::NotFound(format!(
                "Employee {} not found",
                employee_id
            )));
        }

        // Verify the creator matches (if creator_id is set)
        if let Some(current) = current_creator {
            if current != creator_id {
                return Err(EmployeeError::InvalidConfig(format!(
                    "Employee {} does not belong to creator {}",
                    employee_id, creator_id
                )));
            }
        }

        // Update the employee to be published (mark as verified if publishing publicly)
        conn.execute(
            "UPDATE ai_employees SET is_verified = ?2, creator_id = ?3 WHERE id = ?1",
            rusqlite::params![employee_id, if is_public { 1 } else { 0 }, creator_id,],
        )
        .map_err(|e| EmployeeError::DatabaseError(e.to_string()))?;

        Ok(employee_id.to_string())
    }

    /// Get all employees by category
    pub fn get_employees_by_category(&self, category: &str) -> Result<Vec<AIEmployee>> {
        let conn = self
            .db
            .lock()
            .map_err(|e| EmployeeError::DatabaseError(format!("Failed to acquire lock: {}", e)))?;

        let mut stmt = conn
            .prepare(
                "SELECT id, name, role, description, capabilities, estimated_time_saved, estimated_cost_saved,
                        demo_workflow, required_integrations, template_id, is_verified, usage_count, avg_rating, created_at, tags
                 FROM ai_employees
                 ORDER BY avg_rating DESC",
            )
            .map_err(|e| EmployeeError::DatabaseError(e.to_string()))?;

        let employees = stmt
            .query_map([], |row| self.row_to_employee(row))
            .map_err(|e| EmployeeError::DatabaseError(e.to_string()))?;

        let mut result = Vec::new();
        for e in employees.flatten() {
            if e.role.category() == category {
                result.push(e);
            }
        }

        Ok(result)
    }

    /// Get user's hired employees
    pub fn get_user_employees(&self, user_id: &str) -> Result<Vec<UserEmployee>> {
        let conn = self
            .db
            .lock()
            .map_err(|e| EmployeeError::DatabaseError(format!("Failed to acquire lock: {}", e)))?;

        let mut stmt = conn
            .prepare(
                "SELECT id, user_id, employee_id, hired_at, tasks_completed, time_saved_minutes, cost_saved_usd, is_active, custom_config
                 FROM user_employees
                 WHERE user_id = ?1 AND is_active = 1
                 ORDER BY hired_at DESC",
            )
            .map_err(|e| EmployeeError::DatabaseError(e.to_string()))?;

        let user_employees = stmt
            .query_map([user_id], |row| {
                let custom_config_json: Option<String> = row.get(8)?;
                let custom_config: Option<HashMap<String, serde_json::Value>> =
                    custom_config_json.and_then(|json| serde_json::from_str(&json).ok());

                Ok(UserEmployee {
                    id: row.get(0)?,
                    user_id: row.get(1)?,
                    employee_id: row.get(2)?,
                    hired_at: row.get(3)?,
                    tasks_completed: row.get::<_, i64>(4)? as u64,
                    time_saved_minutes: row.get::<_, i64>(5)? as u64,
                    cost_saved_usd: row.get(6)?,
                    is_active: row.get::<_, i32>(7)? == 1,
                    custom_config,
                })
            })
            .map_err(|e| EmployeeError::DatabaseError(e.to_string()))?;

        let mut result = Vec::new();
        for e in user_employees.flatten() {
            result.push(e);
        }

        Ok(result)
    }

    /// Helper: Convert database row to AIEmployee
    fn row_to_employee(
        &self,
        row: &rusqlite::Row,
    ) -> std::result::Result<AIEmployee, rusqlite::Error> {
        let role_str: String = row.get(2)?;
        let capabilities_json: String = row.get(4)?;
        let demo_json: Option<String> = row.get(7)?;
        let integrations_json: String = row.get(8)?;
        let tags_json: String = row.get(14)?;

        let role = match role_str.as_str() {
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
        };

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
    }
}
