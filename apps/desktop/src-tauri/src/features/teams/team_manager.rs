use crate::features::teams::team_permissions::{Permission, TeamPermissions};
use rusqlite::{params, Connection, OptionalExtension, Result as SqliteResult};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use uuid::Uuid;

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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeamMember {
    pub team_id: String,
    pub user_id: String,
    pub role: TeamRole,
    pub joined_at: i64,
    pub invited_by: Option<String>,
}

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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeamUpdates {
    pub name: Option<String>,
    pub description: Option<String>,
    pub settings: Option<TeamSettings>,
}

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

fn verified_actor(actor_id: &str) -> Result<&str, String> {
    let actor = actor_id.trim();
    if actor.is_empty() || actor == UNVERIFIED_ACTOR_ID {
        return Err("Team actions require a signed-in session".to_string());
    }
    Ok(actor)
}

const UNVERIFIED_ACTOR_ID: &str = "default";
const NOT_A_MEMBER: &str = "Not a member of this team";

pub struct TeamManager {
    db: Arc<Mutex<Connection>>,
}

impl TeamManager {
    pub fn new(db: Arc<Mutex<Connection>>) -> Self {
        Self { db }
    }

    pub fn authorize_member(&self, team_id: &str, actor_id: &str) -> Result<TeamMember, String> {
        let actor = verified_actor(actor_id)?;
        self.get_team_member(team_id, actor)?
            .ok_or_else(|| NOT_A_MEMBER.to_string())
    }

    pub fn authorize_permission(
        &self,
        team_id: &str,
        actor_id: &str,
        permission: Permission,
    ) -> Result<TeamMember, String> {
        let member = self.authorize_member(team_id, actor_id)?;
        if !TeamPermissions::has_permission(&member, permission) {
            return Err(format!(
                "Not authorized to {}",
                TeamPermissions::get_permission_description(permission).to_lowercase()
            ));
        }
        Ok(member)
    }

