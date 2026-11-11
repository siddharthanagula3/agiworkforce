-- Reversal of 0413: drop the writable-repository set on a GitHub installation.
--
-- WHAT THIS COSTS: the record of which repositories each linking account can
-- push to. Reapplying 0413 leaves every existing row null, so those
-- installations cannot push or open pull requests until their owner reconnects
-- GitHub.
--
-- ROLLBACK ORDER matters. Application code that predates the drop selects and
-- writes this column, so the connect flow and every GitHub lookup fail until
-- that code is rolled back too. Roll the deployment back first, then run this.
-- Rolling the code back also removes the push and pull-request write check.

begin;

alter table public.github_installations
  drop column if exists writable_repositories;

delete from public.schema_migrations
 where filename = '0413_github_installation_writable_repositories.sql';

commit;
