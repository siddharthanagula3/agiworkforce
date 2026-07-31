-- Persist the stable/beta/nightly channel emitted by release-desktop.yml and
-- make every release lookup enforce the matching prerelease boundary.

alter table public.releases
  add column if not exists channel text;

update public.releases
set channel = case
  when is_prerelease = false then 'stable'
  when lower(split_part(split_part(version, '-', 2), '.', 1)) in ('alpha', 'nightly', 'canary')
    then 'nightly'
  else 'beta'
end
where channel is null or channel = 'stable';

alter table public.releases
  alter column channel set default 'stable',
  alter column channel set not null;

alter table public.releases
  drop constraint if exists releases_channel_check;

alter table public.releases
  add constraint releases_channel_check
  check (channel in ('stable', 'beta', 'nightly'));

create index if not exists releases_platform_channel_published_idx
  on public.releases(platform, channel, is_prerelease, pub_date desc);

create or replace function public.get_latest_release(
  p_platform text,
  p_channel text default 'stable'
)
returns table(
  id uuid,
  version text,
  platform text,
  download_url text,
  signature text,
  notes text,
  pub_date timestamptz,
  file_size_bytes bigint,
  is_critical boolean
)
language plpgsql
stable
as $$
begin
  if p_channel not in ('stable', 'beta', 'nightly') then
    raise exception 'unsupported desktop release channel: %', p_channel;
  end if;

  return query
    select
      r.id,
      r.version,
      r.platform,
      r.download_url,
      r.signature,
      r.notes,
      r.pub_date,
      r.file_size_bytes,
      r.is_critical
    from public.releases r
    where r.platform = p_platform
      and r.channel = p_channel
      and r.is_prerelease = (p_channel <> 'stable')
    order by r.pub_date desc
    limit 1;
end;
$$;

create or replace function public.upsert_release(
  p_version text,
  p_platform text,
  p_download_url text,
  p_signature text,
  p_notes text default null,
  p_pub_date timestamptz default now(),
  p_file_size_bytes bigint default null,
  p_sha256_hash text default null,
  p_min_os_version text default null,
  p_is_prerelease boolean default false,
  p_is_critical boolean default false,
  p_channel text default 'stable'
)
returns uuid
language plpgsql
as $$
declare
  v_release_id uuid;
begin
  if p_channel not in ('stable', 'beta', 'nightly') then
    raise exception 'unsupported desktop release channel: %', p_channel;
  end if;
  if p_is_prerelease <> (p_channel <> 'stable') then
    raise exception 'release prerelease flag does not match channel %', p_channel;
  end if;

  insert into public.releases (
    version, platform, download_url, signature, notes,
    pub_date, file_size_bytes, sha256_hash, min_os_version,
    is_prerelease, is_critical, channel
  ) values (
    p_version, p_platform, p_download_url, p_signature, p_notes,
    p_pub_date, p_file_size_bytes, p_sha256_hash, p_min_os_version,
    p_is_prerelease, p_is_critical, p_channel
  )
  on conflict (version, platform)
  do update set
    download_url = excluded.download_url,
    signature = excluded.signature,
    notes = coalesce(excluded.notes, releases.notes),
    pub_date = excluded.pub_date,
    file_size_bytes = coalesce(excluded.file_size_bytes, releases.file_size_bytes),
    sha256_hash = coalesce(excluded.sha256_hash, releases.sha256_hash),
    min_os_version = coalesce(excluded.min_os_version, releases.min_os_version),
    is_prerelease = excluded.is_prerelease,
    is_critical = excluded.is_critical,
    channel = excluded.channel,
    updated_at = now()
  returning id into v_release_id;

  return v_release_id;
end;
$$;
