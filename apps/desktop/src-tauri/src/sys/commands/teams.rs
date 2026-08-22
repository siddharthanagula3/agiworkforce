use crate::features::teams::team_manager::TeamSettings;
use crate::features::teams::{
    ActivityType, Permission, ResourceType, Team, TeamActivity, TeamActivityManager,
    TeamInvitation, TeamManager, TeamMember, TeamResource, TeamResourceManager, TeamRole,
    TeamUpdates,
};
use crate::sys::commands::auth::{get_session_user_id, SessionState};
use crate::sys::commands::AppDatabase;
use serde_json::json;
use tauri::State;

fn authorize(
    manager: &TeamManager,
    team_id: &str,
    actor_id: &str,
    permission: Permission,
) -> Result<(), String> {
    manager.authorize_permission(team_id, actor_id, permission)?;
    Ok(())
}

#[tauri::command]
pub async fn create_team(
    name: String,
    description: Option<String>,
    session: State<'_, SessionState>,
    db: State<'_, AppDatabase>,
) -> Result<Team, String> {
    let actor = get_session_user_id(&session)?;
    let manager = TeamManager::new(db.conn.clone());
    manager.create_team(name, description, actor)
}

#[tauri::command]
pub async fn get_team(
    team_id: String,
    session: State<'_, SessionState>,
    db: State<'_, AppDatabase>,
) -> Result<Option<Team>, String> {
    let actor = get_session_user_id(&session)?;
    let manager = TeamManager::new(db.conn.clone());
    manager.get_team(&team_id, &actor)
}

#[tauri::command]
pub async fn update_team(
    team_id: String,
    name: Option<String>,
    description: Option<String>,
    session: State<'_, SessionState>,
    db: State<'_, AppDatabase>,
) -> Result<(), String> {
    let actor = get_session_user_id(&session)?;
    let manager = TeamManager::new(db.conn.clone());
    let updates = TeamUpdates {
        name,
        description,
        settings: None,
    };
    manager.update_team(&team_id, &actor, updates)
}

#[tauri::command]
pub async fn update_team_settings(
    team_id: String,
    default_member_role: Option<String>,
    allow_resource_sharing: Option<bool>,
    require_approval_for_automations: Option<bool>,
    enable_activity_notifications: Option<bool>,
    max_members: Option<usize>,
    session: State<'_, SessionState>,
    db: State<'_, AppDatabase>,
) -> Result<(), String> {
    let actor = get_session_user_id(&session)?;
    let manager = TeamManager::new(db.conn.clone());
    let existing = manager
        .get_team(&team_id, &actor)?
        .ok_or_else(|| format!("Team not found: {}", team_id))?;

    let resolved_role = if let Some(role) = default_member_role {
        TeamRole::from_str(&role).ok_or_else(|| format!("Invalid role: {}", role))?
    } else {
        existing.settings.default_member_role
    };

    let merged_settings = TeamSettings {
        default_member_role: resolved_role,
        allow_resource_sharing: allow_resource_sharing
            .unwrap_or(existing.settings.allow_resource_sharing),
        require_approval_for_automations: require_approval_for_automations
            .unwrap_or(existing.settings.require_approval_for_automations),
        enable_activity_notifications: enable_activity_notifications
            .unwrap_or(existing.settings.enable_activity_notifications),
        max_members: max_members.or(existing.settings.max_members),
    };

    let updates = TeamUpdates {
        name: None,
        description: None,
        settings: Some(merged_settings),
    };
    manager.update_team(&team_id, &actor, updates)
}

#[tauri::command]
pub async fn delete_team(
    team_id: String,
    session: State<'_, SessionState>,
    db: State<'_, AppDatabase>,
) -> Result<(), String> {
    let actor = get_session_user_id(&session)?;
    let manager = TeamManager::new(db.conn.clone());
    manager.delete_team(&team_id, &actor)
}

#[tauri::command]
pub async fn get_user_teams(
    session: State<'_, SessionState>,
    db: State<'_, AppDatabase>,
) -> Result<Vec<Team>, String> {
    let actor = get_session_user_id(&session)?;
    let manager = TeamManager::new(db.conn.clone());
    manager.get_user_teams(&actor)
}

