import 'server-only';

import { createClient } from '@supabase/supabase-js';
import { requireEnv } from '@/utils/env';
import { logger } from '@/lib/logger';
import { Organization, OrganizationMember } from '@/types/saas';

function getSupabaseClient() {
  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });
}

export class OrganizationService {
  /**
   * Create a new organization
   */
  static async createOrganization(
    userId: string,
    name: string,
    slug: string,
  ): Promise<Organization> {
    const supabase = getSupabaseClient();

    // 1. Create Org
    const { data: org, error: orgError } = await supabase
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
    const { error: memberError } = await supabase.from('organization_members').insert({
      organization_id: org.id,
      user_id: userId,
      role: 'owner',
    });

    if (memberError) {
      logger.error({ error: memberError, orgId: org.id }, 'Failed to add owner to organization');

      // Cleanup: Delete the orphaned organization
      const { error: cleanupError } = await supabase
        .from('organizations')
        .delete()
        .eq('id', org.id);

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
   * Get user's organizations
   */
  static async getUserOrganizations(userId: string): Promise<Organization[]> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
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
   * Get members of an organization
   */
  static async getOrganizationMembers(orgId: string): Promise<OrganizationMember[]> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('organization_members')
      .select(
        `
        *,
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

    return data as OrganizationMember[];
  }

  /**
   * Add member to organization
   */
  static async addMember(
    orgId: string,
    userId: string,
    role: 'admin' | 'member' | 'viewer',
  ): Promise<void> {
    const supabase = getSupabaseClient();

    const { error } = await supabase.from('organization_members').insert({
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
   * Remove member
   */
  static async removeMember(orgId: string, userId: string): Promise<void> {
    const supabase = getSupabaseClient();

    const { error } = await supabase
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
