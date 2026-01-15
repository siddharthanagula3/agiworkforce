-- 20260115100000_release_management.sql
-- Release management tables for desktop app distribution

-- =============================================================================
-- 1. Releases Table - Stores release information for each platform
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.releases (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  version text NOT NULL,
  platform text NOT NULL CHECK (platform IN (
    'darwin-aarch64',
    'darwin-x86_64',
    'darwin-universal',
    'windows-x86_64',
    'linux-x86_64'
  )),
  download_url text NOT NULL,
  signature text NOT NULL,
  notes text,
  pub_date timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  file_size_bytes bigint,
  sha256_hash text,
  min_os_version text,
  is_prerelease boolean DEFAULT false,
  is_critical boolean DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT releases_pkey PRIMARY KEY (id),
  CONSTRAINT releases_version_platform_unique UNIQUE (version, platform)
);

-- Index for efficient latest version lookup
CREATE INDEX IF NOT EXISTS idx_releases_platform_pub_date
  ON public.releases(platform, pub_date DESC);

-- Index for version lookups
CREATE INDEX IF NOT EXISTS idx_releases_version
  ON public.releases(version);

-- =============================================================================
-- 2. Release Downloads Table - Analytics for download tracking
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.release_downloads (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  release_id uuid NOT NULL,
  ip_hash text NOT NULL,
  user_agent text,
  country_code text,
  region text,
  referrer text,
  downloaded_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT release_downloads_pkey PRIMARY KEY (id),
  CONSTRAINT release_downloads_release_id_fkey FOREIGN KEY (release_id)
    REFERENCES public.releases(id) ON DELETE CASCADE
);

-- Index for analytics queries by release
CREATE INDEX IF NOT EXISTS idx_release_downloads_release_id
  ON public.release_downloads(release_id);

-- Index for time-based analytics
CREATE INDEX IF NOT EXISTS idx_release_downloads_downloaded_at
  ON public.release_downloads(downloaded_at DESC);

-- Composite index for deduplication checks
CREATE INDEX IF NOT EXISTS idx_release_downloads_release_ip
  ON public.release_downloads(release_id, ip_hash);

-- =============================================================================
-- 3. Release Channels Table - Support for beta/stable/nightly channels
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.release_channels (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE CHECK (name IN ('stable', 'beta', 'nightly', 'canary')),
  description text,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT release_channels_pkey PRIMARY KEY (id)
);

-- Insert default channels
INSERT INTO public.release_channels (name, description) VALUES
  ('stable', 'Production-ready releases for all users'),
  ('beta', 'Pre-release builds for beta testers'),
  ('nightly', 'Daily development builds'),
  ('canary', 'Cutting-edge builds with latest features')
ON CONFLICT (name) DO NOTHING;

-- Add channel reference to releases
ALTER TABLE public.releases
  ADD COLUMN IF NOT EXISTS channel text DEFAULT 'stable'
  CHECK (channel IN ('stable', 'beta', 'nightly', 'canary'));

-- Index for channel-based queries
CREATE INDEX IF NOT EXISTS idx_releases_channel
  ON public.releases(channel);

-- =============================================================================
-- 4. Row Level Security Policies
-- =============================================================================

-- Releases RLS - Public read, service role write
ALTER TABLE public.releases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view releases"
  ON public.releases FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Service role manages releases"
  ON public.releases FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Release Downloads RLS - Service role only (contains IP hashes)
ALTER TABLE public.release_downloads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages release downloads"
  ON public.release_downloads FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Release Channels RLS - Public read, service role write
ALTER TABLE public.release_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view release channels"
  ON public.release_channels FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Service role manages release channels"
  ON public.release_channels FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- 5. Helper Functions
-- =============================================================================

