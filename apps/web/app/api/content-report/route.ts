import 'server-only';

/**
 * Surface-neutral content-report intake.
 *
 * The durable sink (`public.content_reports`, migration 0093) and its handler
 * already existed, but only under `/api/mobile/content-report` — so web had no
 * way to report a harmful or inaccurate answer at all. The web UI previously
 * offered only a general feedback link and a refusal APPEAL, which is the
 * opposite complaint: "you refused and shouldn't have" rather than "you
 * answered and it was harmful".
 *
 * This is an alias, not a copy. Re-exporting the same handler keeps one
 * validation schema, one rate limit, one idempotency key, and one insert — a
 * second implementation would drift, and trust-and-safety intake is the wrong
 * place to maintain two of anything.
 *
 * The `/api/mobile/...` path stays for the shipped mobile clients that already
 * call it.
 */
export { POST } from '../mobile/content-report/route';
