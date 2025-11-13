use crate::orchestration::workflow_engine::WorkflowDefinition;
use chrono::Utc;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use uuid::Uuid;

/// Published workflow in the marketplace
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PublishedWorkflow {
    pub id: String,
    pub title: String,
    pub description: String,
    pub category: WorkflowCategory,
    pub creator_id: String,
    pub creator_name: String,
    pub creator_avatar: Option<String>,
    pub thumbnail_url: Option<String>,
    pub share_url: String,
    pub clone_count: u64,
    pub view_count: u64,
    pub favorite_count: u64,
    pub rating: f64,
    pub rating_count: u64,
    pub tags: Vec<String>,
    pub estimated_time_saved: u64, // in minutes
    pub estimated_cost_saved: f64, // in dollars
    pub is_verified: bool,
    pub is_featured: bool,
    pub workflow_definition: String, // JSON
    pub created_at: i64,
    pub updated_at: i64,
}

/// Workflow categories for organization
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum WorkflowCategory {
    CustomerSupport,
    SalesMarketing,
    Development,
    Operations,
    PersonalProductivity,
    Finance,
    HR,
    DataAnalysis,
    ContentCreation,
    Custom,
}

impl std::fmt::Display for WorkflowCategory {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            WorkflowCategory::CustomerSupport => write!(f, "customer_support"),
            WorkflowCategory::SalesMarketing => write!(f, "sales_marketing"),
            WorkflowCategory::Development => write!(f, "development"),
            WorkflowCategory::Operations => write!(f, "operations"),
            WorkflowCategory::PersonalProductivity => write!(f, "personal_productivity"),
            WorkflowCategory::Finance => write!(f, "finance"),
            WorkflowCategory::HR => write!(f, "hr"),
            WorkflowCategory::DataAnalysis => write!(f, "data_analysis"),
            WorkflowCategory::ContentCreation => write!(f, "content_creation"),
            WorkflowCategory::Custom => write!(f, "custom"),
        }
    }
}

impl WorkflowCategory {
    pub fn from_str(s: &str) -> Self {
        match s {
            "customer_support" => WorkflowCategory::CustomerSupport,
            "sales_marketing" => WorkflowCategory::SalesMarketing,
            "development" => WorkflowCategory::Development,
            "operations" => WorkflowCategory::Operations,
            "personal_productivity" => WorkflowCategory::PersonalProductivity,
            "finance" => WorkflowCategory::Finance,
            "hr" => WorkflowCategory::HR,
            "data_analysis" => WorkflowCategory::DataAnalysis,
            "content_creation" => WorkflowCategory::ContentCreation,
            _ => WorkflowCategory::Custom,
        }
    }
}

/// Workflow publisher for managing public workflows
pub struct WorkflowPublisher {
    db: Arc<Mutex<Connection>>,
}

impl WorkflowPublisher {
    pub fn new(db: Arc<Mutex<Connection>>) -> Self {
        Self { db }
    }

    /// Publish a workflow to the marketplace
    pub fn publish_workflow(
        &self,
        workflow: WorkflowDefinition,
        publisher_id: &str,
        publisher_name: &str,
        category: WorkflowCategory,
        tags: Vec<String>,
        estimated_time_saved: u64,
        estimated_cost_saved: f64,
        thumbnail_url: Option<String>,
    ) -> Result<PublishedWorkflow, String> {
        let conn = self
            .db
            .lock()
            .map_err(|e| format!("Failed to lock database: {}", e))?;

        let published_id = Uuid::new_v4().to_string();
        let share_url = Self::generate_share_url(&published_id);
        let now = Utc::now().timestamp();

        // Serialize workflow definition
        let workflow_json = serde_json::to_string(&workflow)
            .map_err(|e| format!("Failed to serialize workflow: {}", e))?;

        // Serialize tags
        let tags_json =
            serde_json::to_string(&tags).map_err(|e| format!("Failed to serialize tags: {}", e))?;

        conn.execute(
            "INSERT INTO published_workflows (
                id, title, description, category, creator_id, creator_name,
                workflow_definition, thumbnail_url, share_url, clone_count,
                view_count, favorite_count, avg_rating, rating_count,
                tags, estimated_time_saved, estimated_cost_saved,
                is_verified, is_featured, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21)",
            rusqlite::params![
                &published_id,
                &workflow.name,
                &workflow.description.as_ref().map(|s| s.as_str()).unwrap_or(""),
                category.to_string(),
                publisher_id,
                publisher_name,
                &workflow_json,
                &thumbnail_url,
                &share_url,
                0_u64,  // clone_count
                0_u64,  // view_count
                0_u64,  // favorite_count
                0.0_f64, // avg_rating
                0_u64,  // rating_count
                &tags_json,
                estimated_time_saved as i64,
                estimated_cost_saved,
                false, // is_verified
                false, // is_featured
                now,
                now,
            ],
        ).map_err(|e| format!("Failed to insert published workflow: {}", e))?;

