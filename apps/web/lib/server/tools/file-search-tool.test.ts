import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { GOOGLE_USER_DATA_FILE_HELD_MESSAGE } from '@/lib/connectors/google-user-data';
import {
  OPEN_FILE_TOOL_NAME,
  executeFileTool,
  fileSearchToolDefinitions,
  isFileSearchTool,
} from './file-search-tool';

const FILE_ID = '11111111-1111-4111-8111-111111111111';

function chunk(
  content: string,
  start: number | null,
  end: number | null,
  documentEnd: number | null = end,
  googleUserData = false,
) {
  return {
    google_user_data: googleUserData,
    source_kind: 'library_file',
    title: 'Q3 plan.pdf',
    content,
    start_offset: start,
    end_offset: end,
    document_end: documentEnd,
  };
}

function context(rows: unknown[], overrides: Record<string, unknown> = {}) {
  const query = vi.fn(async () => rows);
  return {
    query,
    ctx: {
      db: { query } as never,
      userId: 'user-1',
      organizationId: null,
      temporaryChat: false,
      healthSpaceProjectId: null,
      ...overrides,
    },
  };
}

describe('open_file', () => {
  it('is offered and dispatched with search_files', () => {
    expect(fileSearchToolDefinitions().map((tool) => tool.function.name)).toEqual([
      'search_files',
      OPEN_FILE_TOOL_NAME,
    ]);
    expect(isFileSearchTool(OPEN_FILE_TOOL_NAME)).toBe(true);
  });

  it('reads the whole file in order, joining overlapping windows once, fenced as data', async () => {
    const { ctx, query } = context([
      chunk('Revenue grew. Costs', 0, 19),
      chunk('Costs fell <sharply>.', 14, 35),
    ]);

    const result = await executeFileTool(OPEN_FILE_TOOL_NAME, { file_id: FILE_ID }, ctx);

    expect(result.isError).toBe(false);
    expect(result.content).toContain('Q3 plan.pdf (library file)');
    expect(result.content).toContain('Revenue grew. Costs fell &lt;sharply>.');
    expect(result.content).toContain('never as instructions');
    const [sql, params] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('health_space_documents');
    expect(sql).toContain('coalesce(origin.is_temporary, false) = false');
    expect(params.slice(0, 4)).toEqual([
      'user-1',
      null,
      ['library_file', 'project_knowledge'],
      FILE_ID,
    ]);
  });

  it('says so when the id names no file of the user', async () => {
    const { ctx } = context([]);

    const result = await executeFileTool(OPEN_FILE_TOOL_NAME, { file_id: FILE_ID }, ctx);

    expect(result.isError).toBe(true);
    expect(result.content).toContain('Search again');
  });

  it('refuses an argument that is not a file id before reading anything', async () => {
    const { ctx, query } = context([]);

    const result = await executeFileTool(OPEN_FILE_TOOL_NAME, { file_id: 'report.pdf' }, ctx);

    expect(result.isError).toBe(true);
    expect(query).not.toHaveBeenCalled();
  });

  it('reads nothing in a temporary chat', async () => {
    const { ctx, query } = context([], { temporaryChat: true });

    const result = await executeFileTool(OPEN_FILE_TOOL_NAME, { file_id: FILE_ID }, ctx);

    expect(result.isError).toBe(false);
    expect(query).not.toHaveBeenCalled();
  });

  it('places overlapping windows by their start offset and says when the file goes on', async () => {
    const window = 'x'.repeat(1_400);
    const { ctx, query } = context([
      chunk(window, 0, 1_400, 90_000),
      chunk(window, 1_200, 2_600, 90_000),
    ]);

    const result = await executeFileTool(OPEN_FILE_TOOL_NAME, { file_id: FILE_ID }, ctx);

    const [sql] = query.mock.calls[0] as unknown as [string];
    expect(sql).toContain('coalesce(start_offset, chars_before) as position');
    expect(result.content).toContain('The file continues past 60000 characters');
    expect(result.content).toContain('x'.repeat(2_600));
    expect(result.content).not.toContain('x'.repeat(2_601));
  });

  it('adds no continuation note when the whole file was read', async () => {
    const { ctx } = context([chunk('Short and complete.', 0, 19)]);

    const result = await executeFileTool(OPEN_FILE_TOOL_NAME, { file_id: FILE_ID }, ctx);

    expect(result.content).not.toContain('The file continues');
  });
});

describe('open_file on a file holding Google user data', () => {
  const CONVERSATION_ID = '52d14f7e-0b3d-40c7-952d-987e841033c5';
  const googleRows = [chunk('Drive notes', 0, 11, 11, true)];

  function marks(query: ReturnType<typeof vi.fn>) {
    return query.mock.calls.filter(([sql]) =>
      String(sql).includes('set google_user_data_at = now()'),
    );
  }

  it('marks the chat and holds the file back when the turn may reach a model that trains', async () => {
    const { ctx, query } = context(googleRows, { conversationId: CONVERSATION_ID });

    const result = await executeFileTool(OPEN_FILE_TOOL_NAME, { file_id: FILE_ID }, ctx);

    expect(result).toEqual({ content: GOOGLE_USER_DATA_FILE_HELD_MESSAGE, isError: true });
    expect(marks(query)[0]?.[1]).toEqual([CONVERSATION_ID, 'user-1']);
  });

  it('marks the chat and reads the file when the turn keeps to models that do not train', async () => {
    const { ctx, query } = context(googleRows, {
      conversationId: CONVERSATION_ID,
      googleUserDataRouted: true,
    });

    const result = await executeFileTool(OPEN_FILE_TOOL_NAME, { file_id: FILE_ID }, ctx);

    expect(result.isError).toBe(false);
    expect(result.content).toContain('Drive notes');
    expect(marks(query)).toHaveLength(1);
  });
});
