/**
 * Tests for conversation grouping logic (Today / Yesterday / This Week / Older).
 *
 * The grouping function lives in ConversationList.tsx but we extract the logic
 * via the TIME_GROUPS constants from lib/constants to stay in sync.
 */

import { TIME_GROUPS } from '../lib/constants';
import type { ConversationSummary, ConversationGroup } from '../types/chat';

// ---------------------------------------------------------------------------
// Inline the groupConversations function so we can test it directly without
// importing JSX / React Native components.
// ---------------------------------------------------------------------------

interface GroupedConversations {
  label: ConversationGroup;
  conversations: ConversationSummary[];
}

function groupConversations(
  conversations: ConversationSummary[],
  now: Date = new Date(),
): GroupedConversations[] {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const todayMs = startOfToday.getTime();

  const groups: Record<ConversationGroup, ConversationSummary[]> = {
    Today: [],
    Yesterday: [],
    'This Week': [],
    Older: [],
  };

  const sorted = [...conversations].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

  for (const conv of sorted) {
    const updated = new Date(conv.updatedAt).getTime();
    const age = todayMs - updated;

    if (age < 0) {
      groups.Today.push(conv);
    } else if (age < TIME_GROUPS.YESTERDAY) {
      groups.Yesterday.push(conv);
    } else if (age < TIME_GROUPS.THIS_WEEK) {
      groups['This Week'].push(conv);
    } else {
      groups.Older.push(conv);
    }
  }

  const order: ConversationGroup[] = ['Today', 'Yesterday', 'This Week', 'Older'];
  return order
    .filter((label) => groups[label].length > 0)
    .map((label) => ({ label, conversations: groups[label] }));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConversation(id: string, updatedAt: string): ConversationSummary {
  return {
    id,
    title: `Conversation ${id}`,
    updatedAt,
    createdAt: updatedAt,
    messageCount: 1,
    pinned: false,
  };
}

/** Reference "now" for all tests so assertions don't drift at midnight */
const NOW = new Date('2026-03-07T15:00:00.000Z');

/**
 * Replicate exactly how groupConversations computes startOfToday:
 * setHours(0,0,0,0) uses LOCAL time, not UTC. We must mirror that here.
 */
const START_OF_TODAY = new Date(NOW);
START_OF_TODAY.setHours(0, 0, 0, 0);

/** ms from epoch for start-of-today (local timezone, mirrors production code) */
const TODAY_MS = START_OF_TODAY.getTime();

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('groupConversations', () => {
  describe('Today bucket', () => {
    it('groups a conversation updated 1 hour ago (within today) as "Today"', () => {
      const oneHourAgo = new Date(NOW.getTime() - 60 * 60 * 1000).toISOString();
      const groups = groupConversations([makeConversation('1', oneHourAgo)], NOW);
      expect(groups).toHaveLength(1);
      expect(groups[0].label).toBe('Today');
    });

    it('groups a conversation updated 1ms after local midnight as "Today"', () => {
      // TODAY_MS is start-of-today in LOCAL time (matches groupConversations logic).
      // age = todayMs - (todayMs + 1) = -1 < 0 → Today bucket.
      const justAfterMidnight = new Date(TODAY_MS + 1).toISOString();
      const groups = groupConversations([makeConversation('1', justAfterMidnight)], NOW);
      expect(groups[0].label).toBe('Today');
    });

    it('groups a conversation with a future timestamp as "Today"', () => {
      const future = new Date(NOW.getTime() + 60 * 60 * 1000).toISOString();
      const groups = groupConversations([makeConversation('1', future)], NOW);
      expect(groups[0].label).toBe('Today');
    });
  });

  describe('Yesterday bucket', () => {
    it('groups a conversation updated exactly at start-of-today as "Yesterday"', () => {
      // age = 0 → falls into yesterday (age < YESTERDAY threshold)
      const startOfTodayIso = new Date(TODAY_MS).toISOString();
      const groups = groupConversations([makeConversation('1', startOfTodayIso)], NOW);
      expect(groups[0].label).toBe('Yesterday');
    });

    it('groups a conversation updated 12 hours before midnight as "Yesterday"', () => {
      const twelveHoursBeforeMidnight = new Date(TODAY_MS - 12 * 60 * 60 * 1000).toISOString();
      const groups = groupConversations([makeConversation('1', twelveHoursBeforeMidnight)], NOW);
      expect(groups[0].label).toBe('Yesterday');
    });

    it('groups a conversation just before the YESTERDAY→THIS_WEEK boundary as "Yesterday"', () => {
      // age = TIME_GROUPS.YESTERDAY - 1ms → still < YESTERDAY → Yesterday bucket.
      const justBeforeThisWeek = new Date(TODAY_MS - TIME_GROUPS.YESTERDAY + 1).toISOString();
      const groups = groupConversations([makeConversation('1', justBeforeThisWeek)], NOW);
      expect(groups[0].label).toBe('Yesterday');
    });
  });

  describe('This Week bucket', () => {
    it('groups a conversation updated exactly at the YESTERDAY boundary as "This Week"', () => {
      const atYesterdayBoundary = new Date(TODAY_MS - TIME_GROUPS.YESTERDAY).toISOString();
      const groups = groupConversations([makeConversation('1', atYesterdayBoundary)], NOW);
      expect(groups[0].label).toBe('This Week');
    });

    it('groups a conversation updated 3 days ago as "This Week"', () => {
      const threeDaysAgo = new Date(TODAY_MS - 3 * 24 * 60 * 60 * 1000).toISOString();
      const groups = groupConversations([makeConversation('1', threeDaysAgo)], NOW);
      expect(groups[0].label).toBe('This Week');
    });

    it('groups a conversation updated 6 days ago as "This Week"', () => {
      const sixDaysAgo = new Date(TODAY_MS - 6 * 24 * 60 * 60 * 1000).toISOString();
      const groups = groupConversations([makeConversation('1', sixDaysAgo)], NOW);
      expect(groups[0].label).toBe('This Week');
    });
  });

  describe('Older bucket', () => {
    it('groups a conversation updated at the THIS_WEEK boundary as "Older"', () => {
      const atWeekBoundary = new Date(TODAY_MS - TIME_GROUPS.THIS_WEEK).toISOString();
      const groups = groupConversations([makeConversation('1', atWeekBoundary)], NOW);
      expect(groups[0].label).toBe('Older');
    });

    it('groups a conversation updated 30 days ago as "Older"', () => {
      const thirtyDaysAgo = new Date(TODAY_MS - 30 * 24 * 60 * 60 * 1000).toISOString();
      const groups = groupConversations([makeConversation('1', thirtyDaysAgo)], NOW);
      expect(groups[0].label).toBe('Older');
    });

    it('groups a conversation from last year as "Older"', () => {
      const lastYear = '2025-01-01T00:00:00.000Z';
      const groups = groupConversations([makeConversation('1', lastYear)], NOW);
      expect(groups[0].label).toBe('Older');
    });
  });

  describe('multiple groups', () => {
    it('returns groups in order: Today → Yesterday → This Week → Older', () => {
      const conversations = [
        makeConversation('older', new Date(TODAY_MS - 30 * 24 * 60 * 60 * 1000).toISOString()),
        makeConversation('week', new Date(TODAY_MS - 3 * 24 * 60 * 60 * 1000).toISOString()),
        makeConversation('yesterday', new Date(TODAY_MS - 12 * 60 * 60 * 1000).toISOString()),
        makeConversation('today', new Date(NOW.getTime() - 60 * 60 * 1000).toISOString()),
      ];

      const groups = groupConversations(conversations, NOW);
      expect(groups.map((g) => g.label)).toEqual(['Today', 'Yesterday', 'This Week', 'Older']);
    });

    it('omits empty buckets', () => {
      const conversations = [
        makeConversation('today', new Date(NOW.getTime() - 60 * 60 * 1000).toISOString()),
        makeConversation('older', new Date(TODAY_MS - 30 * 24 * 60 * 60 * 1000).toISOString()),
      ];

      const groups = groupConversations(conversations, NOW);
      // Yesterday and This Week have no items — they must not appear
      expect(groups.map((g) => g.label)).toEqual(['Today', 'Older']);
    });

    it('returns conversations sorted by updatedAt descending within each group', () => {
      const first = new Date(NOW.getTime() - 30 * 60 * 1000).toISOString(); // 30 min ago
      const second = new Date(NOW.getTime() - 90 * 60 * 1000).toISOString(); // 90 min ago
      const conversations = [
        makeConversation('older_conv', second),
        makeConversation('newer_conv', first),
      ];

      const groups = groupConversations(conversations, NOW);
      const todayGroup = groups.find((g) => g.label === 'Today');
      expect(todayGroup?.conversations[0].id).toBe('newer_conv');
      expect(todayGroup?.conversations[1].id).toBe('older_conv');
    });

    it('handles an empty list gracefully', () => {
      const groups = groupConversations([], NOW);
      expect(groups).toEqual([]);
    });
  });
});
