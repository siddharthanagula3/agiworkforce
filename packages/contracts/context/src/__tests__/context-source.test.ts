import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CONTEXT_SOURCE_CLASSES,
  contextFenceTag,
  contextSource,
  contextSourceClassPolicies,
  contextSourceClassPolicy,
  contextSourceClassesAwaitingProducer,
  contextTrustLevel,
  isContextSourceClass,
  type ContextSourceClass,
} from '../context-source';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../../..');

const AWAITING_PRODUCER: readonly ContextSourceClass[] = [
  'library_file',
  'user_upload',
  'connector_result',
  'web_result',
  'security_policy',
  'template_instruction',
  'local_repository_instruction',
];

describe('context source taxonomy', () => {
  it('names every class exactly once and answers isContextSourceClass for it', () => {
    expect(new Set(CONTEXT_SOURCE_CLASSES).size).toBe(CONTEXT_SOURCE_CLASSES.length);
    for (const sourceClass of CONTEXT_SOURCE_CLASSES) {
      expect(isContextSourceClass(sourceClass)).toBe(true);
      expect(contextSourceClassPolicy(sourceClass).sourceClass).toBe(sourceClass);
    }
    expect(isContextSourceClass('memories')).toBe(false);
    expect(isContextSourceClass(7)).toBe(false);
    expect(contextSourceClassPolicies()).toHaveLength(CONTEXT_SOURCE_CLASSES.length);
  });

  it('fences everything it does not trust as instruction, and nothing it does', () => {
    for (const policy of contextSourceClassPolicies()) {
      if (policy.isInstruction) {
        expect(policy.fenceTag).toBeNull();
        expect(contextTrustLevel(policy)).toBe('instruction');
        expect(() => contextFenceTag(policy.sourceClass)).toThrow(/never fenced/);
        continue;
      }
      expect(policy.fenceTag).toBeTruthy();
      expect(contextFenceTag(policy.sourceClass)).toBe(policy.fenceTag);
      expect(contextTrustLevel(policy)).toBe(policy.isExternal ? 'untrusted' : 'reference');
    }
  });

  it('gives external content no path to memory and no instruction authority', () => {
    for (const policy of contextSourceClassPolicies()) {
      if (!policy.isExternal) continue;
      expect(policy.isInstruction).toBe(false);
      expect(policy.canGenerateMemory).toBe(false);
    }
  });

  it('accounts for every class: produced by a named loader, or awaiting one', () => {
    expect([...contextSourceClassesAwaitingProducer()]).toEqual([...AWAITING_PRODUCER]);
    for (const policy of contextSourceClassPolicies()) {
      if (AWAITING_PRODUCER.includes(policy.sourceClass)) {
        expect(policy.producedBy).toEqual([]);
        continue;
      }
      expect(policy.producedBy.length).toBeGreaterThan(0);
    }
  });

  it('names loaders that exist and export what the registry claims', () => {
    for (const policy of contextSourceClassPolicies()) {
      for (const producer of policy.producedBy) {
        const modulePath = path.join(REPO_ROOT, producer.module);
        expect(existsSync(modulePath), `${producer.module} is missing`).toBe(true);
        const source = readFileSync(modulePath, 'utf8');
        expect(
          new RegExp(`export (?:async )?function ${producer.loader}\\b`).test(source),
          `${producer.module} does not export ${producer.loader}`,
        ).toBe(true);
      }
    }
  });
});

describe('contextSource', () => {
  it('carries provenance and resolves trust from the class', () => {
    const source = contextSource({
      sourceClass: 'account_memory',
      locator: 'user_memories/mem-1',
      recordId: 'mem-1',
      ownerUserId: 'user-1',
      organizationId: null,
      capturedAt: '2026-09-17T00:00:00.000Z',
    });

    expect(source.id).toBe('account_memory:user_memories/mem-1');
    expect(source.provenance).toEqual({
      origin: 'account_store',
      authoredBy: 'user',
      locator: 'user_memories/mem-1',
      recordId: 'mem-1',
      ownerUserId: 'user-1',
      capturedAt: '2026-09-17T00:00:00.000Z',
    });
    expect(source.trust).toEqual({
      level: 'reference',
      isExternal: false,
      isInstruction: false,
      isUserAuthored: true,
      isMerelyData: true,
      canGenerateMemory: true,
      canBeRetrieved: true,
      canBeExported: true,
      requiresFence: true,
      fenceTag: 'account_memories',
    });
  });

  it('marks an instruction class as instruction, never as data', () => {
    const source = contextSource({
      sourceClass: 'project_instruction',
      locator: 'user_projects/project-1',
      projectId: 'project-1',
    });
    expect(source.trust.level).toBe('instruction');
    expect(source.trust.isInstruction).toBe(true);
    expect(source.trust.isMerelyData).toBe(false);
    expect(source.trust.requiresFence).toBe(false);
    expect(source.provenance.projectId).toBe('project-1');
  });

  it('records who wrote a per-source-authorship source and refuses to guess', () => {
    const assistantExcerpt = contextSource({
      sourceClass: 'past_chat',
      locator: 'web_messages/message-1',
      authoredBy: 'assistant',
      conversationId: 'conversation-1',
    });
    expect(assistantExcerpt.provenance.authoredBy).toBe('assistant');
    expect(assistantExcerpt.trust.isUserAuthored).toBe(false);

    expect(() =>
      contextSource({ sourceClass: 'past_chat', locator: 'web_messages/message-2' }),
    ).toThrow(/authored per source/);

    const siblingChat = contextSource({
      sourceClass: 'project_sibling_chat',
      locator: 'web_conversations/conversation-2',
    });
    expect(siblingChat.provenance.authoredBy).toBe('mixed');
    expect(siblingChat.trust.isUserAuthored).toBe(false);
  });

  it('refuses an authorship the class does not have, and an empty locator', () => {
    expect(() =>
      contextSource({
        sourceClass: 'account_memory',
        locator: 'user_memories/mem-1',
        authoredBy: 'third_party',
      }),
    ).toThrow(/authored by user/);
    expect(() => contextSource({ sourceClass: 'web_result', locator: '  ' })).toThrow(
      /provenance locator/,
    );
  });
});
