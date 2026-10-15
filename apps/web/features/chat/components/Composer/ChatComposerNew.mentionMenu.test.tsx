import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
    toolConnectorIds: {} as Record<string, string>,
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

describe('attaching a library file named with @', () => {
  const CAP_REASON =
    'Free accounts can download 25 MB of files a day, and today’s allowance is used up. Download more after midnight UTC, or upgrade for a higher limit.';

  beforeEach(() => {
    useBillingStore.setState({ subscription: PRO_SUBSCRIPTION });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  // Fails on 6fd29cc4b9: the mention path still showed "That file could not be
  // added. Try again." for every refusal, the download cap included.
  it('names the download cap and when it resets when the file read is refused', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-14T19:00:00.000Z') });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        if (String(input).startsWith('/api/library')) {
          return Response.json({
            items: [
              {
                id: 'mug',
                file_name: 'mug.pdf',
                mime_type: 'application/pdf',
                kind: 'file',
                byte_count: 10,
                uri: '/api/files/mug',
                surface: 'file',
                previewable: false,
                origin: 'uploaded',
                source_surface: null,
                provider: null,
                model: null,
                prompt: null,
                created_at: '2026-09-05T00:00:00.000Z',
              },
            ],
            has_more: false,
            next_offset: null,
          });
        }
        if (String(input) === '/api/files/mug') {
          return Response.json(
            {
              error: {
                code: 'RATE_LIMIT_EXCEEDED',
                message: CAP_REASON,
                details: {
                  code: 'free_daily_download_limit_reached',
                  resetsAt: '2026-10-15T00:00:00.000Z',
                },
              },
            },
            { status: 429 },
          );
        }
        return Response.json({});
      }),
    );
    render(<ChatComposerNew onSend={vi.fn()} projectPicker={picker()} />);

    typeInComposer('@mug');
    fireEvent.click(await screen.findByRole('option', { name: 'mug.pdf' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(`${CAP_REASON} Resets in 5 hours.`);
    expect(screen.queryByText('That file could not be added. Try again.')).toBeNull();
  });
});
