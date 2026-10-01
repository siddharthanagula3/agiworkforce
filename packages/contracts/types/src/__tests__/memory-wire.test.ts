import { describe, expect, it } from 'vitest';
import {
  MANAGED_MEMORY_CITATION_EXCERPT_CHARS,
  MANAGED_MEMORY_COMMAND_MAX_CHARS,
  MANAGED_MEMORY_LOCAL_CONTEXT_PATH,
  MANAGED_MEMORY_MAX_CATEGORY_CHARS,
  MANAGED_MEMORY_MAX_CONTENT_CHARS,
  isManagedMemorySource,
  managedMemoryCitationExcerpt,
  managedMemoryLocalContextUrl,
  managedMemoryLocalTurnContext,
  parseManagedMemoryCitations,
  parseManagedMemoryCommandResponse,
  parseManagedMemoryConflictsResponse,
  parseManagedMemoryImportCommitResponse,
  parseManagedMemoryImportPreviewResponse,
  parseManagedMemoryItemResponse,
  parseManagedMemoryListResponse,
  parseManagedMemoryLocalContextResponse,
  parseManagedMemoryRecord,
  parseManagedMemoryRestoreResponse,
  parseManagedMemoryWriteResponse,
  readManagedMemoryCommandRequest,
  readManagedMemoryCreateRequest,
  readManagedMemoryUpdateRequest,
} from '../memory-wire';

const record = {
  id: 'memory-1',
  content: 'Use concise summaries',
  category: null,
  source: 'web',
  createdAt: '2026-09-30T12:00:00Z',
  updatedAt: '2026-09-30T12:00:00Z',
};
const projectId = '00000000-0000-4000-8000-000000000001';

describe('managed memory wire records', () => {
  it('keeps typed provenance and discards malformed optional fields', () => {
    expect(
      parseManagedMemoryRecord({ ...record, pinned: true, projectId, expiresAt: null }),
    ).toEqual({
      ...record,
      pinned: true,
      projectId,
      expiresAt: null,
    });
    expect(
      parseManagedMemoryRecord({
        ...record,
        category: 5,
        source: false,
        pinned: 'yes',
        projectId: [],
      }),
    ).toEqual({
      ...record,
      category: null,
      source: null,
    });
  });

  it.each(
    [
      null,
      [],
      {},
      { ...record, id: '' },
      { ...record, content: 1 },
      { ...record, createdAt: null },
      { ...record, updatedAt: false },
    ].map((value) => [value]),
  )('rejects a malformed record %#', (value) => {
    expect(parseManagedMemoryRecord(value)).toBeNull();
  });

  it('filters invalid list entries without inventing pagination or a record', () => {
    expect(parseManagedMemoryListResponse({ memories: [record, null], hasMore: true })).toEqual({
      memories: [record],
      hasMore: true,
    });
    expect(parseManagedMemoryListResponse({ memories: [], hasMore: 'true' })).toEqual({
      memories: [],
      hasMore: false,
    });
    expect(parseManagedMemoryListResponse({ memories: {} })).toBeNull();
    expect(parseManagedMemoryItemResponse({ memory: record })).toEqual({ memory: record });
    expect(parseManagedMemoryItemResponse({ memory: {} })).toBeNull();
    expect(parseManagedMemoryItemResponse(null)).toBeNull();
  });

  it('preserves valid supersession and restoration results', () => {
    expect(
      parseManagedMemoryWriteResponse({
        memory: record,
        merged: true,
        supersededIds: ['old', 1],
        supersededBy: 'new',
      }),
    ).toEqual({ memory: record, merged: true, supersededIds: ['old'], supersededBy: 'new' });
    expect(parseManagedMemoryWriteResponse({ memory: record })).toEqual({
      memory: record,
      merged: false,
      supersededIds: [],
      supersededBy: null,
    });
    expect(parseManagedMemoryWriteResponse({ memory: null })).toBeNull();
    expect(parseManagedMemoryWriteResponse([])).toBeNull();
    expect(parseManagedMemoryRestoreResponse({ restoredId: 'old', replacedId: 'new' })).toEqual({
      restoredId: 'old',
      replacedId: 'new',
    });
    expect(parseManagedMemoryRestoreResponse({ restoredId: 1, replacedId: 'new' })).toBeNull();
    expect(parseManagedMemoryRestoreResponse(null)).toBeNull();
  });

  it('requires both sides of a conflict and typed kept content', () => {
    const conflict = {
      id: 'old',
      content: 'Old summary preference',
      kept: { id: 'new', content: record.content, pinned: true, source: 'web' },
    };
    expect(
      parseManagedMemoryConflictsResponse({
        conflicts: [null, { kept: null }, { ...conflict, content: 1 }, conflict],
      }),
    ).toEqual({ conflicts: [{ ...conflict, replacedAt: null }] });
    expect(parseManagedMemoryConflictsResponse({ conflicts: null })).toBeNull();
  });

  it('reads command outcomes without accepting unknown commands or status claims', () => {
    const command = { kind: 'forget', subject: 'Old summary preference' };
    expect(
      parseManagedMemoryCommandResponse({
        command,
        status: 'confirmation_required',
        message: 'Confirm removal',
        requiresConfirmation: true,
        memories: [{ id: 'old', content: 'Old summary preference' }, null],
      }),
    ).toEqual({
      command,
      status: 'confirmation_required',
      message: 'Confirm removal',
      requiresConfirmation: true,
      memories: [{ id: 'old', content: 'Old summary preference' }],
    });
    expect(
      parseManagedMemoryCommandResponse({
        command,
        status: 'allowed',
        message: 5,
        requiresConfirmation: 'yes',
      }),
    ).toEqual({ command });
    expect(parseManagedMemoryCommandResponse({ command: null, status: 'stored' })).toEqual({
      command: null,
    });
    for (const value of [null, {}, { command: {} }, { command: { kind: 'execute', subject: 'x' } }])
      expect(parseManagedMemoryCommandResponse(value)).toBeNull();
  });

  it('distinguishes import preview from commit and bounds malformed counts to zero', () => {
    expect(
      parseManagedMemoryImportPreviewResponse({
        mode: 'dry-run',
        format: 'json',
        sourceName: 'export',
        sourceValue: 'text',
        items: [{ content: 'concise', normalizedKey: 'concise', duplicate: true }, null],
        totalCandidates: 2,
        itemsTruncated: true,
      }),
    ).toEqual({
      mode: 'dry-run',
      format: 'json',
      sourceName: 'export',
      sourceValue: 'text',
      items: [{ content: 'concise', normalizedKey: 'concise', duplicate: true }],
      totalCandidates: 2,
      itemsTruncated: true,
    });
    expect(
      parseManagedMemoryImportPreviewResponse({
        mode: 'dry-run',
        items: [],
        totalCandidates: Infinity,
      }),
    ).toEqual({
      mode: 'dry-run',
      sourceName: '',
      sourceValue: '',
      format: 'text',
      items: [],
      totalCandidates: 0,
      itemsTruncated: false,
    });
    expect(
      parseManagedMemoryImportCommitResponse({
        mode: 'commit',
        sourceName: 'export',
        sourceValue: 'text',
        insertedCount: 1,
        skippedDuplicateCount: -1,
        blockedCount: NaN,
        excludedCount: '2',
        memories: [record, null],
      }),
    ).toEqual({
      mode: 'commit',
      sourceName: 'export',
      sourceValue: 'text',
      insertedCount: 1,
      skippedDuplicateCount: 0,
      blockedCount: 0,
      excludedCount: 0,
      memories: [record],
    });
    expect(parseManagedMemoryImportCommitResponse({ mode: 'commit' })?.memories).toEqual([]);
    expect(parseManagedMemoryImportCommitResponse({ mode: 'dry-run' })).toBeNull();
    expect(parseManagedMemoryImportPreviewResponse({ mode: 'commit', items: [] })).toBeNull();
    expect(parseManagedMemoryImportPreviewResponse({ mode: 'dry-run', items: null })).toBeNull();
  });
});

