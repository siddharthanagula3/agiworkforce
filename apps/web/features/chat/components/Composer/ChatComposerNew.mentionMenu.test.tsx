import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useBillingStore, type SubscriptionPlan } from '@shared/stores/web-auth-store';
import { ChatComposerNew, type ComposerProjectPicker } from './ChatComposerNew';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

vi.mock('@features/settings/components/SettingsModalProvider', () => ({
  useSettingsModal: () => ({ isOpen: false, openSettings: vi.fn(), closeSettings: vi.fn() }),
}));

vi.mock('@features/chat/hooks/use-skills-list', () => ({
  useSkillsList: () => ({
    skills: [
      { name: 'Doc Writer', description: 'Writes documents', source: 'included' },
      { name: 'Data Cleaner', description: 'Cleans spreadsheets', source: 'included' },
    ],
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

const PRO_SUBSCRIPTION: SubscriptionPlan = {
  tier: 'pro',
  display_name: 'Pro',
  status: 'active',
  current_period_end: null,
  plan_name: 'Pro',
};

function picker(overrides: Partial<ComposerProjectPicker> = {}): ComposerProjectPicker {
  return {
    projects: [{ id: 'proj-1', name: 'Launch' }],
    activeProjectId: null,
    onSelectProject: vi.fn(),
    onCreateProject: vi.fn(),
    ...overrides,
  };
}

function typeInComposer(value: string) {
  const textarea = screen.getByRole('textbox');
  fireEvent.change(textarea, { target: { value, selectionStart: value.length } });
  return textarea;
}

describe('composer @mention menu', () => {
  beforeEach(() => {
    useBillingStore.setState({ subscription: PRO_SUBSCRIPTION });
  });

  it('commits the highlighted skill on Enter instead of swallowing the key', () => {
    render(<ChatComposerNew onSend={vi.fn()} projectPicker={picker()} />);

    const textarea = typeInComposer('@doc');
    expect(screen.getByRole('option', { name: /Doc Writer/ })).toBeVisible();

    fireEvent.keyDown(textarea, { key: 'Enter' });

    expect(screen.getByText('/Doc Writer')).toBeVisible();
  });

  it('moves the highlight with the arrow keys', () => {
    render(<ChatComposerNew onSend={vi.fn()} projectPicker={picker()} />);

    const textarea = typeInComposer('@');
    fireEvent.keyDown(textarea, { key: 'ArrowDown' });
    fireEvent.keyDown(textarea, { key: 'Enter' });

    expect(screen.getByText('/Data Cleaner')).toBeVisible();
  });

  it('sends the message when the mention query matches nothing', () => {
    const onSend = vi.fn();
    render(<ChatComposerNew onSend={onSend} projectPicker={picker()} />);

    const textarea = typeInComposer('ping @nobodymatchesthis');
    fireEvent.keyDown(textarea, { key: 'Enter' });

    expect(onSend).toHaveBeenCalledOnce();
    expect(onSend.mock.calls[0]?.[0]).toBe('ping @nobodymatchesthis');
  });

  it('scopes the chat to a project picked from the mention menu', () => {
    const onSelectProject = vi.fn();
    render(
      <ChatComposerNew onSend={vi.fn()} emptyState projectPicker={picker({ onSelectProject })} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'AGI Work' }));
    const textarea = typeInComposer('@Laun');

    expect(screen.getByRole('option', { name: 'Launch' })).toBeVisible();
    fireEvent.keyDown(textarea, { key: 'Enter' });

    expect(onSelectProject).toHaveBeenCalledWith('proj-1');
  });

  it('does not treat an email address as a mention', () => {
    render(<ChatComposerNew onSend={vi.fn()} projectPicker={picker()} />);

    typeInComposer('mail me at founder@doc');

    expect(screen.queryByRole('option', { name: /Doc Writer/ })).toBeNull();
  });
});
