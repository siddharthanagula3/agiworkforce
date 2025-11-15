use rusqlite::{params, Connection, OptionalExtension, Result as SqliteResult};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};

/// Resource type enum
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ResourceType {
    Workflow,
    Template,
    Knowledge,
    Automation,
    Document,
    Dataset,
}

impl ResourceType {
    pub fn as_str(&self) -> &'static str {
        match self {
            ResourceType::Workflow => "workflow",
            ResourceType::Template => "template",
            ResourceType::Knowledge => "knowledge",
            ResourceType::Automation => "automation",
            ResourceType::Document => "document",
            ResourceType::Dataset => "dataset",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "workflow" => Some(ResourceType::Workflow),
            "template" => Some(ResourceType::Template),
            "knowledge" => Some(ResourceType::Knowledge),
            "automation" => Some(ResourceType::Automation),
            "document" => Some(ResourceType::Document),
            "dataset" => Some(ResourceType::Dataset),
            _ => None,
        }
    }
}

/// Team resource structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeamResource {
    pub team_id: String,
    pub resource_type: ResourceType,
    pub resource_id: String,
    pub resource_name: String,
    pub resource_description: Option<String>,
    pub shared_by: String,
    pub shared_at: i64,
    pub access_count: i64,
    pub last_accessed: Option<i64>,
}

/// Resource metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceMetadata {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub created_by: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub size: Option<i64>,
    pub tags: Vec<String>,
}

/// Team resource manager
pub struct TeamResourceManager {
    db: Arc<Mutex<Connection>>,
}

impl TeamResourceManager {
    /// Create a new TeamResourceManager
    pub fn new(db: Arc<Mutex<Connection>>) -> Self {
        Self { db }
    }

