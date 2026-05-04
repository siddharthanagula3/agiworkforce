import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';
import { logSecurityEvent, logInvalidSignature, getClientIp } from '@/lib/security-audit';
import { withRateLimit } from '@/lib/rate-limit';
import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const WORKOS_WEBHOOK_SECRET = process.env['WORKOS_WEBHOOK_SECRET'];
const SUPABASE_URL = process.env['NEXT_PUBLIC_SUPABASE_URL'];
const SUPABASE_SERVICE_ROLE_KEY = process.env['SUPABASE_SERVICE_ROLE_KEY'];

if (!WORKOS_WEBHOOK_SECRET) {
  logger.error(
    'WorkOS webhook secret is not configured. Set WORKOS_WEBHOOK_SECRET in environment variables.',
  );
}

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  logger.error(
    'Supabase service role environment variables are missing. Directory sync webhook cannot operate.',
  );
}

const supabaseAdmin =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
      })
    : null;

// ---------------------------------------------------------------------------
// WorkOS webhook signature verification (HMAC-SHA256, no SDK required)
// WorkOS signs with: SHA256 HMAC of the raw body using the webhook secret.
// The signature is sent in the `workos-signature` header in the format:
//   t=<timestamp>, v1=<signature>
// ---------------------------------------------------------------------------

function verifyWorkOSSignature(
  rawBody: string,
  signatureHeader: string,
  secret: string,
  toleranceSeconds = 60,
): boolean {
  try {
    const parts = signatureHeader.split(',').reduce(
      (acc, part) => {
        const [key, value] = part.trim().split('=');
        if (key && value) {
          acc[key] = value;
        }
        return acc;
      },
      {} as Record<string, string>,
    );

    const timestamp = parts['t'];
    const expectedSig = parts['v1'];

    if (!timestamp || !expectedSig) {
      logger.warn({ signatureHeader }, 'WorkOS signature header missing t or v1 component');
      return false;
    }

    // Verify timestamp is within tolerance to prevent replay attacks
    // Reject non-numeric timestamps - parseInt('abc') returns NaN, which
    // makes NaN > threshold evaluate to false, bypassing the check.
    if (!/^\d+$/.test(timestamp)) {
      logger.warn({ timestamp }, 'WorkOS webhook timestamp is not a valid integer');
      return false;
    }
    const timestampMs = parseInt(timestamp, 10) * 1000;
    const now = Date.now();
    if (Math.abs(now - timestampMs) > toleranceSeconds * 1000) {
      logger.warn(
        { timestamp, now, toleranceSeconds },
        'WorkOS webhook timestamp outside tolerance window',
      );
      return false;
    }

    // Compute expected signature: HMAC-SHA256(secret, "timestamp.rawBody")
    const signedPayload = `${timestamp}.${rawBody}`;
    const computedSig = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');

    // Constant-time comparison to prevent timing attacks.
    // Explicit length check required before timingSafeEqual (which throws on length mismatch).
    const expectedBuf = Buffer.from(expectedSig, 'hex');
    const computedBuf = Buffer.from(computedSig, 'hex');
    if (expectedBuf.length !== computedBuf.length) {
      return false;
    }
    return crypto.timingSafeEqual(expectedBuf, computedBuf);
  } catch (err) {
    logger.error({ error: err }, 'Error verifying WorkOS webhook signature');
    return false;
  }
}

// ---------------------------------------------------------------------------
// WorkOS Directory Sync types (no SDK dependency)
// ---------------------------------------------------------------------------

interface WorkOSDirectoryUser {
  id: string;
  directory_id: string;
  idp_id: string;
  organization_id?: string;
  first_name: string;
  last_name: string;
  job_title?: string;
  emails: Array<{ primary: boolean; type: string; value: string }>;
  username?: string;
  groups?: Array<{ id: string; name: string }>;
  state: 'active' | 'inactive';
  custom_attributes?: Record<string, unknown>;
  raw_attributes?: Record<string, unknown>;
  department?: string;
}

interface WorkOSDirectoryGroup {
  id: string;
  directory_id: string;
  idp_id: string;
  name: string;
  organization_id?: string;
}

