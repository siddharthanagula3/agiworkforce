use rusqlite::{Connection, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

/// Template category for organizing templates
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TemplateCategory {
    Finance,
    CustomerService,
    Development,
    Marketing,
    HR,
    Operations,
    DataEntry,
    Research,
    Content,
    Deployment,
}

impl TemplateCategory {
    pub fn as_str(&self) -> &'static str {
        match self {
            TemplateCategory::Finance => "finance",
            TemplateCategory::CustomerService => "customer_service",
            TemplateCategory::Development => "development",
            TemplateCategory::Marketing => "marketing",
            TemplateCategory::HR => "hr",
            TemplateCategory::Operations => "operations",
            TemplateCategory::DataEntry => "data_entry",
            TemplateCategory::Research => "research",
            TemplateCategory::Content => "content",
            TemplateCategory::Deployment => "deployment",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "finance" => Some(TemplateCategory::Finance),
            "customer_service" => Some(TemplateCategory::CustomerService),
            "development" => Some(TemplateCategory::Development),
            "marketing" => Some(TemplateCategory::Marketing),
            "hr" => Some(TemplateCategory::HR),
            "operations" => Some(TemplateCategory::Operations),
            "data_entry" => Some(TemplateCategory::DataEntry),
            "research" => Some(TemplateCategory::Research),
            "content" => Some(TemplateCategory::Content),
            "deployment" => Some(TemplateCategory::Deployment),
            _ => None,
        }
    }
}

/// Difficulty level for templates
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum DifficultyLevel {
    Easy,
    Medium,
    Hard,
}

impl DifficultyLevel {
    pub fn as_str(&self) -> &'static str {
        match self {
            DifficultyLevel::Easy => "easy",
            DifficultyLevel::Medium => "medium",
            DifficultyLevel::Hard => "hard",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "easy" => Some(DifficultyLevel::Easy),
            "medium" => Some(DifficultyLevel::Medium),
            "hard" => Some(DifficultyLevel::Hard),
            _ => None,
        }
    }
}

/// Workflow step definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowStep {
    pub id: String,
    pub name: String,
    pub description: String,
    pub tool_id: String,
    pub parameters: HashMap<String, serde_json::Value>,
    pub expected_output: String,
    pub retry_on_failure: bool,
    pub max_retries: u32,
    pub timeout_seconds: u64,
}

/// Complete workflow definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowDefinition {
    pub steps: Vec<WorkflowStep>,
    pub parallel_execution: bool,
    pub failure_strategy: String, // "stop", "continue", "retry"
}

/// Agent template definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentTemplate {
    pub id: String,
    pub name: String,
    pub category: TemplateCategory,
    pub description: String,
    pub icon: String,
    pub tools: Vec<String>,
    pub workflow: WorkflowDefinition,
    pub default_prompts: HashMap<String, String>,
    pub success_criteria: Vec<String>,
    pub estimated_duration_ms: u64,
    pub difficulty_level: DifficultyLevel,
    pub install_count: i64,
    pub created_at: i64,
}

impl AgentTemplate {
    pub fn new(id: String, name: String, category: TemplateCategory, description: String) -> Self {
        Self {
            id,
            name,
            category,
            description,
            icon: "📦".to_string(),
            tools: Vec::new(),
            workflow: WorkflowDefinition {
                steps: Vec::new(),
                parallel_execution: false,
                failure_strategy: "stop".to_string(),
            },
            default_prompts: HashMap::new(),
            success_criteria: Vec::new(),
            estimated_duration_ms: 60000,
            difficulty_level: DifficultyLevel::Medium,
            install_count: 0,
            created_at: chrono::Utc::now().timestamp(),
        }
    }

    pub fn with_icon(mut self, icon: String) -> Self {
        self.icon = icon;
        self
    }

    pub fn with_tools(mut self, tools: Vec<String>) -> Self {
        self.tools = tools;
        self
    }

