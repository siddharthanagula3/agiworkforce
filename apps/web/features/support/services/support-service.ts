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
   * Get a specific ticket with replies.
   */
  async getTicket(ticketId: string): Promise<{
    ticket: SupportTicket | null;
    replies: TicketReply[];
    error?: string;
  }> {
    try {
      const token = await getAuthToken();
      if (!token) {
        return { ticket: null, replies: [], error: 'User not authenticated' };
      }

      const encodedId = encodeURIComponent(ticketId);
      const headers = { Authorization: `Bearer ${token}` };
      const [ticketResponse, repliesResponse] = await Promise.all([
        fetch(`/api/support/${encodedId}`, { headers }),
        fetch(`/api/support/${encodedId}/replies`, { headers }),
      ]);

      if (!ticketResponse.ok) {
        const errorData = await ticketResponse.json().catch(() => ({}));
        return {
          ticket: null,
          replies: [],
          error: (errorData as { error?: string }).error ?? `HTTP ${ticketResponse.status}`,
        };
      }

      if (!repliesResponse.ok) {
        const errorData = await repliesResponse.json().catch(() => ({}));
        return {
          ticket: null,
          replies: [],
          error: (errorData as { error?: string }).error ?? `HTTP ${repliesResponse.status}`,
        };
      }

      const ticketResult = (await ticketResponse.json()) as { ticket: SupportTicket };
      const repliesResult = (await repliesResponse.json()) as { replies: TicketReply[] };
      return {
        ticket: ticketResult.ticket,
        replies: repliesResult.replies ?? [],
      };
    } catch (error) {
      console.error('Error getting ticket:', error);
      return {
        ticket: null,
        replies: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Add a reply to a ticket.
   */
  async addReply(
    ticketId: string,
    message: string,
  ): Promise<{ data: TicketReply | null; error?: string }> {
    try {
      const token = await getAuthToken();
      if (!token) {
        return { data: null, error: 'User not authenticated' };
      }

      const response = await fetch(`/api/support/${encodeURIComponent(ticketId)}/replies`, {
        method: 'POST',
        headers: await addCsrfHeaders({
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        }),
        body: JSON.stringify({ message }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          data: null,
          error: (errorData as { error?: string }).error ?? `HTTP ${response.status}`,
        };
      }

      const result = (await response.json()) as { reply: TicketReply };
      return { data: result.reply };
    } catch (error) {
      console.error('Error adding ticket reply:', error);
      return {
        data: null,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get all FAQs.
   */
  async getFAQs(): Promise<{ data: FAQ[]; error?: string }> {
    try {
      const response = await fetch('/api/support/faqs');
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          data: [],
          error: (errorData as { error?: string }).error ?? `HTTP ${response.status}`,
        };
      }

      const result = (await response.json()) as { faqs: FAQ[] };
      return { data: result.faqs ?? [] };
    } catch (error) {
      console.error('Error getting FAQs:', error);
      return {
        data: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Search FAQs.
   */
  async searchFAQs(query: string): Promise<{ data: FAQ[]; error?: string }> {
    try {
      const response = await fetch(
        `/api/support/faqs/search?q=${encodeURIComponent(query.trim())}`,
      );
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          data: [],
          error: (errorData as { error?: string }).error ?? `HTTP ${response.status}`,
        };
      }

      const result = (await response.json()) as { faqs: FAQ[] };
      return { data: result.faqs ?? [] };
    } catch (error) {
      console.error('Error searching FAQs:', error);
      return {
        data: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
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
    if (process.env.NODE_ENV === 'development') {
      console.debug('[Support Service] Email notification skipped:', data.type);
    }

    return {
      success: false,
      error: 'Email notification delivery is not configured in the web client',
    };
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
