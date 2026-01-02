import 'server-only';

import { createClient } from '@supabase/supabase-js';
import { requireEnv } from '@/utils/env';
import { logger } from '@/lib/logger';
import { AuditLog } from '@/types/saas';

function getSupabaseClient() {
  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });
}

export class AuditService {
  /**
   * Log an action
   */
  static async log(
    action: string,
    resource: string,
    resourceId: string,
    metadata: Record<string, any> = {},
    context: {
      userId?: string;
      orgId?: string;
      ipAddress?: string;
      userAgent?: string;
    },
  ): Promise<void> {
    const supabase = getSupabaseClient();

    const { error } = await supabase.from('audit_logs').insert({
      action,
      resource,
      resource_id: resourceId,
      metadata,
      user_id: context.userId,
      organization_id: context.orgId,
      ip_address: context.ipAddress,
      user_agent: context.userAgent,
    });

    if (error) {
      // Don't throw to avoid breaking main flow, just log error
      logger.error({ error, action, resource }, 'Failed to write audit log');
    }
  }

  /**
   * Fetch logs for an organization
   */
  static async getOrganizationLogs(orgId: string, limit = 50): Promise<AuditLog[]> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('audit_logs')
      .select(
        `
        *,
        actor:profiles(email) 
      `,
      )
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      logger.error({ error, orgId }, 'Failed to fetch audit logs');
      throw error;
    }

    return data.map((log: any) => ({
      ...log,
      actor_email: log.actor?.email,
    })) as AuditLog[];
  }
}