#[tauri::command]
pub async fn invite_member(
    team_id: String,
    email: String,
    role: String,
    session: State<'_, SessionState>,
    db: State<'_, AppDatabase>,
) -> Result<String, String> {
    let actor = get_session_user_id(&session)?;
    let manager = TeamManager::new(db.conn.clone());

    let team_role = TeamRole::from_str(&role).ok_or_else(|| format!("Invalid role: {}", role))?;

    let invitation = manager.create_invitation(&team_id, &actor, email, team_role)?;

    let activity_manager = TeamActivityManager::new(db.conn.clone());
    activity_manager.log_activity(
        &team_id,
        Some(actor),
        ActivityType::MemberInvited,
        None,
        None,
        Some(json!({ "email": invitation.email, "role": role })),
    )?;

    Ok(invitation.token)
}

#[tauri::command]
pub async fn accept_invitation(
    token: String,
    session: State<'_, SessionState>,
    db: State<'_, AppDatabase>,
) -> Result<Team, String> {
    let actor = get_session_user_id(&session)?;
    let manager = TeamManager::new(db.conn.clone());
    let team = manager.accept_invitation(&token, &actor)?;

    let activity_manager = TeamActivityManager::new(db.conn.clone());
    activity_manager.log_activity(
        &team.id,
        Some(actor),
        ActivityType::MemberJoined,
        None,
        None,
        None,
    )?;

    Ok(team)
}

#[tauri::command]
pub async fn remove_member(
    team_id: String,
    user_id: String,
    session: State<'_, SessionState>,
    db: State<'_, AppDatabase>,
) -> Result<(), String> {
    let actor = get_session_user_id(&session)?;
    let manager = TeamManager::new(db.conn.clone());
    manager.remove_member(&team_id, &actor, &user_id)?;

    let activity_manager = TeamActivityManager::new(db.conn.clone());
    activity_manager.log_activity(
        &team_id,
        Some(actor),
        ActivityType::MemberLeft,
        None,
        None,
        Some(json!({ "removed_user": user_id })),
    )?;

    Ok(())
}

#[tauri::command]
pub async fn update_member_role(
    team_id: String,
    user_id: String,
    role: String,
    session: State<'_, SessionState>,
    db: State<'_, AppDatabase>,
) -> Result<(), String> {
    let actor = get_session_user_id(&session)?;
    let manager = TeamManager::new(db.conn.clone());

    let team_role = TeamRole::from_str(&role).ok_or_else(|| format!("Invalid role: {}", role))?;

    manager.update_member_role(&team_id, &actor, &user_id, team_role)?;

    let activity_manager = TeamActivityManager::new(db.conn.clone());
    activity_manager.log_activity(
        &team_id,
        Some(actor),
        ActivityType::MemberRoleChanged,
        None,
        None,
        Some(json!({ "user_id": user_id, "new_role": role })),
    )?;

    Ok(())
}

#[tauri::command]
pub async fn get_team_members(
    team_id: String,
    session: State<'_, SessionState>,
    db: State<'_, AppDatabase>,
) -> Result<Vec<TeamMember>, String> {
    let actor = get_session_user_id(&session)?;
    let manager = TeamManager::new(db.conn.clone());
    manager.get_team_members(&team_id, &actor)
}

#[tauri::command]
pub async fn get_team_invitations(
    team_id: String,
    session: State<'_, SessionState>,
    db: State<'_, AppDatabase>,
) -> Result<Vec<TeamInvitation>, String> {
    let actor = get_session_user_id(&session)?;
    let manager = TeamManager::new(db.conn.clone());
    manager.get_team_invitations(&team_id, &actor)
}

#[tauri::command]
pub async fn share_resource(
    team_id: String,
    resource_type: String,
    resource_id: String,
    resource_name: String,
    resource_description: Option<String>,
    session: State<'_, SessionState>,
    db: State<'_, AppDatabase>,
) -> Result<(), String> {
    let actor = get_session_user_id(&session)?;
    let res_type = ResourceType::from_str(&resource_type)
        .ok_or_else(|| format!("Invalid resource type: {}", resource_type))?;

    let teams = TeamManager::new(db.conn.clone());
    authorize(&teams, &team_id, &actor, Permission::ShareResources)?;

    let manager = TeamResourceManager::new(db.conn.clone());
    manager.share_resource(
        &team_id,
        res_type,
        &resource_id,
        resource_name.clone(),
        resource_description.clone(),
        &actor,
    )?;

    let activity_manager = TeamActivityManager::new(db.conn.clone());
    activity_manager.log_activity(
        &team_id,
        Some(actor),
        ActivityType::ResourceShared,
        Some(resource_type),
        Some(resource_id),
        Some(json!({ "name": resource_name, "description": resource_description })),
    )?;

    Ok(())
}

