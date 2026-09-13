-- 0188 : record which repositories the linking account actually proved it can reach.
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- Ownership of an installation was proved by `GET /user/installations`, which
-- lists every installation the OAuth'd GitHub user can reach through ANY one
-- repository they can see. The row it wrote then granted a full-installation
-- credential: `GET /installation/repositories` and an installation access token
-- covering every repository the installation covers. A member with read access
-- to a single public repository in an organization could therefore link that
-- organization's installation and have the product list, clone and act on
-- private repositories they have no GitHub access to.
--
-- This column stores the `owner/name` set that `GET
-- /user/installations/{id}/repositories` returned for the linking account, and
-- every consumer filters to it. NULL means the link predates this check; those
-- installations list nothing until the account reconnects, because a null set
-- must not read as "everything". The set is refreshed on every relink, which is
-- also how a member who gains access to a new repository picks it up.

alter table public.github_installations
  add column if not exists verified_repositories text[];

comment on column public.github_installations.verified_repositories is
  'Lowercased owner/name repositories the linking account proved it can reach through this installation, as of the last link. NULL means unproved: consumers must list and clone nothing rather than falling back to the full installation.';