describe('local memory privacy choices', () => {
  const context = {
    instructions: 'Use plain language',
    memory: 'Prefer concise summaries',
    memoryCitations: [{ id: 'memory-1', excerpt: 'Concise summaries' }],
  };

  it('removes both context and citations when personalization is disabled', () => {
    expect(
      managedMemoryLocalTurnContext(context, {
        temporary: false,
        memoryEnabled: true,
        personalization: false,
      }),
    ).toEqual({ blocks: [], memoryCitations: null });
  });

  it.each([
    { temporary: true, memoryEnabled: true },
    { temporary: false, memoryEnabled: false },
  ])('retains instructions but withholds memory and citations for %j', (settings) => {
    expect(managedMemoryLocalTurnContext(context, { ...settings, personalization: true })).toEqual({
      blocks: [context.instructions],
      memoryCitations: null,
    });
  });

  it('includes citations only when memory is actually present', () => {
    const settings = { temporary: false, memoryEnabled: true, personalization: true };
    expect(managedMemoryLocalTurnContext(context, settings)).toEqual({
      blocks: [context.instructions, context.memory],
      memoryCitations: { count: 1, memories: context.memoryCitations },
    });
    expect(
      managedMemoryLocalTurnContext({ ...context, instructions: null, memory: null }, settings),
    ).toEqual({ blocks: [], memoryCitations: null });
    expect(
      managedMemoryLocalTurnContext({ ...context, memoryCitations: [] }, settings).memoryCitations,
    ).toBeNull();
  });

  it('rejects untyped local context and clears citations when memory is blank', () => {
    expect(parseManagedMemoryLocalContextResponse(context)).toEqual(context);
    expect(parseManagedMemoryLocalContextResponse({ ...context, memory: '  ' })).toEqual({
      instructions: context.instructions,
      memory: null,
      memoryCitations: [],
    });
    expect(parseManagedMemoryLocalContextResponse({ instructions: null, memory: null })).toEqual({
      instructions: null,
      memory: null,
      memoryCitations: [],
    });
    expect(parseManagedMemoryLocalContextResponse({ ...context, instructions: 1 })).toBeNull();
    expect(parseManagedMemoryLocalContextResponse(null)).toBeNull();
  });

  it('sanitizes citation records and keeps reported counts consistent with the retained list', () => {
    expect(
      parseManagedMemoryCitations({
        count: 0,
        memories: [
          context.memoryCitations[0],
          { id: '', excerpt: 'x' },
          { id: 'bad', excerpt: '  ' },
          null,
        ],
      }),
    ).toEqual({ count: 1, memories: context.memoryCitations });
    expect(parseManagedMemoryCitations({ count: 3.9, memories: [] })).toEqual({
      count: 3,
      memories: [],
    });
    expect(parseManagedMemoryCitations({ count: -1, memories: [] })).toBeNull();
    expect(parseManagedMemoryCitations({ memories: null })).toBeNull();
    expect(managedMemoryCitationExcerpt('  short\n summary  ')).toBe('short summary');
    expect(
      managedMemoryCitationExcerpt('x'.repeat(MANAGED_MEMORY_CITATION_EXCERPT_CHARS + 1)),
    ).toBe('x'.repeat(MANAGED_MEMORY_CITATION_EXCERPT_CHARS - 1) + '…');
    expect(managedMemoryLocalContextUrl(null)).toBe(MANAGED_MEMORY_LOCAL_CONTEXT_PATH);
    expect(
      new URL(
        managedMemoryLocalContextUrl('project & other'),
        'https://fixture.invalid',
      ).searchParams.get('projectId'),
    ).toBe('project & other');
  });
});

