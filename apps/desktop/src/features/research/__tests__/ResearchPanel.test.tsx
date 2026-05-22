/**
 * Tests for ResearchPanel component
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ResearchPanel } from '../ResearchPanel';

// Polyfill for Radix UI compatibility with jsdom
// These methods are not implemented in jsdom but are required by Radix UI
if (typeof Element.prototype.hasPointerCapture === 'undefined') {
  Element.prototype.hasPointerCapture = vi.fn().mockReturnValue(false);
}
if (typeof Element.prototype.setPointerCapture === 'undefined') {
  Element.prototype.setPointerCapture = vi.fn();
}
if (typeof Element.prototype.releasePointerCapture === 'undefined') {
  Element.prototype.releasePointerCapture = vi.fn();
}
if (typeof Element.prototype.scrollIntoView === 'undefined') {
  Element.prototype.scrollIntoView = vi.fn();
}

// Mock ResizeObserver which is not available in jsdom
class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

// Mock the tauri-mock module
vi.mock('@/lib/tauri-mock', () => ({
  isTauri: false,
  invoke: vi.fn(),
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

describe('ResearchPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with initial state', () => {
    render(<ResearchPanel />);

    expect(screen.getByText('Research')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('What would you like to research?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start research/i })).toBeInTheDocument();
  });

  it('displays initial query when provided', () => {
    render(<ResearchPanel initialQuery="AI trends" />);

    const input = screen.getByPlaceholderText('What would you like to research?');
    expect(input).toHaveValue('AI trends');
  });

  it('disables start button when query is empty', () => {
    render(<ResearchPanel />);

    const button = screen.getByRole('button', { name: /start research/i });
    expect(button).toBeDisabled();
  });

  it('enables start button when query is entered', async () => {
    const user = userEvent.setup();
    render(<ResearchPanel />);

    const input = screen.getByPlaceholderText('What would you like to research?');
    await user.type(input, 'Test query');

    const button = screen.getByRole('button', { name: /start research/i });
    expect(button).not.toBeDisabled();
  });

  // Skip: Radix UI Select dropdown doesn't render properly in jsdom
  // The dropdown portal doesn't work in the test environment
  it.skip('shows mode selector with all options', async () => {
    const user = userEvent.setup();
    render(<ResearchPanel />);

    // Click on the mode selector
    const modeSelector = screen.getByRole('combobox');
    await user.click(modeSelector);

    // Check all modes are available
    expect(screen.getByText('Quick')).toBeInTheDocument();
    expect(screen.getByText('Standard')).toBeInTheDocument();
    expect(screen.getByText('Deep')).toBeInTheDocument();
    expect(screen.getByText('Exhaustive')).toBeInTheDocument();
  });

  it('displays idle placeholder when no research is active', () => {
    render(<ResearchPanel />);

    expect(screen.getByText('Deep Research Mode')).toBeInTheDocument();
    expect(screen.getByText(/Enter a topic or question/)).toBeInTheDocument();
  });

  it('shows available source badges in idle state', () => {
    render(<ResearchPanel />);

    expect(screen.getByText('Web Search')).toBeInTheDocument();
    expect(screen.getByText('Documents')).toBeInTheDocument();
    expect(screen.getByText('Memory')).toBeInTheDocument();
  });
});

describe('ResearchPanel - Research Flow', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
  });

  it('calls research_start when Start Research button is clicked', async () => {
    const { invoke } = await import('@/lib/tauri-mock');
    const mockInvoke = vi.mocked(invoke);

    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce({
      session_id: 'test-session',
      query: 'Test query',
      mode: 'standard',
      report: '# Test Report',
      summary: 'Test summary',
      key_findings: ['Finding 1', 'Finding 2'],
      citations_count: 5,
      confidence: 'high',
      duration_secs: 30,
      sources_examined: 10,
      sources_cited: 5,
    });

    render(<ResearchPanel />);

    const input = screen.getByPlaceholderText('What would you like to research?');
    await user.type(input, 'Test query');

    const button = screen.getByRole('button', { name: /start research/i });
    await user.click(button);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('research_start', {
        request: {
          query: 'Test query',
          mode: 'standard',
        },
      });
    });
  });

  it('calls onResearchComplete callback when research completes', async () => {
    const { invoke } = await import('@/lib/tauri-mock');
    const mockInvoke = vi.mocked(invoke);

    const user = userEvent.setup();
    const onComplete = vi.fn();
    const mockResult = {
      session_id: 'test-session',
      query: 'Test query',
      mode: 'standard',
      report: '# Test Report',
      summary: 'Test summary',
      key_findings: ['Finding 1'],
      citations_count: 5,
      confidence: 'high',
      duration_secs: 30,
      sources_examined: 10,
      sources_cited: 5,
    };

    mockInvoke.mockResolvedValueOnce(mockResult);

    render(<ResearchPanel onResearchComplete={onComplete} />);

    const input = screen.getByPlaceholderText('What would you like to research?');
    await user.type(input, 'Test query');

    const button = screen.getByRole('button', { name: /start research/i });
    await user.click(button);

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledWith(mockResult);
    });
  });
});
