import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { logger } from './logger.js';

const supabaseUrl = process.env['SUPABASE_URL'];
const supabaseKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];

/**
 * When Supabase env vars are missing, export a degraded stub that returns
 * empty results instead of crashing the entire process with process.exit(1).
 * This allows the server to start and serve health/ready endpoints even
 * without a database.
 */
function createDegradedClient(): SupabaseClient {
  logger.error(
    'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set — ' +
      'running in degraded mode (all DB operations will return empty results)',
  );

  // Create a client with dummy values; all queries will fail gracefully
  // rather than crashing the process on startup.
  const stub = createClient('http://localhost:54321', 'stub-key', {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return stub;
}

export const supabase: SupabaseClient =
  supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      })
    : createDegradedClient();

/** Whether the Supabase client is running in degraded mode */
export const isDegraded = !supabaseUrl || !supabaseKey;
