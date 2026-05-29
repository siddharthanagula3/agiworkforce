/**
 * apps/web/features/support - public API barrel
 *
 * Support ticket management, FAQ fetching, and email notification service.
 * Backed by Neon (support_tickets, faqs tables) + Netlify functions.
 *
 * Canonical Web support feature.
 */

export { supportService, default as defaultSupportService } from './services/support-service';
export type { SupportTicket, TicketReply, FAQ } from './services/support-service';
