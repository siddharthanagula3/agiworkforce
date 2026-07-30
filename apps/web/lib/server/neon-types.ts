export type ProfileRow = {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  stripe_customer_id: string | null;
  routing_preferences: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type SubscriptionRow = {
  id: string;
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  plan_tier: string;
  status: string;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
  stripe_coupon_id: string | null;
  /** StoreKit's stable subscription identifier (migration 0046). */
  apple_original_transaction_id: string | null;
  /** Play Billing's durable purchase token (migration 0046). */
  google_purchase_token: string | null;
  updated_at: string;
};

export type CreditAccountRow = {
  id: string;
  user_id: string;
  subscription_id: string | null;
  period_start: string;
  period_end: string;
  credits_allocated_cents: number;
  credits_used_cents: number;
  flagship_daily_cap_cents: number;
  flagship_used_today_cents: number;
  flagship_cap_reset_date: string | null;
  created_at: string;
  updated_at: string;
};

export type CreditTransactionRow = {
  id: string;
  user_id: string;
  credit_account_id: string;
  transaction_type: string;
  amount_cents: number;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export type ApiKeyRow = {
  id: string;
  user_id: string;
  name: string;
  key_hash: string;
  key_prefix: string;
  scopes: string[];
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

export type ProjectRow = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  instructions: string | null;
  color: string | null;
  is_archived: boolean;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type ProjectKnowledgeFileRow = {
  id: string;
  project_id: string;
  file_name: string;
  mime_type: string | null;
  byte_count: number;
  checksum_sha256: string | null;
  summary: string | null;
  source_surface: string | null;
  added_by_user_id: string | null;
  storage_uri: string | null;
  created_at: string;
  updated_at: string;
};

export type TeamRow = {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  created_at: string;
  updated_at: string;
};

export type TeamMemberRow = {
  id: string;
  team_id: string;
  user_id: string;
  email: string | null;
  name: string | null;
  role: 'admin' | 'editor' | 'viewer';
  joined_at: string;
};

export type OrganizationRow = {
  id: string;
  name: string;
  slug: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type OrganizationMemberRow = {
  organization_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  provisioning_source: string | null;
  provisioned_at: string | null;
  joined_at: string;
};

export type ConnectorToolPermissionRow = {
  id: string;
  user_id: string;
  connector_id: string;
  tool_name: string;
  level: 'always-allow' | 'needs-approval' | 'blocked';
  destructive: boolean;
  updated_at: string;
};

export type ScheduledTaskRow = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  schedule_type: string;
  cron_expression: string | null;
  execute_at: string | null;
  interval_ms: number | null;
  timezone: string;
  is_enabled: boolean;
  action_type: string;
  action_config: Record<string, unknown> | null;
  prompt: string | null;
  model: string | null;
  status: string;
  last_executed_at: string | null;
  next_execution_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ScheduleRunRow = {
  id: string;
  task_id: string;
  status: string;
  trigger_source: string;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  result: Record<string, unknown> | null;
  error: string | null;
};

export type UserMemoryRow = {
  id: string;
  user_id: string;
  content: string;
  category: string | null;
  source: string | null;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
};

export type ArtifactRow = {
  id: string;
  conversation_id: string;
  user_id: string;
  title: string | null;
  content: string;
  artifact_type: string;
  language: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type WaitlistRow = {
  id: string;
  user_id: string | null;
  email: string | null;
  plan: string | null;
  billing_interval: string | null;
  source: string | null;
  status: string;
  joined_at: string | null;
  updated_at: string | null;
  created_at: string;
};

export type BetaInviteRow = {
  id: string;
  code: string;
  max_uses: number;
  current_uses: number;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
  created_by: string | null;
  metadata: Record<string, unknown> | null;
};

export type BetaRedemptionRow = {
  id: string;
  invite_id: string;
  user_id: string;
  redeemed_at: string;
  surface: string | null;
  source: string | null;
};

export type SecurityAuditLogRow = {
  id: string;
  user_id: string | null;
  event_type: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  ip_address: string | null;
  user_agent: string | null;
  endpoint: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
};

export type NotificationRow = {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  link: string | null;
  is_read: boolean;
  created_at: string;
};

export type DeviceAuthorizationCodeRow = {
  id: string;
  device_id: string;
  device_name: string | null;
  device_type: string | null;
  user_code: string;
  user_id: string | null;
  user_email: string | null;
  status: string;
  expires_at: string;
  created_at: string;
  updated_at: string;
};

export type ProcessedStripeEventRow = {
  event_id: string;
  processed_at: string;
};

export type UsageEventRow = {
  id: string;
  user_id: string;
  event_type: string;
  quantity: number | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export type GitHubInstallationRow = {
  id: string;
  user_id: string;
  installation_id: number;
  account_login: string;
  account_type: string;
  ownership_verified_at: string | null;
  pr_review_enabled: boolean;
  review_model: string | null;
  created_at: string;
};

export type FeedbackRow = {
  id: string;
  user_id: string | null;
  subject: string | null;
  message: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export type FeatureFlagRow = {
  id: string;
  user_id: string;
  flag_name: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type ReferralRow = {
  id: string;
  referrer_id: string;
  referral_code: string;
  referred_email: string | null;
  referred_user_id: string | null;
  status: string;
  reward_type: string | null;
  reward_amount: number | null;
  created_at: string;
};

export type EmailPreferenceRow = {
  id: string;
  user_id: string | null;
  email: string;
  marketing_emails: boolean;
  product_updates: boolean;
  security_alerts: boolean;
  weekly_digest: boolean;
  unsubscribe_token: string;
  unsubscribed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SSOConnectionRow = {
  id: string;
  organization_id: string;
  provider: string;
  domain: string;
  metadata_url: string | null;
  metadata_xml: string | null;
  entity_id: string | null;
  sso_url: string | null;
  certificate: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ReleaseRow = {
  id: string;
  version: string;
  platform: string;
  download_url: string;
  notes: string | null;
  pub_date: string;
  file_size_bytes: number | null;
  is_critical: boolean;
  is_prerelease: boolean;
  created_at: string;
};

export type SharedConversationRow = {
  id: string;
  token: string;
  messages_json: string;
  title: string | null;
  expires_at: string | null;
  created_at: string;
};

export type DirectorySyncConnectionRow = {
  id: string;
  organization_id: string;
  provider: string;
  directory_id: string;
  display_name: string | null;
  is_active: boolean;
  last_sync_at: string | null;
  created_at: string;
  updated_at: string;
};

export type DirectorySyncEventRow = {
  id: string;
  connection_id: string;
  event_type: string;
  user_email: string | null;
  raw_payload: Record<string, unknown> | null;
  processed_at: string | null;
  error: string | null;
  created_at: string;
};

export type GitHubPrReviewAttemptRow = {
  id: string;
  installation_id: number;
  pr_number: number;
  repo_owner: string;
  repo_name: string;
  status: string;
  attempted_at: string;
  completed_at: string | null;
  tokens_used: number | null;
};
