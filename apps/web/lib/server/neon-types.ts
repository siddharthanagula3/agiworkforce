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
  apple_original_transaction_id: string | null;
  google_purchase_token: string | null;
  plan_catalog_version?: number | null;
  updated_at: string;
};

export type ApiKeyRow = {
  id: string;
  user_id: string;
  name: string;
  key_hash: string;
  key_prefix: string;
  scopes: string[];
  project_id?: string | null;
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

export type OrganizationRow = {
  id: string;
  name: string;
  slug: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type OrganizationSeatColumns = {
  owner_user_id: string | null;
  licensed_seats: number;
  licensed_premium_seats: number;
  seats_consumed: number;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
  billing_plan_tier: string | null;
  seat_billing_updated_at: string | null;
};

export type OrganizationMemberRow = {
  organization_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  provisioning_source: string | null;
  provisioned_at: string | null;
  joined_at: string;
};

export type OrganizationInvitationStatus =
  'pending' | 'accepted' | 'declined' | 'revoked' | 'expired';

export type OrganizationInvitationRow = {
  id: string;
  organization_id: string;
  email: string;
  role: 'admin' | 'member' | 'viewer';
  status: OrganizationInvitationStatus;
  token_hash: string;
  invited_by_user_id: string;
  accepted_by_user_id: string | null;
  expires_at: string;
  resent_at: string | null;
  resend_count: number;
  created_at: string;
  updated_at: string;
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

export type SSOConnectionRow = {
  id: string;
  organization_id: string;
  provider_type: 'saml' | 'oidc';
  domain: string;
  display_name: string | null;
  metadata_url: string | null;
  metadata_xml: string | null;
  attribute_mapping: Record<string, string>;
  created_by: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  clerk_connection_id: string | null;
  oidc_discovery_url: string | null;
  oidc_client_id: string | null;
  acs_url: string | null;
  sp_entity_id: string | null;
  sp_metadata_url: string | null;
  domain_verified_at: string | null;
  domain_verification_token: string | null;
  jit_provisioning_enabled: boolean;
  jit_default_role: 'member' | 'viewer';
};

export type ReleaseRow = {
  id: string;
  version: string;
  platform: string;
  download_url: string;
  signature: string | null;
  notes: string | null;
  pub_date: string;
  file_size_bytes: number | null;
  is_critical: boolean;
  is_prerelease: boolean;
  channel: 'stable' | 'beta' | 'nightly';
  created_at: string;
  updated_at: string;
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
  organization_id: string;
  event_type: string;
  user_email: string | null;
  raw_payload: Record<string, unknown> | null;
  processed_at: string | null;
  error: string | null;
  created_at: string;
};

export type ScimTokenRow = {
  id: string;
  connection_id: string;
  organization_id: string;
  name: string;
  token_prefix: string;
  token_hash: string;
  created_by_user_id: string;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ScimProvisionedUserRow = {
  id: string;
  connection_id: string;
  organization_id: string;
  external_id: string | null;
  user_name: string;
  email: string | null;
  given_name: string | null;
  family_name: string | null;
  display_name: string | null;
  active: boolean;
  linked_user_id: string | null;
  linked_at: string | null;
  raw_attributes: Record<string, unknown> | null;
  version: number;
  created_at: string;
  updated_at: string;
};

export type ScimGroupRow = {
  id: string;
  connection_id: string;
  organization_id: string;
  external_id: string | null;
  display_name: string;
  mapped_role: 'admin' | 'member' | 'viewer' | null;
  version: number;
  created_at: string;
  updated_at: string;
};

export type BillingCadence = 'annual' | 'quarterly';

export type OrganizationBillingContractRow = {
  organization_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_product_id: string;
  stripe_price_id: string | null;
  procurement_reference: string | null;
  customer_legal_entity: string | null;
  billing_contact_name: string | null;
  billing_contact_email: string | null;
  procurement_contact_name: string | null;
  procurement_contact_email: string | null;
  payment_terms_days: number | null;
  tax_exempt_status: 'none' | 'exempt' | 'reverse';
  contract_term_start: string | null;
  contract_term_end: string | null;
  billing_cadence: BillingCadence;
  committed_seats: number;
  included_usage_cents_per_period: number;
  overage_stripe_price_id: string | null;
  committed_usage_block_cents: number;
  minimum_annual_spend_cents: number;
  support_tier: string | null;
  oldest_open_invoice_id: string | null;
  oldest_open_invoice_due_at: string | null;
  collection_stage: 'current' | 'past_due_30' | 'past_due_60' | 'past_due_90' | 'read_only';
  collection_stage_changed_at: string | null;
  last_collection_notice_at: string | null;
  ended_at: string | null;
  metadata: Record<string, unknown>;
  last_stripe_event_at: string | null;
  created_at: string;
  updated_at: string;
};

export type OrganizationBillingInvoiceRow = {
  stripe_invoice_id: string;
  organization_id: string;
  stripe_subscription_id: string | null;
  invoice_number: string | null;
  status: string;
  collection_method: string | null;
  amount_due_cents: number;
  amount_paid_cents: number;
  currency: string;
  procurement_reference: string | null;
  period_start: string | null;
  period_end: string | null;
  due_at: string | null;
  paid_at: string | null;
  voided_at: string | null;
  hosted_invoice_url: string | null;
  invoice_pdf_url: string | null;
  last_stripe_event_at: string | null;
  created_at: string;
  updated_at: string;
};
