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
  useSkillsList: () => ({
    skills: [{ name: 'summarize', description: 'Summarize a document' }],
    loading: false,
    error: null,
  }),
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
  }),
}));

function picker(): ComposerProjectPicker {
  return {
    projects: [{ id: 'proj-1', name: 'Launch' }],
    activeProjectId: null,
    onSelectProject: vi.fn(),
    onCreateProject: vi.fn(),
  };
}

// The composer sits inside overflow-hidden shell columns, so a popover left as a
// DOM descendant of the composer is clipped away at a small viewport (UI-16).
// Escaping the render container is exactly the property the portal provides.
describe('composer popovers are portalled (UI-16)', () => {
  it('renders the project picker outside the clipped composer column', () => {
    const { container } = render(<ChatComposerNew onSend={vi.fn()} projectPicker={picker()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Project' }));

    expect(container.contains(screen.getByPlaceholderText('Search projects...'))).toBe(false);
  });

  it('renders the @mention menu outside the clipped composer column', () => {
    const { container } = render(<ChatComposerNew onSend={vi.fn()} projectPicker={picker()} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '@' } });

    expect(container.contains(screen.getByText('summarize'))).toBe(false);
  });
});