    /// Share a resource with a team
    pub fn share_resource(
        &self,
        team_id: &str,
        resource_type: ResourceType,
        resource_id: &str,
        resource_name: String,
        resource_description: Option<String>,
        shared_by: &str,
    ) -> Result<(), String> {
        let conn = self
            .db
            .lock()
            .map_err(|e| format!("Database lock error: {}", e))?;
        let now = chrono::Utc::now().timestamp();

        // Check if resource is already shared
        let exists: bool = conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM team_resources WHERE team_id = ?1 AND resource_type = ?2 AND resource_id = ?3)",
                params![team_id, resource_type.as_str(), resource_id],
                |row| row.get(0),
            )
            .map_err(|e| format!("Failed to check resource existence: {}", e))?;

        if exists {
            return Err("Resource is already shared with this team".to_string());
        }

        conn.execute(
            "INSERT INTO team_resources (team_id, resource_type, resource_id, resource_name, resource_description, shared_by, shared_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                team_id,
                resource_type.as_str(),
                resource_id,
                resource_name,
                resource_description,
                shared_by,
                now
            ],
        ).map_err(|e| format!("Failed to share resource: {}", e))?;

        Ok(())
    }

    /// Unshare a resource from a team
    pub fn unshare_resource(
        &self,
        team_id: &str,
        resource_type: ResourceType,
        resource_id: &str,
    ) -> Result<(), String> {
        let conn = self
            .db
            .lock()
            .map_err(|e| format!("Database lock error: {}", e))?;

        let rows_affected = conn
            .execute(
                "DELETE FROM team_resources WHERE team_id = ?1 AND resource_type = ?2 AND resource_id = ?3",
                params![team_id, resource_type.as_str(), resource_id],
            )
            .map_err(|e| format!("Failed to unshare resource: {}", e))?;

        if rows_affected == 0 {
            return Err("Resource not found or not shared with this team".to_string());
        }

        Ok(())
    }

    /// Get all resources shared with a team
    pub fn get_team_resources(&self, team_id: &str) -> Result<Vec<TeamResource>, String> {
        let conn = self
            .db
            .lock()
            .map_err(|e| format!("Database lock error: {}", e))?;

        let mut stmt = conn
            .prepare(
                "SELECT team_id, resource_type, resource_id, resource_name, resource_description,
                        shared_by, shared_at, access_count, last_accessed
                 FROM team_resources
                 WHERE team_id = ?1
                 ORDER BY shared_at DESC",
            )
            .map_err(|e| format!("Failed to prepare statement: {}", e))?;

        let resources = stmt
            .query_map(params![team_id], |row| {
                let resource_type_str: String = row.get(1)?;
                let resource_type =
                    ResourceType::from_str(&resource_type_str).unwrap_or(ResourceType::Document);

                Ok(TeamResource {
                    team_id: row.get(0)?,
                    resource_type,
                    resource_id: row.get(2)?,
                    resource_name: row.get(3)?,
                    resource_description: row.get(4)?,
                    shared_by: row.get(5)?,
                    shared_at: row.get(6)?,
                    access_count: row.get(7)?,
                    last_accessed: row.get(8)?,
                })
            })
            .map_err(|e| format!("Failed to query resources: {}", e))?
            .collect::<SqliteResult<Vec<_>>>()
            .map_err(|e| format!("Failed to collect resources: {}", e))?;

        Ok(resources)
    }

    /// Get resources by type
    pub fn get_team_resources_by_type(
        &self,
        team_id: &str,
        resource_type: ResourceType,
    ) -> Result<Vec<TeamResource>, String> {
        let conn = self
            .db
            .lock()
            .map_err(|e| format!("Database lock error: {}", e))?;

        let mut stmt = conn
            .prepare(
                "SELECT team_id, resource_type, resource_id, resource_name, resource_description,
                        shared_by, shared_at, access_count, last_accessed
                 FROM team_resources
                 WHERE team_id = ?1 AND resource_type = ?2
                 ORDER BY shared_at DESC",
            )
            .map_err(|e| format!("Failed to prepare statement: {}", e))?;

        let resources = stmt
            .query_map(params![team_id, resource_type.as_str()], |row| {
                let resource_type_str: String = row.get(1)?;
                let resource_type =
                    ResourceType::from_str(&resource_type_str).unwrap_or(ResourceType::Document);

                Ok(TeamResource {
                    team_id: row.get(0)?,
                    resource_type,
                    resource_id: row.get(2)?,
                    resource_name: row.get(3)?,
                    resource_description: row.get(4)?,
                    shared_by: row.get(5)?,
                    shared_at: row.get(6)?,
                    access_count: row.get(7)?,
                    last_accessed: row.get(8)?,
                })
            })
            .map_err(|e| format!("Failed to query resources: {}", e))?
            .collect::<SqliteResult<Vec<_>>>()
            .map_err(|e| format!("Failed to collect resources: {}", e))?;

        Ok(resources)
    }

    /// Check if a resource is shared with a team
    pub fn is_resource_shared(
        &self,
        team_id: &str,
        resource_type: ResourceType,
        resource_id: &str,
    ) -> Result<bool, String> {
        let conn = self
            .db
            .lock()
            .map_err(|e| format!("Database lock error: {}", e))?;

        let exists: bool = conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM team_resources WHERE team_id = ?1 AND resource_type = ?2 AND resource_id = ?3)",
                params![team_id, resource_type.as_str(), resource_id],
                |row| row.get(0),
            )
            .map_err(|e| format!("Failed to check resource: {}", e))?;

        Ok(exists)
    }

    /// Get a specific team resource
    pub fn get_team_resource(
        &self,
        team_id: &str,
        resource_type: ResourceType,
        resource_id: &str,
    ) -> Result<Option<TeamResource>, String> {
        let conn = self
            .db
            .lock()
            .map_err(|e| format!("Database lock error: {}", e))?;

        let mut stmt = conn
            .prepare(
                "SELECT team_id, resource_type, resource_id, resource_name, resource_description,
                        shared_by, shared_at, access_count, last_accessed
                 FROM team_resources
                 WHERE team_id = ?1 AND resource_type = ?2 AND resource_id = ?3",
            )
            .map_err(|e| format!("Failed to prepare statement: {}", e))?;

        let resource = stmt
            .query_row(
                params![team_id, resource_type.as_str(), resource_id],
                |row| {
                    let resource_type_str: String = row.get(1)?;
                    let resource_type = ResourceType::from_str(&resource_type_str)
                        .unwrap_or(ResourceType::Document);

                    Ok(TeamResource {
                        team_id: row.get(0)?,
                        resource_type,
                        resource_id: row.get(2)?,
                        resource_name: row.get(3)?,
                        resource_description: row.get(4)?,
                        shared_by: row.get(5)?,
                        shared_at: row.get(6)?,
                        access_count: row.get(7)?,
                        last_accessed: row.get(8)?,
                    })
                },
            )
            .optional()
            .map_err(|e| format!("Failed to get resource: {}", e))?;

        Ok(resource)
    }

    /// Record resource access
    pub fn record_resource_access(
        &self,
        team_id: &str,
        resource_type: ResourceType,
        resource_id: &str,
    ) -> Result<(), String> {
        let conn = self
            .db
            .lock()
            .map_err(|e| format!("Database lock error: {}", e))?;
        let now = chrono::Utc::now().timestamp();

        conn.execute(
            "UPDATE team_resources
             SET access_count = access_count + 1, last_accessed = ?1
             WHERE team_id = ?2 AND resource_type = ?3 AND resource_id = ?4",
            params![now, team_id, resource_type.as_str(), resource_id],
        )
        .map_err(|e| format!("Failed to record access: {}", e))?;

        Ok(())
    }

    /// Get resource access statistics
    pub fn get_resource_stats(&self, team_id: &str) -> Result<ResourceStats, String> {
        let conn = self
            .db
            .lock()
            .map_err(|e| format!("Database lock error: {}", e))?;

        let total_resources: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM team_resources WHERE team_id = ?1",
                params![team_id],
                |row| row.get(0),
            )
            .map_err(|e| format!("Failed to count resources: {}", e))?;

        let workflow_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM team_resources WHERE team_id = ?1 AND resource_type = 'workflow'",
                params![team_id],
                |row| row.get(0),
            )
            .map_err(|e| format!("Failed to count workflows: {}", e))?;

        let template_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM team_resources WHERE team_id = ?1 AND resource_type = 'template'",
                params![team_id],
                |row| row.get(0),
            )
            .map_err(|e| format!("Failed to count templates: {}", e))?;

        let automation_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM team_resources WHERE team_id = ?1 AND resource_type = 'automation'",
                params![team_id],
                |row| row.get(0),
            )
            .map_err(|e| format!("Failed to count automations: {}", e))?;

        let total_accesses: i64 = conn
            .query_row(
                "SELECT COALESCE(SUM(access_count), 0) FROM team_resources WHERE team_id = ?1",
                params![team_id],
                |row| row.get(0),
            )
            .map_err(|e| format!("Failed to sum accesses: {}", e))?;

        Ok(ResourceStats {
            total_resources,
            workflow_count,
            template_count,
            automation_count,
            total_accesses,
        })
    }

    /// Search team resources
    pub fn search_resources(
        &self,
        team_id: &str,
        query: &str,
    ) -> Result<Vec<TeamResource>, String> {
        let conn = self
            .db
            .lock()
            .map_err(|e| format!("Database lock error: {}", e))?;
        let search_pattern = format!("%{}%", query);

        let mut stmt = conn
            .prepare(
                "SELECT team_id, resource_type, resource_id, resource_name, resource_description,
                        shared_by, shared_at, access_count, last_accessed
                 FROM team_resources
                 WHERE team_id = ?1 AND (resource_name LIKE ?2 OR resource_description LIKE ?2)
                 ORDER BY shared_at DESC",
            )
            .map_err(|e| format!("Failed to prepare statement: {}", e))?;

        let resources = stmt
            .query_map(params![team_id, search_pattern], |row| {
                let resource_type_str: String = row.get(1)?;
                let resource_type =
                    ResourceType::from_str(&resource_type_str).unwrap_or(ResourceType::Document);

                Ok(TeamResource {
                    team_id: row.get(0)?,
                    resource_type,
                    resource_id: row.get(2)?,
                    resource_name: row.get(3)?,
                    resource_description: row.get(4)?,
                    shared_by: row.get(5)?,
                    shared_at: row.get(6)?,
                    access_count: row.get(7)?,
                    last_accessed: row.get(8)?,
                })
            })
            .map_err(|e| format!("Failed to search resources: {}", e))?
            .collect::<SqliteResult<Vec<_>>>()
            .map_err(|e| format!("Failed to collect resources: {}", e))?;

        Ok(resources)
    }

    /// Get most accessed resources
    pub fn get_most_accessed_resources(
        &self,
        team_id: &str,
        limit: usize,
    ) -> Result<Vec<TeamResource>, String> {
        let conn = self
            .db
            .lock()
            .map_err(|e| format!("Database lock error: {}", e))?;

        let mut stmt = conn
            .prepare(
                "SELECT team_id, resource_type, resource_id, resource_name, resource_description,
                        shared_by, shared_at, access_count, last_accessed
                 FROM team_resources
                 WHERE team_id = ?1
                 ORDER BY access_count DESC
                 LIMIT ?2",
            )
            .map_err(|e| format!("Failed to prepare statement: {}", e))?;

        let resources = stmt
            .query_map(params![team_id, limit as i64], |row| {
                let resource_type_str: String = row.get(1)?;
                let resource_type =
                    ResourceType::from_str(&resource_type_str).unwrap_or(ResourceType::Document);

                Ok(TeamResource {
                    team_id: row.get(0)?,
                    resource_type,
                    resource_id: row.get(2)?,
                    resource_name: row.get(3)?,
                    resource_description: row.get(4)?,
                    shared_by: row.get(5)?,
                    shared_at: row.get(6)?,
                    access_count: row.get(7)?,
                    last_accessed: row.get(8)?,
                })
            })
            .map_err(|e| format!("Failed to query resources: {}", e))?
            .collect::<SqliteResult<Vec<_>>>()
            .map_err(|e| format!("Failed to collect resources: {}", e))?;

        Ok(resources)
    }

    /// Get recently accessed resources
    pub fn get_recently_accessed_resources(
        &self,
        team_id: &str,
        limit: usize,
    ) -> Result<Vec<TeamResource>, String> {
        let conn = self
            .db
            .lock()
            .map_err(|e| format!("Database lock error: {}", e))?;

        let mut stmt = conn
            .prepare(
                "SELECT team_id, resource_type, resource_id, resource_name, resource_description,
                        shared_by, shared_at, access_count, last_accessed
                 FROM team_resources
                 WHERE team_id = ?1 AND last_accessed IS NOT NULL
                 ORDER BY last_accessed DESC
                 LIMIT ?2",
            )
            .map_err(|e| format!("Failed to prepare statement: {}", e))?;

        let resources = stmt
            .query_map(params![team_id, limit as i64], |row| {
                let resource_type_str: String = row.get(1)?;
                let resource_type =
                    ResourceType::from_str(&resource_type_str).unwrap_or(ResourceType::Document);

                Ok(TeamResource {
                    team_id: row.get(0)?,
                    resource_type,
                    resource_id: row.get(2)?,
                    resource_name: row.get(3)?,
                    resource_description: row.get(4)?,
                    shared_by: row.get(5)?,
                    shared_at: row.get(6)?,
                    access_count: row.get(7)?,
                    last_accessed: row.get(8)?,
                })
            })
            .map_err(|e| format!("Failed to query resources: {}", e))?
            .collect::<SqliteResult<Vec<_>>>()
            .map_err(|e| format!("Failed to collect resources: {}", e))?;

        Ok(resources)
    }
}

