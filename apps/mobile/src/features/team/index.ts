/**
 * team — the Cloud workspace this account belongs to, its members, and the
 * server-computed entitlement that decides whether they can be managed.
 */
export {
  WORKSPACE_ROLES,
  addWorkspaceMember,
  fetchWorkspaceMembers,
  fetchWorkspaceOverview,
  removeWorkspaceMember,
  updateWorkspaceMemberRole,
  type Workspace,
  type WorkspaceAccess,
  type WorkspaceMember,
  type WorkspaceOverview,
  type WorkspaceRole,
} from './service';
