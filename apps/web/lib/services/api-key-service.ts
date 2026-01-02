import 'server-only';

import { createClient } from '@supabase/supabase-js';
import { requireEnv } from '@/utils/env';
import { logger } from '@/lib/logger';
// Ideally use a secure hashing lib, for now simplistic approach or web crypto if available in edge
import { randomBytes, createHash } from 'crypto';
import { ApiKey } from '@/types/saas';

function getSupabaseClient() {
  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });
}

function generateKey(): { raw: string; hash: string } {
  const raw = 'sk_live_' + randomBytes(24).toString('hex');
  const hash = createHash('sha256').update(raw).digest('hex');
  return { raw, hash };
}

export class ApiKeyService {
  /**
   * Create a new API Key.
   * RETURNS THE RAW KEY ONLY ONCE.
   */
  static async createApiKey(
    userId: string,
    name: string,
    scopes: string[] = [],
  ): Promise<{ apiKey: ApiKey; rawKey: string }> {
    const supabase = getSupabaseClient();
    const { raw, hash } = generateKey();

    const { data, error } = await supabase
      .from('api_keys')
      .insert({
        user_id: userId,
        name,
        key_hash: hash,
        scopes,
        expires_at: null, // customizable
      })
      .select()
      .single();

    if (error) {
      logger.error({ error, userId }, 'Failed to create API key');
      throw error;
    }

    return { apiKey: data as ApiKey, rawKey: raw };
  }

  /**
   * List user's API Keys
   */
  static async listApiKeys(userId: string): Promise<ApiKey[]> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('api_keys')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error({ error, userId }, 'Failed to list API keys');
      throw error;
    }

    return data as ApiKey[];
  }

  /**
   * Revoke/Delete API Key
   */
  static async revokeApiKey(id: string, userId: string): Promise<void> {
    const supabase = getSupabaseClient();

    const { error } = await supabase.from('api_keys').delete().eq('id', id).eq('user_id', userId); // Ensure ownership

    if (error) {
      logger.error({ error, id }, 'Failed to revoke API key');
      throw error;
    }
  }

  /**
   * Verify an API Key (for external API usage)
   */
  static async verifyKey(rawKey: string): Promise<ApiKey | null> {
    const supabase = getSupabaseClient();
    const hash = createHash('sha256').update(rawKey).digest('hex');

    const { data, error } = await supabase
      .from('api_keys')
      .select('*')
      .eq('key_hash', hash)
      .single();

    if (error || !data) {
      return null;
    }

    // Update last used
    // Fire and forget update to not block response
    await supabase
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', data.id);

    return data as ApiKey;
  }
}
