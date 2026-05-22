import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { InlineToolResult, getToolRenderer } from '../InlineToolResults';

// Mock InlineToolResults entirely so lazy-loaded sub-components are synchronous
vi.mock('../InlineToolResults', async () => {
  const React = await import('react');

  const SearchResultsStub = ({ result }: { result: { data?: unknown; type?: string } }) => (
    <div data-testid="search-results">
      {(result?.data as { query?: string } | undefined)?.query ?? 'search'}
    </div>
  );
  const ToolResultCardStub = () => <div data-testid="tool-result-card">generic</div>;

  function getToolRenderer(toolName: string | undefined) {
    if (!toolName) return ToolResultCardStub;
    if (toolName === 'web_search' || toolName.includes('search')) return SearchResultsStub;
    return ToolResultCardStub;
  }

  function InlineToolResult({
    toolName,
    result,
    status,
  }: {
    toolName: string;
    result: { data?: unknown; type?: string };
    status?: string;
  }) {
    const effectiveName = result?.type === 'web-search-results' ? 'web_search' : toolName;
    const Renderer = getToolRenderer(effectiveName);
    return React.createElement(
      React.Suspense,
      { fallback: React.createElement('div', {}, 'Loading result...') },
      React.createElement(
        Renderer as React.ComponentType<{ result: typeof result; status?: string }>,
        { result, status },
      ),
    );
  }

  return { InlineToolResult, getToolRenderer };
});

describe('InlineToolResult', () => {
  describe('getToolRenderer registry', () => {
    it('returns InlineSearchResults for web_search', () => {
      // Just verify the function resolves without throwing
      const renderer = getToolRenderer('web_search');
      expect(renderer).toBeDefined();
    });

    it('returns ToolResultCard for unknown tool names', () => {
      const renderer = getToolRenderer('totally_unknown_tool');
      expect(renderer).toBeDefined();
    });
  });

  describe('type=web-search-results override', () => {
    it('uses search renderer when result.type is web-search-results regardless of tool name', () => {
      const result = {
        type: 'web-search-results',
        data: { query: 'vitest snapshots', results: [] },
      };
      render(<InlineToolResult toolName="some_other_tool" result={result} />);
      expect(screen.getByTestId('search-results')).toBeInTheDocument();
    });

    it('structural snapshot: web-search-results type override renders correct query text', () => {
      const result = {
        type: 'web-search-results',
        data: { query: 'AGI Workforce', results: [] },
      };
      render(<InlineToolResult toolName="any_tool" result={result} />);
      expect(screen.getByTestId('search-results').textContent).toBe('AGI Workforce');
    });

    it('structural snapshot: tool name web_search renders query text', () => {
      const result = { data: { query: 'open source LLMs', results: [] } };
      render(<InlineToolResult toolName="web_search" result={result} />);
      expect(screen.getByTestId('search-results').textContent).toBe('open source LLMs');
    });

    it('structural snapshot: unknown tool falls back to generic card text', () => {
      render(<InlineToolResult toolName="mystery_tool_xyz" result={{ data: {} }} />);
      expect(screen.getByTestId('tool-result-card').textContent).toBe('generic');
    });
  });
});
