import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LARGE_PASTE_THRESHOLD } from '@agiworkforce/unified-chat';
import { ChatComposerNew, type ComposerProjectPicker } from './ChatComposerNew';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

vi.mock('@features/settings/components/SettingsModalProvider', () => ({
  useSettingsModal: () => ({ isOpen: false, openSettings: vi.fn(), closeSettings: vi.fn() }),
}));

vi.mock('@features/chat/hooks/use-skills-list', () => ({
  useSkillsList: () => ({ skills: [], loading: false, error: null }),
}));

vi.mock('@features/chat/hooks/use-media-model-availability', () => ({
  useMediaModelAvailability: () => ({
    status: 'ready',
    error: null,
    admissionFor: vi.fn(),
    retry: vi.fn(),
  }),
}));

function picker(): ComposerProjectPicker {
  return {
    projects: [],
    activeProjectId: null,
    onSelectProject: vi.fn(),
    onCreateProject: vi.fn(),
  };
}

function pasteText(target: HTMLElement, text: string) {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', {
    value: { items: [], getData: (type: string) => (type === 'text/plain' ? text : '') },
  });
  fireEvent(target, event);
  return event;
}

describe('web composer large-paste handling (COMPOSER-002)', () => {
  it('converts a book-sized paste into a "Pasted text" attachment rather than flooding the textarea', () => {
    render(<ChatComposerNew onSend={vi.fn()} projectPicker={picker()} />);
    const textarea = screen.getByRole('textbox');

    const event = pasteText(textarea, 'x'.repeat(LARGE_PASTE_THRESHOLD));

    expect(event.defaultPrevented).toBe(true);
    expect(screen.getByText('Pasted text.txt')).not.toBeNull();
    expect((textarea as HTMLTextAreaElement).value).toBe('');
  });

  it('leaves a normal-sized paste as text', () => {
    render(<ChatComposerNew onSend={vi.fn()} projectPicker={picker()} />);
    const textarea = screen.getByRole('textbox');

    const event = pasteText(textarea, 'y'.repeat(LARGE_PASTE_THRESHOLD - 1));

    expect(event.defaultPrevented).toBe(false);
    expect(screen.queryByText('Pasted text.txt')).toBeNull();
  });
});
