-- =============================================================================
-- Migration 0422: chat file intakes, their preparations, and the scan verdict
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- Why    : a chat file above the inline limit is uploaded in parts to a
--          staging key, scanned by the scanner pulling it from storage, and
--          only then sealed into a media row. Every step of that is a
--          compare-and-set on one intake row, and the text read from a sealed
--          file is prepared in bounded batches whose progress is a second row.
--          Neither has anywhere to live today.
--
-- Shape  : chat_file_intakes is one row per upload, from create to a terminal
--          state, keyed by its staging key. chat_file_preparations is one row
--          per sealed media asset; media_asset_id goes null when the asset is
--          deleted so the derived objects it lists are still found and removed.
--          media_assets.scanned_sha256 records the hash the scanner's verdict
--          carried. An insert-only trigger refuses a chat-attachment media row
--          above the inline limit (26214400 bytes, the chat attachment policy
--          maxBytes) unless scanned_sha256 is set and equals content_sha256, so
--          no chat-attachment row that states a size above the limit is
--          inserted without a matching verdict. It fires on
--          insert only: updates of existing rows, a soft delete or the
--          conversation key set to null, are never checked, and every row an
--          older release inserts is at or under the limit.
--
-- Access : both tables are forced row level security with the tenant policy
--          every content table uses. app_rls selects, inserts and updates;
--          deletes run only on the owner connection (erasure and the sweeper).
--
-- Empty  : no existing row is rewritten. The new column is nullable with no
--          default, and both tables start empty.
--
-- Depends: 0036 (media_assets), 0037 (profiles, app_rls), 0015 (organizations),
--          0076 (set_row_updated_at), 0272 (app_row_is_visible,
--          app_row_is_writable), web_conversations
-- =============================================================================
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

create table public.chat_file_intakes (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles(id) on delete restrict,
  organization_id uuid references public.organizations(id) on delete restrict,
  conversation_id uuid references public.web_conversations(id) on delete set null,
  temporary_chat boolean not null default false,
  file_name text not null check (char_length(file_name) > 0),
  mime_type text not null check (char_length(mime_type) > 0),
  byte_count bigint not null check (byte_count > 0),
  declared_sha256 text not null check (declared_sha256 ~ '^[0-9a-f]{64}$'),
  staging_key text not null unique check (char_length(staging_key) > 0),
  multipart_upload_id text,
  part_bytes integer check (part_bytes is null or part_bytes > 0),
  state text not null default 'awaiting_parts' check (state in (
    'awaiting_parts', 'uploaded', 'inspecting', 'scanning', 'sealing',
    'sealed', 'rejected', 'failed', 'cancelled'
  )),
  refusal_code text check (refusal_code is null or refusal_code in (
    'malware', 'encrypted', 'limits_exceeded', 'active_pdf', 'type_mismatch',
    'denylist', 'dlp_blocked', 'checksum_mismatch', 'size_mismatch',
    'changed_during_check', 'storage_full'
  )),
  failure_code text check (failure_code is null or failure_code in ('scan_unavailable', 'stalled')),
  cancel_reason text check (cancel_reason is null or cancel_reason in ('client', 'idle')),
  attempts integer not null default 0 check (attempts >= 0),
  first_submitted_at timestamptz,
  scan_budget_wait_ms integer not null default 0 check (scan_budget_wait_ms >= 0),
  sealing_entered_at timestamptz,
  scan_job_id text,
  workflow_run_id text,
  etag text,
  media_asset_id uuid references public.media_assets(id) on delete set null,
  daily_bytes_charged bigint not null default 0 check (daily_bytes_charged >= 0),
  bytes_refunded_at timestamptz,
  lease_until timestamptz,
  last_part_request_at timestamptz,
  state_changed_at timestamptz not null default now(),
  objects_purged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chat_file_intakes_refusal_state check ((state = 'rejected') = (refusal_code is not null)),
  constraint chat_file_intakes_failure_state check ((state = 'failed') = (failure_code is not null)),
  constraint chat_file_intakes_cancel_state check ((state = 'cancelled') = (cancel_reason is not null))
);

create index chat_file_intakes_user_state_idx
  on public.chat_file_intakes (user_id, state);

