-- =============================================================================
-- Migration 0243: a contract term has to run forwards
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- Why    : 0163 stores `contract_term_start` and `contract_term_end` as plain
--          `date` columns with nothing relating them. Both are written from
--          whatever the executed agreement or the Stripe subscription period
--          says, so a swapped pair, or an end equal to the start, is stored
--          without complaint and read back into the contract panel as a term
--          that ends before it begins. Every downstream figure derived from the
--          term, renewal date and remaining commitment included, is then wrong
--          in a way no reader can distinguish from a real term.
--
-- Null   : both columns stay nullable. A contract provisioned before its term
--          is countersigned genuinely has no dates yet, and the constraint only
--          relates them once both are present.
--
-- Overlap: there is deliberately no non-overlap constraint. 0163 makes
--          `organization_id` the PRIMARY KEY of
--          `organization_billing_contracts`, so one workspace holds exactly one
--          contract row and two terms can never coexist to overlap. A range
--          exclusion constraint here would guard a state the primary key
--          already makes unreachable.
--
-- Repair : the constraint is added NOT VALID and validated in a second step, so
--          existing rows do not block the apply. If validation fails, the rows
--          it names are genuinely inverted and have to be corrected against the
--          signed agreement, not by relaxing this.
--
-- Depends: 0163 (organization_billing_contracts)
-- =============================================================================

begin;

do $$
begin
  if to_regclass('public.organization_billing_contracts') is null then
    raise notice '0243: organization_billing_contracts absent, skipping term ordering';
    return;
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.organization_billing_contracts'::regclass
       and conname = 'organization_billing_contracts_term_runs_forwards'
  ) then
    alter table public.organization_billing_contracts
      add constraint organization_billing_contracts_term_runs_forwards
      check (
        contract_term_start is null
        or contract_term_end is null
        or contract_term_start < contract_term_end
      ) not valid;
  end if;
end $$;

commit;

begin;

do $$
begin
  if to_regclass('public.organization_billing_contracts') is not null then
    alter table public.organization_billing_contracts
      validate constraint organization_billing_contracts_term_runs_forwards;
  end if;
end $$;

commit;

-- =============================================================================
-- VERIFICATION, run MANUALLY on a throwaway Neon BRANCH before production.
-- (Commented so it never runs during apply.)
-- =============================================================================
-- -- 1. An inverted term is refused:
-- --    UPDATE public.organization_billing_contracts
-- --       SET contract_term_start = '2026-12-31', contract_term_end = '2026-01-01'
-- --     WHERE organization_id = '<org>';
-- --    EXPECT: check violation (organization_billing_contracts_term_runs_forwards).
--
-- -- 2. A zero-length term is refused, because a term that ends the day it
-- --    starts bills a period with no days in it:
-- --    Same UPDATE with both dates '2026-01-01'.
-- --    EXPECT: check violation.
--
-- -- 3. A contract that is not countersigned yet still writes:
-- --    Same UPDATE with both dates NULL.
-- --    EXPECT: 1 row updated.
--
-- -- 4. Find rows that would fail validation before applying:
-- --    SELECT organization_id, contract_term_start, contract_term_end
-- --      FROM public.organization_billing_contracts
-- --     WHERE contract_term_start >= contract_term_end;
-- --    EXPECT: 0 rows.
