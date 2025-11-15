use rusqlite::{params, Connection, OptionalExtension, Result as SqliteResult};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use uuid::Uuid;

/// Team structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Team {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub owner_id: String,
    pub settings: TeamSettings,
    pub created_at: i64,
    pub updated_at: i64,
}

/// Team settings
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeamSettings {
    pub default_member_role: TeamRole,
    pub allow_resource_sharing: bool,
    pub require_approval_for_automations: bool,
    pub enable_activity_notifications: bool,
    pub max_members: Option<usize>,
}

impl Default for TeamSettings {
    fn default() -> Self {
        Self {
            default_member_role: TeamRole::Viewer,
            allow_resource_sharing: true,
            require_approval_for_automations: true,
            enable_activity_notifications: true,
            max_members: Some(10),
        }
    }
}

/// Team member structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeamMember {
    pub team_id: String,
    pub user_id: String,
    pub role: TeamRole,
    pub joined_at: i64,
    pub invited_by: Option<String>,
}

/// Team role enum
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TeamRole {
    Viewer,
    Editor,
    Admin,
    Owner,
}

impl TeamRole {
    pub fn as_str(&self) -> &'static str {
        match self {
            TeamRole::Viewer => "viewer",
            TeamRole::Editor => "editor",
            TeamRole::Admin => "admin",
            TeamRole::Owner => "owner",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "viewer" => Some(TeamRole::Viewer),
            "editor" => Some(TeamRole::Editor),
            "admin" => Some(TeamRole::Admin),
            "owner" => Some(TeamRole::Owner),
            _ => None,
        }
    }
}

/// Team updates structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeamUpdates {
    pub name: Option<String>,
    pub description: Option<String>,
    pub settings: Option<TeamSettings>,
}

/// Team invitation structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeamInvitation {
    pub id: String,
    pub team_id: String,
    pub email: String,
    pub role: TeamRole,
    pub invited_by: String,
    pub token: String,
    pub expires_at: i64,
    pub accepted: bool,
    pub created_at: i64,
}

/// Team manager for handling all team operations
pub struct TeamManager {
    db: Arc<Mutex<Connection>>,
}

impl TeamManager {
    /// Create a new TeamManager
    pub fn new(db: Arc<Mutex<Connection>>) -> Self {
        Self { db }
    }

    /// Create a new team
    pub fn create_team(
        &self,
        name: String,
        description: Option<String>,
        owner_id: String,
    ) -> Result<Team, String> {
        let team_id = Uuid::new_v4().to_string();
        let settings = TeamSettings::default();
        let settings_json = serde_json::to_string(&settings)
            .map_err(|e| format!("Failed to serialize settings: {}", e))?;

        let now = chrono::Utc::now().timestamp();

        let conn = self
            .db
            .lock()
            .map_err(|e| format!("Database lock error: {}", e))?;

        conn.execute(
            "INSERT INTO teams (id, name, description, owner_id, settings, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                team_id,
                name,
                description,
                owner_id,
                settings_json,
                now,
                now
            ],
        )
        .map_err(|e| format!("Failed to create team: {}", e))?;

        // Add owner as team member
        conn.execute(
            "INSERT INTO team_members (team_id, user_id, role, joined_at)
             VALUES (?1, ?2, ?3, ?4)",
            params![team_id, owner_id, TeamRole::Owner.as_str(), now],
        )
        .map_err(|e| format!("Failed to add owner as member: {}", e))?;

