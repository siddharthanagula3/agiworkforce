import { describe, expect, it } from 'vitest';
import {
  ManagedCloudPaginationError,
  createManagedCloudPaginationGuard,
} from '../managedCloudPagination';

const TEST_LIMITS = { maxPages: 2, maxItems: 3, maxBytes: 32 };

describe('managedCloudPagination', () => {
  it('returns the validated server offset and records bounded totals', () => {
    const guard = createManagedCloudPaginationGuard('conversations', TEST_LIMITS);

    expect(
      guard.acceptPage({
        items: [{ id: 'a' }],
        hasMore: true,
        currentOffset: 0,
        nextOffset: 1,
      }),
    ).toBe(1);
    expect(guard.pages).toBe(1);
    expect(guard.items).toBe(1);
    expect(guard.bytes).toBeGreaterThan(0);
  });

  it('fails with a structured, actionable error for a non-advancing page', () => {
    const guard = createManagedCloudPaginationGuard('conversations', TEST_LIMITS);

    expect(() =>
      guard.acceptPage({
        items: [{ id: 'a' }],
        hasMore: true,
        currentOffset: 2,
        nextOffset: 2,
      }),
    ).toThrowError(
      expect.objectContaining({
        name: 'ManagedCloudPaginationError',
        code: 'managed_cloud_pagination_non_advancing',
        resource: 'conversations',
        message: expect.stringContaining('Archive older conversations in AGI Web'),
      }),
    );
  });

  it('enforces page, item, and aggregate byte limits', () => {
    const pageGuard = createManagedCloudPaginationGuard('messages', TEST_LIMITS);
    pageGuard.acceptPage({ items: ['a'], hasMore: true, currentOffset: 0 });
    expect(() =>
      pageGuard.acceptPage({ items: ['b'], hasMore: true, currentOffset: 1 }),
    ).toThrowError(expect.objectContaining({ code: 'managed_cloud_pagination_page_limit' }));

    const itemGuard = createManagedCloudPaginationGuard('messages', TEST_LIMITS);
    expect(() =>
      itemGuard.acceptPage({
        items: [],
        hasMore: false,
        currentOffset: 0,
        reportedTotal: 4,
      }),
    ).toThrowError(expect.objectContaining({ code: 'managed_cloud_pagination_item_limit' }));

    const byteGuard = createManagedCloudPaginationGuard('messages', TEST_LIMITS);
    expect(() =>
      byteGuard.acceptPage({
        items: [{ content: 'x'.repeat(40) }],
        hasMore: false,
        currentOffset: 0,
      }),
    ).toThrowError(expect.objectContaining({ code: 'managed_cloud_pagination_byte_limit' }));
  });

  it('exposes the pagination error class for UI failure classification', () => {
    const error = new ManagedCloudPaginationError(
      'managed_cloud_pagination_item_limit',
      'messages',
      4,
      3,
      'Too many messages.',
    );
    expect(error).toMatchObject({ observed: 4, limit: 3, resource: 'messages' });
  });
});
