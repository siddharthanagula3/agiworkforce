/**
 * @deprecated Barrel re-export — file moved to src/features/support/services/support-service.ts
 * This file exists to preserve the public import path during Phase 5 migration.
 * Do not add new code here. Import from src/features/support/ directly for new code.
 */
export { supportService, default } from '../../../src/features/support/services/support-service';
export type {
  SupportTicket,
  TicketReply,
  FAQ,
} from '../../../src/features/support/services/support-service';
