/**
 * src/features/support — public API barrel
 *
 * Support ticket management, FAQ fetching, and email notification service.
 * Backed by Supabase (support_tickets, faqs tables) + Netlify functions.
 *
 * Migrated from apps/web/features/support/ — Phase 5, 2026-05-18
 */

export { supportService, default as defaultSupportService } from './services/support-service';
export type { SupportTicket, TicketReply, FAQ } from './services/support-service';
