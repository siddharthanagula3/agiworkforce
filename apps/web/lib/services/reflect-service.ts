import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  ManagedCloudReflectRecapSchema,
  type ManagedCloudConversationTopic,
  type ManagedCloudReflectRange,
  type ManagedCloudReflectRecap,
} from '@agiworkforce/cloud-contracts';
import { getDateHourInTimeZone } from '@agiworkforce/types';
import {
  classifyConversationText,
  getConversationTopicPresentation,
} from './conversation-classification-service';

const MAX_REFLECT_CONVERSATIONS = 1_000;

const RANGE_PRESENTATION: Record<ManagedCloudReflectRange, { days: number; label: string }> = {
  '30d': { days: 30, label: 'Past 30 days' },
  '90d': { days: 90, label: 'Past 3 months' },
  '180d': { days: 180, label: 'Past 6 months' },
  '365d': { days: 365, label: 'Past year' },
};

export interface ReflectConversationSample {
  id: string;
  title: string;
  messageSample: string;
  firstUserMessage?: string;
  userMessageCount: number;
  createdAt: string;
  updatedAt: string;
}

interface ReflectConversationRow {
  id: string;
  title: string;
  message_sample: string | null;
  first_user_message: string | null;
  user_message_count: number | string;
  total_conversations: number | string;
  created_at: string;
  updated_at: string;
}

interface UserSettingsRow {
  settings: Record<string, unknown> | null;
}

export type ManagedReflectLoadResult =
  | { kind: 'memory-disabled' }
  | { kind: 'recap'; recap: ManagedCloudReflectRecap };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function isReflectMemoryEnabled(settings: unknown): boolean {
  const root = asRecord(settings);
  const capabilities = asRecord(root?.['capabilities']);
  if (!capabilities) return false;
  const memory = capabilities['memory'];
  const generateFromHistory = capabilities['generateFromHistory'];
  return memory === true && (generateFromHistory === undefined || generateFromHistory === true);
}

export function getManagedReflectPeriod(range: ManagedCloudReflectRange, now: Date) {
  const presentation = RANGE_PRESENTATION[range];
  const end = new Date(now);
  const start = new Date(end.getTime() - presentation.days * 24 * 60 * 60_000);
  return { start, end, label: presentation.label };
}

function increment(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function highestCountKey(map: Map<string, number>): string | null {
  let result: string | null = null;
  let highest = 0;
  for (const [key, count] of map) {
    if (count > highest || (count === highest && result !== null && key < result)) {
      result = key;
      highest = count;
    }
  }
  return result;
}

function wordCount(value: string): number {
  const words = value.trim().split(/\s+/u).filter(Boolean);
  return words.length;
}

export function buildManagedReflectRecap(input: {
  range: ManagedCloudReflectRange;
  timezone: string;
  now: Date;
  totalConversations: number;
  conversations: readonly ReflectConversationSample[];
}): ManagedCloudReflectRecap {
  const period = getManagedReflectPeriod(input.range, input.now);
  const dailyCounts = new Map<string, number>();
  const hourlyCounts = new Map<string, number>();
  const topicCounts = new Map<ManagedCloudConversationTopic, number>();
  let openingWordCount = 0;
  let followUpConversations = 0;
  let multiDayConversations = 0;

  for (const conversation of input.conversations) {
    const createdAt = new Date(conversation.createdAt);
    const dateHour = getDateHourInTimeZone(createdAt, input.timezone);
    if (dateHour) {
      increment(dailyCounts, dateHour.dateKey);
      increment(hourlyCounts, String(dateHour.hour).padStart(2, '0'));
    }

    const topic = classifyConversationText(`${conversation.title}\n${conversation.messageSample}`);
    topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + 1);
    openingWordCount += wordCount(conversation.firstUserMessage ?? conversation.messageSample);
    if (conversation.userMessageCount > 1) followUpConversations += 1;

    const updatedAt = new Date(conversation.updatedAt);
    if (
      Number.isFinite(createdAt.getTime()) &&
      Number.isFinite(updatedAt.getTime()) &&
      updatedAt.getTime() - createdAt.getTime() >= 24 * 60 * 60_000
    ) {
      multiDayConversations += 1;
    }
  }

  const sampledConversationCount = input.conversations.length;
  const mostActiveDay = highestCountKey(dailyCounts);
  const peakHourKey = highestCountKey(hourlyCounts);
  const peakHour = peakHourKey === null ? null : Number(peakHourKey);
  const dailyActivity = [...dailyCounts]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, conversationCount]) => ({ date, conversationCount }));
  const topics = [...topicCounts]
    .map(([id, conversationCount]) => ({
      id,
      ...getConversationTopicPresentation(id),
      conversationCount,
      percentage:
        sampledConversationCount === 0
          ? 0
          : Math.round((conversationCount / sampledConversationCount) * 1_000) / 10,
    }))
    .sort(
      (left, right) =>
        right.conversationCount - left.conversationCount || left.label.localeCompare(right.label),
    );

  if (sampledConversationCount === 0) {
    return ManagedCloudReflectRecapSchema.parse({
      range: input.range,
      generatedAt: input.now.toISOString(),
      period: {
        start: period.start.toISOString(),
        end: period.end.toISOString(),
        label: period.label,
      },
      summary: {
        headline: 'No conversation activity yet',
        body: `There are no eligible conversations in your ${period.label.toLowerCase()}.`,
      },
      stats: {
        totalConversations: input.totalConversations,
        activeDays: 0,
        mostActiveDay: null,
        peakHour: null,
      },
      dailyActivity: [],
      topics: [],
      insights: [],
      sampled: false,
      sampledConversationCount: 0,
    });
  }

  const topTopic = topics[0]!;
  const followUpPercentage = Math.round((followUpConversations / sampledConversationCount) * 100);
  const averageOpeningWords = Math.round(openingWordCount / sampledConversationCount);
  const insights = [
    {
      dimension: 'delegation' as const,
      title: 'What you handed off',
      observation: `${topTopic.label} appeared in ${topTopic.conversationCount} of ${sampledConversationCount} sampled conversations.`,
      nextStep: 'Choose which repeated parts are useful to delegate and which you want to keep.',
      href: '/chat/projects',
    },
    {
      dimension: 'description' as const,
      title: 'How you set context',
      observation: `Your opening messages averaged ${averageOpeningWords} words in this sample.`,
      nextStep:
        'For complex work, include the goal, constraints, and what a good result looks like.',
      href: '/skills',
    },
    {
      dimension: 'discernment' as const,
      title: 'How often you followed up',
      observation: `You sent follow-up messages in ${followUpPercentage}% of sampled conversations.`,
      nextStep:
        'Use follow-ups to question assumptions and compare the result with your own judgment.',
    },
    {
      dimension: 'diligence' as const,
      title: 'Work revisited over time',
      observation: `${multiDayConversations} sampled ${multiDayConversations === 1 ? 'conversation' : 'conversations'} stayed active across at least one day.`,
      nextStep:
        'Before sharing important output, verify sources, ownership, and how AI contributed.',
      href: '/settings/time-focus',
    },
  ];

  return ManagedCloudReflectRecapSchema.parse({
    range: input.range,
    generatedAt: input.now.toISOString(),
    period: {
      start: period.start.toISOString(),
      end: period.end.toISOString(),
      label: period.label,
    },
    summary: {
      headline: `${topTopic.label} led your ${period.label.toLowerCase()}`,
      body: `You started ${input.totalConversations} conversations across ${dailyCounts.size} active days. This recap describes patterns without scoring them.`,
    },
    stats: {
      totalConversations: input.totalConversations,
      activeDays: dailyCounts.size,
      mostActiveDay,
      peakHour,
    },
    dailyActivity,
    topics,
    insights,
    sampled: input.totalConversations > sampledConversationCount,
    sampledConversationCount,
  });
}

