import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { savePreferenceNamespace } from '@/app/settings/_lib/preferences-client';
import { PersonalizationSection } from './PersonalizationSection';
import { WEB_SETTINGS_NAV_FIELDS } from '@/features/settings/components/web-settings-navigation';

const mocks = vi.hoisted(() => ({ fetchPreferences: vi.fn() }));

vi.mock('@shared/stores/web-auth-store', () => ({
  useBillingStore: (selector: (state: unknown) => unknown) =>
    selector({
      initialized: true,
      user: {
        email: 'demo@example.com',
        name: 'Demo User',
        profile: { display_name: 'Demo User', preferred_name: 'Demo' },
      },
    }),
}));

vi.mock('@clerk/nextjs', () => ({
  useUser: () => ({ isLoaded: true, user: { fullName: 'Demo User', firstName: 'Demo' } }),
}));

vi.mock('@/app/settings/_lib/preferences-client', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchStoredPreferenceNamespace: mocks.fetchPreferences,
  refreshProfileConsumers: vi.fn(),
  savePreferenceNamespace: vi.fn(),
}));

vi.mock('./MemorySection', () => ({
  MemorySection: () => (
    <section aria-labelledby="memory-heading">
      <h2 id="memory-heading">Memory</h2>
    </section>
  ),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function renderLoaded() {
  render(<PersonalizationSection />);
  await waitFor(() =>
    expect(screen.getByRole('combobox', { name: /Response style/ })).toBeEnabled(),
  );
}

beforeEach(() => {
  mocks.fetchPreferences.mockReset();
  mocks.fetchPreferences.mockResolvedValue({});
  vi.mocked(savePreferenceNamespace).mockReset();
  vi.mocked(savePreferenceNamespace).mockResolvedValue({ version: null });
});

describe('PersonalizationSection layout', () => {
  it('heads the pane Personalization and orders style, characteristics, instructions, about you, then Memory', async () => {
    await renderLoaded();

    expect(screen.getByRole('heading', { level: 1, name: 'Personalization' })).toBeVisible();
    expect(
      screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent),
    ).toEqual(['Style and tone', 'Characteristics', 'Instructions for AGI', 'About you', 'Memory']);
    const styleSection = screen.getByRole('region', { name: 'Style and tone' });
    expect(within(styleSection).getAllByRole('combobox')[0]).toHaveAccessibleName(
      /^Response style/,
    );
  });

  it('keeps the about-you fields under About you', async () => {
    await renderLoaded();

    const about = screen.getByRole('region', { name: 'About you' });
    expect(within(about).getByRole('textbox', { name: /What should AGI call you/ })).toHaveValue(
      'Demo',
    );
    expect(within(about).getByRole('combobox', { name: /What best describes your work/ })).toBe(
      screen.getByRole('combobox', { name: /What best describes your work/ }),
    );
    expect(within(about).getByRole('textbox', { name: 'More about you' })).toBeVisible();
  });

  it('renders the four characteristics as Less, Default and More selects', async () => {
    await renderLoaded();

    const characteristics = screen.getByRole('region', { name: 'Characteristics' });
    for (const label of ['Warmth', 'Enthusiasm', 'Headers and lists', 'Emoji']) {
      const select = within(characteristics).getByRole('combobox', { name: label });
      expect(select).toHaveValue('default');
      expect(
        within(select)
          .getAllByRole('option')
          .map((option) => option.textContent),
      ).toEqual(['Less', 'Default', 'More']);
    }
    expect(screen.queryByRole('slider')).toBeNull();
  });

  it('draws no text smaller than 14px', async () => {
    const { container } = render(<PersonalizationSection />);
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: /Response style/ })).toBeEnabled(),
    );

    expect(container.querySelector('[class*="text-xs"], [class*="text-[1"]')).toBeNull();
    expect(container.querySelector('[class*="text-caption"]')).toBeNull();
  });
});

describe('PersonalizationSection loading', () => {
  it('blocks edits until stored instructions have loaded', async () => {
    const pending = deferred<{ instructions: string }>();
    mocks.fetchPreferences.mockReturnValueOnce(pending.promise);

    render(<PersonalizationSection />);

    const instructions = screen.getByRole('textbox', { name: /Instructions for AGI/ });
    expect(instructions).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Loading personalization');

    await act(async () => {
      pending.resolve({ instructions: 'Keep answers concise.' });
      await pending.promise;
    });

    await waitFor(() => expect(instructions).toBeEnabled());
    expect(instructions).toHaveValue('Keep answers concise.');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('keeps every field disabled after a load failure and recovers on Retry', async () => {
    mocks.fetchPreferences.mockImplementation(async (namespace: string) => {
      if (namespace === 'personalization') throw new Error('Response preferences unavailable');
      return { instructions: 'Keep my saved instructions.' };
    });
    render(<PersonalizationSection />);

    expect(await screen.findByText('Response preferences unavailable')).toBeVisible();
    expect(screen.getByRole('combobox', { name: /Response style/ })).toBeDisabled();
    expect(screen.getByRole('textbox', { name: /Instructions for AGI/ })).toBeDisabled();

    mocks.fetchPreferences.mockImplementation(async (namespace: string) =>
      namespace === 'personalization'
        ? { style: 'formal' }
        : { instructions: 'Keep my saved instructions.' },
    );
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: /Response style/ })).toBeEnabled(),
    );
    expect(screen.getByRole('combobox', { name: /Response style/ })).toHaveValue('formal');
    expect(screen.getByRole('textbox', { name: /Instructions for AGI/ })).toHaveValue(
      'Keep my saved instructions.',
    );
  });
});

