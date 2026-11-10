-- =============================================================================
-- Migration 0412: record which linked repositories the GitHub account can push to
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- Why    : Linking proved only that the GitHub account can SEE a repository
--          (0188). GitHub lists a repository to a user with read access too,
--          and an installation token with write scope acts with the App's
--          rights, not the user's. A read-only member could therefore link an
--          installation and have the product push or open pull requests with
--          the App's write credential.
--
-- Shape  : One nullable text[] on github_installations holding the lowercased
--          owner/name repositories whose `permissions` (from GET
--          /user/installations/{id}/repositories) grant push, maintain or
--          admin to the linking account, as of the last link. It is always a
--          subset of verified_repositories. Null means the link predates this
--          column: write-scoped tokens are refused until the owner reconnects
--          GitHub, which refreshes the set. An empty array means the account
--          can push nowhere through this installation.
--
-- Empty  : every existing row keeps null. Existing links must reconnect GitHub
--          before Code can push or open a pull request; cloning, listing and
--          reading are unaffected.
--
-- Depends: 0188 (github installation verified repositories)
-- =============================================================================

begin;

alter table public.github_installations
  add column if not exists writable_repositories text[];

comment on column public.github_installations.writable_repositories is
  'Lowercased owner/name repositories the linking account can push to through this installation, as of the last link. NULL means unproved: consumers must refuse write-scoped tokens rather than fall back to the full installation.';

commit;
