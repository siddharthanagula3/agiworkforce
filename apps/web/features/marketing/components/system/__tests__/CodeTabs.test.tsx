import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CodeTabs, type CodeTab } from '../CodeTabs';

const TABS: readonly CodeTab[] = [
  { label: 'Rust', language: 'rust', code: 'fn main() {}' },
  { label: 'TypeScript', language: 'ts', code: 'const a = 1;' },
  { label: 'CLI', language: 'sh', code: 'agi run' },
];

afterEach(() => {
  vi.useRealTimers();
});

describe('CodeTabs keyboard contract', () => {
  it('puts only the selected tab in the tab order', () => {
    render(<CodeTabs tabs={TABS} title="Examples" />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
  });

  it('moves focus, selection and the panel label with the arrow keys', () => {
    render(<CodeTabs tabs={TABS} title="Examples" />);
    const list = screen.getByRole('tablist');
    fireEvent.keyDown(list, { key: 'ArrowRight' });
    const second = screen.getByRole('tab', { name: 'TypeScript' });
    expect(second).toHaveFocus();
    expect(second).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', second.id);
    expect(screen.getByRole('tabpanel')).toHaveTextContent('const a = 1;');
  });

  it('wraps with ArrowLeft and supports End and Home', () => {
    render(<CodeTabs tabs={TABS} title="Examples" />);
    const list = screen.getByRole('tablist');
    fireEvent.keyDown(list, { key: 'ArrowLeft' });
    expect(screen.getByRole('tab', { name: 'CLI' })).toHaveFocus();
    fireEvent.keyDown(list, { key: 'Home' });
    expect(screen.getByRole('tab', { name: 'Rust' })).toHaveFocus();
    fireEvent.keyDown(list, { key: 'End' });
    expect(screen.getByRole('tab', { name: 'CLI' })).toHaveAttribute('aria-selected', 'true');
  });
});

describe('CodeTabs copy announcement', () => {
  it('announces the copy politely and clears it afterwards', async () => {
    vi.useFakeTimers();
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    render(<CodeTabs tabs={TABS} title="Examples" />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent('');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    });
    expect(status).toHaveTextContent('Copied to clipboard');
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(status).toHaveTextContent('');
  });
});