describe('PersonalizationSection instructions', () => {
  it('switches instructions off without emptying the field', async () => {
    mocks.fetchPreferences.mockResolvedValue({ instructions: 'Always cite sources.' });
    await renderLoaded();

    const toggle = screen.getByRole('switch', { name: 'Apply instructions for AGI' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');

    await userEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('textbox', { name: 'Instructions for AGI' })).toHaveValue(
      'Always cite sources.',
    );
    expect(screen.getByText(/not sent to the model/i)).toBeVisible();
  });

  it('reads a stored off state back as off', async () => {
    mocks.fetchPreferences.mockResolvedValue({
      instructions: 'Always cite sources.',
      instructionsEnabled: false,
    });
    await renderLoaded();

    expect(screen.getByRole('switch', { name: 'Apply instructions for AGI' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });
});

describe('PersonalizationSection saving', () => {
  it('saves both namespaces it owns, merging rather than replacing them', async () => {
    await renderLoaded();

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Warmth' }), 'more');

    await waitFor(() => expect(savePreferenceNamespace).toHaveBeenCalledTimes(2));
    const calls = vi.mocked(savePreferenceNamespace).mock.calls;
    expect(calls.find(([namespace]) => namespace === 'personalization')).toEqual([
      'personalization',
      expect.objectContaining({ warmth: 80 }),
      expect.objectContaining({ merge: true }),
    ]);
    expect(calls.find(([namespace]) => namespace === 'general')).toEqual([
      'general',
      expect.objectContaining({ preferredName: 'Demo', instructionsEnabled: true }),
      expect.objectContaining({ merge: true }),
    ]);
    expect(await screen.findByText('Saved')).toBeVisible();
  });

  it('coalesces edits while a save is in flight without sending overlapping drafts', async () => {
    const first = deferred<{ version: null }>();
    vi.mocked(savePreferenceNamespace).mockImplementationOnce(() => first.promise);
    await renderLoaded();
    const style = screen.getByRole('combobox', { name: /Response style/ });

    await userEvent.selectOptions(style, 'concise');
    await waitFor(() => expect(savePreferenceNamespace).toHaveBeenCalledTimes(2));
    await userEvent.selectOptions(style, 'formal');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 450));
    });
    expect(savePreferenceNamespace).toHaveBeenCalledTimes(2);

    await act(async () => {
      first.resolve({ version: null });
      await first.promise;
    });

    await waitFor(() => expect(savePreferenceNamespace).toHaveBeenCalledTimes(4));
    expect(vi.mocked(savePreferenceNamespace).mock.calls.at(-1)?.slice(0, 2)).toEqual([
      'personalization',
      expect.objectContaining({ style: 'formal' }),
    ]);
  });

  it('keeps a failed draft and saves it again only when asked', async () => {
    vi.mocked(savePreferenceNamespace).mockRejectedValueOnce(new Error('Service unavailable'));
    await renderLoaded();
    const style = screen.getByRole('combobox', { name: /Response style/ });

    await userEvent.selectOptions(style, 'formal');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your personalization was not saved.',
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 450));
    });
    expect(savePreferenceNamespace).toHaveBeenCalledTimes(2);
    expect(style).toHaveValue('formal');

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await screen.findByText('Saved');
    expect(vi.mocked(savePreferenceNamespace).mock.calls.at(-1)?.slice(0, 2)).toEqual([
      'personalization',
      expect.objectContaining({ style: 'formal' }),
    ]);
  });
});

describe('PersonalizationSection search index', () => {
  it('renders every style and instructions control the settings search lists', async () => {
    await renderLoaded();

    const labels = (WEB_SETTINGS_NAV_FIELDS.personalization ?? [])
      .map((field) => field.label)
      .filter((label) => !MEMORY_SECTION_LABELS.has(label));
    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) {
      expect(screen.getAllByLabelText(label).length).toBeGreaterThan(0);
    }
  });
});

const MEMORY_SECTION_LABELS = new Set([
  'Persistent memory',
  'Save memories from chats',
  'Search past chats',
  'Include sensitive topics in memory',
  'Allow memory generation from tool-assisted chats',
]);