interface WorkOSWebhookEvent {
  id: string;
  event: string;
  data: Record<string, unknown>;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Helper: extract primary email from WorkOS user
// ---------------------------------------------------------------------------

function getPrimaryEmail(user: WorkOSDirectoryUser): string | null {
  const primary = user.emails?.find((e) => e.primary);
  return primary?.value ?? user.emails?.[0]?.value ?? null;
}

// ---------------------------------------------------------------------------
// Helper: build display name
// ---------------------------------------------------------------------------

function buildDisplayName(user: WorkOSDirectoryUser): string {
  const parts = [user.first_name, user.last_name].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : (user.username ?? 'Unknown User');
}

// ---------------------------------------------------------------------------
// Helper: resolve organization for a directory
// ---------------------------------------------------------------------------

async function resolveOrganization(
  directoryId: string,
): Promise<{ organizationId: string; connectionId: string } | null> {
  if (!supabaseAdmin) return null;

  const { data, error } = await supabaseAdmin
    .from('directory_sync_connections')
    .select('id, organization_id')
    .eq('directory_id', directoryId)
    .eq('is_active', true)
    .single();

  if (error || !data) {
    logger.warn({ directoryId, error }, 'No active directory sync connection found');
    return null;
  }

  return { organizationId: data.organization_id, connectionId: data.id };
}

// ---------------------------------------------------------------------------
// Event Handlers
// ---------------------------------------------------------------------------

/**
 * dsync.user.created - Create a Supabase auth user and profile, then
 * add them to the organization associated with the directory.
 */
async function handleUserCreated(user: WorkOSDirectoryUser, request: Request): Promise<void> {
  if (!supabaseAdmin) throw new Error('Supabase admin client not initialized');

  const rawEmail = getPrimaryEmail(user);
  if (!rawEmail) {
    logger.error({ workosUserId: user.id }, 'SCIM user.created missing email - skipping');
    return;
  }
  // Normalize to lowercase - email local parts are case-insensitive in practice (RFC 5321)
  const email = rawEmail.toLowerCase();

  const displayName = buildDisplayName(user);
  const orgInfo = await resolveOrganization(user.directory_id);

  // Check if a Supabase auth user with this email already exists.
  // First check our profiles table (fast indexed query), then fall back to
  // paginated listUsers() if needed (e.g., auth user exists but profile doesn't).
  let existingUser: { id: string; email?: string } | undefined;

  const { data: existingProfile } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (existingProfile) {
    existingUser = { id: existingProfile.id, email };
  } else {
    // Profile not found -- search auth.users with pagination in case
    // an auth user exists without a corresponding profile row.
    const PER_PAGE = 50;
    let page = 1;
    let searchDone = false;
    while (!searchDone) {
      const { data: pageData } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage: PER_PAGE,
      });
      const users = pageData?.users ?? [];
      const match = users.find((u) => u.email === email);
      if (match) {
        existingUser = { id: match.id, email: match.email };
        searchDone = true;
      } else if (users.length < PER_PAGE) {
        // Last page reached, user not found
        searchDone = true;
      } else {
        page++;
      }
    }
  }

  let userId: string;

  if (existingUser) {
    userId = existingUser.id;
    logger.info(
      { userId, email, workosUserId: user.id },
      'SCIM user.created - existing auth user found, updating profile',
    );
  } else {
    // Create new Supabase auth user (no password - enterprise users authenticate via SSO)
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        display_name: displayName,
        provisioning_source: 'scim',
      },
    });

    if (createError) {
      logger.error(
        { error: createError, email, workosUserId: user.id },
        'Failed to create Supabase auth user via SCIM',
      );
      throw createError;
    }

    userId = newUser.user.id;
    logger.info(
      { userId, email, workosUserId: user.id },
      'SCIM user.created - new auth user created',
    );
  }

  // Upsert profile with SCIM fields
  const { error: profileError } = await supabaseAdmin.from('profiles').upsert(
    {
      id: userId,
      email,
      display_name: displayName,
      external_id: user.id,
      provisioning_source: 'scim',
      provisioned_at: new Date().toISOString(),
      department: user.department ?? null,
      job_title: user.job_title ?? null,
      account_status: 'active',
    },
    { onConflict: 'id' },
  );

  if (profileError) {
    logger.error({ error: profileError, userId }, 'Failed to upsert SCIM profile');
    throw profileError;
  }

  // Add user to the organization if a directory connection exists
  if (orgInfo) {
    const { error: memberError } = await supabaseAdmin.from('organization_members').upsert(
      {
        organization_id: orgInfo.organizationId,
        user_id: userId,
        role: 'member',
        provisioned_at: new Date().toISOString(),
        provisioning_source: 'scim',
      },
      { onConflict: 'organization_id,user_id' },
    );

    if (memberError) {
      logger.error(
        { error: memberError, userId, organizationId: orgInfo.organizationId },
        'Failed to add SCIM user to organization',
      );
      // Non-fatal - user is created, membership can be retried
    }

    // Update last_sync_at on the directory connection
    await supabaseAdmin
      .from('directory_sync_connections')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('id', orgInfo.connectionId);
  }

  await logSecurityEvent({
    userId,
    eventType: 'admin_action',
    severity: 'low',
    ipAddress: getClientIp(request),
    endpoint: '/api/webhooks/directory-sync',
    details: {
      action: 'scim_user_created',
      workosUserId: user.id,
      email,
      directoryId: user.directory_id,
      organizationId: orgInfo?.organizationId,
    },
  });
}

