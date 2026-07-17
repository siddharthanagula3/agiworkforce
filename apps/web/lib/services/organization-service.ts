/**
 * @file organization-service.ts
 *
 * # Client injection contract (WEB-RLS-BYPASS mitigation)
 *
 * All methods are USER-CONTEXT and accept a `db: DatabaseAdapter` parameter.
 * RLS policies enforce organization membership visibility and mutability via
 * `db.withUser(jwt)` on the caller side.
 *
 * Never add a private `getDatabase()` here. See lib/services/README.md.
 */
import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { logger } from '@/lib/logger';
import type { OrganizationRow, OrganizationMemberRow } from '@/lib/server/neon-types';
import { Organization, OrganizationMember } from '@shared/types/saas';

interface OrgMemberWithProfile extends OrganizationMemberRow {
  profile_email: string | null;
  profile_display_name: string | null;
  profile_avatar_url: string | null;
}

export class OrganizationService {
  /**
   * Create a new organization.
   * USER-CONTEXT: caller passes a db scoped to the authenticated user.
   * RLS policies enforce that only authenticated users can create organizations.
   */
  static async createOrganization(
    db: DatabaseAdapter,
    userId: string,
    name: string,
    slug: string,
  ): Promise<Organization> {
    // 1. Create Org
    const [org] = await db
      .query<OrganizationRow>(
        `insert into organizations (name, slug, created_by)
         values ($1, $2, $3)
         returning *`,
        [name, slug, userId],
      )
      .catch((orgError: unknown) => {
        logger.error({ error: orgError, userId, name }, 'Failed to create organization');
        throw orgError;
      });

    if (!org) {
      throw new Error('Organization insert returned no row');
    }

    // 2. Add creator as Owner
    try {
      await db.execute(
        `insert into organization_members (organization_id, user_id, role)
         values ($1, $2, $3)`,
        [org.id, userId, 'owner'],
      );
    } catch (memberError) {
      logger.error({ error: memberError, orgId: org.id }, 'Failed to add owner to organization');

      // Cleanup: Delete the orphaned organization
      try {
        await db.execute(`delete from organizations where id = $1`, [org.id]);
        logger.info({ orgId: org.id }, 'Cleaned up orphaned organization after member add failure');
      } catch (cleanupError) {
        logger.error(
          { error: cleanupError, orgId: org.id },
          'Failed to cleanup orphaned organization after member add failure',
        );
      }

      throw memberError;
    }

    return org as unknown as Organization;
  }

  /**
   * Get user's organizations.
   * USER-CONTEXT: caller passes a db scoped to the authenticated user.
   * RLS policies enforce that only organizations the user is a member of are returned.
   */
  static async getUserOrganizations(db: DatabaseAdapter, userId: string): Promise<Organization[]> {
    const rows = await db
      .query<OrganizationRow>(
        `select o.*
         from organizations o
         inner join organization_members om on om.organization_id = o.id
         where om.user_id = $1`,
        [userId],
      )
      .catch((error: unknown) => {
        logger.error({ error, userId }, 'Failed to fetch user organizations');
        throw error;
      });

    return rows as unknown as Organization[];
  }

  /**
   * Get members of an organization.
   * USER-CONTEXT: caller passes a db scoped to the authenticated user.
   * RLS policies enforce that only members of accessible organizations are returned.
   *
   * SEV-WEB-08 / WEB-31: explicit column list to limit blast radius.
   */
  static async getOrganizationMembers(
    db: DatabaseAdapter,
    orgId: string,
  ): Promise<OrganizationMember[]> {
    const rows = await db
      .query<OrgMemberWithProfile>(
        `select
           om.organization_id,
           om.user_id,
           om.role,
           om.joined_at,
           p.email      as profile_email,
           p.display_name as profile_display_name,
           p.avatar_url as profile_avatar_url
         from organization_members om
         left join profiles p on p.id = om.user_id
         where om.organization_id = $1`,
        [orgId],
      )
      .catch((error: unknown) => {
        logger.error({ error, orgId }, 'Failed to fetch organization members');
        throw error;
      });

    return rows.map((row) => ({
      organization_id: row.organization_id,
      user_id: row.user_id,
      role: row.role,
      joined_at: row.joined_at,
      profile: {
        email: row.profile_email,
        display_name: row.profile_display_name,
        avatar_url: row.profile_avatar_url,
      },
    })) as OrganizationMember[];
  }

  /**
   * Add member to organization.
   * USER-CONTEXT: caller passes a db scoped to the authenticated user.
   * RLS policies enforce that only org admins/owners can add members.
   */
  static async addMember(
    db: DatabaseAdapter,
    orgId: string,
    userId: string,
    role: 'admin' | 'member' | 'viewer',
  ): Promise<void> {
    try {
      await db.execute(
        `insert into organization_members (organization_id, user_id, role)
         values ($1, $2, $3)`,
        [orgId, userId, role],
      );
    } catch (error) {
      logger.error({ error, orgId, userId }, 'Failed to add member');
      throw error;
    }
  }

  /**
   * Remove member.
   * USER-CONTEXT: caller passes a db scoped to the authenticated user.
   * RLS policies enforce that only org admins/owners can remove members.
   */
  static async removeMember(db: DatabaseAdapter, orgId: string, userId: string): Promise<void> {
    try {
      await db.execute(
        `delete from organization_members where organization_id = $1 and user_id = $2`,
        [orgId, userId],
      );
    } catch (error) {
      logger.error({ error, orgId, userId }, 'Failed to remove member');
      throw error;
    }
  }
}
