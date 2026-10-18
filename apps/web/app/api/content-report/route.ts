import 'server-only';

/**
 * Surface-neutral content-report intake.
 *
 * This is an alias, not a copy. Re-exporting the same handler keeps one
 * validation schema, one rate limit, one idempotency key, and one insert, a
 * second implementation would drift, and trust-and-safety intake is the wrong
 * place to maintain two of anything.
 *
 * The `/api/mobile/...` path stays for the shipped mobile clients that already
 * call it.
 */
export { POST } from '../mobile/content-report/route';