    pub fn with_workflow(mut self, workflow: WorkflowDefinition) -> Self {
        self.workflow = workflow;
        self
    }

    pub fn with_prompts(mut self, prompts: HashMap<String, String>) -> Self {
        self.default_prompts = prompts;
        self
    }

    pub fn with_success_criteria(mut self, criteria: Vec<String>) -> Self {
        self.success_criteria = criteria;
        self
    }

    pub fn with_estimated_duration(mut self, duration_ms: u64) -> Self {
        self.estimated_duration_ms = duration_ms;
        self
    }

    pub fn with_difficulty(mut self, difficulty: DifficultyLevel) -> Self {
        self.difficulty_level = difficulty;
        self
    }
}

/// Template manager for storing and retrieving templates
pub struct TemplateManager {
    db: Arc<Mutex<Connection>>,
}

impl TemplateManager {
    pub fn new(db: Arc<Mutex<Connection>>) -> Result<Self> {
        Ok(Self { db })
    }

    /// Get all available templates
    pub fn get_all_templates(&self) -> Result<Vec<AgentTemplate>> {
        let conn = self.db.lock().map_err(|_| {
            rusqlite::Error::ToSqlConversionFailure(Box::new(std::io::Error::new(
                std::io::ErrorKind::Other,
                "Failed to lock database",
            )))
        })?;

        let mut stmt = conn.prepare(
            "SELECT id, name, category, description, icon, tools, workflow,
                    default_prompts, success_criteria, estimated_duration_ms,
                    difficulty_level, install_count, created_at
             FROM agent_templates
             ORDER BY install_count DESC, name ASC",
        )?;

        let templates = stmt
            .query_map([], |row| {
                let tools_json: String = row.get(5)?;
                let workflow_json: String = row.get(6)?;
                let prompts_json: String = row.get(7)?;
                let criteria_json: String = row.get(8)?;
                let category_str: String = row.get(2)?;
                let difficulty_str: String = row.get(10)?;

                Ok(AgentTemplate {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    category: TemplateCategory::from_str(&category_str)
                        .unwrap_or(TemplateCategory::Operations),
                    description: row.get(3)?,
                    icon: row.get(4)?,
                    tools: serde_json::from_str(&tools_json).unwrap_or_default(),
                    workflow: serde_json::from_str(&workflow_json).unwrap_or(WorkflowDefinition {
                        steps: Vec::new(),
                        parallel_execution: false,
                        failure_strategy: "stop".to_string(),
                    }),
                    default_prompts: serde_json::from_str(&prompts_json).unwrap_or_default(),
                    success_criteria: serde_json::from_str(&criteria_json).unwrap_or_default(),
                    estimated_duration_ms: row.get(9)?,
                    difficulty_level: DifficultyLevel::from_str(&difficulty_str)
                        .unwrap_or(DifficultyLevel::Medium),
                    install_count: row.get(11)?,
                    created_at: row.get(12)?,
                })
            })?
            .collect::<Result<Vec<_>>>()?;

        Ok(templates)
    }