export async function loadManagedReflectRecap(input: {
  db: DatabaseAdapter;
  userId: string;
  organizationId: string | null;
  range: ManagedCloudReflectRange;
  timezone: string;
  now?: Date;
}): Promise<ManagedReflectLoadResult> {
  const { db } = input;
  const now = input.now ?? new Date();
  const [settingsRow] = await db.query<UserSettingsRow>(
    'select settings from public.user_settings where user_id = $1 limit 1',
    [input.userId],
  );
  if (!isReflectMemoryEnabled(settingsRow?.settings)) return { kind: 'memory-disabled' };

  const period = getManagedReflectPeriod(input.range, now);
  const rows = await db.query<ReflectConversationRow>(
    `select wc.id,
            wc.title,
            wc.created_at,
            wc.updated_at,
            coalesce((
              select string_agg(sample.content, E'\n' order by sample.created_at)
              from (
                select left(wm.content, 2000) as content, wm.created_at
                from public.web_messages wm
                where wm.conversation_id = wc.id and wm.role = 'user'
                order by wm.created_at asc
                limit 5
              ) sample
            ), '') as message_sample,
            coalesce((
              select left(wm.content, 2000)
              from public.web_messages wm
              where wm.conversation_id = wc.id and wm.role = 'user'
              order by wm.created_at asc
              limit 1
            ), '') as first_user_message,
            (select count(*) from public.web_messages wm where wm.conversation_id = wc.id and wm.role = 'user')::int as user_message_count,
            count(*) over()::int as total_conversations
       from public.web_conversations wc
      where wc.user_id = $1
        and wc.organization_id is not distinct from $5::uuid
        and wc.deleted_at is null
        and wc.is_temporary = false
        and wc.created_at >= $2
        and wc.created_at < $3
        and not exists (
          select 1
          from public.web_messages excluded
          where excluded.conversation_id = wc.id
            and excluded.metadata ? 'cloudAgentRun'
        )
      order by wc.created_at desc
      limit $4`,
    [
      input.userId,
      period.start.toISOString(),
      period.end.toISOString(),
      MAX_REFLECT_CONVERSATIONS,
      input.organizationId,
    ],
  );
  const totalConversations = rows.length > 0 ? Number(rows[0]?.total_conversations ?? 0) : 0;
  const conversations = rows.map((row) => ({
    id: row.id,
    title: row.title,
    messageSample: row.message_sample ?? '',
    firstUserMessage: row.first_user_message ?? '',
    userMessageCount: Number(row.user_message_count),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));

  return {
    kind: 'recap',
    recap: buildManagedReflectRecap({
      range: input.range,
      timezone: input.timezone,
      now,
      totalConversations,
      conversations,
    }),
  };
}
