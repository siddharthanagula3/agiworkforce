import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  COMPOSER_CONNECTORS_CONNECT_LABEL,
  COMPOSER_CONNECTORS_EMPTY_COPY,
  COMPOSER_CONNECTORS_SEARCH_LABEL,
  ComposerPluginsMenu,
  type ComposerPluginsMenuProps,
} from './ComposerPluginsMenu';

const openSettings = vi.fn();

vi.mock('@features/settings/components/SettingsModalProvider', () => ({
  useSettingsModal: () => ({ isOpen: false, openSettings, closeSettings: vi.fn() }),
}));

vi.mock('@/features/connectors/components/OfficialConnectorLogo', () => ({
  OfficialConnectorLogo: ({ connector }: { connector: { id: string } }) => (
    <span data-testid={`logo-${connector.id}`} />
  ),
}));

const TRIGGER_LABEL = 'Connectors';

const CONNECTORS: ComposerPluginsMenuProps['connectors'] = [
  { id: 'gmail', label: 'Gmail', name: 'Gmail', iconBg: 'from-red-500', iconText: 'G' },
  { id: 'notion', label: 'Notion', name: 'Notion', iconBg: 'from-neutral-500', iconText: 'N' },
];

afterEach(() => {
  openSettings.mockReset();
  window.location.hash = '';
});

function renderMenu(overrides: Partial<ComposerPluginsMenuProps> = {}) {
  const props: ComposerPluginsMenuProps = {
    children: <button type="button">{TRIGGER_LABEL}</button>,
    connectors: CONNECTORS,
    disabledConnectorIds: [],
    onSetConnectorEnabled: vi.fn(),
    open: true,
    ...overrides,
  };
  render(<ComposerPluginsMenu {...props} />);
  return props;
}

describe('ComposerPluginsMenu populated', () => {
  it('lists the connected connectors with their logo and an enabled toggle', () => {
    renderMenu();
    expect(screen.getByLabelText(COMPOSER_CONNECTORS_SEARCH_LABEL)).toBeTruthy();
    expect(screen.getByTestId('logo-gmail')).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Use Gmail' }).getAttribute('aria-checked')).toBe(
      'true',
    );
    expect(screen.getByRole('switch', { name: 'Use Notion' })).toBeTruthy();
  });

  it('reflects a connector the chat has disabled and toggles it back through the store', () => {
    const props = renderMenu({ disabledConnectorIds: ['notion'] });
    const toggle = screen.getByRole('switch', { name: 'Use Notion' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(toggle);
    expect(props.onSetConnectorEnabled).toHaveBeenCalledWith('notion', true);
    fireEvent.click(screen.getByRole('switch', { name: 'Use Gmail' }));
    expect(props.onSetConnectorEnabled).toHaveBeenCalledWith('gmail', false);
  });

  it('emits the tool server id for a directory connector, and reads its state from it', () => {
    const directory = {
      id: 'io.sentry/mcp',
      toolId: 'custom-abc123def0',
      label: 'Sentry',
      name: 'Sentry',
      iconBg: 'from-violet-500',
      iconText: 'S',
    };
    const props = renderMenu({
      connectors: [directory],
      disabledConnectorIds: ['custom-abc123def0'],
    });

    const toggle = screen.getByRole('switch', { name: 'Use Sentry' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(toggle);
    expect(props.onSetConnectorEnabled).toHaveBeenCalledWith('custom-abc123def0', true);
  });

  it('filters the rows by the search field', () => {
    renderMenu();
    fireEvent.change(screen.getByLabelText(COMPOSER_CONNECTORS_SEARCH_LABEL), {
      target: { value: 'not' },
    });
    expect(screen.queryByRole('switch', { name: 'Use Gmail' })).toBeNull();
    expect(screen.getByRole('switch', { name: 'Use Notion' })).toBeTruthy();
  });

  it('opens the connectors directory from the Add connectors row', async () => {
    renderMenu();
    fireEvent.click(screen.getByRole('button', { name: COMPOSER_CONNECTORS_CONNECT_LABEL }));
    await waitFor(() => expect(openSettings).toHaveBeenCalledWith('connectors'));
    expect(window.location.hash).toBe('#settings/customize-connectors');
  });
});

describe('ComposerPluginsMenu empty', () => {
  it('says no connectors are connected and still offers the Add row', () => {
    renderMenu({ connectors: [] });
    expect(screen.getByText(COMPOSER_CONNECTORS_EMPTY_COPY)).toBeTruthy();
    expect(screen.queryByLabelText(COMPOSER_CONNECTORS_SEARCH_LABEL)).toBeNull();
    expect(screen.getByRole('button', { name: COMPOSER_CONNECTORS_CONNECT_LABEL })).toBeTruthy();
  });

  it('shows a loading state before the connected list arrives', () => {
    renderMenu({ connectors: [], loading: true });
    expect(screen.getByText('Loading connectors')).toBeTruthy();
    expect(screen.queryByText(COMPOSER_CONNECTORS_EMPTY_COPY)).toBeNull();
  });

  it('opens from its trigger when uncontrolled', async () => {
    render(
      <ComposerPluginsMenu
        connectors={[]}
        disabledConnectorIds={[]}
        onSetConnectorEnabled={vi.fn()}
      >
        <button type="button">{TRIGGER_LABEL}</button>
      </ComposerPluginsMenu>,
    );
    expect(screen.queryByText(COMPOSER_CONNECTORS_EMPTY_COPY)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: TRIGGER_LABEL }));
    expect(await screen.findByText(COMPOSER_CONNECTORS_EMPTY_COPY)).toBeTruthy();
  });
});
