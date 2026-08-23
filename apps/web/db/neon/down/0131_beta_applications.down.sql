-- Reversal of 0131 — drop the beta application intake table.
--
-- WHAT THIS COSTS: every submitted application is destroyed, along with the
-- reviewer's decision, note and the promotion code issued against it. Codes
-- already handed out keep working — they live in public.beta_invites and in
-- Stripe — but the record of who asked, who approved them and why is gone and
-- cannot be reconstructed from the codes alone. Export the table before
-- running this if any application has been reviewed.

begin;

drop index if exists public.idx_beta_applications_status_created;

drop index if exists public.idx_beta_applications_email;

drop table if exists public.beta_applications;

delete from public.schema_migrations
 where filename = '0131_beta_applications.sql';

commit;