    /// Get template by ID
    pub fn get_template_by_id(&self, id: &str) -> Result<Option<AgentTemplate>> {
        let conn = self.db.lock().map_err(|_| {
            rusqlite::Error::ToSqlConversionFailure(Box::new(std::io::Error::new(
                std::io::ErrorKind::Other,
                "Failed to lock database",
            )))
        })?;

        let mut stmt = conn.prepare(
            "SELECT id, name, category, description, icon, tools, workflow,
                    default_prompts, success_criteria, estimated_duration_ms,
                    difficulty_level, install_count, created_at
             FROM agent_templates
             WHERE id = ?1",
        )?;

        let mut rows = stmt.query([id])?;

        if let Some(row) = rows.next()? {
            let tools_json: String = row.get(5)?;
            let workflow_json: String = row.get(6)?;
            let prompts_json: String = row.get(7)?;
            let criteria_json: String = row.get(8)?;
            let category_str: String = row.get(2)?;
            let difficulty_str: String = row.get(10)?;

            Ok(Some(AgentTemplate {
                id: row.get(0)?,
                name: row.get(1)?,
                category: TemplateCategory::from_str(&category_str)
                    .unwrap_or(TemplateCategory::Operations),
                description: row.get(3)?,
                icon: row.get(4)?,
                tools: serde_json::from_str(&tools_json).unwrap_or_default(),
                workflow: serde_json::from_str(&workflow_json).unwrap_or(WorkflowDefinition {
                    steps: Vec::new(),
                    parallel_execution: false,
                    failure_strategy: "stop".to_string(),
                }),
                default_prompts: serde_json::from_str(&prompts_json).unwrap_or_default(),
                success_criteria: serde_json::from_str(&criteria_json).unwrap_or_default(),
                estimated_duration_ms: row.get(9)?,
                difficulty_level: DifficultyLevel::from_str(&difficulty_str)
                    .unwrap_or(DifficultyLevel::Medium),
                install_count: row.get(11)?,
                created_at: row.get(12)?,
            }))
        } else {
            Ok(None)
        }
    }

    pub fn uninstall_template(&self, user_id: &str, template_id: &str) -> Result<()> {
        let conn = self.db.lock().map_err(|_| {
            rusqlite::Error::ToSqlConversionFailure(Box::new(std::io::Error::new(
                std::io::ErrorKind::Other,
                "Failed to lock database",
            )))
        })?;

        conn.execute(
            "DELETE FROM template_installs WHERE user_id = ?1 AND template_id = ?2",
            rusqlite::params![user_id, template_id],
        )?;

        Ok(())
    }

    /// Get templates by category
    pub fn get_templates_by_category(
        &self,
        category: TemplateCategory,
    ) -> Result<Vec<AgentTemplate>> {
        let conn = self.db.lock().map_err(|_| {
            rusqlite::Error::ToSqlConversionFailure(Box::new(std::io::Error::new(
                std::io::ErrorKind::Other,
                "Failed to lock database",
            )))
        })?;

        let mut stmt = conn.prepare(
            "SELECT id, name, category, description, icon, tools, workflow,
                    default_prompts, success_criteria, estimated_duration_ms,
                    difficulty_level, install_count, created_at
             FROM agent_templates
             WHERE category = ?1
             ORDER BY install_count DESC, name ASC",
        )?;

        let templates = stmt
            .query_map([category.as_str()], |row| {
                let tools_json: String = row.get(5)?;
                let workflow_json: String = row.get(6)?;
                let prompts_json: String = row.get(7)?;
                let criteria_json: String = row.get(8)?;
                let category_str: String = row.get(2)?;
                let difficulty_str: String = row.get(10)?;

                Ok(AgentTemplate {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    category: TemplateCategory::from_str(&category_str)
                        .unwrap_or(TemplateCategory::Operations),
                    description: row.get(3)?,
                    icon: row.get(4)?,
                    tools: serde_json::from_str(&tools_json).unwrap_or_default(),
                    workflow: serde_json::from_str(&workflow_json).unwrap_or(WorkflowDefinition {
                        steps: Vec::new(),
                        parallel_execution: false,
                        failure_strategy: "stop".to_string(),
                    }),
                    default_prompts: serde_json::from_str(&prompts_json).unwrap_or_default(),
                    success_criteria: serde_json::from_str(&criteria_json).unwrap_or_default(),
                    estimated_duration_ms: row.get(9)?,
                    difficulty_level: DifficultyLevel::from_str(&difficulty_str)
                        .unwrap_or(DifficultyLevel::Medium),
                    install_count: row.get(11)?,
                    created_at: row.get(12)?,
                })
            })?
            .collect::<Result<Vec<_>>>()?;

        Ok(templates)
    }

