import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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

vi.mock('@features/connectors/hooks/use-connectors', () => ({
  useConnectors: () => ({
    connectedIds: new Set<string>(),
    sources: {} as Record<string, string>,
    customNames: {} as Record<string, string>,
    toolConnectorIds: {} as Record<string, string>,
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

function pasteText(target: HTMLElement, text: string, html = '') {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', {
    value: {
      items: [],
      getData: (type: string) => (type === 'text/plain' ? text : type === 'text/html' ? html : ''),
    },
  });
  fireEvent(target, event);
  return event;
}

const SOURCE = ['export function add(a: number, b: number) {', '  return a + b;', '}'].join('\n');

describe('web composer code paste', () => {
  it('wraps pasted source in a fence instead of letting markdown mangle it', () => {
    render(<ChatComposerNew onSend={vi.fn()} projectPicker={picker()} />);
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;

    const event = pasteText(textarea, SOURCE);

    expect(event.defaultPrevented).toBe(true);
    expect(textarea.value).toBe(['```', SOURCE, '```'].join('\n'));
  });

  it('labels the fence with the language the clipboard carried', () => {
    render(<ChatComposerNew onSend={vi.fn()} projectPicker={picker()} />);
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;

    pasteText(textarea, SOURCE, '<pre><code class="language-typescript">x</code></pre>');

    expect(textarea.value.startsWith('```typescript\n')).toBe(true);
  });

  it('leaves prose in the message box untouched', () => {
    render(<ChatComposerNew onSend={vi.fn()} projectPicker={picker()} />);
    const textarea = screen.getByRole('textbox');

    const event = pasteText(
      textarea,
      ['We shipped the composer rewrite.', 'Next we measure it on a phone.'].join('\n'),
    );

    expect(event.defaultPrevented).toBe(false);
    expect(screen.queryByTestId('pasted-code-notice')).toBeNull();
  });

  it('offers the plain text back', async () => {
    render(<ChatComposerNew onSend={vi.fn()} projectPicker={picker()} />);
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;

    pasteText(textarea, SOURCE);
    fireEvent.click(await screen.findByTestId('pasted-code-undo'));

    expect(textarea.value).toBe(SOURCE);
    expect(screen.queryByTestId('pasted-code-notice')).toBeNull();
  });
});
