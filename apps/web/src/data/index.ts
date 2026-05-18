/**
 * src/data — zod schemas, RLS clients, query helpers
 *
 * Layer: data (innermost)
 * Depends on: nothing in apps/web/src/
 * May be imported by: all other layers
 *
 * This barrel will re-export data schemas and query helpers as they are migrated
 * from apps/web/types/, apps/web/lib/validations/, apps/web/data/.
 *
 * Pure data: schemas, types, query builders, RLS-aware clients.
 * No React, no Next.js specifics, no side effects.
 */

export {};
