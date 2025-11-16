use crate::teams::{TeamMember, TeamRole};
use serde::{Deserialize, Serialize};

/// Permission types for team resources
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Permission {
    // Resource permissions
    ViewResources,
    CreateResources,
    ModifyResources,
    DeleteResources,
    ShareResources,

    // Member permissions
    ViewMembers,
    InviteMembers,
    RemoveMembers,
    ModifyMemberRoles,

    // Team management
    ViewTeamSettings,
    ModifyTeamSettings,
    DeleteTeam,

    // Automation permissions
    ViewAutomations,
    RunAutomations,
    CreateAutomations,
    ModifyAutomations,
    DeleteAutomations,

    // Workflow permissions
    ViewWorkflows,
    CreateWorkflows,
    ModifyWorkflows,
    DeleteWorkflows,
    ExecuteWorkflows,

    // Billing permissions
    ViewBilling,
    ManageBilling,

    // Activity permissions
    ViewActivity,
    ExportActivity,
}

/// Team permissions manager
pub struct TeamPermissions;

impl TeamPermissions {
    /// Check if a member has a specific permission
    pub fn has_permission(member: &TeamMember, permission: Permission) -> bool {
        match member.role {
            TeamRole::Owner => Self::owner_permissions(permission),
            TeamRole::Admin => Self::admin_permissions(permission),
            TeamRole::Editor => Self::editor_permissions(permission),
            TeamRole::Viewer => Self::viewer_permissions(permission),
        }
    }

    /// Check multiple permissions at once
    pub fn has_all_permissions(member: &TeamMember, permissions: &[Permission]) -> bool {
        permissions.iter().all(|p| Self::has_permission(member, *p))
    }

    /// Check if member has any of the specified permissions
    pub fn has_any_permission(member: &TeamMember, permissions: &[Permission]) -> bool {
        permissions.iter().any(|p| Self::has_permission(member, *p))
    }

    /// Get all permissions for a role
    pub fn get_role_permissions(role: TeamRole) -> Vec<Permission> {
        use Permission::*;

        match role {
            TeamRole::Owner => vec![
                ViewResources,
                CreateResources,
                ModifyResources,
                DeleteResources,
                ShareResources,
                ViewMembers,
                InviteMembers,
                RemoveMembers,
                ModifyMemberRoles,
                ViewTeamSettings,
                ModifyTeamSettings,
                DeleteTeam,
                ViewAutomations,
                RunAutomations,
                CreateAutomations,
                ModifyAutomations,
                DeleteAutomations,
                ViewWorkflows,
                CreateWorkflows,
                ModifyWorkflows,
                DeleteWorkflows,
                ExecuteWorkflows,
                ViewBilling,
                ManageBilling,
                ViewActivity,
                ExportActivity,
            ],
            TeamRole::Admin => vec![
                ViewResources,
                CreateResources,
                ModifyResources,
                DeleteResources,
                ShareResources,
                ViewMembers,
                InviteMembers,
                RemoveMembers,
                ModifyMemberRoles,
                ViewTeamSettings,
                ModifyTeamSettings,
                ViewAutomations,
                RunAutomations,
                CreateAutomations,
                ModifyAutomations,
                DeleteAutomations,
                ViewWorkflows,
                CreateWorkflows,
                ModifyWorkflows,
                DeleteWorkflows,
                ExecuteWorkflows,
                ViewBilling,
                ViewActivity,
                ExportActivity,
            ],
            TeamRole::Editor => vec![
                ViewResources,
                CreateResources,
                ModifyResources,
                ShareResources,
                ViewMembers,
                ViewTeamSettings,
                ViewAutomations,
                RunAutomations,
                CreateAutomations,
                ModifyAutomations,
                ViewWorkflows,
                CreateWorkflows,
                ModifyWorkflows,
                ExecuteWorkflows,
                ViewActivity,
            ],
            TeamRole::Viewer => vec![
                ViewResources,
                ViewMembers,
                ViewTeamSettings,
                ViewAutomations,
                ViewWorkflows,
                ViewActivity,
            ],
        }
    }

    /// Owner permissions (all permissions)
    fn owner_permissions(_permission: Permission) -> bool {
        true // Owners have all permissions
    }

    /// Admin permissions (all except team deletion and billing management)
    fn admin_permissions(permission: Permission) -> bool {
        use Permission::*;

        match permission {
            DeleteTeam | ManageBilling => false,
            _ => true,
        }
    }