create index chat_file_intakes_organization_idx
  on public.chat_file_intakes (organization_id);

create index chat_file_intakes_state_changed_idx
  on public.chat_file_intakes (state, state_changed_at);

create trigger chat_file_intakes_set_updated_at
  before update on public.chat_file_intakes
  for each row execute function public.set_row_updated_at();

create table public.chat_file_preparations (
  id uuid primary key default gen_random_uuid(),
  media_asset_id uuid unique references public.media_assets(id) on delete set null,
  user_id text not null references public.profiles(id) on delete restrict,
  organization_id uuid references public.organizations(id) on delete restrict,
  kind text not null check (kind ~ '^[a-z][a-z0-9_]{0,31}$'),
  state text not null default 'preparing' check (state in (
    'preparing', 'ready', 'ready_partial', 'prepare_failed'
  )),
  preparer_version integer not null check (preparer_version > 0),
  cursor jsonb not null default '{}'::jsonb check (jsonb_typeof(cursor) = 'object'),
  segments_ready integer not null default 0 check (segments_ready >= 0),
  pages_read integer not null default 0 check (pages_read >= 0),
  page_count integer check (page_count is null or page_count >= 0),
  sheet_count integer check (sheet_count is null or sheet_count >= 0),
  token_estimate bigint check (token_estimate is null or token_estimate >= 0),
  indexed_chars bigint not null default 0 check (indexed_chars >= 0),
  derived_keys text[] not null default '{}'::text[],
  coverage jsonb not null default '{}'::jsonb check (jsonb_typeof(coverage) = 'object'),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index chat_file_preparations_user_idx
  on public.chat_file_preparations (user_id);

create index chat_file_preparations_organization_idx
  on public.chat_file_preparations (organization_id);

create index chat_file_preparations_orphan_idx
  on public.chat_file_preparations (updated_at)
  where media_asset_id is null;

create trigger chat_file_preparations_set_updated_at
  before update on public.chat_file_preparations
  for each row execute function public.set_row_updated_at();

revoke all on public.chat_file_intakes from public, app_rls;
grant select, insert, update on public.chat_file_intakes to app_rls;
alter table public.chat_file_intakes enable row level security;
alter table public.chat_file_intakes force row level security;
create policy chat_file_intakes_tenant_isolation
  on public.chat_file_intakes for all to app_rls
  using (public.app_row_is_visible(user_id, organization_id))
  with check (public.app_row_is_writable(user_id, organization_id));

revoke all on public.chat_file_preparations from public, app_rls;
grant select, insert, update on public.chat_file_preparations to app_rls;
alter table public.chat_file_preparations enable row level security;
alter table public.chat_file_preparations force row level security;
create policy chat_file_preparations_tenant_isolation
  on public.chat_file_preparations for all to app_rls
  using (public.app_row_is_visible(user_id, organization_id))
  with check (public.app_row_is_writable(user_id, organization_id));

alter table public.media_assets add column scanned_sha256 text;

create function public.refuse_unscanned_large_chat_file()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.byte_size > 26214400
     and (new.metadata ->> 'source' = 'chat-attachment'
       or new.storage_pathname like 'chat-attachments/%')
     and (new.scanned_sha256 is null
       or new.content_sha256 is null
       or new.scanned_sha256 <> new.content_sha256) then
    raise exception 'A chat file above the inline limit needs a scan verdict that matches its content hash'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.refuse_unscanned_large_chat_file() from public, app_rls;

create trigger media_assets_refuse_unscanned_large_chat_file
  before insert on public.media_assets
  for each row execute function public.refuse_unscanned_large_chat_file();

comment on table public.chat_file_intakes is
  'One chat file upload above the inline limit, from create to a terminal state: its staging key, multipart upload, scan job, lease and the media asset its seal produced.';
comment on table public.chat_file_preparations is
  'Progress and derived object keys of the text prepared from one sealed chat file; survives its media asset (set null) until the sweeper deletes the derived objects.';
comment on column public.media_assets.scanned_sha256 is
  'SHA-256 the scanner verdict carried for a sealed chat file; a chat-attachment row above the inline limit is refused unless it equals content_sha256.';

commit;
