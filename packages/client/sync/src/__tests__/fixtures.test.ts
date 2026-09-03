import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import cursorFixtures from '../__fixtures__/cursor-compare.json';
import pullApplyFixtures from '../__fixtures__/pull-apply.json';
import pushBodyFixtures from '../__fixtures__/push-body.json';
import { bigintGreater, maxCursor, selectNextCursor } from '../cursor';
import {
  applyConversationDeltas,
  toConversationPushItem,
  type SyncConversationRecord,
} from '../conversations';
import { applyMessageDeltas, toMessagePushItem, type SyncMessageRecord } from '../messages';
import {
  applyArtifactDeltas,
  wireToCloudArtifact,
  type CloudArtifact,
} from '@agiworkforce/artifacts';
import {
  ConversationWireDeltaSchema,
  MessageWireDeltaSchema,
  ArtifactWireDeltaSchema,
} from '@agiworkforce/cloud-contracts';
import { createInMemoryConversationPort, createInMemoryMessagePort } from './test-ports';

describe('fixtures: cursor-compare.json', () => {
  it.each(cursorFixtures.bigintGreaterCases)('bigintGreater, $name', (c) => {
    expect(bigintGreater(c.a, c.b)).toBe(c.expected);
  });

  it.each(cursorFixtures.maxCursorCases)('maxCursor, $name', (c) => {
    expect(maxCursor(c.base, ...c.versions)).toBe(c.expected);
  });

  it.each(cursorFixtures.selectNextCursorCases)('selectNextCursor, $name', (c) => {
    expect(selectNextCursor(c.current, c.responseCursor)).toBe(c.expected);
  });
});

const PushConversationSchemaMirror = z.object({
  id: z.string(),
  title: z.string().max(500),
  model: z.string().max(200).nullable().optional(),
  projectId: z.string().max(200).nullable().optional(),
  pinned: z.boolean().optional(),
  baseVersion: z.string(),
});

const PushMessageSchemaMirror = z.object({
  id: z.string(),
  conversationId: z.string(),
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().max(1_000_000),
  model: z.string().max(200).nullable().optional(),
  provider: z.string().max(200).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  baseVersion: z.string(),
});

describe('fixtures: push-body.json', () => {
  it.each(pushBodyFixtures.conversationCases)('conversation push mapping, $name', (c) => {
    const item = toConversationPushItem(c.record as SyncConversationRecord);
    expect(item).toEqual(c.expectedWireItem);
    expect(() => PushConversationSchemaMirror.parse(item)).not.toThrow();
  });

  it.each(pushBodyFixtures.messageCases)('message push mapping, $name', (c) => {
    const item = toMessagePushItem(
      c.conversationId,
      c.record as SyncMessageRecord & { role: 'user' | 'assistant' | 'system' },
    );
    expect(item).toEqual(c.expectedWireItem);
    expect(() => PushMessageSchemaMirror.parse(item)).not.toThrow();
  });
});

interface FixtureConversationRecord {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount?: number;
  pinned?: boolean;
}

interface FixtureMessageRecord {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt?: string;
}

interface FixtureCase {
  name: string;
  applies: string[];
  divergenceNote?: string;
  dirtyConversationIds: string[];
  initialConversations: FixtureConversationRecord[];
  initialMessages: Record<string, FixtureMessageRecord[]>;
  initialArtifacts?: unknown[];
  steps: Array<{ conversations: unknown[]; messages: unknown[]; artifacts: unknown[] }>;
  expectedLiveConversations: FixtureConversationRecord[];
  expectedTombstonedConversationIds: string[];
  expectedLiveMessages: Record<string, FixtureMessageRecord[]>;
  expectedLiveArtifactIds?: string[];
  expectedTombstonedArtifactIds?: string[];
}

const allCases = pullApplyFixtures.cases as unknown as FixtureCase[];
const tsCases = allCases.filter((c) => c.applies.includes('ts'));

describe('fixtures: pull-apply.json (every delta is schema-valid)', () => {
  it.each(allCases)('$name, deltas parse against the wire schemas', (c) => {
    for (const step of c.steps) {
      for (const conv of step.conversations)
        expect(() => ConversationWireDeltaSchema.parse(conv)).not.toThrow();
      for (const msg of step.messages)
        expect(() => MessageWireDeltaSchema.parse(msg)).not.toThrow();
      for (const art of step.artifacts)
        expect(() => ArtifactWireDeltaSchema.parse(art)).not.toThrow();
    }
  });
});

describe('fixtures: pull-apply.json (TS apply outcome)', () => {
  it.each(tsCases)('$name', (c) => {
    const convPort = createInMemoryConversationPort(
      c.initialConversations.map(
        (r): SyncConversationRecord => ({
          id: r.id,
          title: r.title,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
          messageCount: r.messageCount ?? 0,
          pinned: r.pinned ?? false,
        }),
      ),
    );
    const msgPort = createInMemoryMessagePort(
      Object.fromEntries(
        Object.entries(c.initialMessages).map(([convId, msgs]) => [
          convId,
          msgs.map(
            (m): SyncMessageRecord => ({
              id: m.id,
              role: m.role,
              content: m.content,
              createdAt: m.createdAt,
            }),
          ),
        ]),
      ),
    );
    let cloudArtifacts: CloudArtifact[] = (c.initialArtifacts ?? []).map((a) =>
      wireToCloudArtifact(a as Parameters<typeof wireToCloudArtifact>[0]),
    );

    if (c.name === 'orphan_message_then_parent_conversation_arrives') {
      applyMessageDeltas(msgPort, c.steps[0]!.messages as never);
      expect(msgPort.getMessages('c-orphan').map((m) => m.id)).toEqual(['m1']);
      applyConversationDeltas(convPort, c.steps[1]!.conversations as never, c.dirtyConversationIds);
    } else {
      for (const step of c.steps) {
        applyConversationDeltas(convPort, step.conversations as never, c.dirtyConversationIds);
        applyMessageDeltas(msgPort, step.messages as never);
        if (step.artifacts.length > 0) {
          cloudArtifacts = applyArtifactDeltas(cloudArtifacts, step.artifacts as never);
        }
      }
    }

    for (const expected of c.expectedLiveConversations) {
      expect(convPort.get(expected.id)).toMatchObject({ id: expected.id, title: expected.title });
      if (expected.messageCount !== undefined) {
        expect(convPort.get(expected.id)?.messageCount).toBe(expected.messageCount);
      }
    }
    for (const tombstonedId of c.expectedTombstonedConversationIds) {
      expect(convPort.get(tombstonedId)).toBeUndefined();
    }
    for (const [convId, expectedMsgs] of Object.entries(c.expectedLiveMessages)) {
      expect(
        msgPort.getMessages(convId).map((m) => ({ id: m.id, role: m.role, content: m.content })),
      ).toEqual(expectedMsgs.map((m) => ({ id: m.id, role: m.role, content: m.content })));
    }
    for (const liveId of c.expectedLiveArtifactIds ?? []) {
      expect(cloudArtifacts.find((a) => a.id === liveId && !a.deletedAt)).toBeDefined();
    }
    for (const tombstonedId of c.expectedTombstonedArtifactIds ?? []) {
      expect(cloudArtifacts.find((a) => a.id === tombstonedId)?.deletedAt).toBeTruthy();
    }
  });
});
