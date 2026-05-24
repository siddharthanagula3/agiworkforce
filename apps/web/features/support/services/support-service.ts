/**
 * Support Service
 * Handles support tickets, FAQs, and help center functionality
 */

import { getAuthToken } from '@shared/lib/get-auth-token';
import { addCsrfHeaders } from '@/lib/client/csrf';

// =============================================================================
// EMAIL NOTIFICATION TYPES
// =============================================================================

interface TicketCreatedEmailData {
  type: 'ticket_created';
  to: string;
  ticketId: string;
  ticketSubject: string;
  ticketNumber?: string;
}

interface TicketStatusUpdateEmailData {
  type: 'ticket_status_update';
  to: string;
  ticketId: string;
  ticketSubject: string;
  previousStatus: string;
  newStatus: string;
  statusMessage?: string;
}

interface TicketReplyEmailData {
  type: 'ticket_reply';
  to: string;
  ticketId: string;
  ticketSubject: string;
  replyPreview: string;
  isStaffReply: boolean;
  replierName?: string;
}

type EmailNotificationData =
  | TicketCreatedEmailData
  | TicketStatusUpdateEmailData
  | TicketReplyEmailData;

export interface SupportTicket {
  id: string;
  user_id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  created_at: string;
  updated_at: string;
  resolved_at?: string;
}

export interface TicketReply {
  id: string;
  ticket_id: string;
  user_id: string;
  message: string;
  is_staff: boolean;
  created_at: string;
}

export interface FAQ {
  id: string;
  category: string;
  question: string;
  answer: string;
  display_order: number;
  is_published: boolean;
}

class SupportService {
  /**
   * Submit a new support ticket
   */
  async submitTicket(ticket: {
    name: string;
    email: string;
    subject: string;
    message: string;
  }): Promise<{ data: SupportTicket | null; error?: string }> {
    try {
      const token = await getAuthToken();

      const response = await fetch('/api/support', {
        method: 'POST',
        headers: await addCsrfHeaders({
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        }),
        body: JSON.stringify(ticket),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          data: null,
          error: (errorData as { error?: string }).error ?? `HTTP ${response.status}`,
        };
      }

      const result = (await response.json()) as { ticket: SupportTicket };

      // Send email notification via Netlify function
      await this.sendTicketNotification(ticket.email, result.ticket.id, ticket.subject);

      return { data: result.ticket };
    } catch (error) {
      console.error('Error submitting ticket:', error);
      return {
        data: null,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get user's support tickets
   */
  async getUserTickets(): Promise<{
    data: SupportTicket[];
    error?: string;
  }> {
    try {
      const token = await getAuthToken();
      if (!token) {
        return { data: [], error: 'User not authenticated' };
      }

      const response = await fetch('/api/support', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          data: [],
          error: (errorData as { error?: string }).error ?? `HTTP ${response.status}`,
        };
      }

      const result = (await response.json()) as { tickets: SupportTicket[] };
      return { data: result.tickets ?? [] };
    } catch (error) {
      console.error('Error getting tickets:', error);
      return {
        data: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get a specific ticket with replies
   * TODO: Implement /api/support/[id] route to support individual ticket fetch + replies
   */
  async getTicket(_ticketId: string): Promise<{
    ticket: SupportTicket | null;
    replies: TicketReply[];
    error?: string;
  }> {
    return {
      ticket: null,
      replies: [],
      error: 'Not implemented: individual ticket API route pending',
    };
  }

  /**
   * Add a reply to a ticket
   * TODO: Implement /api/support/[id]/replies route
   */
  async addReply(
    _ticketId: string,
    _message: string,
  ): Promise<{ data: TicketReply | null; error?: string }> {
    return { data: null, error: 'Not implemented: ticket reply API route pending' };
  }

  /**
   * Get all FAQs
   * TODO: Implement /api/support/faqs route
   */
  async getFAQs(): Promise<{ data: FAQ[]; error?: string }> {
    return { data: [] };
  }

  /**
   * Search FAQs
   * TODO: Implement /api/support/faqs route with search param
   */
  async searchFAQs(_query: string): Promise<{ data: FAQ[]; error?: string }> {
    return { data: [] };
  }

  /**
   * Send ticket notification email via Netlify function
   * Supports multiple notification types: ticket_created, ticket_status_update, ticket_reply
   */
  private async sendTicketNotification(
    email: string,
    ticketId: string,
    subject?: string,
  ): Promise<void> {
    await this.sendEmailNotification({
      type: 'ticket_created',
      to: email,
      ticketId,
      ticketSubject: subject || 'Support Ticket',
    });
  }

  /**
   * Send email notification via Netlify function
   * Generic method that supports all email notification types
   */
  async sendEmailNotification(data: EmailNotificationData): Promise<{
    success: boolean;
    messageId?: string;
    error?: string;
  }> {
    try {
      // Get the current auth token
      const token = await getAuthToken();

      if (!token) {
        console.warn('[Support Service] No session for email notification, skipping');
        return { success: false, error: 'Not authenticated' };
      }

      // Call the Netlify function
      const response = await fetch('/.netlify/functions/notifications/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('[Support Service] Email notification failed:', response.status, errorData);
        return {
          success: false,
          error: (errorData as { error?: string }).error || `HTTP ${response.status}`,
        };
      }

      const result = (await response.json()) as { messageId?: string };
      if (process.env.NODE_ENV === 'development') {
        console.debug('[Support Service] Email notification sent:', result.messageId);
      }

      return {
        success: true,
        messageId: result.messageId,
      };
    } catch (error) {
      console.error('[Support Service] Error sending email notification:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Send ticket status update notification
   */
  async sendStatusUpdateNotification(
    ticketId: string,
    email: string,
    subject: string,
    previousStatus: string,
    newStatus: string,
    statusMessage?: string,
  ): Promise<void> {
    await this.sendEmailNotification({
      type: 'ticket_status_update',
      to: email,
      ticketId,
      ticketSubject: subject,
      previousStatus,
      newStatus,
      statusMessage,
    });
  }

  /**
   * Send ticket reply notification
   */
  async sendReplyNotification(
    ticketId: string,
    email: string,
    subject: string,
    replyPreview: string,
    isStaffReply: boolean,
    replierName?: string,
  ): Promise<void> {
    await this.sendEmailNotification({
      type: 'ticket_reply',
      to: email,
      ticketId,
      ticketSubject: subject,
      replyPreview: replyPreview.slice(0, 500), // Limit preview length
      isStaffReply,
      replierName,
    });
  }
}

const supportService = new SupportService();
export default supportService;
export { supportService };
