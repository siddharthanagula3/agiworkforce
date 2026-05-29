/**
 * Marketing Endpoints Tests
 * Unit tests for the marketing website API services
 *
 * Note: getBlogCategories, getSupportCategories, getHelpArticles, getFAQItems,
 * createSupportTicket, getUserTickets, getResources, and getPricingPlans are
 * now stub implementations that return empty arrays/objects pending API route
 * implementation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  submitContactForm,
  subscribeToNewsletter,
  getBlogPosts,
  getBlogCategories,
  getResources,
  trackResourceDownload,
  getPricingPlans,
  getSupportCategories,
  getHelpArticles,
  getFAQItems,
  createSupportTicket,
  getUserTickets,
  type ContactFormData,
  type NewsletterData,
  type SupportTicket,
} from './marketing-endpoints';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

describe('Marketing Endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();

    // Suppress console logs during tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('submitContactForm', () => {
    const mockFormData: ContactFormData = {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      company: 'Acme Inc',
      phone: '+1234567890',
      companySize: '50-100',
      message: 'I would like to learn more about your product.',
      source: 'website',
    };

    it('should submit contact form successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, id: 'contact-123' }),
      });

      const result = await submitContactForm(mockFormData);

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/contact'),
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(mockFormData),
        }),
      );
    });

    it('should throw error on submission failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Invalid email format' }),
      });

      await expect(submitContactForm(mockFormData)).rejects.toThrow(
        new Error('Invalid email format'),
      );
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(submitContactForm(mockFormData)).rejects.toThrow(new Error('Network error'));
    });

    it('should use default error message when none provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({}),
      });

      await expect(submitContactForm(mockFormData)).rejects.toThrow(
        new Error('Failed to submit contact form'),
      );
    });
  });

  describe('subscribeToNewsletter', () => {
    const mockNewsletterData: NewsletterData = {
      email: 'subscriber@example.com',
      name: 'Jane Doe',
      source: 'footer',
      tags: ['product-updates', 'blog'],
    };

    it('should subscribe to newsletter successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      const result = await subscribeToNewsletter(mockNewsletterData);

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/newsletter/subscribe'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(mockNewsletterData),
        }),
      );
    });

    it('should throw error on subscription failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Email already subscribed' }),
      });

      await expect(subscribeToNewsletter(mockNewsletterData)).rejects.toThrow(
        new Error('Email already subscribed'),
      );
    });

    it('should handle minimal newsletter data', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      await subscribeToNewsletter({ email: 'test@example.com' });

      const callBody = JSON.parse(mockFetch!.mock.calls[0]![1]!.body!);
      expect(callBody.email).toBe('test@example.com');
    });
  });

  describe('getBlogPosts', () => {
    it('should fetch blog posts successfully', async () => {
      const mockPosts = {
        posts: [
          { id: '1', title: 'Post 1', slug: 'post-1' },
          { id: '2', title: 'Post 2', slug: 'post-2' },
        ],
        total: 2,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockPosts),
      });

      const result = await getBlogPosts();

      expect(result.posts.length).toBe(2);
    });

    it('should apply category filter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ posts: [] }),
      });

      await getBlogPosts({ category: 'technology' });

      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('category=technology'));
    });

    it('should apply search filter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ posts: [] }),
      });

      await getBlogPosts({ search: 'ai automation' });

      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('search=ai+automation'));
    });

    it('should apply pagination', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ posts: [] }),
      });

      await getBlogPosts({ limit: 10, offset: 20 });

      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('limit=10'));
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('offset=20'));
    });

    it('should apply featured filter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ posts: [] }),
      });

      await getBlogPosts({ featured: true });

      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('featured=true'));
    });

    it('should throw error on fetch failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Server error' }),
      });

      await expect(getBlogPosts()).rejects.toThrow(new Error('Server error'));
    });
  });

  describe('getBlogCategories', () => {
    it('should return empty array (stub pending API route)', async () => {
      const result = await getBlogCategories();

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });
  });

  describe('getResources', () => {
    it('should return empty array (stub pending API route)', async () => {
      const result = await getResources();

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });
  });

  describe('trackResourceDownload', () => {
    it('should track resource download', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      const result = await trackResourceDownload('resource-123', 'user@example.com');

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/resources/download'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            resourceId: 'resource-123',
            userEmail: 'user@example.com',
          }),
        }),
      );
    });

    it('should work without user email', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      await trackResourceDownload('resource-123');

      const callBody = JSON.parse(mockFetch!.mock.calls[0]![1]!.body!);
      expect(callBody.resourceId).toBe('resource-123');
      expect(callBody.userEmail).toBeUndefined();
    });
  });

  describe('getPricingPlans', () => {
    it('should return empty array (stub pending API route)', async () => {
      const result = await getPricingPlans();

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });
  });

  describe('getSupportCategories', () => {
    it('should return empty array (stub pending API route)', async () => {
      const result = await getSupportCategories();

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });
  });

  describe('getHelpArticles', () => {
    it('should return empty array (stub pending API route)', async () => {
      const result = await getHelpArticles();

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });

    it('should accept category slug parameter', async () => {
      const result = await getHelpArticles('getting-started');

      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('getFAQItems', () => {
    it('should return empty array (stub pending API route)', async () => {
      const result = await getFAQItems();

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });
  });

  describe('createSupportTicket', () => {
    const mockTicket: SupportTicket = {
      subject: 'Need help with billing',
      description: 'I cannot update my payment method.',
      priority: 'high',
      category_id: 'billing-cat',
    };

    it('should return ticket data (stub pending API route)', async () => {
      const result = await createSupportTicket(mockTicket);

      // Stub returns the ticket as-is cast to SupportTicket & { id: string }
      expect(result.subject).toBe(mockTicket.subject);
      expect(result.description).toBe(mockTicket.description);
    });
  });

  describe('getUserTickets', () => {
    it('should return empty array (stub pending API route)', async () => {
      const result = await getUserTickets();

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });
  });
});
