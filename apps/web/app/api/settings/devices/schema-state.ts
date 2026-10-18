import 'server-only';

const PG_UNDEFINED_COLUMN = '42703';
const PG_UNDEFINED_TABLE = '42P01';

export function isRegistryMissing(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as Record<string, unknown>;
  if (record['code'] === PG_UNDEFINED_TABLE) return true;
  const message = String(record['message'] ?? '');
  return /device_registrations/.test(message) && /does not exist/.test(message);
}