-- Get latest release for a platform and channel
CREATE OR REPLACE FUNCTION public.get_latest_release(
  p_platform text,
  p_channel text DEFAULT 'stable'
)
RETURNS TABLE (
  id uuid,
  version text,
  platform text,
  download_url text,
  signature text,
  notes text,
  pub_date timestamp with time zone,
  file_size_bytes bigint,
  is_critical boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.id,
    r.version,
    r.platform,
    r.download_url,
    r.signature,
    r.notes,
    r.pub_date,
    r.file_size_bytes,
    r.is_critical
  FROM public.releases r
  WHERE r.platform = p_platform
    AND r.channel = p_channel
    AND r.is_prerelease = false
  ORDER BY r.pub_date DESC
  LIMIT 1;
END;
$$;

-- Record a download (with IP hashing for privacy)
CREATE OR REPLACE FUNCTION public.record_release_download(
  p_release_id uuid,
  p_ip_address text,
  p_user_agent text DEFAULT NULL,
  p_country_code text DEFAULT NULL,
  p_region text DEFAULT NULL,
  p_referrer text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ip_hash text;
  v_download_id uuid;
BEGIN
  -- Hash IP address for privacy (one-way hash)
  v_ip_hash := encode(digest(p_ip_address || 'agiworkforce-salt', 'sha256'), 'hex');

  -- Insert download record
  INSERT INTO public.release_downloads (
    release_id,
    ip_hash,
    user_agent,
    country_code,
    region,
    referrer
  ) VALUES (
    p_release_id,
    v_ip_hash,
    p_user_agent,
    p_country_code,
    p_region,
    p_referrer
  )
  RETURNING id INTO v_download_id;

  RETURN v_download_id;
END;
$$;

-- Get download statistics for a release
CREATE OR REPLACE FUNCTION public.get_release_download_stats(
  p_release_id uuid
)
RETURNS TABLE (
  total_downloads bigint,
  unique_downloads bigint,
  downloads_today bigint,
  downloads_this_week bigint,
  downloads_this_month bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::bigint AS total_downloads,
    COUNT(DISTINCT rd.ip_hash)::bigint AS unique_downloads,
    COUNT(*) FILTER (WHERE rd.downloaded_at >= CURRENT_DATE)::bigint AS downloads_today,
    COUNT(*) FILTER (WHERE rd.downloaded_at >= CURRENT_DATE - INTERVAL '7 days')::bigint AS downloads_this_week,
    COUNT(*) FILTER (WHERE rd.downloaded_at >= CURRENT_DATE - INTERVAL '30 days')::bigint AS downloads_this_month
  FROM public.release_downloads rd
  WHERE rd.release_id = p_release_id;
END;
$$;

-- Get overall download statistics
CREATE OR REPLACE FUNCTION public.get_overall_download_stats()
RETURNS TABLE (
  total_downloads bigint,
  unique_users bigint,
  downloads_today bigint,
  downloads_this_week bigint,
  downloads_this_month bigint,
  top_platform text,
  top_platform_downloads bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN QUERY
  WITH stats AS (
    SELECT
      COUNT(*)::bigint AS total_downloads,
      COUNT(DISTINCT rd.ip_hash)::bigint AS unique_users,
      COUNT(*) FILTER (WHERE rd.downloaded_at >= CURRENT_DATE)::bigint AS downloads_today,
      COUNT(*) FILTER (WHERE rd.downloaded_at >= CURRENT_DATE - INTERVAL '7 days')::bigint AS downloads_this_week,
      COUNT(*) FILTER (WHERE rd.downloaded_at >= CURRENT_DATE - INTERVAL '30 days')::bigint AS downloads_this_month
    FROM public.release_downloads rd
  ),
  platform_stats AS (
    SELECT
      r.platform,
      COUNT(*)::bigint AS download_count
    FROM public.release_downloads rd
    JOIN public.releases r ON rd.release_id = r.id
    GROUP BY r.platform
    ORDER BY download_count DESC
    LIMIT 1
  )
  SELECT
    s.total_downloads,
    s.unique_users,
    s.downloads_today,
    s.downloads_this_week,
    s.downloads_this_month,
    COALESCE(p.platform, 'none')::text AS top_platform,
    COALESCE(p.download_count, 0)::bigint AS top_platform_downloads
  FROM stats s
  LEFT JOIN platform_stats p ON true;
END;
$$;

-- Upsert release (for CI/CD pipeline)
CREATE OR REPLACE FUNCTION public.upsert_release(
  p_version text,
  p_platform text,
  p_download_url text,
  p_signature text,
  p_notes text DEFAULT NULL,
  p_pub_date timestamp with time zone DEFAULT NOW(),
  p_file_size_bytes bigint DEFAULT NULL,
  p_sha256_hash text DEFAULT NULL,
  p_min_os_version text DEFAULT NULL,
  p_is_prerelease boolean DEFAULT false,
  p_is_critical boolean DEFAULT false,
  p_channel text DEFAULT 'stable'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_release_id uuid;
BEGIN
  INSERT INTO public.releases (
    version,
    platform,
    download_url,
    signature,
    notes,
    pub_date,
    file_size_bytes,
    sha256_hash,
    min_os_version,
    is_prerelease,
    is_critical,
    channel
  ) VALUES (
    p_version,
    p_platform,
    p_download_url,
    p_signature,
    p_notes,
    p_pub_date,
    p_file_size_bytes,
    p_sha256_hash,
    p_min_os_version,
    p_is_prerelease,
    p_is_critical,
    p_channel
  )
  ON CONFLICT (version, platform)
  DO UPDATE SET
    download_url = EXCLUDED.download_url,
    signature = EXCLUDED.signature,
    notes = COALESCE(EXCLUDED.notes, releases.notes),
    pub_date = EXCLUDED.pub_date,
    file_size_bytes = COALESCE(EXCLUDED.file_size_bytes, releases.file_size_bytes),
    sha256_hash = COALESCE(EXCLUDED.sha256_hash, releases.sha256_hash),
    min_os_version = COALESCE(EXCLUDED.min_os_version, releases.min_os_version),
    is_prerelease = EXCLUDED.is_prerelease,
    is_critical = EXCLUDED.is_critical,
    channel = EXCLUDED.channel,
    updated_at = NOW()
  RETURNING id INTO v_release_id;

  RETURN v_release_id;
END;
$$;

-- =============================================================================
-- 6. Cleanup Function for Old Download Records
-- =============================================================================

-- Cleanup old download records (keep 90 days of data)
CREATE OR REPLACE FUNCTION public.cleanup_old_download_records()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted_count integer;
BEGIN
  DELETE FROM public.release_downloads
  WHERE downloaded_at < NOW() - INTERVAL '90 days';

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  RETURN v_deleted_count;
END;
$$;