    /// Editor permissions
    fn editor_permissions(permission: Permission) -> bool {
        use Permission::*;

        match permission {
            // Can view resources
            ViewResources | ViewMembers | ViewTeamSettings | ViewActivity => true,

            // Can create and modify resources
            CreateResources | ModifyResources | ShareResources => true,

            // Can work with automations (but not delete)
            ViewAutomations | RunAutomations | CreateAutomations | ModifyAutomations => true,

            // Can work with workflows (but not delete)
            ViewWorkflows | CreateWorkflows | ModifyWorkflows | ExecuteWorkflows => true,

            // Cannot delete resources or manage members
            DeleteResources | InviteMembers | RemoveMembers | ModifyMemberRoles => false,

            // Cannot modify team settings or delete team
            ModifyTeamSettings | DeleteTeam => false,

            // Cannot delete automations or workflows
            DeleteAutomations | DeleteWorkflows => false,

            // Cannot manage billing
            ViewBilling | ManageBilling => false,

            // Cannot export activity
            ExportActivity => false,
        }
    }

    /// Viewer permissions (read-only)
    fn viewer_permissions(permission: Permission) -> bool {
        use Permission::*;

        matches!(
            permission,
            ViewResources
                | ViewMembers
                | ViewTeamSettings
                | ViewActivity
                | ViewAutomations
                | ViewWorkflows
        )
    }

    /// Check if a member can view a specific resource
    pub fn can_view_resource(member: &TeamMember) -> bool {
        Self::has_permission(member, Permission::ViewResources)
    }

    /// Check if a member can create resources
    pub fn can_create_resource(member: &TeamMember) -> bool {
        Self::has_permission(member, Permission::CreateResources)
    }

    /// Check if a member can modify a specific resource
    pub fn can_modify_resource(member: &TeamMember) -> bool {
        Self::has_permission(member, Permission::ModifyResources)
    }

    /// Check if a member can delete a specific resource
    pub fn can_delete_resource(member: &TeamMember) -> bool {
        Self::has_permission(member, Permission::DeleteResources)
    }

    /// Check if a member can share resources
    pub fn can_share_resource(member: &TeamMember) -> bool {
        Self::has_permission(member, Permission::ShareResources)
    }

    /// Check if a member can invite other members
    pub fn can_invite_member(member: &TeamMember) -> bool {
        Self::has_permission(member, Permission::InviteMembers)
    }

    /// Check if a member can remove other members
    pub fn can_remove_member(member: &TeamMember) -> bool {
        Self::has_permission(member, Permission::RemoveMembers)
    }

    /// Check if a member can modify member roles
    pub fn can_modify_member_role(member: &TeamMember) -> bool {
        Self::has_permission(member, Permission::ModifyMemberRoles)
    }

    /// Check if a member can manage billing
    pub fn can_manage_billing(member: &TeamMember) -> bool {
        Self::has_permission(member, Permission::ManageBilling)
    }

    /// Check if a member can delete the team
    pub fn can_delete_team(member: &TeamMember) -> bool {
        Self::has_permission(member, Permission::DeleteTeam)
    }

    /// Check if a member can modify team settings
    pub fn can_modify_team_settings(member: &TeamMember) -> bool {
        Self::has_permission(member, Permission::ModifyTeamSettings)
    }

    /// Check if a member can run automations
    pub fn can_run_automation(member: &TeamMember) -> bool {
        Self::has_permission(member, Permission::RunAutomations)
    }

    /// Check if a member can execute workflows
    pub fn can_execute_workflow(member: &TeamMember) -> bool {
        Self::has_permission(member, Permission::ExecuteWorkflows)
    }

    /// Check if a member can export activity logs
    pub fn can_export_activity(member: &TeamMember) -> bool {
        Self::has_permission(member, Permission::ExportActivity)
    }

    /// Get permission description
    pub fn get_permission_description(permission: Permission) -> &'static str {
        use Permission::*;

