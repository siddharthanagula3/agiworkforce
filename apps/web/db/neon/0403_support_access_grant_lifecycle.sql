-- =============================================================================
-- Migration 0403: an approved break-glass grant can be revoked and can expire
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- Why    : 0229 tied approval to status with an equivalence: a row is
--          'approved' exactly when approved_by_user_id, decided_at and
--          expires_at are all set. Revoking or expiring an approved grant
--          keeps those three fields as history, so both updates broke the
--          check and rolled back. An operator could not withdraw a live grant
--          before its expiry, and the expiry sweep could never write its
--          'expired' trail entry.
--
-- Shape  : The same constraint name, now per status. 'approved' and
--          'expired' need the complete approval. 'revoked' carries either no
--          approval (a pending request withdrawn) or the complete approval (a
--          live grant withdrawn), never a partial one. 'pending' and 'denied'
--          carry no approver and no expiry, as before. Approval history is
--          never cleared to satisfy the check.
--
-- Empty  : Every row the service could write under 0229 is admitted: pending,
--          denied (decided_at only), approved, and a pending request revoked.
--          A non-approved row holding a partial approval, which only a hand
--          edit could make, fails the add and stops the migration rather than
--          being rewritten. The table holds one small row per request.
--
-- Depends: 0229 (support_access_grants), 0291 (owner-only writes: apply as the
--          table owner)
-- =============================================================================

begin;

alter table public.support_access_grants
  drop constraint if exists support_access_grants_approval_is_complete;

alter table public.support_access_grants
  add constraint support_access_grants_approval_is_complete check (
    case status
      when 'approved' then
        approved_by_user_id is not null and decided_at is not null and expires_at is not null
      when 'expired' then
        approved_by_user_id is not null and decided_at is not null and expires_at is not null
      when 'revoked' then
        (approved_by_user_id is null and expires_at is null)
        or (approved_by_user_id is not null and decided_at is not null and expires_at is not null)
      else
        approved_by_user_id is null and expires_at is null
    end
  );

comment on constraint support_access_grants_approval_is_complete on public.support_access_grants is
  'Approved and expired grants carry the complete approval; a revoked grant carries none or all of it; pending and denied carry none.';

commit;

-- =============================================================================
-- VERIFICATION, run MANUALLY on a throwaway Neon BRANCH before production.
-- (Commented so it never runs during apply.)
-- =============================================================================
-- -- 1. A live grant is withdrawn and keeps its approval:
-- --    update public.support_access_grants
-- --       set status = 'revoked', revoked_at = now(), revoked_by_user_id = 'op'
-- --     where id = '<approved grant>';
-- --    EXPECT: one row, approved_by_user_id, decided_at and expires_at unchanged.
--
-- -- 2. A lapsed grant expires:
-- --    update public.support_access_grants set status = 'expired'
-- --     where id = '<approved grant past expires_at>';
-- --    EXPECT: one row.
--
-- -- 3. A pending request is withdrawn:
-- --    update public.support_access_grants
-- --       set status = 'revoked', revoked_at = now(), revoked_by_user_id = 'op'
-- --     where id = '<pending grant>';
-- --    EXPECT: one row.
--
-- -- 4. An approved grant without an expiry is still refused:
-- --    update public.support_access_grants set expires_at = null where status = 'approved';
-- --    EXPECT: check violation (support_access_grants_approval_is_complete).