    pub fn create_team(
        &self,
        name: String,
        description: Option<String>,
        owner_id: String,
    ) -> Result<Team, String> {
        let owner_id = verified_actor(&owner_id)?.to_string();
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

    pub fn get_team(&self, team_id: &str, actor_id: &str) -> Result<Option<Team>, String> {
        self.authorize_permission(team_id, actor_id, Permission::ViewTeamSettings)?;

        let conn = self
            .db
            .lock()
            .map_err(|e| format!("Database lock error: {}", e))?;

        self.get_team_internal(&conn, team_id)
    }

    fn get_team_internal(&self, conn: &Connection, team_id: &str) -> Result<Option<Team>, String> {
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

    pub fn update_team(
        &self,
        team_id: &str,
        actor_id: &str,
        updates: TeamUpdates,
    ) -> Result<(), String> {
        self.authorize_permission(team_id, actor_id, Permission::ModifyTeamSettings)?;

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

    pub fn delete_team(&self, team_id: &str, actor_id: &str) -> Result<(), String> {
        self.authorize_permission(team_id, actor_id, Permission::DeleteTeam)?;

        let conn = self
            .db
            .lock()
            .map_err(|e| format!("Database lock error: {}", e))?;

        conn.execute("DELETE FROM teams WHERE id = ?1", params![team_id])
            .map_err(|e| format!("Failed to delete team: {}", e))?;

        Ok(())
    }

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

        let team = self
            .get_team_internal(&conn, team_id)?
            .ok_or_else(|| "Team not found".to_string())?;

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

    pub fn remove_member(
        &self,
        team_id: &str,
        actor_id: &str,
        user_id: &str,
    ) -> Result<(), String> {
        let actor = self.authorize_member(team_id, actor_id)?;
        if actor.user_id != user_id {
            let target = self
                .get_team_member(team_id, user_id)?
                .ok_or_else(|| "User is not a member of this team".to_string())?;
            if !TeamPermissions::can_remove_member(&actor)
                || !TeamPermissions::can_remove_role(actor.role, target.role)
            {
                return Err("Not authorized to remove this member".to_string());
            }
        }

        let conn = self
            .db
            .lock()
            .map_err(|e| format!("Database lock error: {}", e))?;

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

    pub fn update_member_role(
        &self,
        team_id: &str,
        actor_id: &str,
        user_id: &str,
        new_role: TeamRole,
    ) -> Result<(), String> {
        let actor = self.authorize_member(team_id, actor_id)?;
        let target = self
            .get_team_member(team_id, user_id)?
            .ok_or_else(|| "User is not a member of this team".to_string())?;
        if !TeamPermissions::can_modify_member_role(&actor)
            || !TeamPermissions::can_modify_role(actor.role, target.role)
            || !TeamPermissions::can_modify_role(actor.role, new_role)
        {
            return Err("Not authorized to change this member's role".to_string());
        }

        let conn = self
            .db
            .lock()
            .map_err(|e| format!("Database lock error: {}", e))?;

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

    pub fn get_team_members(
        &self,
        team_id: &str,
        actor_id: &str,
    ) -> Result<Vec<TeamMember>, String> {
        self.authorize_permission(team_id, actor_id, Permission::ViewMembers)?;

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

    pub fn create_invitation(
        &self,
        team_id: &str,
        actor_id: &str,
        email: String,
        role: TeamRole,
    ) -> Result<TeamInvitation, String> {
        let actor = self.authorize_permission(team_id, actor_id, Permission::InviteMembers)?;
        if role == TeamRole::Owner {
            return Err(
                "Cannot invite a member as owner. Use transfer_ownership instead.".to_string(),
            );
        }
        if !TeamPermissions::can_modify_role(actor.role, role) {
            return Err("Not authorized to invite a member at this role".to_string());
        }
        let invited_by = actor.user_id.as_str();

        let invitation_id = Uuid::new_v4().to_string();
        let token = Uuid::new_v4().to_string();
        let now = chrono::Utc::now().timestamp();
        let expires_at = now + (7 * 24 * 60 * 60);

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

    pub fn accept_invitation(&self, token: &str, user_id: &str) -> Result<Team, String> {
        let user_id = verified_actor(user_id)?;

        let conn = self
            .db
            .lock()
            .map_err(|e| format!("Database lock error: {}", e))?;
        let now = chrono::Utc::now().timestamp();

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
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    role,
                    row.get::<_, String>(4)?,
                    row.get::<_, i64>(5)?,
                    row.get::<_, bool>(6)?,
                ))
            })
            .map_err(|e| format!("Invitation not found: {}", e))?;

        let (invitation_id, team_id, _email, role, invited_by, expires_at, accepted) = invitation;

        if accepted {
            return Err("Invitation already accepted".to_string());
        }

        if now > expires_at {
            return Err("Invitation has expired".to_string());
        }

        drop(stmt);
        drop(conn);
        self.add_member(&team_id, user_id, role, &invited_by)?;

        let conn = self
            .db
            .lock()
            .map_err(|e| format!("Database lock error: {}", e))?;

        conn.execute(
            "UPDATE team_invitations SET accepted = 1 WHERE id = ?1",
            params![invitation_id],
        )
        .map_err(|e| format!("Failed to mark invitation as accepted: {}", e))?;

        self.get_team_internal(&conn, &team_id)?
            .ok_or_else(|| "Team not found after accepting invitation".to_string())
    }

    pub fn get_team_invitations(
        &self,
        team_id: &str,
        actor_id: &str,
    ) -> Result<Vec<TeamInvitation>, String> {
        self.authorize_permission(team_id, actor_id, Permission::InviteMembers)?;

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

    pub fn transfer_ownership(
        &self,
        team_id: &str,
        actor_id: &str,
        new_owner_id: &str,
    ) -> Result<(), String> {
        let actor = self.authorize_member(team_id, actor_id)?;
        if actor.role != TeamRole::Owner {
            return Err("Only the team owner can transfer ownership".to_string());
        }

        let conn = self
            .db
            .lock()
            .map_err(|e| format!("Database lock error: {}", e))?;

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

        let current_owner_id: String = conn
            .query_row(
                "SELECT user_id FROM team_members WHERE team_id = ?1 AND role = 'owner'",
                params![team_id],
                |row| row.get(0),
            )
            .map_err(|e| format!("Failed to get current owner: {}", e))?;

        if current_owner_id != actor.user_id {
            return Err("Only the team owner can transfer ownership".to_string());
        }

        conn.execute(
            "UPDATE team_members SET role = 'admin' WHERE team_id = ?1 AND user_id = ?2",
            params![team_id, current_owner_id],
        )
        .map_err(|e| format!("Failed to demote current owner: {}", e))?;

        conn.execute(
            "UPDATE team_members SET role = 'owner' WHERE team_id = ?1 AND user_id = ?2",
            params![team_id, new_owner_id],
        )
        .map_err(|e| format!("Failed to promote new owner: {}", e))?;

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

        let team = manager
            .get_team(&created_team.id, "user123")
            .unwrap()
            .unwrap();
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

        let members = manager.get_team_members(&team.id, "owner123").unwrap();
        assert_eq!(members.len(), 2);
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
            .update_member_role(&team.id, "owner123", "user456", TeamRole::Admin)
            .unwrap();

        let member = manager
            .get_team_member(&team.id, "user456")
            .unwrap()
            .unwrap();
        assert_eq!(member.role, TeamRole::Admin);
    }

    fn team_with_editor(manager: &TeamManager) -> Team {
        let team = manager
            .create_team("Test Team".to_string(), None, "owner123".to_string())
            .unwrap();
        manager
            .add_member(&team.id, "attacker", TeamRole::Editor, "owner123")
            .unwrap();
        team
    }

    #[test]
    fn test_transfer_ownership_rejects_non_owner_actor() {
        let db = setup_test_db();
        let manager = TeamManager::new(db);
        let team = team_with_editor(&manager);

        let result = manager.transfer_ownership(&team.id, "attacker", "attacker");
        assert!(result.is_err());

        let owner = manager
            .get_team_member(&team.id, "owner123")
            .unwrap()
            .unwrap();
        assert_eq!(owner.role, TeamRole::Owner);
        let attacker = manager
            .get_team_member(&team.id, "attacker")
            .unwrap()
            .unwrap();
        assert_eq!(attacker.role, TeamRole::Editor);
        assert_eq!(
            manager
                .get_team(&team.id, "owner123")
                .unwrap()
                .unwrap()
                .owner_id,
            "owner123"
        );
    }

    #[test]
    fn test_transfer_ownership_rejects_non_member_actor() {
        let db = setup_test_db();
        let manager = TeamManager::new(db);
        let team = team_with_editor(&manager);

        assert!(manager
            .transfer_ownership(&team.id, "outsider", "attacker")
            .is_err());
    }

    #[test]
    fn test_transfer_ownership_allows_owner() {
        let db = setup_test_db();
        let manager = TeamManager::new(db);
        let team = team_with_editor(&manager);

        manager
            .transfer_ownership(&team.id, "owner123", "attacker")
            .unwrap();

        let promoted = manager
            .get_team_member(&team.id, "attacker")
            .unwrap()
            .unwrap();
        assert_eq!(promoted.role, TeamRole::Owner);
    }

    #[test]
    fn test_delete_team_rejects_non_owner_member() {
        let db = setup_test_db();
        let manager = TeamManager::new(db);
        let team = team_with_editor(&manager);
        manager
            .update_member_role(&team.id, "owner123", "attacker", TeamRole::Admin)
            .unwrap();

        assert!(manager.delete_team(&team.id, "attacker").is_err());
        assert!(manager.get_team(&team.id, "owner123").unwrap().is_some());
    }

    #[test]
    fn test_delete_team_rejects_non_member() {
        let db = setup_test_db();
        let manager = TeamManager::new(db);
        let team = team_with_editor(&manager);

        assert!(manager.delete_team(&team.id, "outsider").is_err());
        assert!(manager.get_team(&team.id, "owner123").unwrap().is_some());

        manager.delete_team(&team.id, "owner123").unwrap();
        assert!(manager.get_team(&team.id, "owner123").unwrap().is_none());
    }

    #[test]
    fn test_remove_member_requires_permission() {
        let db = setup_test_db();
        let manager = TeamManager::new(db);
        let team = team_with_editor(&manager);
        manager
            .add_member(&team.id, "victim", TeamRole::Viewer, "owner123")
            .unwrap();

        assert!(manager
            .remove_member(&team.id, "attacker", "victim")
            .is_err());
        assert!(manager
            .remove_member(&team.id, "outsider", "victim")
            .is_err());
        assert!(manager
            .get_team_member(&team.id, "victim")
            .unwrap()
            .is_some());

        manager
            .remove_member(&team.id, "attacker", "attacker")
            .unwrap();
        manager
            .remove_member(&team.id, "owner123", "victim")
            .unwrap();
        assert!(manager
            .get_team_member(&team.id, "victim")
            .unwrap()
            .is_none());
    }

    #[test]
    fn test_update_member_role_requires_permission() {
        let db = setup_test_db();
        let manager = TeamManager::new(db);
        let team = team_with_editor(&manager);

        assert!(manager
            .update_member_role(&team.id, "attacker", "attacker", TeamRole::Admin)
            .is_err());
        assert!(manager
            .update_member_role(&team.id, "outsider", "attacker", TeamRole::Admin)
            .is_err());

        manager
            .update_member_role(&team.id, "owner123", "attacker", TeamRole::Admin)
            .unwrap();
        assert!(manager
            .update_member_role(&team.id, "attacker", "owner123", TeamRole::Viewer)
            .is_err());
    }

    #[test]
    fn test_reads_require_membership() {
        let db = setup_test_db();
        let manager = TeamManager::new(db);
        let team = team_with_editor(&manager);

        assert!(manager.get_team(&team.id, "outsider").is_err());
        assert!(manager.get_team_members(&team.id, "outsider").is_err());
        assert!(manager.get_team_invitations(&team.id, "outsider").is_err());
        assert!(manager.get_team_invitations(&team.id, "attacker").is_err());
        assert!(manager.get_team_members(&team.id, "attacker").is_ok());
    }

    #[test]
    fn test_invite_requires_permission_and_rejects_owner_role() {
        let db = setup_test_db();
        let manager = TeamManager::new(db);
        let team = team_with_editor(&manager);

        assert!(manager
            .create_invitation(
                &team.id,
                "attacker",
                "x@example.com".to_string(),
                TeamRole::Admin
            )
            .is_err());
        assert!(manager
            .create_invitation(
                &team.id,
                "owner123",
                "x@example.com".to_string(),
                TeamRole::Owner
            )
            .is_err());

        let invitation = manager
            .create_invitation(
                &team.id,
                "owner123",
                "x@example.com".to_string(),
                TeamRole::Editor,
            )
            .unwrap();
        assert_eq!(invitation.invited_by, "owner123");
    }

    #[test]
    fn test_unauthenticated_actor_is_rejected() {
        let db = setup_test_db();
        let manager = TeamManager::new(db);
        let team = team_with_editor(&manager);

        assert!(manager.delete_team(&team.id, "default").is_err());
        assert!(manager
            .transfer_ownership(&team.id, "default", "attacker")
            .is_err());
        assert!(manager.get_team_members(&team.id, "").is_err());
        assert!(manager
            .create_team("Ghost".to_string(), None, "default".to_string())
            .is_err());
        assert!(manager.accept_invitation("token", "default").is_err());
    }
}