/**
 * dsync.user.updated - Update profile attributes from the directory.
 */
async function handleUserUpdated(user: WorkOSDirectoryUser, request: Request): Promise<void> {
  if (!supabaseAdmin) throw new Error('Supabase admin client not initialized');

  const email = getPrimaryEmail(user);
  const displayName = buildDisplayName(user);

  // Find user by external_id first (most reliable), then by email
  let userId: string | null = null;

  const { data: profileByExtId } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('external_id', user.id)
    .maybeSingle();

  if (profileByExtId) {
    userId = profileByExtId.id;
  } else if (email) {
    const { data: profileByEmail } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle();
    userId = profileByEmail?.id ?? null;
  }

  if (!userId) {
    logger.warn(
      { workosUserId: user.id, email },
      'SCIM user.updated - profile not found, ignoring',
    );
    return;
  }

  // Build update payload (only set fields that are present)
  const updates: Record<string, unknown> = {
    external_id: user.id,
    updated_at: new Date().toISOString(),
  };

  if (email) updates['email'] = email;
  if (displayName) updates['display_name'] = displayName;
  if (user.department !== undefined) updates['department'] = user.department;
  if (user.job_title !== undefined) updates['job_title'] = user.job_title;

  // If the directory reports the user as inactive, disable the account
  if (user.state === 'inactive') {
    updates['account_status'] = 'disabled';
  }

  const { error: updateError } = await supabaseAdmin
    .from('profiles')
    .update(updates)
    .eq('id', userId);

  if (updateError) {
    logger.error({ error: updateError, userId }, 'Failed to update profile via SCIM');
    throw updateError;
  }

  // Also update the auth user email if it changed
  if (email) {
    try {
      await supabaseAdmin.auth.admin.updateUserById(userId, { email });
    } catch (authUpdateErr) {
      logger.warn(
        { error: authUpdateErr, userId, email },
        'Failed to update auth user email via SCIM (non-fatal)',
      );
    }
  }

  logger.info({ userId, workosUserId: user.id, email }, 'SCIM user.updated processed');

  await logSecurityEvent({
    userId,
    eventType: 'admin_action',
    severity: 'low',
    ipAddress: getClientIp(request),
    endpoint: '/api/webhooks/directory-sync',
    details: {
      action: 'scim_user_updated',
      workosUserId: user.id,
      email,
      fieldsUpdated: Object.keys(updates),
    },
  });
}

/**
 * dsync.user.deleted - Disable the account (soft-delete; preserves data).
 */