/// Resource statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceStats {
    pub total_resources: i64,
    pub workflow_count: i64,
    pub template_count: i64,
    pub automation_count: i64,
    pub total_accesses: i64,
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn setup_test_db() -> Arc<Mutex<Connection>> {
        let conn = Connection::open_in_memory().unwrap();

        conn.execute(
            "CREATE TABLE team_resources (
                team_id TEXT NOT NULL,
                resource_type TEXT NOT NULL,
                resource_id TEXT NOT NULL,
                resource_name TEXT NOT NULL,
                resource_description TEXT,
                shared_by TEXT NOT NULL,
                shared_at INTEGER,
                access_count INTEGER DEFAULT 0,
                last_accessed INTEGER,
                PRIMARY KEY (team_id, resource_type, resource_id)
            )",
            [],
        )
        .unwrap();

        Arc::new(Mutex::new(conn))
    }

    #[test]
    fn test_share_resource() {
        let db = setup_test_db();
        let manager = TeamResourceManager::new(db);

        manager
            .share_resource(
                "team123",
                ResourceType::Workflow,
                "workflow456",
                "Test Workflow".to_string(),
                Some("Description".to_string()),
                "user789",
            )
            .unwrap();

        let resources = manager.get_team_resources("team123").unwrap();
        assert_eq!(resources.len(), 1);
        assert_eq!(resources[0].resource_name, "Test Workflow");
    }

    #[test]
    fn test_unshare_resource() {
        let db = setup_test_db();
        let manager = TeamResourceManager::new(db);

        manager
            .share_resource(
                "team123",
                ResourceType::Workflow,
                "workflow456",
                "Test Workflow".to_string(),
                None,
                "user789",
            )
            .unwrap();

        manager
            .unshare_resource("team123", ResourceType::Workflow, "workflow456")
            .unwrap();

        let resources = manager.get_team_resources("team123").unwrap();
        assert_eq!(resources.len(), 0);
    }

    #[test]
    fn test_resource_access_tracking() {
        let db = setup_test_db();
        let manager = TeamResourceManager::new(db);

        manager
            .share_resource(
                "team123",
                ResourceType::Workflow,
                "workflow456",
                "Test Workflow".to_string(),
                None,
                "user789",
            )
            .unwrap();

        manager
            .record_resource_access("team123", ResourceType::Workflow, "workflow456")
            .unwrap();

        let resource = manager
            .get_team_resource("team123", ResourceType::Workflow, "workflow456")
            .unwrap()
            .unwrap();

        assert_eq!(resource.access_count, 1);
        assert!(resource.last_accessed.is_some());
    }
}
