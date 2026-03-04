#!/usr/bin/env npx tsx
/**
 * API Key Hash Format Audit Script
 *
 * This script analyzes all API keys in the database and reports on their hash formats.
 * Use this to track migration progress from legacy hash formats (SHA-256, scrypt) to Argon2id.
 *
 * Run with: npx tsx scripts/audit-legacy-keys.ts
 *
 * Environment variables required:
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js';

// Hash format detection (same logic as api-key-service.ts)
type HashFormat = 'argon2id' | 'scrypt' | 'sha256' | 'unknown';

function detectHashFormat(storedHash: string): HashFormat {
  if (!storedHash || typeof storedHash !== 'string') {
    return 'unknown';
  }

  if (storedHash.startsWith('$argon2id$')) {
    return 'argon2id';
  }

  // Scrypt format: salt$hash (32 hex chars for salt, 128 hex chars for hash)
  const parts = storedHash.split('$');
  if (parts.length === 2 && parts[0] && parts[1]) {
    // Validate it looks like hex strings
    const saltMatch = /^[a-f0-9]{32}$/i.test(parts[0]);
    const hashMatch = /^[a-f0-9]{128}$/i.test(parts[1]);
    if (saltMatch && hashMatch) {
      return 'scrypt';
    }
  }

  // Legacy SHA-256: 64 hex characters, no separator
  if (/^[a-f0-9]{64}$/i.test(storedHash)) {
    return 'sha256';
  }

  return 'unknown';
}

interface AuditResult {
  total: number;
  byFormat: Record<HashFormat, number>;
  byFormatWithExpiry: Record<HashFormat, { active: number; expired: number }>;
  oldestByFormat: Record<HashFormat, Date | null>;
  newestByFormat: Record<HashFormat, Date | null>;
}

async function auditApiKeys(): Promise<void> {
  // Load environment variables
  const supabaseUrl = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const supabaseServiceKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Error: Missing required environment variables.');
    console.error('Required:');
    console.error('  - NEXT_PUBLIC_SUPABASE_URL');
    console.error('  - SUPABASE_SERVICE_ROLE_KEY');
    console.error(
      '\nRun with: NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/audit-legacy-keys.ts',
    );
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });

  console.log('Fetching API keys from database...\n');

  // Fetch all API keys (only the fields we need)
  const { data: keys, error } = await supabase
    .from('api_keys')
    .select('id, key_hash, created_at, expires_at')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching API keys:', error.message);
    process.exit(1);
  }

  if (!keys || keys.length === 0) {
    console.log('No API keys found in database.');
    return;
  }

  // Initialize result tracking
  const result: AuditResult = {
    total: keys.length,
    byFormat: {
      argon2id: 0,
      scrypt: 0,
      sha256: 0,
      unknown: 0,
    },
    byFormatWithExpiry: {
      argon2id: { active: 0, expired: 0 },
      scrypt: { active: 0, expired: 0 },
      sha256: { active: 0, expired: 0 },
      unknown: { active: 0, expired: 0 },
    },
    oldestByFormat: {
      argon2id: null,
      scrypt: null,
      sha256: null,
      unknown: null,
    },
    newestByFormat: {
      argon2id: null,
      scrypt: null,
      sha256: null,
      unknown: null,
    },
  };

  const now = new Date();

  // Analyze each key
  for (const key of keys) {
    const format = detectHashFormat(key.key_hash);
    const createdAt = new Date(key.created_at);
    const isExpired = key.expires_at ? new Date(key.expires_at) < now : false;

    result.byFormat[format]++;

    if (isExpired) {
      result.byFormatWithExpiry[format].expired++;
    } else {
      result.byFormatWithExpiry[format].active++;
    }

    // Track oldest and newest
    if (!result.oldestByFormat[format] || createdAt < result.oldestByFormat[format]) {
      result.oldestByFormat[format] = createdAt;
    }
    if (!result.newestByFormat[format] || createdAt > result.newestByFormat[format]) {
      result.newestByFormat[format] = createdAt;
    }
  }

  // Print results
  console.log('='.repeat(60));
  console.log('API Key Hash Format Audit Report');
  console.log('='.repeat(60));
  console.log(`\nTotal API Keys: ${result.total}\n`);

  console.log('Summary by Hash Format:');
  console.log('-'.repeat(40));

  const formats: HashFormat[] = ['argon2id', 'scrypt', 'sha256', 'unknown'];
  const formatLabels: Record<HashFormat, string> = {
    argon2id: 'Argon2id (current)',
    scrypt: 'scrypt (legacy)',
    sha256: 'SHA-256 unsalted (legacy)',
    unknown: 'Unknown format',
  };

  for (const format of formats) {
    const count = result.byFormat[format];
    const percentage = ((count / result.total) * 100).toFixed(1);
    const active = result.byFormatWithExpiry[format].active;
    const expired = result.byFormatWithExpiry[format].expired;

    console.log(`\n${formatLabels[format]}:`);
    console.log(`  Total: ${count} (${percentage}%)`);
    console.log(`  Active: ${active}, Expired: ${expired}`);

    if (result.oldestByFormat[format]) {
      console.log(`  Oldest: ${result.oldestByFormat[format]?.toISOString()}`);
    }
    if (result.newestByFormat[format]) {
      console.log(`  Newest: ${result.newestByFormat[format]?.toISOString()}`);
    }
  }

  // Migration status
  console.log('\n' + '='.repeat(60));
  console.log('Migration Status');
  console.log('='.repeat(60));

  const legacyCount = result.byFormat.scrypt + result.byFormat.sha256;
  const legacyActive =
    result.byFormatWithExpiry.scrypt.active + result.byFormatWithExpiry.sha256.active;

  if (legacyCount === 0) {
    console.log('\nAll API keys are using Argon2id. Migration complete!');
  } else {
    const migrationPercentage = ((result.byFormat.argon2id / result.total) * 100).toFixed(1);
    console.log(`\nMigration Progress: ${migrationPercentage}%`);
    console.log(`\nLegacy keys remaining: ${legacyCount} total (${legacyActive} active)`);
    console.log('\nNote: Legacy keys will be automatically migrated to Argon2id');
    console.log('when they are next used for authentication.');

    if (result.byFormat.sha256 > 0) {
      console.log('\nWARNING: SHA-256 unsalted keys are vulnerable to rainbow table attacks.');
      console.log('Consider forcing users to regenerate these keys.');
    }
  }

  console.log('\n' + '='.repeat(60));
}

// Run the audit
auditApiKeys().catch((error) => {
  console.error('Audit failed:', error);
  process.exit(1);
});
