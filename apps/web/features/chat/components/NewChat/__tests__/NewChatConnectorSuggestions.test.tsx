import type { ReactElement } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { baseInitOptions } from '@agiworkforce/i18n';
import { CONNECTORS } from '@/features/connectors/data/connectors';
import { buildSettingsBrowseHash } from '@/features/directory';

interface ConnectorState {
  connectedIds: Set<string>;
  availableIds: Set<string>;
  loading: boolean;
  error: string | null;
}

const mocks = vi.hoisted(() => ({
  connectors: {
    connectedIds: new Set<string>(),
    availableIds: new Set<string>(),
    loading: false,
    error: null,
  } as ConnectorState,
  openSettings: vi.fn(),
}));

type UseConnectorsModule = typeof import('@/features/connectors/hooks/use-connectors');
type SettingsModalProviderModule =
  typeof import('@/features/settings/components/SettingsModalProvider');

vi.mock('@/features/connectors/hooks/use-connectors', async (importOriginal) => ({
  ...(await importOriginal<UseConnectorsModule>()),
  useConnectors: () => mocks.connectors,
}));
vi.mock('@/features/settings/components/SettingsModalProvider', async (importOriginal) => ({
  ...(await importOriginal<SettingsModalProviderModule>()),
  useSettingsModal: () => ({
    isOpen: false,
    openSettings: mocks.openSettings,
    closeSettings: () => undefined,
  }),
}));

import { NewChatConnectorSuggestions } from '../NewChatConnectorSuggestions';

const LINK_NAME = 'Connect your apps (optional)';
const DISMISS_NAME = 'Hide app suggestions';
const DISMISSED_STORAGE_KEY = 'agi-new-chat-connector-suggestions-dismissed';
const CONNECTABLE_IDS = ['gmail', 'google-calendar', 'google-drive'];
const FOURTH_CONNECTABLE_ID = 'notion';

function setConnectors(overrides: Partial<ConnectorState> = {}) {
  mocks.connectors = {
    connectedIds: new Set<string>(),
    availableIds: new Set(CONNECTABLE_IDS),
    loading: false,
    error: null,
    ...overrides,
  };
}

function renderWithLocale(ui: ReactElement) {
  const instance = createInstance();
  void instance.use(initReactI18next).init({ ...baseInitOptions, lng: 'en' });
  return render(<I18nextProvider i18n={instance}>{ui}</I18nextProvider>);
}

function renderRow(show = true) {
  return renderWithLocale(<NewChatConnectorSuggestions show={show} />);
}

function expectHidden() {
  expect(screen.queryByRole('button')).toBeNull();
  expect(screen.queryByText(LINK_NAME)).toBeNull();
}

describe('NewChatConnectorSuggestions', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.location.hash = '';
    setConnectors();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders one optional link and the dismiss control, and nothing else', () => {
    renderRow();

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(2);
    expect(screen.getByRole('button', { name: LINK_NAME })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: DISMISS_NAME })).toBeInTheDocument();
    expect(screen.queryByText('All connectors')).toBeNull();
    expect(screen.queryByText('Connect your apps')).toBeNull();
    for (const id of CONNECTABLE_IDS) {
      const connector = CONNECTORS.find((entry) => entry.id === id);
      expect(connector).toBeDefined();
      expect(screen.queryByText(connector!.name)).toBeNull();
      expect(screen.queryByRole('button', { name: `Set up ${connector!.name}` })).toBeNull();
    }
  });

  it('paints the link with the muted text token, undiluted and without an accent or border', () => {
    renderRow();

    const classes = screen.getByRole('button', { name: LINK_NAME }).className.split(/\s+/);
    expect(classes).toContain('text-muted-foreground');
    expect(classes.some((name) => name.startsWith('text-muted-foreground/'))).toBe(false);
    expect(classes.some((name) => name.includes('accent'))).toBe(false);
    expect(classes.some((name) => name === 'border' || name.startsWith('border-'))).toBe(false);
    expect(classes).toContain('pointer-coarse:min-h-11');
  });

  it('is hidden when the account is not eligible', () => {
    renderRow(false);
    expectHidden();
  });

  it('is hidden when it was dismissed in this browser', () => {
    window.localStorage.setItem(DISMISSED_STORAGE_KEY, 'true');
    renderRow();
    expectHidden();
  });

  it('is hidden while connectors load', () => {
    setConnectors({ loading: true });
    renderRow();
    expectHidden();
  });

  it('is hidden when connectors failed to load', () => {
    setConnectors({ error: 'Could not load connectors. Try again later.' });
    renderRow();
    expectHidden();
  });

  it('is hidden once three apps are connected, even with another app left to connect', () => {
    const availableIds = new Set([...CONNECTABLE_IDS, FOURTH_CONNECTABLE_ID]);

    setConnectors({ connectedIds: new Set(CONNECTABLE_IDS.slice(0, 2)), availableIds });
    const belowThreshold = renderRow();
    expect(screen.getByRole('button', { name: LINK_NAME })).toBeInTheDocument();
    belowThreshold.unmount();

    setConnectors({ availableIds: new Set([FOURTH_CONNECTABLE_ID]) });
    const fourthAlone = renderRow();
    expect(screen.getByRole('button', { name: LINK_NAME })).toBeInTheDocument();
    fourthAlone.unmount();

    setConnectors({ connectedIds: new Set(CONNECTABLE_IDS), availableIds });
    renderRow();
    expectHidden();
  });

  it('is hidden when no connector is available to this account', () => {
    setConnectors({ availableIds: new Set<string>() });
    renderRow();
    expectHidden();
  });

  it('is hidden when every available connector is already connected', () => {
    const connected = CONNECTABLE_IDS.slice(0, 2);
    setConnectors({ connectedIds: new Set(connected), availableIds: new Set(connected) });
    renderRow();
    expectHidden();
  });

  it('opens Settings, Connectors without preselecting a connector', () => {
    renderRow();

    fireEvent.click(screen.getByRole('button', { name: LINK_NAME }));

    expect(window.location.hash).toBe(buildSettingsBrowseHash('connectors'));
    expect(mocks.openSettings).toHaveBeenCalledTimes(1);
    expect(mocks.openSettings).toHaveBeenCalledWith('connectors');
    expect(window.localStorage.getItem(DISMISSED_STORAGE_KEY)).toBeNull();
  });

  it('remembers a dismissal in this browser and hides the row', () => {
    const first = renderRow();

    fireEvent.click(screen.getByRole('button', { name: DISMISS_NAME }));

    expect(window.localStorage.getItem(DISMISSED_STORAGE_KEY)).toBe('true');
    expectHidden();
    expect(mocks.openSettings).not.toHaveBeenCalled();

    first.unmount();
    renderRow();
    expectHidden();
  });

  it('still renders when reading the dismissal throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });

    renderRow();

    expect(screen.getByRole('button', { name: LINK_NAME })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: DISMISS_NAME })).toBeInTheDocument();
  });

  it('still hides when storing the dismissal throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    renderRow();

    fireEvent.click(screen.getByRole('button', { name: DISMISS_NAME }));

    expectHidden();
  });
});
