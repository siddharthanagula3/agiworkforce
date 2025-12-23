use crate::features::teams::{TeamMember, TeamRole};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Permission {
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
}

pub struct TeamPermissions;

impl TeamPermissions {
    pub fn has_permission(member: &TeamMember, permission: Permission) -> bool {
        match member.role {
            TeamRole::Owner => Self::owner_permissions(permission),
            TeamRole::Admin => Self::admin_permissions(permission),
            TeamRole::Editor => Self::editor_permissions(permission),
            TeamRole::Viewer => Self::viewer_permissions(permission),
        }
    }

    pub fn has_all_permissions(member: &TeamMember, permissions: &[Permission]) -> bool {
        permissions.iter().all(|p| Self::has_permission(member, *p))
    }

    pub fn has_any_permission(member: &TeamMember, permissions: &[Permission]) -> bool {
        permissions.iter().any(|p| Self::has_permission(member, *p))
    }

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

    fn owner_permissions(_permission: Permission) -> bool {
        true
    }

    fn admin_permissions(permission: Permission) -> bool {
        use Permission::*;

        !matches!(permission, DeleteTeam | ManageBilling)
    }

    fn editor_permissions(permission: Permission) -> bool {
        use Permission::*;

        match permission {
            ViewResources | ViewMembers | ViewTeamSettings | ViewActivity => true,

            CreateResources | ModifyResources | ShareResources => true,

            ViewAutomations | RunAutomations | CreateAutomations | ModifyAutomations => true,

            ViewWorkflows | CreateWorkflows | ModifyWorkflows | ExecuteWorkflows => true,

            DeleteResources | InviteMembers | RemoveMembers | ModifyMemberRoles => false,

            ModifyTeamSettings | DeleteTeam => false,

            DeleteAutomations | DeleteWorkflows => false,

            ViewBilling | ManageBilling => false,

            ExportActivity => false,
        }
    }

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

    pub fn can_view_resource(member: &TeamMember) -> bool {
        Self::has_permission(member, Permission::ViewResources)
    }

    pub fn can_create_resource(member: &TeamMember) -> bool {
        Self::has_permission(member, Permission::CreateResources)
    }

    pub fn can_modify_resource(member: &TeamMember) -> bool {
        Self::has_permission(member, Permission::ModifyResources)
    }

    pub fn can_delete_resource(member: &TeamMember) -> bool {
        Self::has_permission(member, Permission::DeleteResources)
    }

    pub fn can_share_resource(member: &TeamMember) -> bool {
        Self::has_permission(member, Permission::ShareResources)
    }

    pub fn can_invite_member(member: &TeamMember) -> bool {
        Self::has_permission(member, Permission::InviteMembers)
    }

    pub fn can_remove_member(member: &TeamMember) -> bool {
        Self::has_permission(member, Permission::RemoveMembers)
    }

    pub fn can_modify_member_role(member: &TeamMember) -> bool {
        Self::has_permission(member, Permission::ModifyMemberRoles)
    }

    pub fn can_manage_billing(member: &TeamMember) -> bool {
        Self::has_permission(member, Permission::ManageBilling)
    }

    pub fn can_delete_team(member: &TeamMember) -> bool {
        Self::has_permission(member, Permission::DeleteTeam)
    }

    pub fn can_modify_team_settings(member: &TeamMember) -> bool {
        Self::has_permission(member, Permission::ModifyTeamSettings)
    }

    pub fn can_run_automation(member: &TeamMember) -> bool {
        Self::has_permission(member, Permission::RunAutomations)
    }

    pub fn can_execute_workflow(member: &TeamMember) -> bool {
        Self::has_permission(member, Permission::ExecuteWorkflows)
    }

    pub fn can_export_activity(member: &TeamMember) -> bool {
        Self::has_permission(member, Permission::ExportActivity)
    }

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

    pub fn can_modify_role(actor_role: TeamRole, target_role: TeamRole) -> bool {
        match actor_role {
            TeamRole::Owner => true,
            TeamRole::Admin => target_role != TeamRole::Owner,
            TeamRole::Editor | TeamRole::Viewer => false,
        }
    }

    pub fn can_remove_role(actor_role: TeamRole, target_role: TeamRole) -> bool {
        match actor_role {
            TeamRole::Owner => target_role != TeamRole::Owner,
            TeamRole::Admin => matches!(target_role, TeamRole::Editor | TeamRole::Viewer),
            TeamRole::Editor | TeamRole::Viewer => false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourcePermissions {
    pub can_view: bool,
    pub can_edit: bool,
    pub can_delete: bool,
    pub can_share: bool,
}

impl ResourcePermissions {
    pub fn from_member(member: &TeamMember) -> Self {
        Self {
            can_view: TeamPermissions::can_view_resource(member),
            can_edit: TeamPermissions::can_modify_resource(member),
            can_delete: TeamPermissions::can_delete_resource(member),
            can_share: TeamPermissions::can_share_resource(member),
        }
    }

    pub fn has_full_access(&self) -> bool {
        self.can_view && self.can_edit && self.can_delete && self.can_share
    }

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
