-- User-scoped catalog of AI-generated media (images, video). Generated artifacts
-- must persist across the cloud suite — web/desktop/mobile cloud all read by
-- user_id — and survive a refresh. The bytes live in object storage (Cloudflare
-- R2, via the S3 API — see lib/server/object-storage.ts; this comment said
-- "Vercel Blob" until 2026-07-27, but no such dependency has ever existed in
-- this repo); this table holds the durable URL + provenance so any surface can list,
-- preview, and re-use what the user created.

create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  kind text not null,                       -- 'image' | 'video'
  mime_type text not null,
  byte_size integer,
  storage_url text not null,                -- durable object-storage URL
  storage_pathname text,                    -- blob pathname (used for deletion)
  prompt text,
  provider text,
  model text,
  width integer,
  height integer,
  source_surface text,                      -- provenance: web | desktop | mobile cloud
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Library list query: WHERE user_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC
create index if not exists idx_media_assets_user_active
  on public.media_assets(user_id, created_at desc)
  where deleted_at is null;
