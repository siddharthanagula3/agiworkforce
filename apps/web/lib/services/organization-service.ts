/**
 * @file organization-service.ts
 *
 * # Client injection contract (WEB-RLS-BYPASS mitigation)
 *
 * All methods are USER-CONTEXT and accept a `client: SupabaseClient` parameter.
 * Callers pass `getUserClient(jwt)` from `@/lib/supabase-server`.
 * RLS policies enforce organization membership visibility and mutability.
 *
 * Never add a private `getSupabaseClient()` here. See lib/services/README.md.
 */
import 'server-only';

import { type SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';
import { Organization, OrganizationMember } from '@/types/saas';

export class OrganizationService {
  /**
   * Create a new organization.
   * USER-CONTEXT: caller passes an RLS-bound SupabaseClient so inserts are
   * authorized as the authenticated user. RLS policies enforce that only
   * authenticated users can create organizations.
   */
  static async createOrganization(
    client: SupabaseClient,
    userId: string,
    name: string,
    slug: string,
  ): Promise<Organization> {
    // 1. Create Org
    const { data: org, error: orgError } = await client
      .from('organizations')
      .insert({
        name,
        slug,
        created_by: userId,
      })
      .select()
      .single();

    if (orgError) {
      logger.error({ error: orgError, userId, name }, 'Failed to create organization');
      throw orgError;
    }

    // 2. Add creator as Owner
    const { error: memberError } = await client.from('organization_members').insert({
      organization_id: org.id,
      user_id: userId,
      role: 'owner',
    });

    if (memberError) {
      logger.error({ error: memberError, orgId: org.id }, 'Failed to add owner to organization');

      // Cleanup: Delete the orphaned organization
      const { error: cleanupError } = await client.from('organizations').delete().eq('id', org.id);

      if (cleanupError) {
        logger.error(
          { error: cleanupError, orgId: org.id },
          'Failed to cleanup orphaned organization after member add failure',
        );
      } else {
        logger.info({ orgId: org.id }, 'Cleaned up orphaned organization after member add failure');
      }

      throw memberError;
    }

    return org as Organization;
  }

  /**
   * Get user's organizations.
   * USER-CONTEXT: caller passes an RLS-bound SupabaseClient so only organizations
   * the authenticated user is a member of are returned.
   */
  static async getUserOrganizations(
    client: SupabaseClient,
    userId: string,
  ): Promise<Organization[]> {
    const { data, error } = await client
      .from('organization_members')
      .select(
        `
        organization:organizations (*)
      `,
      )
      .eq('user_id', userId);

    if (error) {
      logger.error({ error, userId }, 'Failed to fetch user organizations');
      throw error;
    }

    // Flatten structure - Supabase returns { organization: Organization }[]
    // The nested select returns the organization object directly
    // Use unknown first to handle Supabase's generic return type
    return (data as unknown as { organization: Organization | null }[])
      .map((d) => d.organization)
      .filter((org): org is Organization => org !== null);
  }

  /**
   * Get members of an organization.
   * USER-CONTEXT: caller passes an RLS-bound SupabaseClient so only members
   * of organizations the authenticated user can access are returned.
   */
  static async getOrganizationMembers(
    client: SupabaseClient,
    orgId: string,
  ): Promise<OrganizationMember[]> {
    // SEV-WEB-08 / WEB-31 (audit 2026-05-19): explicit column list matching
    // the OrganizationMember type. The previous `select('*, profile:profiles(...)')`
    // returned every column on organization_members (including internal flags /
    // metadata columns) to any caller — even role='viewer' members. RLS doesn't
    // help because the service-role client bypasses it. Listing only the
    // columns the UI needs limits the blast radius of any future column added
    // with sensitive semantics (e.g. invitation tokens, mfa state, etc.).
    const { data, error } = await client
      .from('organization_members')
      .select(
        `
        organization_id,
        user_id,
        role,
        joined_at,
        profile:profiles (
          email,
          display_name,
          avatar_url
        )
      `,
      )
      .eq('organization_id', orgId);

    if (error) {
      logger.error({ error, orgId }, 'Failed to fetch organization members');
      throw error;
    }

    // Supabase's generated PostgrestResponse types model FK joins as arrays
    // even when the relationship is single-row. Cast through unknown to bridge
    // the structural mismatch — runtime shape is consistent with
    // OrganizationMember thanks to the column-by-column select above.
    return data as unknown as OrganizationMember[];
  }

  /**
   * Add member to organization.
   * USER-CONTEXT: caller passes an RLS-bound SupabaseClient so the insert
   * is authorized as the authenticated user. RLS policies enforce that only
   * org admins/owners can add members.
   */
  static async addMember(
    client: SupabaseClient,
    orgId: string,
    userId: string,
    role: 'admin' | 'member' | 'viewer',
  ): Promise<void> {
    const { error } = await client.from('organization_members').insert({
      organization_id: orgId,
      user_id: userId,
      role,
    });

    if (error) {
      logger.error({ error, orgId, userId }, 'Failed to add member');
      throw error;
    }
  }

  /**
   * Remove member.
   * USER-CONTEXT: caller passes an RLS-bound SupabaseClient so the delete
   * is authorized as the authenticated user. RLS policies enforce that only
   * org admins/owners can remove members.
   */
  static async removeMember(client: SupabaseClient, orgId: string, userId: string): Promise<void> {
    const { error } = await client
      .from('organization_members')
      .delete()
      .eq('organization_id', orgId)
      .eq('user_id', userId);

    if (error) {
      logger.error({ error, orgId, userId }, 'Failed to remove member');
      throw error;
    }
  }
}
