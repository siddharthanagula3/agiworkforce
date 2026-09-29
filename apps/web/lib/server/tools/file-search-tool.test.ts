import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  OPEN_FILE_TOOL_NAME,
  executeFileTool,
  fileSearchToolDefinitions,
  isFileSearchTool,
} from './file-search-tool';

const FILE_ID = '11111111-1111-4111-8111-111111111111';

function chunk(content: string, start: number | null, end: number | null) {
  return {
    source_kind: 'library_file',
    title: 'Q3 plan.pdf',
    content,
    start_offset: start,
    end_offset: end,
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
});