        match permission {
            ViewResources => "View team resources",
            CreateResources => "Create new resources",
            ModifyResources => "Modify existing resources",
            DeleteResources => "Delete resources",
            ShareResources => "Share resources with team",

            ViewMembers => "View team members",
            InviteMembers => "Invite new members",
            RemoveMembers => "Remove team members",
            ModifyMemberRoles => "Change member roles",

            ViewTeamSettings => "View team settings",
            ModifyTeamSettings => "Modify team settings",
            DeleteTeam => "Delete the team",

            ViewAutomations => "View automations",
            RunAutomations => "Run automations",
            CreateAutomations => "Create new automations",
            ModifyAutomations => "Modify automations",
            DeleteAutomations => "Delete automations",

            ViewWorkflows => "View workflows",
            CreateWorkflows => "Create new workflows",
            ModifyWorkflows => "Modify workflows",
            DeleteWorkflows => "Delete workflows",
            ExecuteWorkflows => "Execute workflows",

            ViewBilling => "View billing information",
            ManageBilling => "Manage billing and subscriptions",

            ViewActivity => "View activity logs",
            ExportActivity => "Export activity data",
        }
    }

    /// Get role description
    pub fn get_role_description(role: TeamRole) -> &'static str {
        match role {
            TeamRole::Owner => {
                "Full access to all team features including billing and team deletion"
            }
            TeamRole::Admin => {
                "Manage members, settings, and all resources except billing and team deletion"
            }
            TeamRole::Editor => "Create and modify resources, run workflows and automations",
            TeamRole::Viewer => "View-only access to team resources",
        }
    }

    /// Check if role A can modify role B
    pub fn can_modify_role(actor_role: TeamRole, target_role: TeamRole) -> bool {
        match actor_role {
            TeamRole::Owner => true, // Owner can modify any role
            TeamRole::Admin => target_role != TeamRole::Owner, // Admin cannot modify owner
            TeamRole::Editor | TeamRole::Viewer => false, // Cannot modify roles
        }
    }

    /// Check if role A can remove role B
    pub fn can_remove_role(actor_role: TeamRole, target_role: TeamRole) -> bool {
        match actor_role {
            TeamRole::Owner => target_role != TeamRole::Owner, // Cannot remove another owner
            TeamRole::Admin => matches!(target_role, TeamRole::Editor | TeamRole::Viewer),
            TeamRole::Editor | TeamRole::Viewer => false,
        }
    }
}

/// Resource permissions structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourcePermissions {
    pub can_view: bool,
    pub can_edit: bool,
    pub can_delete: bool,
    pub can_share: bool,
}

impl ResourcePermissions {
    /// Create permissions from team member
    pub fn from_member(member: &TeamMember) -> Self {
        Self {
            can_view: TeamPermissions::can_view_resource(member),
            can_edit: TeamPermissions::can_modify_resource(member),
            can_delete: TeamPermissions::can_delete_resource(member),
            can_share: TeamPermissions::can_share_resource(member),
        }
    }

    /// Check if member has full permissions
    pub fn has_full_access(&self) -> bool {
        self.can_view && self.can_edit && self.can_delete && self.can_share
    }

    /// Check if member has no permissions
    pub fn has_no_access(&self) -> bool {
        !self.can_view && !self.can_edit && !self.can_delete && !self.can_share
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_member(role: TeamRole) -> TeamMember {
        TeamMember {
            team_id: "team123".to_string(),
            user_id: "user123".to_string(),
            role,
            joined_at: 0,
            invited_by: None,
        }
    }

    #[test]
    fn test_owner_permissions() {
        let owner = create_member(TeamRole::Owner);

        assert!(TeamPermissions::can_delete_team(&owner));
        assert!(TeamPermissions::can_manage_billing(&owner));
        assert!(TeamPermissions::can_invite_member(&owner));
        assert!(TeamPermissions::can_modify_resource(&owner));
    }

    #[test]
    fn test_admin_permissions() {
        let admin = create_member(TeamRole::Admin);

        assert!(!TeamPermissions::can_delete_team(&admin));
        assert!(!TeamPermissions::can_manage_billing(&admin));
        assert!(TeamPermissions::can_invite_member(&admin));
        assert!(TeamPermissions::can_modify_resource(&admin));
    }

    #[test]
    fn test_editor_permissions() {
        let editor = create_member(TeamRole::Editor);

        assert!(!TeamPermissions::can_invite_member(&editor));
        assert!(TeamPermissions::can_modify_resource(&editor));
        assert!(!TeamPermissions::can_delete_resource(&editor));
        assert!(TeamPermissions::can_run_automation(&editor));
    }

    #[test]
    fn test_viewer_permissions() {
        let viewer = create_member(TeamRole::Viewer);

        assert!(TeamPermissions::can_view_resource(&viewer));
        assert!(!TeamPermissions::can_modify_resource(&viewer));
        assert!(!TeamPermissions::can_create_resource(&viewer));
        assert!(!TeamPermissions::can_run_automation(&viewer));
    }

    #[test]
    fn test_role_modification_rules() {
        assert!(TeamPermissions::can_modify_role(
            TeamRole::Owner,
            TeamRole::Admin
        ));
        assert!(!TeamPermissions::can_modify_role(
            TeamRole::Admin,
            TeamRole::Owner
        ));
        assert!(!TeamPermissions::can_modify_role(
            TeamRole::Editor,
            TeamRole::Viewer
        ));
    }

    #[test]
    fn test_resource_permissions() {
        let editor = create_member(TeamRole::Editor);
        let perms = ResourcePermissions::from_member(&editor);

        assert!(perms.can_view);
        assert!(perms.can_edit);
        assert!(!perms.can_delete);
        assert!(perms.can_share);
        assert!(!perms.has_full_access());
    }
}
