-- Reversal of 0188 : drop the proved-repository set on a GitHub installation.
--
-- WHAT THIS COSTS: the record of which repositories each linking account proved
-- it can reach. Reapplying 0188 leaves every existing row null, so those
-- installations list and clone nothing until their owner reconnects.
--
-- ROLLBACK ORDER matters. Application code that predates the drop selects and
-- writes this column, so the connect flow and the repository listing fail until
-- that code is rolled back too. Roll the deployment back first, then run this.

begin;

alter table public.github_installations
  drop column if exists verified_repositories;

delete from public.schema_migrations
  where filename = '0188_github_installation_verified_repositories.sql';

commit;