async function handleUserDeleted(user: WorkOSDirectoryUser, request: Request): Promise<void> {
  if (!supabaseAdmin) throw new Error('Supabase admin client not initialized');

  const email = getPrimaryEmail(user);

  // Find the user by external_id or email
  let userId: string | null = null;

  const { data: profileByExtId } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('external_id', user.id)
    .maybeSingle();

  if (profileByExtId) {
    userId = profileByExtId.id;
  } else if (email) {
    const { data: profileByEmail } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle();
    userId = profileByEmail?.id ?? null;
  }

  if (!userId) {
    logger.warn(
      { workosUserId: user.id, email },
      'SCIM user.deleted - profile not found, ignoring',
    );
    return;
  }

  // Soft-disable: set account_status to 'disabled' (preserves data, blocks login)
  const { error: updateError } = await supabaseAdmin
    .from('profiles')
    .update({
      account_status: 'disabled',
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (updateError) {
    logger.error({ error: updateError, userId }, 'Failed to disable user via SCIM');
    throw updateError;
  }

  // Also ban the Supabase auth user to prevent any auth bypass
  try {
    await supabaseAdmin.auth.admin.updateUserById(userId, {
      ban_duration: '876600h', // ~100 years
    });
  } catch (banErr) {
    logger.warn(
      { error: banErr, userId },
      'Failed to ban auth user via SCIM delete (non-fatal, middleware handles account_status)',
    );
  }

  logger.info({ userId, workosUserId: user.id, email }, 'SCIM user.deleted - account disabled');

  await logSecurityEvent({
    userId,
    eventType: 'admin_action',
    severity: 'high',
    ipAddress: getClientIp(request),
    endpoint: '/api/webhooks/directory-sync',
    details: {
      action: 'scim_user_deprovisioned',
      workosUserId: user.id,
      email,
      directoryId: user.directory_id,
    },
  });
}

/**
 * dsync.group.user_added - Add user to an organization with a default role.
 */
async function handleGroupUserAdded(
  data: { user: WorkOSDirectoryUser; group: WorkOSDirectoryGroup },
  request: Request,
): Promise<void> {
  if (!supabaseAdmin) throw new Error('Supabase admin client not initialized');

  const { user, group } = data;
  const email = getPrimaryEmail(user);
  const orgInfo = await resolveOrganization(group.directory_id);

  if (!orgInfo) {
    logger.warn(
      { directoryId: group.directory_id, groupId: group.id },
      'SCIM group.user_added - no directory connection found',
    );
    return;
  }

  // Find the user
  let userId: string | null = null;

  const { data: profileByExtId } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('external_id', user.id)
    .maybeSingle();

  if (profileByExtId) {
    userId = profileByExtId.id;
  } else if (email) {
    const { data: profileByEmail } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle();
    userId = profileByEmail?.id ?? null;
  }

  if (!userId) {
    logger.warn(
      { workosUserId: user.id, email, groupId: group.id },
      'SCIM group.user_added - user not found in profiles, ignoring',
    );
    return;
  }

  // Map group name to role via exact-match allowlists (env-var driven, not substring)
  // SCIM_ADMIN_GROUP_NAMES: comma-separated exact group names that grant admin role (default: "Admins")
  // SCIM_VIEWER_GROUP_NAMES: comma-separated exact group names that grant viewer role (default: "Viewers,ReadOnly")
  const adminGroups = (process.env['SCIM_ADMIN_GROUP_NAMES'] ?? 'Admins')
    .split(',')
    .map((g) => g.trim().toLowerCase())
    .filter(Boolean);
  const viewerGroups = (process.env['SCIM_VIEWER_GROUP_NAMES'] ?? 'Viewers,ReadOnly')
    .split(',')
    .map((g) => g.trim().toLowerCase())
    .filter(Boolean);
  // Canonicalize and sanitize group name before role mapping.
  // Reject names with special chars to prevent role-mapping confusion.
  const groupNameLower = group.name.trim().toLowerCase();
  if (!/^[a-zA-Z0-9_\- ]+$/.test(group.name.trim())) {
    logger.warn(
      { groupName: group.name, userId },
      'Skipping role mapping for group with non-alphanumeric name',
    );
    return;
  }
  let role: 'owner' | 'admin' | 'member' | 'viewer' = 'member';
  if (adminGroups.includes(groupNameLower)) {
    role = 'admin';
  } else if (viewerGroups.includes(groupNameLower)) {
    role = 'viewer';
  }

  const { error: memberError } = await supabaseAdmin.from('organization_members').upsert(
    {
      organization_id: orgInfo.organizationId,
      user_id: userId,
      role,
      provisioned_at: new Date().toISOString(),
      provisioning_source: 'scim',
    },
    { onConflict: 'organization_id,user_id' },
  );

  if (memberError) {
    logger.error(
      { error: memberError, userId, organizationId: orgInfo.organizationId, groupId: group.id },
      'Failed to add user to organization via SCIM group',
    );
    throw memberError;
  }

  logger.info(
    { userId, organizationId: orgInfo.organizationId, groupId: group.id, role },
    'SCIM group.user_added - user added to organization',
  );

  await logSecurityEvent({
    userId,
    eventType: 'admin_action',
    severity: 'low',
    ipAddress: getClientIp(request),
    endpoint: '/api/webhooks/directory-sync',
    details: {
      action: 'scim_group_user_added',
      workosUserId: user.id,
      groupId: group.id,
      groupName: group.name,
      role,
      organizationId: orgInfo.organizationId,
    },
  });
}

/**
 * dsync.group.user_removed - Remove user from organization.
 */
async function handleGroupUserRemoved(
  data: { user: WorkOSDirectoryUser; group: WorkOSDirectoryGroup },
  request: Request,
): Promise<void> {
  if (!supabaseAdmin) throw new Error('Supabase admin client not initialized');

  const { user, group } = data;
  const email = getPrimaryEmail(user);
  const orgInfo = await resolveOrganization(group.directory_id);

  if (!orgInfo) {
    logger.warn(
      { directoryId: group.directory_id, groupId: group.id },
      'SCIM group.user_removed - no directory connection found',
    );
    return;
  }

  // Find the user
  let userId: string | null = null;

  const { data: profileByExtId } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('external_id', user.id)
    .maybeSingle();

  if (profileByExtId) {
    userId = profileByExtId.id;
  } else if (email) {
    const { data: profileByEmail } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle();
    userId = profileByEmail?.id ?? null;
  }

  if (!userId) {
    logger.warn(
      { workosUserId: user.id, email, groupId: group.id },
      'SCIM group.user_removed - user not found, ignoring',
    );
    return;
  }

  const { error: deleteError } = await supabaseAdmin
    .from('organization_members')
    .delete()
    .eq('organization_id', orgInfo.organizationId)
    .eq('user_id', userId);

  if (deleteError) {
    logger.error(
      { error: deleteError, userId, organizationId: orgInfo.organizationId },
      'Failed to remove user from organization via SCIM group',
    );
    throw deleteError;
  }

  logger.info(
    { userId, organizationId: orgInfo.organizationId, groupId: group.id },
    'SCIM group.user_removed - user removed from organization',
  );

  await logSecurityEvent({
    userId,
    eventType: 'admin_action',
    severity: 'medium',
    ipAddress: getClientIp(request),
    endpoint: '/api/webhooks/directory-sync',
    details: {
      action: 'scim_group_user_removed',
      workosUserId: user.id,
      groupId: group.id,
      groupName: group.name,
      organizationId: orgInfo.organizationId,
    },
  });
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  // Rate limit: generous limit for webhook traffic to prevent DDoS, while still
  // allowing burst delivery from WorkOS. HMAC signature verification provides the
  // primary authentication layer; rate limiting adds a secondary abuse-prevention layer.
  const rateLimitResponse = await withRateLimit(request, 'default');
  if (rateLimitResponse) return rateLimitResponse;

  if (!WORKOS_WEBHOOK_SECRET) {
    logger.error('WorkOS webhook secret not configured');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  if (!supabaseAdmin) {
    logger.error('Supabase admin client not configured');
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  // -- 1. Read raw body for signature verification ---
  const rawBody = await request.text();
  const signatureHeader = request.headers.get('workos-signature');

  if (!signatureHeader) {
    logger.error('Missing WorkOS signature header');
    await logInvalidSignature(request, 'workos_directory_sync');
    return NextResponse.json({ error: 'Missing signature' }, { status: 401 });
  }

  // -- 2. Verify HMAC-SHA256 signature ---
  const isValid = verifyWorkOSSignature(rawBody, signatureHeader, WORKOS_WEBHOOK_SECRET);
  if (!isValid) {
    logger.error('WorkOS webhook signature verification failed');
    await logInvalidSignature(request, 'workos_directory_sync');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // -- 3. Parse the payload ---
  let event: WorkOSWebhookEvent;
  try {
    event = JSON.parse(rawBody) as WorkOSWebhookEvent;
  } catch {
    logger.error('Failed to parse WorkOS webhook payload');
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  logger.info(
    { eventId: event.id, eventType: event.event },
    'WorkOS directory sync webhook received',
  );

  // -- 4. Idempotency check ---
  const { data: existingEvent } = await supabaseAdmin
    .from('directory_sync_events')
    .select('id')
    .eq('event_id', event.id)
    .maybeSingle();

  if (existingEvent) {
    logger.warn(
      { eventId: event.id },
      'WorkOS directory sync event already processed (idempotent skip)',
    );
    return NextResponse.json({ received: true, message: 'Event already processed' });
  }

  // -- 5. Record the event before processing (claim it) ---
  const eventData = event.data as Record<string, unknown>;
  const directoryId =
    (eventData['directory_id'] as string) ??
    ((eventData['user'] as Record<string, unknown> | undefined)?.['directory_id'] as string) ??
    ((eventData['group'] as Record<string, unknown> | undefined)?.['directory_id'] as string) ??
    'unknown';

  const { error: insertError } = await supabaseAdmin.from('directory_sync_events').insert({
    event_id: event.id,
    event_type: event.event,
    directory_id: directoryId,
    payload: event.data,
  });

  if (insertError) {
    // If insert fails due to unique constraint, another instance already claimed it.
    // Check both the Postgres error code and message text as a fallback (some drivers
    // normalise or omit the code field).
    if (
      insertError.code === '23505' ||
      insertError.message?.includes('unique') ||
      insertError.message?.includes('duplicate key')
    ) {
      logger.warn(
        { eventId: event.id },
        'WorkOS event claimed by concurrent instance (idempotent skip)',
      );
      return NextResponse.json({ received: true, message: 'Event already processed' });
    }
    logger.error(
      { error: insertError, eventId: event.id },
      'Failed to record directory sync event',
    );
    return NextResponse.json({ error: 'Failed to record event' }, { status: 500 });
  }

  // -- 6. Route to the correct handler ---
  try {
    switch (event.event) {
      case 'dsync.user.created': {
        const user = event.data as unknown as WorkOSDirectoryUser;
        await handleUserCreated(user, request);
        break;
      }

      case 'dsync.user.updated': {
        const user = event.data as unknown as WorkOSDirectoryUser;
        await handleUserUpdated(user, request);
        break;
      }

      case 'dsync.user.deleted': {
        const user = event.data as unknown as WorkOSDirectoryUser;
        await handleUserDeleted(user, request);
        break;
      }

      case 'dsync.group.user_added': {
        const payload = event.data as unknown as {
          user: WorkOSDirectoryUser;
          group: WorkOSDirectoryGroup;
        };
        await handleGroupUserAdded(payload, request);
        break;
      }

      case 'dsync.group.user_removed': {
        const payload = event.data as unknown as {
          user: WorkOSDirectoryUser;
          group: WorkOSDirectoryGroup;
        };
        await handleGroupUserRemoved(payload, request);
        break;
      }

      default:
        logger.info(
          { eventType: event.event, eventId: event.id },
          'Unhandled WorkOS directory sync event type - acknowledged',
        );
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error(
      {
        error: errorMessage,
        stack: err instanceof Error ? err.stack : undefined,
        eventId: event.id,
        eventType: event.event,
      },
      'Error processing WorkOS directory sync event',
    );

    // Return 500 so WorkOS retries the webhook
    return NextResponse.json({ error: `Webhook handler failed: ${errorMessage}` }, { status: 500 });
  }

  // Update last_sync_at on the directory connection
  if (directoryId !== 'unknown') {
    await supabaseAdmin
      .from('directory_sync_connections')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('directory_id', directoryId)
      .eq('is_active', true);
  }

  logger.info(
    { eventId: event.id, eventType: event.event },
    'WorkOS directory sync event processed successfully',
  );

  return NextResponse.json({ received: true });
}
