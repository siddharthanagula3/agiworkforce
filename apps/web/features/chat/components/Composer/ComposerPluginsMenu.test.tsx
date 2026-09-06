import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  COMPOSER_PLUGINS_CONNECT_LABEL,
  COMPOSER_PLUGINS_EMPTY_COPY,
  COMPOSER_PLUGINS_SEARCH_LABEL,
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

const TRIGGER_LABEL = 'Plugins';

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
  it('lists the connected plugins with their logo and an enabled toggle', () => {
    renderMenu();
    expect(screen.getByLabelText(COMPOSER_PLUGINS_SEARCH_LABEL)).toBeTruthy();
    expect(screen.getByTestId('logo-gmail')).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Use Gmail' }).getAttribute('aria-checked')).toBe(
      'true',
    );
    expect(screen.getByRole('switch', { name: 'Use Notion' })).toBeTruthy();
  });

  it('reflects a plugin the chat has disabled and toggles it back through the store', () => {
    const props = renderMenu({ disabledConnectorIds: ['notion'] });
    const toggle = screen.getByRole('switch', { name: 'Use Notion' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(toggle);
    expect(props.onSetConnectorEnabled).toHaveBeenCalledWith('notion', true);
    fireEvent.click(screen.getByRole('switch', { name: 'Use Gmail' }));
    expect(props.onSetConnectorEnabled).toHaveBeenCalledWith('gmail', false);
  });

  it('filters the rows by the search field', () => {
    renderMenu();
    fireEvent.change(screen.getByLabelText(COMPOSER_PLUGINS_SEARCH_LABEL), {
      target: { value: 'not' },
    });
    expect(screen.queryByRole('switch', { name: 'Use Gmail' })).toBeNull();
    expect(screen.getByRole('switch', { name: 'Use Notion' })).toBeTruthy();
  });

  it('opens the connectors directory from the Connect plugins row', async () => {
    renderMenu();
    fireEvent.click(screen.getByRole('button', { name: COMPOSER_PLUGINS_CONNECT_LABEL }));
    await waitFor(() => expect(openSettings).toHaveBeenCalledWith('connectors'));
    expect(window.location.hash).toBe('#settings/customize-connectors');
  });
});

describe('ComposerPluginsMenu empty', () => {
  it('says no plugins are connected and still offers the Connect row', () => {
    renderMenu({ connectors: [] });
    expect(screen.getByText(COMPOSER_PLUGINS_EMPTY_COPY)).toBeTruthy();
    expect(screen.queryByLabelText(COMPOSER_PLUGINS_SEARCH_LABEL)).toBeNull();
    expect(screen.getByRole('button', { name: COMPOSER_PLUGINS_CONNECT_LABEL })).toBeTruthy();
  });

  it('shows a loading state before the connected list arrives', () => {
    renderMenu({ connectors: [], loading: true });
    expect(screen.getByText('Loading plugins')).toBeTruthy();
    expect(screen.queryByText(COMPOSER_PLUGINS_EMPTY_COPY)).toBeNull();
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
    expect(screen.queryByText(COMPOSER_PLUGINS_EMPTY_COPY)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: TRIGGER_LABEL }));
    expect(await screen.findByText(COMPOSER_PLUGINS_EMPTY_COPY)).toBeTruthy();
  });
});
