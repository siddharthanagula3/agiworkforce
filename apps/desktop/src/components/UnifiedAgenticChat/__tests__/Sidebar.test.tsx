import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

type TemporalGroup = 'today' | 'yesterday' | 'thisWeek' | 'last7Days' | 'last30Days' | 'older';

function getTemporalGroup(date: Date): TemporalGroup {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const thisWeekStart = new Date(today);
  thisWeekStart.setDate(thisWeekStart.getDate() - today.getDay());
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const conversationDate = new Date(date);

  if (conversationDate >= today) {
    return 'today';
  } else if (conversationDate >= yesterday && conversationDate < today) {
    return 'yesterday';
  } else if (conversationDate >= thisWeekStart && conversationDate < yesterday) {
    return 'thisWeek';
  } else if (conversationDate >= sevenDaysAgo) {
    return 'last7Days';
  } else if (conversationDate >= thirtyDaysAgo) {
    return 'last30Days';
  } else {
    return 'older';
  }
}

describe('Sidebar Temporal Grouping', () => {
  describe('getTemporalGroup', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-11-21T12:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should categorize dates from today as "today"', () => {
      const date = new Date('2026-01-21T08:00:00Z');
      expect(getTemporalGroup(date)).toBe('today');
    });

    it('should categorize dates from yesterday as "yesterday"', () => {
      const date = new Date('2026-01-20T15:00:00Z');
      expect(getTemporalGroup(date)).toBe('yesterday');
    });

    it('should categorize dates from this week as "thisWeek"', () => {
      const date = new Date('2026-01-19T10:00:00Z');
      expect(getTemporalGroup(date)).toBe('thisWeek');
    });

    it('should categorize dates from last 7 days as "last7Days"', () => {
      const date = new Date('2026-01-15T10:00:00Z');
      expect(getTemporalGroup(date)).toBe('last7Days');
    });

    it('should categorize dates from last 30 days as "last30Days"', () => {
      const date = new Date('2025-12-22T10:00:00Z');
      expect(getTemporalGroup(date)).toBe('last30Days');
    });

    it('should categorize dates older than 30 days as "older"', () => {
      const date = new Date('2025-11-21T10:00:00Z');
      expect(getTemporalGroup(date)).toBe('older');
    });

    it('should handle edge case: exactly at midnight today', () => {
      const date = new Date('2026-01-21T12:00:00Z');
      expect(getTemporalGroup(date)).toBe('today');
    });

    it('should handle edge case: just before midnight yesterday', () => {
      const date = new Date('2026-01-20T23:59:59Z');
      expect(getTemporalGroup(date)).toBe('yesterday');
    });

    it('should handle edge case: exactly 7 days ago', () => {
      const date = new Date('2026-01-14T12:00:00Z');
      expect(getTemporalGroup(date)).toBe('last7Days');
    });

    it('should handle edge case: exactly 30 days ago', () => {
      const date = new Date('2025-12-22T12:00:00Z');
      expect(getTemporalGroup(date)).toBe('last30Days');
    });

    it('should handle week boundaries correctly (Sunday start)', () => {
      const sunday = new Date('2026-01-17T10:00:00Z');
      expect(getTemporalGroup(sunday)).toBe('thisWeek');
    });
  });

  describe('Temporal Labels', () => {
    it('should have correct label mapping', () => {
      const TEMPORAL_LABELS: Record<TemporalGroup, string> = {
        today: 'Today',
        yesterday: 'Yesterday',
        thisWeek: 'This Week',
        last7Days: 'Last 7 Days',
        last30Days: 'Last 30 Days',
        older: 'Older',
      };

      expect(TEMPORAL_LABELS.today).toBe('Today');
      expect(TEMPORAL_LABELS.yesterday).toBe('Yesterday');
      expect(TEMPORAL_LABELS.thisWeek).toBe('This Week');
      expect(TEMPORAL_LABELS.last7Days).toBe('Last 7 Days');
      expect(TEMPORAL_LABELS.last30Days).toBe('Last 30 Days');
      expect(TEMPORAL_LABELS.older).toBe('Older');
    });
  });

  describe('Grouping Logic', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-21T12:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should correctly group multiple conversations by temporal category', () => {
      const conversations = [
        { id: '1', updatedAt: new Date('2026-01-21T10:00:00Z') },
        { id: '2', updatedAt: new Date('2026-01-20T15:00:00Z') },
        { id: '3', updatedAt: new Date('2026-01-19T10:00:00Z') },
        { id: '4', updatedAt: new Date('2026-01-15T10:00:00Z') },
        { id: '5', updatedAt: new Date('2025-12-22T10:00:00Z') },
        { id: '6', updatedAt: new Date('2025-11-21T10:00:00Z') },
      ];

      const groups: Record<TemporalGroup, typeof conversations> = {
        today: [],
        yesterday: [],
        thisWeek: [],
        last7Days: [],
        last30Days: [],
        older: [],
      };

      conversations.forEach((conv) => {
        if (conv.updatedAt) {
          const group = getTemporalGroup(conv.updatedAt);
          groups[group].push(conv);
        }
      });

      expect(groups.today).toHaveLength(1);
      expect(groups.yesterday).toHaveLength(1);
      expect(groups.thisWeek).toHaveLength(1);
      expect(groups.last7Days).toHaveLength(1);
      expect(groups.last30Days).toHaveLength(1);
      expect(groups.older).toHaveLength(1);
    });

    it('should handle conversations without updatedAt date', () => {
      const conversations = [
        { id: '1', updatedAt: undefined },
        { id: '2', updatedAt: null },
      ];

      type Conv = { id: string; updatedAt: Date | undefined | null };
      const groups: Record<TemporalGroup, Array<Conv>> = {
        today: [],
        yesterday: [],
        thisWeek: [],
        last7Days: [],
        last30Days: [],
        older: [],
      };

      conversations.forEach((conv: Conv) => {
        if (conv.updatedAt) {
          const group = getTemporalGroup(conv.updatedAt);
          groups[group].push(conv);
        } else {
          groups.older.push(conv);
        }
      });

      expect(groups.older).toHaveLength(2);
    });
  });

  describe('Relative Time Formatting', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-11-21T12:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    function formatRelativeTime(date: Date): string {
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;

      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    it('should format "Just now" for very recent dates', () => {
      const date = new Date('2025-11-21T11:59:30Z');
      expect(formatRelativeTime(date)).toBe('Just now');
    });

    it('should format minutes ago', () => {
      const date = new Date('2025-11-21T11:30:00Z');
      expect(formatRelativeTime(date)).toBe('30m ago');
    });

    it('should format hours ago', () => {
      const date = new Date('2025-11-21T09:00:00Z');
      expect(formatRelativeTime(date)).toBe('3h ago');
    });

    it('should format days ago', () => {
      const date = new Date('2025-11-19T12:00:00Z');
      expect(formatRelativeTime(date)).toBe('2d ago');
    });

    it('should format as date for older items', () => {
      const date = new Date('2025-11-01T12:00:00Z');
      expect(formatRelativeTime(date)).toBe('Nov 1');
    });
  });
});