#[tauri::command]
pub async fn unshare_resource(
    team_id: String,
    resource_type: String,
    resource_id: String,
    session: State<'_, SessionState>,
    db: State<'_, AppDatabase>,
) -> Result<(), String> {
    let actor = get_session_user_id(&session)?;
    let res_type = ResourceType::from_str(&resource_type)
        .ok_or_else(|| format!("Invalid resource type: {}", resource_type))?;

    let teams = TeamManager::new(db.conn.clone());
    authorize(&teams, &team_id, &actor, Permission::ShareResources)?;

    let manager = TeamResourceManager::new(db.conn.clone());
    manager.unshare_resource(&team_id, res_type, &resource_id)?;

    let activity_manager = TeamActivityManager::new(db.conn.clone());
    activity_manager.log_activity(
        &team_id,
        Some(actor),
        ActivityType::ResourceUnshared,
        Some(resource_type),
        Some(resource_id),
        None,
    )?;

    Ok(())
}

#[tauri::command]
pub async fn get_team_resources(
    team_id: String,
    session: State<'_, SessionState>,
    db: State<'_, AppDatabase>,
) -> Result<Vec<TeamResource>, String> {
    let actor = get_session_user_id(&session)?;
    let teams = TeamManager::new(db.conn.clone());
    authorize(&teams, &team_id, &actor, Permission::ViewResources)?;

    let manager = TeamResourceManager::new(db.conn.clone());
    manager.get_team_resources(&team_id)
}

#[tauri::command]
pub async fn get_team_resources_by_type(
    team_id: String,
    resource_type: String,
    session: State<'_, SessionState>,
    db: State<'_, AppDatabase>,
) -> Result<Vec<TeamResource>, String> {
    let actor = get_session_user_id(&session)?;
    let res_type = ResourceType::from_str(&resource_type)
        .ok_or_else(|| format!("Invalid resource type: {}", resource_type))?;

    let teams = TeamManager::new(db.conn.clone());
    authorize(&teams, &team_id, &actor, Permission::ViewResources)?;

    let manager = TeamResourceManager::new(db.conn.clone());
    manager.get_team_resources_by_type(&team_id, res_type)
}

#[tauri::command]
pub async fn get_team_activity(
    team_id: String,
    limit: usize,
    offset: usize,
    session: State<'_, SessionState>,
    db: State<'_, AppDatabase>,
) -> Result<Vec<TeamActivity>, String> {
    let actor = get_session_user_id(&session)?;
    let teams = TeamManager::new(db.conn.clone());
    authorize(&teams, &team_id, &actor, Permission::ViewActivity)?;

    let manager = TeamActivityManager::new(db.conn.clone());
    manager.get_team_activity(&team_id, limit, offset)
}

#[tauri::command]
pub async fn get_user_team_activity(
    team_id: String,
    user_id: String,
    limit: usize,
    session: State<'_, SessionState>,
    db: State<'_, AppDatabase>,
) -> Result<Vec<TeamActivity>, String> {
    let actor = get_session_user_id(&session)?;
    let teams = TeamManager::new(db.conn.clone());
    authorize(&teams, &team_id, &actor, Permission::ViewActivity)?;

    let manager = TeamActivityManager::new(db.conn.clone());
    manager.get_user_activity(&team_id, &user_id, limit)
}

#[tauri::command]
pub async fn transfer_team_ownership(
    team_id: String,
    new_owner_id: String,
    session: State<'_, SessionState>,
    db: State<'_, AppDatabase>,
) -> Result<(), String> {
    let actor = get_session_user_id(&session)?;
    let manager = TeamManager::new(db.conn.clone());
    manager.transfer_ownership(&team_id, &actor, &new_owner_id)?;

    let activity_manager = TeamActivityManager::new(db.conn.clone());
    activity_manager.log_activity(
        &team_id,
        Some(actor),
        ActivityType::MemberRoleChanged,
        None,
        None,
        Some(json!({ "new_owner": new_owner_id, "action": "ownership_transferred" })),
    )?;

    Ok(())
}