    /// Install a template for a user
    pub fn install_template(&self, user_id: &str, template_id: &str) -> Result<()> {
        let conn = self.db.lock().map_err(|_| {
            rusqlite::Error::ToSqlConversionFailure(Box::new(std::io::Error::new(
                std::io::ErrorKind::Other,
                "Failed to lock database",
            )))
        })?;

        // Insert install record
        conn.execute(
            "INSERT OR REPLACE INTO template_installs (user_id, template_id, installed_at)
             VALUES (?1, ?2, ?3)",
            [
                user_id,
                template_id,
                &chrono::Utc::now().timestamp().to_string(),
            ],
        )?;

        // Increment install count
        conn.execute(
            "UPDATE agent_templates SET install_count = install_count + 1 WHERE id = ?1",
            [template_id],
        )?;

        Ok(())
    }

    /// Get installed templates for a user
    pub fn get_installed_templates(&self, user_id: &str) -> Result<Vec<AgentTemplate>> {
        let conn = self.db.lock().map_err(|_| {
            rusqlite::Error::ToSqlConversionFailure(Box::new(std::io::Error::new(
                std::io::ErrorKind::Other,
                "Failed to lock database",
            )))
        })?;

        let mut stmt = conn.prepare(
            "SELECT t.id, t.name, t.category, t.description, t.icon, t.tools, t.workflow,
                    t.default_prompts, t.success_criteria, t.estimated_duration_ms,
                    t.difficulty_level, t.install_count, t.created_at
             FROM agent_templates t
             INNER JOIN template_installs i ON t.id = i.template_id
             WHERE i.user_id = ?1
             ORDER BY i.installed_at DESC",
        )?;

        let templates = stmt
            .query_map([user_id], |row| {
                let tools_json: String = row.get(5)?;
                let workflow_json: String = row.get(6)?;
                let prompts_json: String = row.get(7)?;
                let criteria_json: String = row.get(8)?;
                let category_str: String = row.get(2)?;
                let difficulty_str: String = row.get(10)?;

                Ok(AgentTemplate {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    category: TemplateCategory::from_str(&category_str)
                        .unwrap_or(TemplateCategory::Operations),
                    description: row.get(3)?,
                    icon: row.get(4)?,
                    tools: serde_json::from_str(&tools_json).unwrap_or_default(),
                    workflow: serde_json::from_str(&workflow_json).unwrap_or(WorkflowDefinition {
                        steps: Vec::new(),
                        parallel_execution: false,
                        failure_strategy: "stop".to_string(),
                    }),
                    default_prompts: serde_json::from_str(&prompts_json).unwrap_or_default(),
                    success_criteria: serde_json::from_str(&criteria_json).unwrap_or_default(),
                    estimated_duration_ms: row.get(9)?,
                    difficulty_level: DifficultyLevel::from_str(&difficulty_str)
                        .unwrap_or(DifficultyLevel::Medium),
                    install_count: row.get(11)?,
                    created_at: row.get(12)?,
                })
            })?
            .collect::<Result<Vec<_>>>()?;

        Ok(templates)
    }