        Ok(PublishedWorkflow {
            id: published_id,
            title: workflow.name,
            description: workflow.description.unwrap_or_default(),
            category,
            creator_id: publisher_id.to_string(),
            creator_name: publisher_name.to_string(),
            creator_avatar: None,
            thumbnail_url,
            share_url,
            clone_count: 0,
            view_count: 0,
            favorite_count: 0,
            rating: 0.0,
            rating_count: 0,
            tags,
            estimated_time_saved,
            estimated_cost_saved,
            is_verified: false,
            is_featured: false,
            workflow_definition: workflow_json,
            created_at: now,
            updated_at: now,
        })
    }

    /// Unpublish a workflow from the marketplace
    pub fn unpublish_workflow(&self, workflow_id: &str, user_id: &str) -> Result<(), String> {
        let conn = self
            .db
            .lock()
            .map_err(|e| format!("Failed to lock database: {}", e))?;

        // Verify ownership
        let creator_id: String = conn
            .query_row(
                "SELECT creator_id FROM published_workflows WHERE id = ?1",
                rusqlite::params![workflow_id],
                |row| row.get(0),
            )
            .map_err(|e| format!("Workflow not found: {}", e))?;

        if creator_id != user_id {
            return Err("Not authorized to unpublish this workflow".to_string());
        }

        conn.execute(
            "DELETE FROM published_workflows WHERE id = ?1",
            rusqlite::params![workflow_id],
        )
        .map_err(|e| format!("Failed to delete workflow: {}", e))?;

        Ok(())
    }

    /// Clone a published workflow to user's workspace
    pub fn clone_workflow(
        &self,
        workflow_id: &str,
        user_id: &str,
        user_name: &str,
    ) -> Result<String, String> {
        let conn = self
            .db
            .lock()
            .map_err(|e| format!("Failed to lock database: {}", e))?;

        // Get published workflow
        let (workflow_json, title): (String, String) = conn
            .query_row(
                "SELECT workflow_definition, title FROM published_workflows WHERE id = ?1",
                rusqlite::params![workflow_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|e| format!("Workflow not found: {}", e))?;

        // Parse workflow definition
        let mut workflow: WorkflowDefinition = serde_json::from_str(&workflow_json)
            .map_err(|e| format!("Failed to parse workflow: {}", e))?;

        // Generate new ID and update user_id
        let cloned_id = Uuid::new_v4().to_string();
        workflow.id = cloned_id.clone();
        workflow.user_id = user_id.to_string();
        workflow.name = format!("{} (cloned)", title);
        let now = Utc::now().timestamp();
        workflow.created_at = now;
        workflow.updated_at = now;

        // Re-serialize workflow
        let cloned_json = serde_json::to_string(&workflow)
            .map_err(|e| format!("Failed to serialize cloned workflow: {}", e))?;

        // Insert into workflow_definitions
        conn.execute(
            "INSERT INTO workflow_definitions (id, user_id, name, description, nodes, edges, triggers, metadata, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            rusqlite::params![
                &workflow.id,
                &workflow.user_id,
                &workflow.name,
                &workflow.description,
                &serde_json::to_string(&workflow.nodes).unwrap_or_default(),
                &serde_json::to_string(&workflow.edges).unwrap_or_default(),
                &serde_json::to_string(&workflow.triggers).unwrap_or_default(),
                &serde_json::to_string(&workflow.metadata).unwrap_or_default(),
                workflow.created_at,
                workflow.updated_at,
            ],
        ).map_err(|e| format!("Failed to insert cloned workflow: {}", e))?;

        // Record the clone
        let clone_record_id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO workflow_clones (id, workflow_id, cloner_id, cloner_name, cloned_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![&clone_record_id, workflow_id, user_id, user_name, now,],
        )
        .map_err(|e| format!("Failed to record clone: {}", e))?;

        // Increment clone count
        conn.execute(
            "UPDATE published_workflows SET clone_count = clone_count + 1 WHERE id = ?1",
            rusqlite::params![workflow_id],
        )
        .map_err(|e| format!("Failed to increment clone count: {}", e))?;

        Ok(cloned_id)
    }

    /// Fork a workflow (create editable copy with link to original)
    pub fn fork_workflow(
        &self,
        workflow_id: &str,
        user_id: &str,
        user_name: &str,
    ) -> Result<String, String> {
        // Forking is similar to cloning but preserves original reference
        let cloned_id = self.clone_workflow(workflow_id, user_id, user_name)?;

        // Add fork metadata to the cloned workflow
        let conn = self
            .db
            .lock()
            .map_err(|e| format!("Failed to lock database: {}", e))?;

        conn.execute(
            "UPDATE workflow_definitions SET metadata = json_set(metadata, '$.forked_from', ?1) WHERE id = ?2",
            rusqlite::params![workflow_id, &cloned_id],
        ).map_err(|e| format!("Failed to update fork metadata: {}", e))?;

        Ok(cloned_id)
    }

    /// Get a published workflow by ID
    pub fn get_published_workflow(&self, workflow_id: &str) -> Result<PublishedWorkflow, String> {
        let conn = self
            .db
            .lock()
            .map_err(|e| format!("Failed to lock database: {}", e))?;

        let workflow = conn
            .query_row(
                "SELECT id, title, description, category, creator_id, creator_name,
                    workflow_definition, thumbnail_url, share_url, clone_count,
                    view_count, favorite_count, avg_rating, rating_count,
                    tags, estimated_time_saved, estimated_cost_saved,
                    is_verified, is_featured, created_at, updated_at
             FROM published_workflows WHERE id = ?1",
                rusqlite::params![workflow_id],
                Self::row_to_published_workflow,
            )
            .map_err(|e| format!("Failed to get workflow: {}", e))?;

        Ok(workflow)
    }

    /// Get user's published workflows
    pub fn get_user_published_workflows(
        &self,
        user_id: &str,
    ) -> Result<Vec<PublishedWorkflow>, String> {
        let conn = self
            .db
            .lock()
            .map_err(|e| format!("Failed to lock database: {}", e))?;

        let mut stmt = conn
            .prepare(
                "SELECT id, title, description, category, creator_id, creator_name,
                    workflow_definition, thumbnail_url, share_url, clone_count,
                    view_count, favorite_count, avg_rating, rating_count,
                    tags, estimated_time_saved, estimated_cost_saved,
                    is_verified, is_featured, created_at, updated_at
             FROM published_workflows WHERE creator_id = ?1 ORDER BY created_at DESC",
            )
            .map_err(|e| format!("Failed to prepare statement: {}", e))?;

        let workflows = stmt
            .query_map(rusqlite::params![user_id], Self::row_to_published_workflow)
            .map_err(|e| format!("Failed to query workflows: {}", e))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("Failed to collect workflows: {}", e))?;

        Ok(workflows)
    }

    /// Increment view count for a workflow
    pub fn increment_view_count(&self, workflow_id: &str) -> Result<(), String> {
        let conn = self
            .db
            .lock()
            .map_err(|e| format!("Failed to lock database: {}", e))?;

        conn.execute(
            "UPDATE published_workflows SET view_count = view_count + 1 WHERE id = ?1",
            rusqlite::params![workflow_id],
        )
        .map_err(|e| format!("Failed to increment view count: {}", e))?;

        Ok(())
    }

    /// Generate a unique share URL
    fn generate_share_url(id: &str) -> String {
        // Take first 8 characters of UUID for short URL
        let short_id = id.chars().take(8).collect::<String>();
        format!("w/{}", short_id)
    }

    /// Helper to convert database row to PublishedWorkflow
    fn row_to_published_workflow(row: &rusqlite::Row) -> rusqlite::Result<PublishedWorkflow> {
        let category_str: String = row.get(3)?;
        let tags_json: String = row.get(14)?;
        let tags: Vec<String> = serde_json::from_str(&tags_json).unwrap_or_default();

        Ok(PublishedWorkflow {
            id: row.get(0)?,
            title: row.get(1)?,
            description: row.get(2)?,
            category: WorkflowCategory::from_str(&category_str),
            creator_id: row.get(4)?,
            creator_name: row.get(5)?,
            creator_avatar: None,
            workflow_definition: row.get(6)?,
            thumbnail_url: row.get(7)?,
            share_url: row.get(8)?,
            clone_count: row.get::<_, i64>(9)? as u64,
            view_count: row.get::<_, i64>(10)? as u64,
            favorite_count: row.get::<_, i64>(11)? as u64,
            rating: row.get(12)?,
            rating_count: row.get::<_, i64>(13)? as u64,
            tags,
            estimated_time_saved: row.get::<_, i64>(15)? as u64,
            estimated_cost_saved: row.get(16)?,
            is_verified: row.get::<_, i64>(17)? != 0,
            is_featured: row.get::<_, i64>(18)? != 0,
            created_at: row.get(19)?,
            updated_at: row.get(20)?,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_workflow_category_display() {
        assert_eq!(
            WorkflowCategory::CustomerSupport.to_string(),
            "customer_support"
        );
        assert_eq!(WorkflowCategory::Development.to_string(), "development");
    }

    #[test]
    fn test_share_url_generation() {
        let id = "12345678-1234-1234-1234-123456789abc";
        let url = WorkflowPublisher::generate_share_url(id);
        assert_eq!(url, "w/12345678");
    }
}
