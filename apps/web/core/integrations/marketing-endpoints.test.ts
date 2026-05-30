/**
 * Marketing Endpoints Tests
 * Unit tests for the marketing website API services
 *
 * Note: getBlogCategories, getSupportCategories, getHelpArticles, getFAQItems,
 * createSupportTicket, getUserTickets, getResources, and getPricingPlans are
 * now stub implementations that return empty arrays/objects pending API route
 * implementation.
 *
 * submitContactForm, subscribeToNewsletter, and trackResourceDownload were
 * removed; they posted to nonexistent API routes and had zero live callers.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getBlogPosts,
  getBlogCategories,
  getResources,
  getPricingPlans,
  getSupportCategories,
  getHelpArticles,
  getFAQItems,
  createSupportTicket,
  getUserTickets,
  type SupportTicket,
} from './marketing-endpoints';
import * as endpoints from './marketing-endpoints';

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

  describe('removed dead exports', () => {
    it('no longer exports submitContactForm', () => {
      expect('submitContactForm' in endpoints).toBe(false);
    });

    it('no longer exports subscribeToNewsletter', () => {
      expect('subscribeToNewsletter' in endpoints).toBe(false);
    });

    it('no longer exports trackResourceDownload', () => {
      expect('trackResourceDownload' in endpoints).toBe(false);
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