describe('managed memory request validation', () => {
  it('preserves explicit false and null choices and leaves unknown sources unassigned', () => {
    const request = {
      content: '  concise  ',
      category: null,
      pinned: false,
      source: 'web',
      expiresAt: null,
      projectId,
    };
    expect(readManagedMemoryCreateRequest(request)).toEqual({ ok: true, request });
    expect(readManagedMemoryCreateRequest({ content: 'x', source: 'untrusted' })).toEqual({
      ok: true,
      request: { content: 'x' },
    });
    expect(isManagedMemorySource('desktop')).toBe(true);
    expect(isManagedMemorySource(1)).toBe(false);
    expect(isManagedMemorySource('untrusted')).toBe(false);
  });

  it.each([
    [null, 'body'],
    [{ content: ' ' }, 'content'],
    [{ content: 'x'.repeat(MANAGED_MEMORY_MAX_CONTENT_CHARS + 1) }, 'content'],
    [{ content: 'x', pinned: 'true' }, 'pinned'],
    [{ content: 'x', category: 1 }, 'category'],
    [{ content: 'x', category: 'x'.repeat(MANAGED_MEMORY_MAX_CATEGORY_CHARS + 1) }, 'category'],
    [{ content: 'x', expiresAt: 1 }, 'expiresAt'],
    [{ content: 'x', projectId: '../other' }, 'projectId'],
  ])('refuses invalid create input %# at the named field', (body, field) => {
    expect(readManagedMemoryCreateRequest(body)).toMatchObject({ ok: false, field });
  });

  it('allows bounded content and metadata-only updates without fabricating content', () => {
    expect(
      readManagedMemoryCreateRequest({
        content: 'x'.repeat(MANAGED_MEMORY_MAX_CONTENT_CHARS),
        category: 'x'.repeat(MANAGED_MEMORY_MAX_CATEGORY_CHARS),
      }).ok,
    ).toBe(true);
    expect(readManagedMemoryUpdateRequest({ pinned: false })).toEqual({
      ok: true,
      request: { pinned: false },
    });
    expect(readManagedMemoryUpdateRequest({ expiresAt: null })).toEqual({
      ok: true,
      request: { expiresAt: null },
    });
    expect(readManagedMemoryUpdateRequest({ content: 'updated', pinned: true })).toEqual({
      ok: true,
      request: { content: 'updated', pinned: true },
    });
    for (const body of [null, {}, { pinned: 1 }, { expiresAt: false }, { content: '' }])
      expect(readManagedMemoryUpdateRequest(body).ok).toBe(false);
  });

  it('requires typed confirmation and valid project and conversation identities', () => {
    const request = {
      message: 'forget concise summaries',
      confirmed: false,
      projectId,
      conversationId: null,
    };
    expect(readManagedMemoryCommandRequest(request)).toEqual({ ok: true, request });
    expect(readManagedMemoryCommandRequest({ message: 'remember concise summaries' })).toEqual({
      ok: true,
      request: { message: 'remember concise summaries' },
    });
    for (const body of [
      null,
      { message: '' },
      { message: 'x'.repeat(MANAGED_MEMORY_COMMAND_MAX_CHARS + 1) },
      { message: 'x', confirmed: 'yes' },
      { message: 'x', projectId: 'wrong' },
      { message: 'x', conversationId: 1 },
    ])
      expect(readManagedMemoryCommandRequest(body).ok).toBe(false);
  });
});
