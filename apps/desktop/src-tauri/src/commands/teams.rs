use crate::teams::{
    Team, TeamMember, TeamRole, TeamManager, TeamUpdates, TeamInvitation,
    TeamResource, TeamResourceManager, ResourceType,
    TeamActivity, TeamActivityManager, ActivityType,
    TeamBilling, BillingPlan, BillingCycle, TeamBillingManager, UsageMetrics,
};
use crate::db::AppDatabase;
use serde_json::json;
use tauri::State;

/// Create a new team
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

/// Get a team by ID
#[tauri::command]
pub async fn get_team(
    team_id: String,
    db: State<'_, AppDatabase>,
) -> Result<Option<Team>, String> {
    let manager = TeamManager::new(db.conn.clone());
    manager.get_team(&team_id)
}

/// Update a team
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

/// Delete a team
#[tauri::command]
pub async fn delete_team(
    team_id: String,
    db: State<'_, AppDatabase>,
) -> Result<(), String> {
    let manager = TeamManager::new(db.conn.clone());
    manager.delete_team(&team_id)
}

/// Get all teams for a user
#[tauri::command]
pub async fn get_user_teams(
    user_id: String,
    db: State<'_, AppDatabase>,
) -> Result<Vec<Team>, String> {
    let manager = TeamManager::new(db.conn.clone());
    manager.get_user_teams(&user_id)
}

/// Invite a member to a team
#[tauri::command]
pub async fn invite_member(
    team_id: String,
    email: String,
    role: String,
    invited_by: String,
    db: State<'_, AppDatabase>,
) -> Result<String, String> {
    let manager = TeamManager::new(db.conn.clone());

    let team_role = TeamRole::from_str(&role)
        .ok_or_else(|| format!("Invalid role: {}", role))?;

    let invitation = manager.create_invitation(&team_id, email, team_role, &invited_by)?;

    // Log activity
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

/// Accept an invitation
#[tauri::command]
pub async fn accept_invitation(
    token: String,
    user_id: String,
    db: State<'_, AppDatabase>,
) -> Result<Team, String> {
    let manager = TeamManager::new(db.conn.clone());
    let team = manager.accept_invitation(&token, &user_id)?;

    // Log activity
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

/// Remove a member from a team
#[tauri::command]
pub async fn remove_member(
    team_id: String,
    user_id: String,
    removed_by: String,
    db: State<'_, AppDatabase>,
) -> Result<(), String> {
    let manager = TeamManager::new(db.conn.clone());
    manager.remove_member(&team_id, &user_id)?;

    // Log activity
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

/// Update a member's role
#[tauri::command]
pub async fn update_member_role(
    team_id: String,
    user_id: String,
    role: String,
    updated_by: String,
    db: State<'_, AppDatabase>,
) -> Result<(), String> {
    let manager = TeamManager::new(db.conn.clone());

    let team_role = TeamRole::from_str(&role)
        .ok_or_else(|| format!("Invalid role: {}", role))?;

    manager.update_member_role(&team_id, &user_id, team_role)?;

    // Log activity
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

/// Get all members of a team
#[tauri::command]
pub async fn get_team_members(
    team_id: String,
    db: State<'_, AppDatabase>,
) -> Result<Vec<TeamMember>, String> {
    let manager = TeamManager::new(db.conn.clone());
    manager.get_team_members(&team_id)
}

/// Get pending invitations for a team
#[tauri::command]
pub async fn get_team_invitations(
    team_id: String,
    db: State<'_, AppDatabase>,
) -> Result<Vec<TeamInvitation>, String> {
    let manager = TeamManager::new(db.conn.clone());
    manager.get_team_invitations(&team_id)
}

/// Share a resource with a team
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
    manager.share_resource(&team_id, res_type, &resource_id, resource_name.clone(), resource_description.clone(), &shared_by)?;

    // Log activity
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

/// Unshare a resource from a team
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

    // Log activity
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

/// Get all resources shared with a team
#[tauri::command]
pub async fn get_team_resources(
    team_id: String,
    db: State<'_, AppDatabase>,
) -> Result<Vec<TeamResource>, String> {
    let manager = TeamResourceManager::new(db.conn.clone());
    manager.get_team_resources(&team_id)
}

/// Get resources by type
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

/// Get team activity
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

/// Get user activity in a team
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

/// Get team billing information
#[tauri::command]
pub async fn get_team_billing(
    team_id: String,
    db: State<'_, AppDatabase>,
) -> Result<Option<TeamBilling>, String> {
    let manager = TeamBillingManager::new(db.conn.clone());
    manager.get_team_billing(&team_id)
}

/// Initialize billing for a team
#[tauri::command]
pub async fn initialize_team_billing(
    team_id: String,
    plan: String,
    cycle: String,
    seat_count: usize,
    db: State<'_, AppDatabase>,
) -> Result<TeamBilling, String> {
    let plan_tier = BillingPlan::from_str(&plan)
        .ok_or_else(|| format!("Invalid plan: {}", plan))?;

    let billing_cycle = BillingCycle::from_str(&cycle)
        .ok_or_else(|| format!("Invalid billing cycle: {}", cycle))?;

    let manager = TeamBillingManager::new(db.conn.clone());
    let billing = manager.initialize_team_billing(&team_id, plan_tier, billing_cycle, seat_count)?;

    // Log activity
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

/// Update team plan
#[tauri::command]
pub async fn update_team_plan(
    team_id: String,
    plan: String,
    updated_by: String,
    db: State<'_, AppDatabase>,
) -> Result<(), String> {
    let plan_tier = BillingPlan::from_str(&plan)
        .ok_or_else(|| format!("Invalid plan: {}", plan))?;

    let manager = TeamBillingManager::new(db.conn.clone());
    manager.update_team_plan(&team_id, plan_tier)?;

    // Log activity
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

/// Add seats to team billing
#[tauri::command]
pub async fn add_team_seats(
    team_id: String,
    count: usize,
    updated_by: String,
    db: State<'_, AppDatabase>,
) -> Result<(), String> {
    let manager = TeamBillingManager::new(db.conn.clone());
    manager.add_seats(&team_id, count)?;

    // Log activity
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

/// Remove seats from team billing
#[tauri::command]
pub async fn remove_team_seats(
    team_id: String,
    count: usize,
    updated_by: String,
    db: State<'_, AppDatabase>,
) -> Result<(), String> {
    let manager = TeamBillingManager::new(db.conn.clone());
    manager.remove_seats(&team_id, count)?;

    // Log activity
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

/// Calculate team cost
#[tauri::command]
pub async fn calculate_team_cost(
    team_id: String,
    db: State<'_, AppDatabase>,
) -> Result<f64, String> {
    let manager = TeamBillingManager::new(db.conn.clone());
    manager.calculate_team_cost(&team_id)
}

/// Update team usage metrics
#[tauri::command]
pub async fn update_team_usage(
    team_id: String,
    metrics: UsageMetrics,
    db: State<'_, AppDatabase>,
) -> Result<(), String> {
    let manager = TeamBillingManager::new(db.conn.clone());
    manager.update_usage_metrics(&team_id, metrics)
}

/// Transfer team ownership
#[tauri::command]
pub async fn transfer_team_ownership(
    team_id: String,
    new_owner_id: String,
    transferred_by: String,
    db: State<'_, AppDatabase>,
) -> Result<(), String> {
    let manager = TeamManager::new(db.conn.clone());
    manager.transfer_ownership(&team_id, &new_owner_id)?;

    // Log activity
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
