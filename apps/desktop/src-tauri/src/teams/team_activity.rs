use rusqlite::{Connection, Result as SqliteResult, params};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use uuid::Uuid;

/// Activity type enum
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ActivityType {
    // Member activities
    MemberJoined,
    MemberLeft,
    MemberRoleChanged,
    MemberInvited,

    // Resource activities
    ResourceShared,
    ResourceUnshared,
    ResourceAccessed,
    ResourceModified,
    ResourceDeleted,

    // Workflow activities
    WorkflowCreated,
    WorkflowExecuted,
    WorkflowModified,
    WorkflowDeleted,

    // Automation activities
    AutomationCreated,
    AutomationExecuted,
    AutomationModified,
    AutomationDeleted,

    // Team settings
    SettingsChanged,
    TeamCreated,
    TeamDeleted,

    // Billing
    BillingPlanChanged,
    BillingSeatsAdded,
    BillingSeatsRemoved,
}

impl ActivityType {
    pub fn as_str(&self) -> &'static str {
        match self {
            ActivityType::MemberJoined => "member_joined",
            ActivityType::MemberLeft => "member_left",
            ActivityType::MemberRoleChanged => "member_role_changed",
            ActivityType::MemberInvited => "member_invited",
            ActivityType::ResourceShared => "resource_shared",
            ActivityType::ResourceUnshared => "resource_unshared",
            ActivityType::ResourceAccessed => "resource_accessed",
            ActivityType::ResourceModified => "resource_modified",
            ActivityType::ResourceDeleted => "resource_deleted",
            ActivityType::WorkflowCreated => "workflow_created",
            ActivityType::WorkflowExecuted => "workflow_executed",
            ActivityType::WorkflowModified => "workflow_modified",
            ActivityType::WorkflowDeleted => "workflow_deleted",
            ActivityType::AutomationCreated => "automation_created",
            ActivityType::AutomationExecuted => "automation_executed",
            ActivityType::AutomationModified => "automation_modified",
            ActivityType::AutomationDeleted => "automation_deleted",
            ActivityType::SettingsChanged => "settings_changed",
            ActivityType::TeamCreated => "team_created",
            ActivityType::TeamDeleted => "team_deleted",
            ActivityType::BillingPlanChanged => "billing_plan_changed",
            ActivityType::BillingSeatsAdded => "billing_seats_added",
            ActivityType::BillingSeatsRemoved => "billing_seats_removed",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "member_joined" => Some(ActivityType::MemberJoined),
            "member_left" => Some(ActivityType::MemberLeft),
            "member_role_changed" => Some(ActivityType::MemberRoleChanged),
            "member_invited" => Some(ActivityType::MemberInvited),
            "resource_shared" => Some(ActivityType::ResourceShared),
            "resource_unshared" => Some(ActivityType::ResourceUnshared),
            "resource_accessed" => Some(ActivityType::ResourceAccessed),
            "resource_modified" => Some(ActivityType::ResourceModified),
            "resource_deleted" => Some(ActivityType::ResourceDeleted),
            "workflow_created" => Some(ActivityType::WorkflowCreated),
            "workflow_executed" => Some(ActivityType::WorkflowExecuted),
            "workflow_modified" => Some(ActivityType::WorkflowModified),
            "workflow_deleted" => Some(ActivityType::WorkflowDeleted),
            "automation_created" => Some(ActivityType::AutomationCreated),
            "automation_executed" => Some(ActivityType::AutomationExecuted),
            "automation_modified" => Some(ActivityType::AutomationModified),
            "automation_deleted" => Some(ActivityType::AutomationDeleted),
            "settings_changed" => Some(ActivityType::SettingsChanged),
            "team_created" => Some(ActivityType::TeamCreated),
            "team_deleted" => Some(ActivityType::TeamDeleted),
            "billing_plan_changed" => Some(ActivityType::BillingPlanChanged),
            "billing_seats_added" => Some(ActivityType::BillingSeatsAdded),
            "billing_seats_removed" => Some(ActivityType::BillingSeatsRemoved),
            _ => None,
        }
    }

    pub fn get_description(&self) -> &'static str {
        match self {
            ActivityType::MemberJoined => "Member joined the team",
            ActivityType::MemberLeft => "Member left the team",
            ActivityType::MemberRoleChanged => "Member role was changed",
            ActivityType::MemberInvited => "New member was invited",
            ActivityType::ResourceShared => "Resource was shared with team",
            ActivityType::ResourceUnshared => "Resource was unshared from team",
            ActivityType::ResourceAccessed => "Resource was accessed",
            ActivityType::ResourceModified => "Resource was modified",
            ActivityType::ResourceDeleted => "Resource was deleted",
            ActivityType::WorkflowCreated => "Workflow was created",
            ActivityType::WorkflowExecuted => "Workflow was executed",
            ActivityType::WorkflowModified => "Workflow was modified",
            ActivityType::WorkflowDeleted => "Workflow was deleted",
            ActivityType::AutomationCreated => "Automation was created",
            ActivityType::AutomationExecuted => "Automation was executed",
            ActivityType::AutomationModified => "Automation was modified",
            ActivityType::AutomationDeleted => "Automation was deleted",
            ActivityType::SettingsChanged => "Team settings were changed",
            ActivityType::TeamCreated => "Team was created",
            ActivityType::TeamDeleted => "Team was deleted",
            ActivityType::BillingPlanChanged => "Billing plan was changed",
            ActivityType::BillingSeatsAdded => "Seats were added to billing",
            ActivityType::BillingSeatsRemoved => "Seats were removed from billing",
        }
    }
}

