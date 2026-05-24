create table if not exists public.user_id_mapping (
  clerk_id text primary key,
  supabase_uuid uuid unique not null,
  email text,
  mapped_at timestamptz not null default now()
);

create index if not exists idx_user_id_mapping_uuid
  on public.user_id_mapping(supabase_uuid);
create index if not exists idx_user_id_mapping_email
  on public.user_id_mapping(email);
