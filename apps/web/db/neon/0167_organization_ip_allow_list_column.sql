-- 0167 : move the organization ip allow list off jsonb metadata onto its own column.
--
-- NOT YET APPLIED, draft only, pending explicit approval before running.
--
-- ipAllowList shipped (d645b13e4, 6138a6a05, 358902da0) stored inside the
-- organization_admin_policies.metadata jsonb blob, the same place
-- secretHandling, requireMfa, monthlySpendCapCents and zeroDataRetentionOnly
-- live. Unlike those scalar toggles, an ip allow list is shaped like
-- allowed_privacy_modes and chat_sync_surfaces on this same table, a bounded
-- list an admin edits directly, so it gets the same treatment: a native
-- array column Postgres can type-check, rather than a free-form jsonb key
-- any future metadata write could clobber.
--
-- ip_allow_list carries every CIDR and bare address currently nested at
-- metadata->'ipAllowList' for a row that has one, then that key is stripped
-- from metadata so the list has exactly one source of truth going forward.
-- Rows with no such key get the column's own default, an empty array,
-- meaning unrestricted, matching how an absent key already read.

begin;

alter table public.organization_admin_policies
  add column if not exists ip_allow_list text[] not null default '{}'::text[];

update public.organization_admin_policies
   set ip_allow_list = coalesce(
         (select array_agg(entry)
            from jsonb_array_elements_text(metadata -> 'ipAllowList') as entry),
         '{}'::text[]
       )
 where metadata ? 'ipAllowList';

update public.organization_admin_policies
   set metadata = metadata - 'ipAllowList'
 where metadata ? 'ipAllowList';

comment on column public.organization_admin_policies.ip_allow_list is
  'IPv4/IPv6 CIDR ranges and bare addresses this workspace restricts authenticated requests to. Empty means unrestricted. Enforced in assertIpAllowList (apps/web/lib/ip-allow-list-gate.ts) at the api-auth boundary.';

commit;

-- =============================================================================
-- VERIFICATION : run MANUALLY on a throwaway Neon BRANCH before production.
-- (Commented so it never runs during apply.)
-- =============================================================================
-- -- 1. Every row that had a metadata ip allow list carried it across intact:
-- --    SELECT organization_id, ip_allow_list FROM public.organization_admin_policies
-- --     WHERE ip_allow_list <> '{}';                    -- EXPECT: matches the pre-migration count
--
-- -- 2. No row still carries the old metadata key:
-- --    SELECT count(*) FROM public.organization_admin_policies WHERE metadata ? 'ipAllowList';
-- --                                                              -- EXPECT: 0
-- =============================================================================
