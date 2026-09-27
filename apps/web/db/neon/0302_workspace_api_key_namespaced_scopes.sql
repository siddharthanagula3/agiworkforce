begin;

alter table public.organization_admin_api_keys
  drop constraint if exists organization_admin_api_keys_scopes_check;

alter table public.organization_admin_api_keys
  add constraint organization_admin_api_keys_scopes_check check (
    cardinality(scopes) between 1 and 16
    and scopes <@ array[
      'content.read', 'content.share', 'content.govern', 'sharing.manage',
      'members.manage', 'owners.manage', 'roles.manage', 'groups.manage',
      'policy.manage', 'identity.read', 'identity.manage', 'directory.manage',
      'audit.read', 'billing.read', 'workspace.settings',
      'feature.content.view', 'feature.content.share', 'feature.content.govern',
      'feature.sharing.manage',
      'admin.members.view', 'admin.members.manage',
      'admin.owners.view', 'admin.owners.manage',
      'admin.roles.view', 'admin.roles.manage',
      'admin.groups.view', 'admin.groups.manage',
      'admin.policy.view', 'admin.policy.manage',
      'admin.identity.view', 'admin.identity.manage',
      'admin.directory.view', 'admin.directory.manage',
      'admin.audit.view', 'admin.audit.manage',
      'admin.billing.view', 'admin.billing.manage',
      'admin.workspace.view', 'admin.workspace.manage',
      'admin.ownership.view', 'admin.lifecycle.view', 'admin.contracts.view'
    ]::text[]
  );

alter table public.organization_service_principals
  drop constraint if exists organization_service_principals_max_scopes_check;

alter table public.organization_service_principals
  add constraint organization_service_principals_max_scopes_check check (
    cardinality(max_scopes) between 1 and 16
    and max_scopes <@ array[
      'content.read', 'content.share', 'content.govern', 'sharing.manage',
      'members.manage', 'owners.manage', 'roles.manage', 'groups.manage',
      'policy.manage', 'identity.read', 'identity.manage', 'directory.manage',
      'audit.read', 'billing.read', 'workspace.settings',
      'feature.content.view', 'feature.content.share', 'feature.content.govern',
      'feature.sharing.manage',
      'admin.members.view', 'admin.members.manage',
      'admin.owners.view', 'admin.owners.manage',
      'admin.roles.view', 'admin.roles.manage',
      'admin.groups.view', 'admin.groups.manage',
      'admin.policy.view', 'admin.policy.manage',
      'admin.identity.view', 'admin.identity.manage',
      'admin.directory.view', 'admin.directory.manage',
      'admin.audit.view', 'admin.audit.manage',
      'admin.billing.view', 'admin.billing.manage',
      'admin.workspace.view', 'admin.workspace.manage',
      'admin.ownership.view', 'admin.lifecycle.view', 'admin.contracts.view'
    ]::text[]
  );

commit;