/// Team activity structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeamActivity {
    pub id: String,
    pub team_id: String,
    pub user_id: Option<String>,
    pub action: ActivityType,
    pub resource_type: Option<String>,
    pub resource_id: Option<String>,
    pub metadata: Option<serde_json::Value>,
    pub timestamp: i64,
}

/// Activity filter options
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActivityFilter {
    pub user_id: Option<String>,
    pub action_types: Option<Vec<ActivityType>>,
    pub resource_type: Option<String>,
    pub start_time: Option<i64>,
    pub end_time: Option<i64>,
}

/// Team activity manager
pub struct TeamActivityManager {
    db: Arc<Mutex<Connection>>,
}

impl TeamActivityManager {
    /// Create a new TeamActivityManager
    pub fn new(db: Arc<Mutex<Connection>>) -> Self {
        Self { db }
    }

    /// Log a team activity
    pub fn log_activity(
        &self,
        team_id: &str,
        user_id: Option<String>,
        action: ActivityType,
        resource_type: Option<String>,
        resource_id: Option<String>,
        metadata: Option<serde_json::Value>,
    ) -> Result<TeamActivity, String> {
        let activity_id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now().timestamp();

        let metadata_json = metadata.as_ref()
            .map(|m| serde_json::to_string(m).ok())
            .flatten();

        let conn = self.db.lock().map_err(|e| format!("Database lock error: {}", e))?;

        conn.execute(
            "INSERT INTO team_activity (id, team_id, user_id, action, resource_type, resource_id, metadata, timestamp)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                activity_id,
                team_id,
                user_id,
                action.as_str(),
                resource_type,
                resource_id,
                metadata_json,
                now
            ],
        ).map_err(|e| format!("Failed to log activity: {}", e))?;

