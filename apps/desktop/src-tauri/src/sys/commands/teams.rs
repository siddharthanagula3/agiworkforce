use crate::features::teams::{
    ActivityType, BillingCycle, BillingPlan, ResourceType, Team, TeamActivity, TeamActivityManager,
    TeamBilling, TeamBillingManager, TeamInvitation, TeamManager, TeamMember, TeamResource,
    TeamResourceManager, TeamRole, TeamUpdates, UsageMetrics,
};
use crate::features::teams::team_manager::TeamSettings;
use crate::sys::commands::AppDatabase;
use serde_json::json;
use tauri::State;

#[tauri::command]
pub async fn create_team(
    name: String,
    description: Option<String>,
    owner_id: String,
    db: State<'_, AppDatabase>,
) -> Result<Team, String> {
    let manager = TeamManager::new(db.conn.clone());
    manager.create_team(name, description, owner_id)
}

#[tauri::command]
pub async fn get_team(team_id: String, db: State<'_, AppDatabase>) -> Result<Option<Team>, String> {
    let manager = TeamManager::new(db.conn.clone());
    manager.get_team(&team_id)
}

#[tauri::command]
pub async fn update_team(
    team_id: String,
    name: Option<String>,
    description: Option<String>,
    db: State<'_, AppDatabase>,
) -> Result<(), String> {
    let manager = TeamManager::new(db.conn.clone());
    let updates = TeamUpdates {
        name,
        description,
        settings: None,
    };
    manager.update_team(&team_id, updates)
}

#[tauri::command]
pub async fn update_team_settings(
    team_id: String,
    default_member_role: Option<String>,
    allow_resource_sharing: Option<bool>,
    require_approval_for_automations: Option<bool>,
    enable_activity_notifications: Option<bool>,
    max_members: Option<usize>,
    db: State<'_, AppDatabase>,
) -> Result<(), String> {
    let manager = TeamManager::new(db.conn.clone());
    let existing = manager
        .get_team(&team_id)?
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
    manager.update_team(&team_id, updates)
}

#[tauri::command]
pub async fn delete_team(team_id: String, db: State<'_, AppDatabase>) -> Result<(), String> {
    let manager = TeamManager::new(db.conn.clone());
    manager.delete_team(&team_id)
}

#[tauri::command]
pub async fn get_user_teams(
    user_id: String,
    db: State<'_, AppDatabase>,
) -> Result<Vec<Team>, String> {
    let manager = TeamManager::new(db.conn.clone());
    manager.get_user_teams(&user_id)
}