    /// Search templates by query (searches name and description)
    pub fn search_templates(&self, query: &str) -> Result<Vec<AgentTemplate>> {
        let conn = self.db.lock().map_err(|_| {
            rusqlite::Error::ToSqlConversionFailure(Box::new(std::io::Error::new(
                std::io::ErrorKind::Other,
                "Failed to lock database",
            )))
        })?;

        let search_pattern = format!("%{}%", query.to_lowercase());

        let mut stmt = conn.prepare(
            "SELECT id, name, category, description, icon, tools, workflow,
                    default_prompts, success_criteria, estimated_duration_ms,
                    difficulty_level, install_count, created_at
             FROM agent_templates
             WHERE LOWER(name) LIKE ?1 OR LOWER(description) LIKE ?1
             ORDER BY install_count DESC, name ASC",
        )?;

        let templates = stmt
            .query_map([&search_pattern], |row| {
                let tools_json: String = row.get(5)?;
                let workflow_json: String = row.get(6)?;
                let prompts_json: String = row.get(7)?;
                let criteria_json: String = row.get(8)?;
                let category_str: String = row.get(2)?;
                let difficulty_str: String = row.get(10)?;

                Ok(AgentTemplate {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    category: TemplateCategory::from_str(&category_str)
                        .unwrap_or(TemplateCategory::Operations),
                    description: row.get(3)?,
                    icon: row.get(4)?,
                    tools: serde_json::from_str(&tools_json).unwrap_or_default(),
                    workflow: serde_json::from_str(&workflow_json).unwrap_or(WorkflowDefinition {
                        steps: Vec::new(),
                        parallel_execution: false,
                        failure_strategy: "stop".to_string(),
                    }),
                    default_prompts: serde_json::from_str(&prompts_json).unwrap_or_default(),
                    success_criteria: serde_json::from_str(&criteria_json).unwrap_or_default(),
                    estimated_duration_ms: row.get(9)?,
                    difficulty_level: DifficultyLevel::from_str(&difficulty_str)
                        .unwrap_or(DifficultyLevel::Medium),
                    install_count: row.get(11)?,
                    created_at: row.get(12)?,
                })
            })?
            .collect::<Result<Vec<_>>>()?;

        Ok(templates)
    }

    /// Save a template to the database
    pub fn save_template(&self, template: &AgentTemplate) -> Result<()> {
        let conn = self.db.lock().map_err(|_| {
            rusqlite::Error::ToSqlConversionFailure(Box::new(std::io::Error::new(
                std::io::ErrorKind::Other,
                "Failed to lock database",
            )))
        })?;

        let tools_json = serde_json::to_string(&template.tools).unwrap_or_default();
        let workflow_json = serde_json::to_string(&template.workflow).unwrap_or_default();
        let prompts_json = serde_json::to_string(&template.default_prompts).unwrap_or_default();
        let criteria_json = serde_json::to_string(&template.success_criteria).unwrap_or_default();

        conn.execute(
            "INSERT OR REPLACE INTO agent_templates
             (id, name, category, description, icon, tools, workflow,
              default_prompts, success_criteria, estimated_duration_ms,
              difficulty_level, install_count, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            rusqlite::params![
                template.id,
                template.name,
                template.category.as_str(),
                template.description,
                template.icon,
                tools_json,
                workflow_json,
                prompts_json,
                criteria_json,
                template.estimated_duration_ms as i64,
                template.difficulty_level.as_str(),
                template.install_count,
                template.created_at,
            ],
        )?;

        Ok(())
    }

    /// Initialize built-in templates in the database
    pub fn initialize_builtin_templates(&self, templates: Vec<AgentTemplate>) -> Result<()> {
        for template in templates {
            // Only insert if not already exists
            let exists = self.get_template_by_id(&template.id)?.is_some();
            if !exists {
                self.save_template(&template)?;
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    #[test]
    fn test_template_category_conversion() {
        assert_eq!(TemplateCategory::Finance.as_str(), "finance");
        assert_eq!(
            TemplateCategory::from_str("finance"),
            Some(TemplateCategory::Finance)
        );
    }

    #[test]
    fn test_difficulty_level_conversion() {
        assert_eq!(DifficultyLevel::Easy.as_str(), "easy");
        assert_eq!(
            DifficultyLevel::from_str("medium"),
            Some(DifficultyLevel::Medium)
        );
    }

    #[test]
    fn test_template_builder() {
        let template = AgentTemplate::new(
            "test-1".to_string(),
            "Test Template".to_string(),
            TemplateCategory::Development,
            "A test template".to_string(),
        )
        .with_icon("🧪".to_string())
        .with_difficulty(DifficultyLevel::Easy)
        .with_estimated_duration(30000);

        assert_eq!(template.id, "test-1");
        assert_eq!(template.name, "Test Template");
        assert_eq!(template.icon, "🧪");
        assert_eq!(template.difficulty_level, DifficultyLevel::Easy);
        assert_eq!(template.estimated_duration_ms, 30000);
    }
}