        Ok(TeamActivity {
            id: activity_id,
            team_id: team_id.to_string(),
            user_id,
            action,
            resource_type,
            resource_id,
            metadata,
            timestamp: now,
        })
    }

    /// Get team activity with pagination
    pub fn get_team_activity(&self, team_id: &str, limit: usize, offset: usize) -> Result<Vec<TeamActivity>, String> {
        let conn = self.db.lock().map_err(|e| format!("Database lock error: {}", e))?;

        let mut stmt = conn
            .prepare(
                "SELECT id, team_id, user_id, action, resource_type, resource_id, metadata, timestamp
                 FROM team_activity
                 WHERE team_id = ?1
                 ORDER BY timestamp DESC
                 LIMIT ?2 OFFSET ?3"
            )
            .map_err(|e| format!("Failed to prepare statement: {}", e))?;

        let activities = stmt
            .query_map(params![team_id, limit as i64, offset as i64], |row| {
                let action_str: String = row.get(3)?;
                let action = ActivityType::from_str(&action_str).unwrap_or(ActivityType::SettingsChanged);

                let metadata_str: Option<String> = row.get(6)?;
                let metadata = metadata_str.and_then(|s| serde_json::from_str(&s).ok());

                Ok(TeamActivity {
                    id: row.get(0)?,
                    team_id: row.get(1)?,
                    user_id: row.get(2)?,
                    action,
                    resource_type: row.get(4)?,
                    resource_id: row.get(5)?,
                    metadata,
                    timestamp: row.get(7)?,
                })
            })
            .map_err(|e| format!("Failed to query activities: {}", e))?
            .collect::<SqliteResult<Vec<_>>>()
            .map_err(|e| format!("Failed to collect activities: {}", e))?;

        Ok(activities)
    }

    /// Get user activity in a team
    pub fn get_user_activity(&self, team_id: &str, user_id: &str, limit: usize) -> Result<Vec<TeamActivity>, String> {
        let conn = self.db.lock().map_err(|e| format!("Database lock error: {}", e))?;

        let mut stmt = conn
            .prepare(
                "SELECT id, team_id, user_id, action, resource_type, resource_id, metadata, timestamp
                 FROM team_activity
                 WHERE team_id = ?1 AND user_id = ?2
                 ORDER BY timestamp DESC
                 LIMIT ?3"
            )
            .map_err(|e| format!("Failed to prepare statement: {}", e))?;

        let activities = stmt
            .query_map(params![team_id, user_id, limit as i64], |row| {
                let action_str: String = row.get(3)?;
                let action = ActivityType::from_str(&action_str).unwrap_or(ActivityType::SettingsChanged);

                let metadata_str: Option<String> = row.get(6)?;
                let metadata = metadata_str.and_then(|s| serde_json::from_str(&s).ok());

                Ok(TeamActivity {
                    id: row.get(0)?,
                    team_id: row.get(1)?,
                    user_id: row.get(2)?,
                    action,
                    resource_type: row.get(4)?,
                    resource_id: row.get(5)?,
                    metadata,
                    timestamp: row.get(7)?,
                })
            })
            .map_err(|e| format!("Failed to query activities: {}", e))?
            .collect::<SqliteResult<Vec<_>>>()
            .map_err(|e| format!("Failed to collect activities: {}", e))?;

        Ok(activities)
    }

    /// Get activities by type
    pub fn get_activities_by_type(&self, team_id: &str, action_type: ActivityType, limit: usize) -> Result<Vec<TeamActivity>, String> {
        let conn = self.db.lock().map_err(|e| format!("Database lock error: {}", e))?;

        let mut stmt = conn
            .prepare(
                "SELECT id, team_id, user_id, action, resource_type, resource_id, metadata, timestamp
                 FROM team_activity
                 WHERE team_id = ?1 AND action = ?2
                 ORDER BY timestamp DESC
                 LIMIT ?3"
            )
            .map_err(|e| format!("Failed to prepare statement: {}", e))?;

        let activities = stmt
            .query_map(params![team_id, action_type.as_str(), limit as i64], |row| {
                let action_str: String = row.get(3)?;
                let action = ActivityType::from_str(&action_str).unwrap_or(ActivityType::SettingsChanged);

                let metadata_str: Option<String> = row.get(6)?;
                let metadata = metadata_str.and_then(|s| serde_json::from_str(&s).ok());

                Ok(TeamActivity {
                    id: row.get(0)?,
                    team_id: row.get(1)?,
                    user_id: row.get(2)?,
                    action,
                    resource_type: row.get(4)?,
                    resource_id: row.get(5)?,
                    metadata,
                    timestamp: row.get(7)?,
                })
            })
            .map_err(|e| format!("Failed to query activities: {}", e))?
            .collect::<SqliteResult<Vec<_>>>()
            .map_err(|e| format!("Failed to collect activities: {}", e))?;

        Ok(activities)
    }

    /// Get activities within a time range
    pub fn get_activities_in_range(&self, team_id: &str, start_time: i64, end_time: i64) -> Result<Vec<TeamActivity>, String> {
        let conn = self.db.lock().map_err(|e| format!("Database lock error: {}", e))?;

        let mut stmt = conn
            .prepare(
                "SELECT id, team_id, user_id, action, resource_type, resource_id, metadata, timestamp
                 FROM team_activity
                 WHERE team_id = ?1 AND timestamp >= ?2 AND timestamp <= ?3
                 ORDER BY timestamp DESC"
            )
            .map_err(|e| format!("Failed to prepare statement: {}", e))?;

        let activities = stmt
            .query_map(params![team_id, start_time, end_time], |row| {
                let action_str: String = row.get(3)?;
                let action = ActivityType::from_str(&action_str).unwrap_or(ActivityType::SettingsChanged);

                let metadata_str: Option<String> = row.get(6)?;
                let metadata = metadata_str.and_then(|s| serde_json::from_str(&s).ok());

                Ok(TeamActivity {
                    id: row.get(0)?,
                    team_id: row.get(1)?,
                    user_id: row.get(2)?,
                    action,
                    resource_type: row.get(4)?,
                    resource_id: row.get(5)?,
                    metadata,
                    timestamp: row.get(7)?,
                })
            })
            .map_err(|e| format!("Failed to query activities: {}", e))?
            .collect::<SqliteResult<Vec<_>>>()
            .map_err(|e| format!("Failed to collect activities: {}", e))?;

        Ok(activities)
    }

    /// Get activity statistics
    pub fn get_activity_stats(&self, team_id: &str) -> Result<ActivityStats, String> {
        let conn = self.db.lock().map_err(|e| format!("Database lock error: {}", e))?;

        let total_activities: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM team_activity WHERE team_id = ?1",
                params![team_id],
                |row| row.get(0),
            )
            .map_err(|e| format!("Failed to count activities: {}", e))?;

        let active_users: i64 = conn
            .query_row(
                "SELECT COUNT(DISTINCT user_id) FROM team_activity WHERE team_id = ?1",
                params![team_id],
                |row| row.get(0),
            )
            .map_err(|e| format!("Failed to count active users: {}", e))?;

        // Get activity count for last 24 hours
        let now = chrono::Utc::now().timestamp();
        let day_ago = now - (24 * 60 * 60);

        let activities_last_24h: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM team_activity WHERE team_id = ?1 AND timestamp >= ?2",
                params![team_id, day_ago],
                |row| row.get(0),
            )
            .map_err(|e| format!("Failed to count recent activities: {}", e))?;

        // Get most active user
        let most_active_user: Option<String> = conn
            .query_row(
                "SELECT user_id FROM team_activity
                 WHERE team_id = ?1 AND user_id IS NOT NULL
                 GROUP BY user_id
                 ORDER BY COUNT(*) DESC
                 LIMIT 1",
                params![team_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| format!("Failed to get most active user: {}", e))?;

        Ok(ActivityStats {
            total_activities,
            active_users,
            activities_last_24h,
            most_active_user,
        })
    }

    /// Delete old activities (older than specified days)
    pub fn cleanup_old_activities(&self, team_id: &str, days: i64) -> Result<usize, String> {
        let conn = self.db.lock().map_err(|e| format!("Database lock error: {}", e))?;
        let now = chrono::Utc::now().timestamp();
        let cutoff_time = now - (days * 24 * 60 * 60);

        let rows_deleted = conn
            .execute(
                "DELETE FROM team_activity WHERE team_id = ?1 AND timestamp < ?2",
                params![team_id, cutoff_time],
            )
            .map_err(|e| format!("Failed to cleanup activities: {}", e))?;

        Ok(rows_deleted)
    }

    /// Export activities to JSON
    pub fn export_activities(&self, team_id: &str, start_time: Option<i64>, end_time: Option<i64>) -> Result<String, String> {
        let activities = if let (Some(start), Some(end)) = (start_time, end_time) {
            self.get_activities_in_range(team_id, start, end)?
        } else {
            self.get_team_activity(team_id, 10000, 0)?
        };

        serde_json::to_string_pretty(&activities)
            .map_err(|e| format!("Failed to serialize activities: {}", e))
    }
}

