begin;

alter table public.organization_admin_api_keys
  drop constraint if exists organization_admin_api_keys_scopes_check;

alter table public.organization_service_principals
  drop constraint if exists organization_service_principals_max_scopes_check;

update public.organization_admin_api_keys api_key
   set scopes = array(
         select distinct coalesce(alias.legacy_key, granted.scope)
           from unnest(api_key.scopes) as granted(scope)
           left join public.organization_permission_aliases alias
             on alias.canonical_key = granted.scope
          where coalesce(alias.legacy_key, granted.scope) = any (array[
            'content.read', 'content.share', 'content.govern', 'sharing.manage',
            'members.manage', 'owners.manage', 'roles.manage', 'groups.manage',
            'policy.manage', 'identity.read', 'identity.manage', 'directory.manage',
            'audit.read', 'billing.read', 'workspace.settings'
          ]::text[])
          order by 1
       );

update public.organization_service_principals principal
   set max_scopes = array(
         select distinct coalesce(alias.legacy_key, granted.scope)
           from unnest(principal.max_scopes) as granted(scope)
           left join public.organization_permission_aliases alias
             on alias.canonical_key = granted.scope
          where coalesce(alias.legacy_key, granted.scope) = any (array[
            'content.read', 'content.share', 'content.govern', 'sharing.manage',
            'members.manage', 'owners.manage', 'roles.manage', 'groups.manage',
            'policy.manage', 'identity.read', 'identity.manage', 'directory.manage',
            'audit.read', 'billing.read', 'workspace.settings'
          ]::text[])
          order by 1
       );

delete from public.organization_service_principals
 where cardinality(max_scopes) = 0;

delete from public.organization_admin_api_keys
 where cardinality(scopes) = 0;

alter table public.organization_admin_api_keys
  add constraint organization_admin_api_keys_scopes_check check (
    cardinality(scopes) between 1 and 16
    and scopes <@ array[
      'content.read', 'content.share', 'content.govern', 'sharing.manage',
      'members.manage', 'owners.manage', 'roles.manage', 'groups.manage',
      'policy.manage', 'identity.read', 'identity.manage', 'directory.manage',
      'audit.read', 'billing.read', 'workspace.settings'
    ]::text[]
  );

alter table public.organization_service_principals
  add constraint organization_service_principals_max_scopes_check check (
    cardinality(max_scopes) between 1 and 16
    and max_scopes <@ array[
      'content.read', 'content.share', 'content.govern', 'sharing.manage',
      'members.manage', 'owners.manage', 'roles.manage', 'groups.manage',
      'policy.manage', 'identity.read', 'identity.manage', 'directory.manage',
      'audit.read', 'billing.read', 'workspace.settings'
    ]::text[]
  );

delete from public.schema_migrations
 where filename = '0302_workspace_api_key_namespaced_scopes.sql';

commit;