#[tauri::command]
pub async fn invite_member(
    team_id: String,
    email: String,
    role: String,
    invited_by: String,
    db: State<'_, AppDatabase>,
) -> Result<String, String> {
    let manager = TeamManager::new(db.conn.clone());

    let team_role = TeamRole::from_str(&role).ok_or_else(|| format!("Invalid role: {}", role))?;

    let invitation = manager.create_invitation(&team_id, email, team_role, &invited_by)?;

    let activity_manager = TeamActivityManager::new(db.conn.clone());
    activity_manager.log_activity(
        &team_id,
        Some(invited_by),
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
    user_id: String,
    db: State<'_, AppDatabase>,
) -> Result<Team, String> {
    let manager = TeamManager::new(db.conn.clone());
    let team = manager.accept_invitation(&token, &user_id)?;

    let activity_manager = TeamActivityManager::new(db.conn.clone());
    activity_manager.log_activity(
        &team.id,
        Some(user_id),
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
    removed_by: String,
    db: State<'_, AppDatabase>,
) -> Result<(), String> {
    let manager = TeamManager::new(db.conn.clone());
    manager.remove_member(&team_id, &user_id)?;

    let activity_manager = TeamActivityManager::new(db.conn.clone());
    activity_manager.log_activity(
        &team_id,
        Some(removed_by),
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
    updated_by: String,
    db: State<'_, AppDatabase>,
) -> Result<(), String> {
    let manager = TeamManager::new(db.conn.clone());

    let team_role = TeamRole::from_str(&role).ok_or_else(|| format!("Invalid role: {}", role))?;

    manager.update_member_role(&team_id, &user_id, team_role)?;

    let activity_manager = TeamActivityManager::new(db.conn.clone());
    activity_manager.log_activity(
        &team_id,
        Some(updated_by),
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
    db: State<'_, AppDatabase>,
) -> Result<Vec<TeamMember>, String> {
    let manager = TeamManager::new(db.conn.clone());
    manager.get_team_members(&team_id)
}

#[tauri::command]
pub async fn get_team_invitations(
    team_id: String,
    db: State<'_, AppDatabase>,
) -> Result<Vec<TeamInvitation>, String> {
    let manager = TeamManager::new(db.conn.clone());
    manager.get_team_invitations(&team_id)
}

#[tauri::command]
pub async fn share_resource(
    team_id: String,
    resource_type: String,
    resource_id: String,
    resource_name: String,
    resource_description: Option<String>,
    shared_by: String,
    db: State<'_, AppDatabase>,
) -> Result<(), String> {
    let res_type = ResourceType::from_str(&resource_type)
        .ok_or_else(|| format!("Invalid resource type: {}", resource_type))?;

    let manager = TeamResourceManager::new(db.conn.clone());
    manager.share_resource(
        &team_id,
        res_type,
        &resource_id,
        resource_name.clone(),
        resource_description.clone(),
        &shared_by,
    )?;

    let activity_manager = TeamActivityManager::new(db.conn.clone());
    activity_manager.log_activity(
        &team_id,
        Some(shared_by),
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
    unshared_by: String,
    db: State<'_, AppDatabase>,
) -> Result<(), String> {
    let res_type = ResourceType::from_str(&resource_type)
        .ok_or_else(|| format!("Invalid resource type: {}", resource_type))?;

    let manager = TeamResourceManager::new(db.conn.clone());
    manager.unshare_resource(&team_id, res_type, &resource_id)?;

    let activity_manager = TeamActivityManager::new(db.conn.clone());
    activity_manager.log_activity(
        &team_id,
        Some(unshared_by),
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
    db: State<'_, AppDatabase>,
) -> Result<Vec<TeamResource>, String> {
    let manager = TeamResourceManager::new(db.conn.clone());
    manager.get_team_resources(&team_id)
}

#[tauri::command]
pub async fn get_team_resources_by_type(
    team_id: String,
    resource_type: String,
    db: State<'_, AppDatabase>,
) -> Result<Vec<TeamResource>, String> {
    let res_type = ResourceType::from_str(&resource_type)
        .ok_or_else(|| format!("Invalid resource type: {}", resource_type))?;

    let manager = TeamResourceManager::new(db.conn.clone());
    manager.get_team_resources_by_type(&team_id, res_type)
}

#[tauri::command]
pub async fn get_team_activity(
    team_id: String,
    limit: usize,
    offset: usize,
    db: State<'_, AppDatabase>,
) -> Result<Vec<TeamActivity>, String> {
    let manager = TeamActivityManager::new(db.conn.clone());
    manager.get_team_activity(&team_id, limit, offset)
}

#[tauri::command]
pub async fn get_user_team_activity(
    team_id: String,
    user_id: String,
    limit: usize,
    db: State<'_, AppDatabase>,
) -> Result<Vec<TeamActivity>, String> {
    let manager = TeamActivityManager::new(db.conn.clone());
    manager.get_user_activity(&team_id, &user_id, limit)
}

#[tauri::command]
pub async fn get_team_billing(
    team_id: String,
    db: State<'_, AppDatabase>,
) -> Result<Option<TeamBilling>, String> {
    let manager = TeamBillingManager::new(db.conn.clone());
    manager.get_team_billing(&team_id)
}

#[tauri::command]
pub async fn initialize_team_billing(
    team_id: String,
    plan: String,
    cycle: String,
    seat_count: usize,
    db: State<'_, AppDatabase>,
) -> Result<TeamBilling, String> {
    let plan_tier =
        BillingPlan::from_str(&plan).ok_or_else(|| format!("Invalid plan: {}", plan))?;

    let billing_cycle = BillingCycle::from_str(&cycle)
        .ok_or_else(|| format!("Invalid billing cycle: {}", cycle))?;

    let manager = TeamBillingManager::new(db.conn.clone());
    let billing =
        manager.initialize_team_billing(&team_id, plan_tier, billing_cycle, seat_count)?;

    let activity_manager = TeamActivityManager::new(db.conn.clone());
    activity_manager.log_activity(
        &team_id,
        None,
        ActivityType::BillingPlanChanged,
        None,
        None,
        Some(json!({ "plan": plan, "cycle": cycle })),
    )?;

    Ok(billing)
}

#[tauri::command]
pub async fn update_team_plan(
    team_id: String,
    plan: String,
    updated_by: String,
    db: State<'_, AppDatabase>,
) -> Result<(), String> {
    let plan_tier =
        BillingPlan::from_str(&plan).ok_or_else(|| format!("Invalid plan: {}", plan))?;

    let manager = TeamBillingManager::new(db.conn.clone());
    manager.update_team_plan(&team_id, plan_tier)?;

    let activity_manager = TeamActivityManager::new(db.conn.clone());
    activity_manager.log_activity(
        &team_id,
        Some(updated_by),
        ActivityType::BillingPlanChanged,
        None,
        None,
        Some(json!({ "new_plan": plan })),
    )?;

    Ok(())
}

#[tauri::command]
pub async fn add_team_seats(
    team_id: String,
    count: usize,
    updated_by: String,
    db: State<'_, AppDatabase>,
) -> Result<(), String> {
    let manager = TeamBillingManager::new(db.conn.clone());
    manager.add_seats(&team_id, count)?;

    let activity_manager = TeamActivityManager::new(db.conn.clone());
    activity_manager.log_activity(
        &team_id,
        Some(updated_by),
        ActivityType::BillingSeatsAdded,
        None,
        None,
        Some(json!({ "seats_added": count })),
    )?;

    Ok(())
}

#[tauri::command]
pub async fn remove_team_seats(
    team_id: String,
    count: usize,
    updated_by: String,
    db: State<'_, AppDatabase>,
) -> Result<(), String> {
    let manager = TeamBillingManager::new(db.conn.clone());
    manager.remove_seats(&team_id, count)?;

    let activity_manager = TeamActivityManager::new(db.conn.clone());
    activity_manager.log_activity(
        &team_id,
        Some(updated_by),
        ActivityType::BillingSeatsRemoved,
        None,
        None,
        Some(json!({ "seats_removed": count })),
    )?;

    Ok(())
}

#[tauri::command]
pub async fn calculate_team_cost(
    team_id: String,
    db: State<'_, AppDatabase>,
) -> Result<f64, String> {
    let manager = TeamBillingManager::new(db.conn.clone());
    manager.calculate_team_cost(&team_id)
}

#[tauri::command]
pub async fn update_team_usage(
    team_id: String,
    metrics: UsageMetrics,
    db: State<'_, AppDatabase>,
) -> Result<(), String> {
    let manager = TeamBillingManager::new(db.conn.clone());
    manager.update_usage_metrics(&team_id, metrics)
}

#[tauri::command]
pub async fn transfer_team_ownership(
    team_id: String,
    new_owner_id: String,
    transferred_by: String,
    db: State<'_, AppDatabase>,
) -> Result<(), String> {
    let manager = TeamManager::new(db.conn.clone());
    manager.transfer_ownership(&team_id, &new_owner_id)?;

    let activity_manager = TeamActivityManager::new(db.conn.clone());
    activity_manager.log_activity(
        &team_id,
        Some(transferred_by),
        ActivityType::MemberRoleChanged,
        None,
        None,
        Some(json!({ "new_owner": new_owner_id, "action": "ownership_transferred" })),
    )?;

    Ok(())
}
