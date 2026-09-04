-- Reversal of 0167, drop ip_allow_list and fold any surviving values back into metadata.
--
-- After this, resolveIpAllowListPolicy and the policy service go back to
-- reading and writing metadata->'ipAllowList', so this restores that key
-- before the column is dropped rather than losing whatever was saved there.

begin;

update public.organization_admin_policies
   set metadata = metadata || jsonb_build_object(
         'ipAllowList',
         to_jsonb(ip_allow_list)
       )
 where ip_allow_list <> '{}'::text[];

alter table public.organization_admin_policies
  drop column if exists ip_allow_list;

delete from public.schema_migrations
 where filename = '0167_organization_ip_allow_list_column.sql';

commit;
