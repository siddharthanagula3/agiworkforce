-- =============================================================================
-- Migration 0220: customer-managed encryption keys, and the region a workspace
--                 is pinned to
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- Why    : Two rows a security review always reaches and this schema could not
--          answer: "can we hold the key?" and "can you keep our data in the
--          EU?". The key ring is a process-env value today and the deployment
--          has one database in one place, so both answers were no, and the
--          posture said so.
--
-- Keys   : `organization_encryption_keys` holds the WRAPPED data key for one
--          workspace, never the key that wraps it. The key-encryption key lives
--          in the customer's own AWS or GCP KMS and this deployment sees only
--          its name; opening anything sealed for that workspace requires their
--          KMS to answer. That is what makes revocation real: the customer
--          removes our grant and our ability to read ends, rather than
--          depending on us to delete something.
--
--          `retired_keys` carries previous versions so a rotation does not have
--          to rewrite every ciphertext before the new key takes over, which is
--          the same ring shape `apps/web/lib/crypto/envelope.ts` already uses.
--          A revoked row is kept, not deleted: the audit trail has to be able to
--          say which key a ciphertext was sealed under after the association is
--          gone.
--
--          A workspace with no row here stays on the platform root key with an
--          HKDF derivation per organization. That path is unchanged.
--
-- Region : `organizations.data_region` is the region the workspace's rows,
--          objects, logs, keys and inference are pinned to. Null means the home
--          region, which is what every existing workspace is in. The value is
--          checked against the regions the build declares rather than being
--          free text, so a row cannot name a region no code can resolve.
--
--          `data_region_requested` plus `data_region_requested_at` are the
--          migration path for a workspace already holding data: moving is a
--          copy, a verification and a cutover, not an UPDATE, so the request and
--          the effective region are separate columns and the request is cleared
--          by whoever completes the move. Setting `data_region` directly on a
--          workspace that holds rows would claim a residency the data does not
--          have.
--
-- RLS    : Owners and admins read their own workspace's key association. Nobody
--          writes it through the application role: rotation and revocation run
--          as the owner connection from an audited service, the same rule
--          0144 applies to the other governance tables. The wrapped key is
--          useless without the customer's KMS, but it is still key material and
--          a plain member has no reason to hold it.
--
-- Depends: 0015 (organizations), 0037 (app_rls), 0143 (set_row_updated_at)
-- =============================================================================

begin;

create table if not exists public.organization_encryption_keys (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('aws_kms', 'gcp_kms', 'local')),
  key_uri text not null check (char_length(key_uri) between 1 and 2048),
  key_region text not null check (char_length(key_region) between 1 and 64),
  status text not null default 'active' check (status in ('active', 'rotating', 'revoked')),
  key_version text not null check (key_version ~ '^[A-Za-z0-9_-]{1,32}$'),
  wrapped_data_key text not null check (wrapped_data_key ~ '^[A-Za-z0-9+/=_-]{1,8192}$'),
  retired_keys jsonb not null default '[]'::jsonb check (jsonb_typeof(retired_keys) = 'array'),
  last_rotated_at timestamptz,
  revoked_at timestamptz,
  created_by_user_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_encryption_keys_revocation_is_dated check (
    (status = 'revoked') = (revoked_at is not null)
  )
);

comment on table public.organization_encryption_keys is
  'One workspace''s customer-managed key association. Holds the wrapped data key and the name of the customer''s key-encryption key, never the key-encryption key itself.';
comment on column public.organization_encryption_keys.key_uri is
  'The key''s name in the customer''s own KMS: an AWS ARN or a GCP resource path. Not a secret, and useless without a grant on the customer''s account.';
comment on column public.organization_encryption_keys.retired_keys is
  'Previous wrapped data keys as [{"version","wrapped"}], so a ciphertext sealed before a rotation still opens. Retained on revocation so the trail can name the key a ciphertext used.';
comment on column public.organization_encryption_keys.status is
  'revoked means refuse: the app fails closed for this workspace rather than falling back to the platform key, which would defeat the point of the customer holding the key.';

drop trigger if exists set_organization_encryption_keys_updated_at
  on public.organization_encryption_keys;
create trigger set_organization_encryption_keys_updated_at
  before update on public.organization_encryption_keys
  for each row execute function public.set_row_updated_at();

grant select on public.organization_encryption_keys to app_rls;

alter table public.organization_encryption_keys enable row level security;
alter table public.organization_encryption_keys force row level security;

drop policy if exists organization_encryption_keys_admin_read
  on public.organization_encryption_keys;
create policy organization_encryption_keys_admin_read
  on public.organization_encryption_keys
  for select to app_rls
  using (
    exists (
      select 1 from public.organization_members m
       where m.organization_id = organization_encryption_keys.organization_id
         and m.user_id = public.current_app_user_id()
         and m.role in ('owner', 'admin')
    )
  );

alter table public.organizations
  add column if not exists data_region text
    check (data_region is null or data_region in ('us', 'eu')),
  add column if not exists data_region_requested text
    check (data_region_requested is null or data_region_requested in ('us', 'eu')),
  add column if not exists data_region_requested_at timestamptz;

comment on column public.organizations.data_region is
  'The region this workspace''s rows, objects, logs, keys and inference are pinned to. Null is the home region, which is where every workspace created before residency existed lives.';
comment on column public.organizations.data_region_requested is
  'A move this workspace has asked for and that has not completed. Moving is a copy and a cutover, so the request is recorded separately from the region the data is actually in.';

commit;

-- =============================================================================
-- VERIFICATION — run MANUALLY on a throwaway Neon BRANCH before production.
-- (Commented so it never runs during apply.)
-- =============================================================================
-- -- 1. A revoked row must carry its date:
-- --    INSERT INTO public.organization_encryption_keys
-- --      (organization_id, provider, key_uri, key_region, status, key_version,
-- --       wrapped_data_key, created_by_user_id)
-- --      VALUES ('<org>', 'aws_kms', 'arn:aws:kms:...', 'us-east-1', 'revoked', '1',
-- --              'AAAA', 'u');
-- --    EXPECT: check violation (revoked_at is null).
--
-- -- 2. A region this build does not declare cannot be stored:
-- --    UPDATE public.organizations SET data_region = 'ap-southeast' WHERE id = '<org>';
-- --    EXPECT: check violation.
--
-- -- 3. A plain member reads no key association:
-- --    SET ROLE app_rls;
-- --    SELECT set_config('app.user_id', '<member user id>', true);
-- --    SELECT count(*) FROM public.organization_encryption_keys;
-- --    EXPECT: 0.
--
-- -- 4. The application role cannot write one:
-- --    SET ROLE app_rls;
-- --    UPDATE public.organization_encryption_keys SET status = 'revoked';
-- --    EXPECT: permission denied (no UPDATE grant).