        Ok(Team {
            id: team_id,
            name,
            description,
            owner_id,
            settings,
            created_at: now,
            updated_at: now,
        })
    }

    /// Get a team by ID
    pub fn get_team(&self, team_id: &str) -> Result<Option<Team>, String> {
        let conn = self
            .db
            .lock()
            .map_err(|e| format!("Database lock error: {}", e))?;

        let mut stmt = conn
            .prepare("SELECT id, name, description, owner_id, settings, created_at, updated_at FROM teams WHERE id = ?1")
            .map_err(|e| format!("Failed to prepare statement: {}", e))?;

        let team = stmt
            .query_row(params![team_id], |row| {
                let settings_json: String = row.get(4)?;
                let settings: TeamSettings =
                    serde_json::from_str(&settings_json).unwrap_or_default();

                Ok(Team {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    description: row.get(2)?,
                    owner_id: row.get(3)?,
                    settings,
                    created_at: row.get(5)?,
                    updated_at: row.get(6)?,
                })
            })
            .optional()
            .map_err(|e| format!("Failed to get team: {}", e))?;

        Ok(team)
    }

    /// Update a team
    pub fn update_team(&self, team_id: &str, updates: TeamUpdates) -> Result<(), String> {
        let conn = self
            .db
            .lock()
            .map_err(|e| format!("Database lock error: {}", e))?;
        let now = chrono::Utc::now().timestamp();

        if let Some(name) = updates.name {
            conn.execute(
                "UPDATE teams SET name = ?1, updated_at = ?2 WHERE id = ?3",
                params![name, now, team_id],
            )
            .map_err(|e| format!("Failed to update team name: {}", e))?;
        }

        if let Some(description) = updates.description {
            conn.execute(
                "UPDATE teams SET description = ?1, updated_at = ?2 WHERE id = ?3",
                params![description, now, team_id],
            )
            .map_err(|e| format!("Failed to update team description: {}", e))?;
        }

        if let Some(settings) = updates.settings {
            let settings_json = serde_json::to_string(&settings)
                .map_err(|e| format!("Failed to serialize settings: {}", e))?;

            conn.execute(
                "UPDATE teams SET settings = ?1, updated_at = ?2 WHERE id = ?3",
                params![settings_json, now, team_id],
            )
            .map_err(|e| format!("Failed to update team settings: {}", e))?;
        }

        Ok(())
    }

    /// Delete a team
    pub fn delete_team(&self, team_id: &str) -> Result<(), String> {
        let conn = self
            .db
            .lock()
            .map_err(|e| format!("Database lock error: {}", e))?;

        conn.execute("DELETE FROM teams WHERE id = ?1", params![team_id])
            .map_err(|e| format!("Failed to delete team: {}", e))?;

        // CASCADE delete will remove members, resources, activity, etc.

        Ok(())
    }

    /// Get all teams for a user
    pub fn get_user_teams(&self, user_id: &str) -> Result<Vec<Team>, String> {
        let conn = self
            .db
            .lock()
            .map_err(|e| format!("Database lock error: {}", e))?;

        let mut stmt = conn
            .prepare(
                "SELECT t.id, t.name, t.description, t.owner_id, t.settings, t.created_at, t.updated_at
                 FROM teams t
                 INNER JOIN team_members tm ON t.id = tm.team_id
                 WHERE tm.user_id = ?1
                 ORDER BY t.updated_at DESC"
            )
            .map_err(|e| format!("Failed to prepare statement: {}", e))?;

        let teams = stmt
            .query_map(params![user_id], |row| {
                let settings_json: String = row.get(4)?;
                let settings: TeamSettings =
                    serde_json::from_str(&settings_json).unwrap_or_default();

                Ok(Team {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    description: row.get(2)?,
                    owner_id: row.get(3)?,
                    settings,
                    created_at: row.get(5)?,
                    updated_at: row.get(6)?,
                })
            })
            .map_err(|e| format!("Failed to query teams: {}", e))?
            .collect::<SqliteResult<Vec<_>>>()
            .map_err(|e| format!("Failed to collect teams: {}", e))?;

        Ok(teams)
    }

    /// Add a member to a team
    pub fn add_member(
        &self,
        team_id: &str,
        user_id: &str,
        role: TeamRole,
        inviter_id: &str,
    ) -> Result<(), String> {
        let conn = self
            .db
            .lock()
            .map_err(|e| format!("Database lock error: {}", e))?;
        let now = chrono::Utc::now().timestamp();

        // Check if team exists and get max_members setting
        let team = self
            .get_team(team_id)?
            .ok_or_else(|| "Team not found".to_string())?;

        // Check member limit
        if let Some(max_members) = team.settings.max_members {
            let member_count: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM team_members WHERE team_id = ?1",
                    params![team_id],
                    |row| row.get(0),
                )
                .map_err(|e| format!("Failed to count members: {}", e))?;

            if member_count >= max_members as i64 {
                return Err("Team has reached maximum member limit".to_string());
            }
        }

        // Check if user is already a member
        let exists: bool = conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM team_members WHERE team_id = ?1 AND user_id = ?2)",
                params![team_id, user_id],
                |row| row.get(0),
            )
            .map_err(|e| format!("Failed to check member existence: {}", e))?;

        if exists {
            return Err("User is already a member of this team".to_string());
        }

        conn.execute(
            "INSERT INTO team_members (team_id, user_id, role, joined_at, invited_by)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![team_id, user_id, role.as_str(), now, inviter_id],
        )
        .map_err(|e| format!("Failed to add member: {}", e))?;

        Ok(())
    }

    /// Remove a member from a team
    pub fn remove_member(&self, team_id: &str, user_id: &str) -> Result<(), String> {
        let conn = self
            .db
            .lock()
            .map_err(|e| format!("Database lock error: {}", e))?;

        // Check if user is the owner
        let is_owner: bool = conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM team_members WHERE team_id = ?1 AND user_id = ?2 AND role = 'owner')",
                params![team_id, user_id],
                |row| row.get(0),
            )
            .map_err(|e| format!("Failed to check owner status: {}", e))?;

        if is_owner {
            return Err(
                "Cannot remove team owner. Transfer ownership first or delete the team."
                    .to_string(),
            );
        }

        conn.execute(
            "DELETE FROM team_members WHERE team_id = ?1 AND user_id = ?2",
            params![team_id, user_id],
        )
        .map_err(|e| format!("Failed to remove member: {}", e))?;

        Ok(())
    }

    /// Update a member's role
    pub fn update_member_role(
        &self,
        team_id: &str,
        user_id: &str,
        new_role: TeamRole,
    ) -> Result<(), String> {
        let conn = self
            .db
            .lock()
            .map_err(|e| format!("Database lock error: {}", e))?;

        // Check if user is a member
        let exists: bool = conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM team_members WHERE team_id = ?1 AND user_id = ?2)",
                params![team_id, user_id],
                |row| row.get(0),
            )
            .map_err(|e| format!("Failed to check member existence: {}", e))?;

        if !exists {
            return Err("User is not a member of this team".to_string());
        }

        // Cannot change owner role this way
        if new_role == TeamRole::Owner {
            return Err(
                "Cannot directly assign owner role. Use transfer_ownership method instead."
                    .to_string(),
            );
        }

        let current_role: String = conn
            .query_row(
                "SELECT role FROM team_members WHERE team_id = ?1 AND user_id = ?2",
                params![team_id, user_id],
                |row| row.get(0),
            )
            .map_err(|e| format!("Failed to get current role: {}", e))?;

        if current_role == "owner" {
            return Err(
                "Cannot change owner role. Use transfer_ownership method instead.".to_string(),
            );
        }

        conn.execute(
            "UPDATE team_members SET role = ?1 WHERE team_id = ?2 AND user_id = ?3",
            params![new_role.as_str(), team_id, user_id],
        )
        .map_err(|e| format!("Failed to update member role: {}", e))?;

        Ok(())
    }

    /// Get all members of a team
    pub fn get_team_members(&self, team_id: &str) -> Result<Vec<TeamMember>, String> {
        let conn = self
            .db
            .lock()
            .map_err(|e| format!("Database lock error: {}", e))?;

        let mut stmt = conn
            .prepare(
                "SELECT team_id, user_id, role, joined_at, invited_by
                 FROM team_members
                 WHERE team_id = ?1
                 ORDER BY joined_at ASC",
            )
            .map_err(|e| format!("Failed to prepare statement: {}", e))?;

        let members = stmt
            .query_map(params![team_id], |row| {
                let role_str: String = row.get(2)?;
                let role = TeamRole::from_str(&role_str).unwrap_or(TeamRole::Viewer);

                Ok(TeamMember {
                    team_id: row.get(0)?,
                    user_id: row.get(1)?,
                    role,
                    joined_at: row.get(3)?,
                    invited_by: row.get(4)?,
                })
            })
            .map_err(|e| format!("Failed to query members: {}", e))?
            .collect::<SqliteResult<Vec<_>>>()
            .map_err(|e| format!("Failed to collect members: {}", e))?;

        Ok(members)
    }

    /// Get a team member
    pub fn get_team_member(
        &self,
        team_id: &str,
        user_id: &str,
    ) -> Result<Option<TeamMember>, String> {
        let conn = self
            .db
            .lock()
            .map_err(|e| format!("Database lock error: {}", e))?;

        let mut stmt = conn
            .prepare(
                "SELECT team_id, user_id, role, joined_at, invited_by
                 FROM team_members
                 WHERE team_id = ?1 AND user_id = ?2",
            )
            .map_err(|e| format!("Failed to prepare statement: {}", e))?;

        let member = stmt
            .query_row(params![team_id, user_id], |row| {
                let role_str: String = row.get(2)?;
                let role = TeamRole::from_str(&role_str).unwrap_or(TeamRole::Viewer);

                Ok(TeamMember {
                    team_id: row.get(0)?,
                    user_id: row.get(1)?,
                    role,
                    joined_at: row.get(3)?,
                    invited_by: row.get(4)?,
                })
            })
            .optional()
            .map_err(|e| format!("Failed to get member: {}", e))?;

        Ok(member)
    }

    /// Create an invitation token
    pub fn create_invitation(
        &self,
        team_id: &str,
        email: String,
        role: TeamRole,
        invited_by: &str,
    ) -> Result<TeamInvitation, String> {
        let invitation_id = Uuid::new_v4().to_string();
        let token = Uuid::new_v4().to_string();
        let now = chrono::Utc::now().timestamp();
        let expires_at = now + (7 * 24 * 60 * 60); // 7 days

        let conn = self
            .db
            .lock()
            .map_err(|e| format!("Database lock error: {}", e))?;

        conn.execute(
            "INSERT INTO team_invitations (id, team_id, email, role, invited_by, token, expires_at, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![invitation_id, team_id, email, role.as_str(), invited_by, token, expires_at, now],
        ).map_err(|e| format!("Failed to create invitation: {}", e))?;

        Ok(TeamInvitation {
            id: invitation_id,
            team_id: team_id.to_string(),
            email: email.clone(),
            role,
            invited_by: invited_by.to_string(),
            token: token.clone(),
            expires_at,
            accepted: false,
            created_at: now,
        })
    }

    /// Accept an invitation
    pub fn accept_invitation(&self, token: &str, user_id: &str) -> Result<Team, String> {
        let conn = self
            .db
            .lock()
            .map_err(|e| format!("Database lock error: {}", e))?;
        let now = chrono::Utc::now().timestamp();

        // Get invitation
        let mut stmt = conn
            .prepare(
                "SELECT id, team_id, email, role, invited_by, expires_at, accepted
                 FROM team_invitations
                 WHERE token = ?1",
            )
            .map_err(|e| format!("Failed to prepare statement: {}", e))?;

        let invitation = stmt
            .query_row(params![token], |row| {
                let role_str: String = row.get(3)?;
                let role = TeamRole::from_str(&role_str).unwrap_or(TeamRole::Viewer);

                Ok((
                    row.get::<_, String>(0)?, // id
                    row.get::<_, String>(1)?, // team_id
                    row.get::<_, String>(2)?, // email
                    role,                     // role
                    row.get::<_, String>(4)?, // invited_by
                    row.get::<_, i64>(5)?,    // expires_at
                    row.get::<_, bool>(6)?,   // accepted
                ))
            })
            .map_err(|e| format!("Invitation not found: {}", e))?;

        let (invitation_id, team_id, _email, role, invited_by, expires_at, accepted) = invitation;

        // Check if already accepted
        if accepted {
            return Err("Invitation already accepted".to_string());
        }

        // Check if expired
        if now > expires_at {
            return Err("Invitation has expired".to_string());
        }

        // Add member to team
        drop(stmt);
        self.add_member(&team_id, user_id, role, &invited_by)?;

        // Mark invitation as accepted
        conn.execute(
            "UPDATE team_invitations SET accepted = 1 WHERE id = ?1",
            params![invitation_id],
        )
        .map_err(|e| format!("Failed to mark invitation as accepted: {}", e))?;

        // Get and return the team
        self.get_team(&team_id)?
            .ok_or_else(|| "Team not found after accepting invitation".to_string())
    }

    /// Get pending invitations for a team
    pub fn get_team_invitations(&self, team_id: &str) -> Result<Vec<TeamInvitation>, String> {
        let conn = self
            .db
            .lock()
            .map_err(|e| format!("Database lock error: {}", e))?;

        let mut stmt = conn
            .prepare(
                "SELECT id, team_id, email, role, invited_by, token, expires_at, accepted, created_at
                 FROM team_invitations
                 WHERE team_id = ?1 AND accepted = 0
                 ORDER BY created_at DESC"
            )
            .map_err(|e| format!("Failed to prepare statement: {}", e))?;

        let invitations = stmt
            .query_map(params![team_id], |row| {
                let role_str: String = row.get(3)?;
                let role = TeamRole::from_str(&role_str).unwrap_or(TeamRole::Viewer);

                Ok(TeamInvitation {
                    id: row.get(0)?,
                    team_id: row.get(1)?,
                    email: row.get(2)?,
                    role,
                    invited_by: row.get(4)?,
                    token: row.get(5)?,
                    expires_at: row.get(6)?,
                    accepted: row.get(7)?,
                    created_at: row.get(8)?,
                })
            })
            .map_err(|e| format!("Failed to query invitations: {}", e))?
            .collect::<SqliteResult<Vec<_>>>()
            .map_err(|e| format!("Failed to collect invitations: {}", e))?;

        Ok(invitations)
    }

    /// Transfer team ownership
    pub fn transfer_ownership(&self, team_id: &str, new_owner_id: &str) -> Result<(), String> {
        let conn = self
            .db
            .lock()
            .map_err(|e| format!("Database lock error: {}", e))?;

        // Check if new owner is a member
        let is_member: bool = conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM team_members WHERE team_id = ?1 AND user_id = ?2)",
                params![team_id, new_owner_id],
                |row| row.get(0),
            )
            .map_err(|e| format!("Failed to check member existence: {}", e))?;

        if !is_member {
            return Err("New owner must be a member of the team".to_string());
        }

        // Get current owner
        let current_owner_id: String = conn
            .query_row(
                "SELECT user_id FROM team_members WHERE team_id = ?1 AND role = 'owner'",
                params![team_id],
                |row| row.get(0),
            )
            .map_err(|e| format!("Failed to get current owner: {}", e))?;

        // Demote current owner to admin
        conn.execute(
            "UPDATE team_members SET role = 'admin' WHERE team_id = ?1 AND user_id = ?2",
            params![team_id, current_owner_id],
        )
        .map_err(|e| format!("Failed to demote current owner: {}", e))?;

        // Promote new owner
        conn.execute(
            "UPDATE team_members SET role = 'owner' WHERE team_id = ?1 AND user_id = ?2",
            params![team_id, new_owner_id],
        )
        .map_err(|e| format!("Failed to promote new owner: {}", e))?;

        // Update team owner_id
        conn.execute(
            "UPDATE teams SET owner_id = ?1 WHERE id = ?2",
            params![new_owner_id, team_id],
        )
        .map_err(|e| format!("Failed to update team owner: {}", e))?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn setup_test_db() -> Arc<Mutex<Connection>> {
        let conn = Connection::open_in_memory().unwrap();

        // Create tables
        conn.execute(
            "CREATE TABLE teams (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                owner_id TEXT NOT NULL,
                settings TEXT,
                created_at INTEGER,
                updated_at INTEGER
            )",
            [],
        )
        .unwrap();

        conn.execute(
            "CREATE TABLE team_members (
                team_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                role TEXT NOT NULL,
                joined_at INTEGER,
                invited_by TEXT,
                PRIMARY KEY (team_id, user_id)
            )",
            [],
        )
        .unwrap();

        conn.execute(
            "CREATE TABLE team_invitations (
                id TEXT PRIMARY KEY,
                team_id TEXT NOT NULL,
                email TEXT NOT NULL,
                role TEXT NOT NULL,
                invited_by TEXT NOT NULL,
                token TEXT NOT NULL UNIQUE,
                expires_at INTEGER NOT NULL,
                accepted INTEGER DEFAULT 0,
                created_at INTEGER
            )",
            [],
        )
        .unwrap();

        Arc::new(Mutex::new(conn))
    }

    #[test]
    fn test_create_team() {
        let db = setup_test_db();
        let manager = TeamManager::new(db);

        let team = manager
            .create_team(
                "Test Team".to_string(),
                Some("Test description".to_string()),
                "user123".to_string(),
            )
            .unwrap();

        assert_eq!(team.name, "Test Team");
        assert_eq!(team.description, Some("Test description".to_string()));
        assert_eq!(team.owner_id, "user123");
    }

    #[test]
    fn test_get_team() {
        let db = setup_test_db();
        let manager = TeamManager::new(db);

        let created_team = manager
            .create_team("Test Team".to_string(), None, "user123".to_string())
            .unwrap();

        let team = manager.get_team(&created_team.id).unwrap().unwrap();
        assert_eq!(team.id, created_team.id);
        assert_eq!(team.name, "Test Team");
    }

    #[test]
    fn test_add_member() {
        let db = setup_test_db();
        let manager = TeamManager::new(db);

        let team = manager
            .create_team("Test Team".to_string(), None, "owner123".to_string())
            .unwrap();

        manager
            .add_member(&team.id, "user456", TeamRole::Editor, "owner123")
            .unwrap();

        let members = manager.get_team_members(&team.id).unwrap();
        assert_eq!(members.len(), 2); // Owner + new member
    }

    #[test]
    fn test_update_member_role() {
        let db = setup_test_db();
        let manager = TeamManager::new(db);

        let team = manager
            .create_team("Test Team".to_string(), None, "owner123".to_string())
            .unwrap();

        manager
            .add_member(&team.id, "user456", TeamRole::Viewer, "owner123")
            .unwrap();

        manager
            .update_member_role(&team.id, "user456", TeamRole::Admin)
            .unwrap();

        let member = manager
            .get_team_member(&team.id, "user456")
            .unwrap()
            .unwrap();
        assert_eq!(member.role, TeamRole::Admin);
    }
}