/// Activity statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActivityStats {
    pub total_activities: i64,
    pub active_users: i64,
    pub activities_last_24h: i64,
    pub most_active_user: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn setup_test_db() -> Arc<Mutex<Connection>> {
        let conn = Connection::open_in_memory().unwrap();

        conn.execute(
            "CREATE TABLE team_activity (
                id TEXT PRIMARY KEY,
                team_id TEXT NOT NULL,
                user_id TEXT,
                action TEXT NOT NULL,
                resource_type TEXT,
                resource_id TEXT,
                metadata TEXT,
                timestamp INTEGER
            )",
            [],
        ).unwrap();

        Arc::new(Mutex::new(conn))
    }

    #[test]
    fn test_log_activity() {
        let db = setup_test_db();
        let manager = TeamActivityManager::new(db);

        let activity = manager
            .log_activity(
                "team123",
                Some("user456".to_string()),
                ActivityType::MemberJoined,
                None,
                None,
                None,
            )
            .unwrap();

        assert_eq!(activity.team_id, "team123");
        assert_eq!(activity.action, ActivityType::MemberJoined);
    }

    #[test]
    fn test_get_team_activity() {
        let db = setup_test_db();
        let manager = TeamActivityManager::new(db);

        manager
            .log_activity("team123", Some("user1".to_string()), ActivityType::MemberJoined, None, None, None)
            .unwrap();
        manager
            .log_activity("team123", Some("user2".to_string()), ActivityType::ResourceShared, None, None, None)
            .unwrap();

        let activities = manager.get_team_activity("team123", 10, 0).unwrap();
        assert_eq!(activities.len(), 2);
    }

    #[test]
    fn test_get_user_activity() {
        let db = setup_test_db();
        let manager = TeamActivityManager::new(db);

        manager
            .log_activity("team123", Some("user1".to_string()), ActivityType::MemberJoined, None, None, None)
            .unwrap();
        manager
            .log_activity("team123", Some("user2".to_string()), ActivityType::ResourceShared, None, None, None)
            .unwrap();

        let activities = manager.get_user_activity("team123", "user1", 10).unwrap();
        assert_eq!(activities.len(), 1);
        assert_eq!(activities[0].user_id, Some("user1".to_string()));
    }

    #[test]
    fn test_activity_stats() {
        let db = setup_test_db();
        let manager = TeamActivityManager::new(db);

        manager
            .log_activity("team123", Some("user1".to_string()), ActivityType::MemberJoined, None, None, None)
            .unwrap();
        manager
            .log_activity("team123", Some("user2".to_string()), ActivityType::ResourceShared, None, None, None)
            .unwrap();

        let stats = manager.get_activity_stats("team123").unwrap();
        assert_eq!(stats.total_activities, 2);
        assert_eq!(stats.active_users, 2);
    }
}
