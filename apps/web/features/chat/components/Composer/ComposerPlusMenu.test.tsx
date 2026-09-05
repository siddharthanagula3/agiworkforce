import { useRef } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { baseInitOptions } from '@agiworkforce/i18n';

import { summarizeSendPreview } from '@agiworkforce/types';
import {
  ComposerPlusMenu,
  COMPOSER_MENU_SEND_ROUTE_TESTID,
  type ComposerPlusMenuProps,
} from './ComposerPlusMenu';
import { invalidatePalettePlugins } from '@features/chat/services/palette-plugin-catalog';

const TRIGGER_LABEL = 'Open composer menu';

function baseProps(): Omit<ComposerPlusMenuProps, 'anchorRef' | 'contentRef'> {
  return {
    open: true,
    onRequestClose: vi.fn(),
    closeMenu: vi.fn(),
    workPalette: false,
    onAddFiles: vi.fn(),
    mediaModeActive: false,
    mediaModeNoun: 'Image',
    billingPolicyReady: true,
    billingPolicyError: false,
    mediaAvailabilityStatus: 'ready',
    hostCanGenerateImage: true,
    imageModelsAvailable: true,
    canUseImageGeneration: true,
    imageMode: false,
    onCreateImage: vi.fn(),
    hostCanGenerateVideo: false,
    videoModelsAvailable: false,
    canUseVideoGeneration: false,
    videoMode: false,
    onCreateVideo: vi.fn(),
    canTakeScreenshot: false,
    isCapturingScreenshot: false,
    onTakeScreenshot: vi.fn(),
    showWorkingFolderRow: false,
    canPickFolder: false,
    folderName: null,
    onPickFolder: vi.fn(),
    onClearFolder: vi.fn(),
    selectedSkillName: null,
    onOpenSettings: vi.fn(),
    connectorsSubmenuOpen: false,
    onToggleConnectorsSubmenu: vi.fn(),
    connectorsLoading: false,
    connectors: [
      {
        id: 'gmail',
        label: 'Gmail',
        name: 'Gmail',
        iconBg: 'from-red-500 to-red-600',
        iconText: 'G',
        description: 'email search, reading, sending, and drafts',
      },
      {
        id: 'notion',
        label: 'Notion',
        name: 'Notion',
        iconBg: 'from-neutral-500 to-neutral-600',
        iconText: 'N',
        description: 'page and database reads and writes',
      },
    ],
    disabledConnectorIds: [],
    onSetConnectorEnabled: vi.fn(),
    webSearchEnabled: true,
    showScopeRow: false,
    scopeOpen: false,
    scopeDisabled: false,
    onToggleScope: vi.fn(),
    researchEnabled: false,
    researchDisabled: false,
    onToggleResearch: vi.fn(),
    codeExecutionEnabled: false,
    codeExecutionDisabled: false,
    onToggleCodeExecution: vi.fn(),
    officeCreationEnabled: false,
    officeCreationDisabled: false,
    onToggleOfficeCreation: vi.fn(),
    memoryEnabled: true,
    memoryDisabled: false,
    onToggleMemory: vi.fn(),
    showTemporaryChat: false,
    temporaryChatSaving: false,
    isIncognito: false,
    canToggleIncognito: true,
    onToggleIncognito: vi.fn(),
    skills: [
      { name: 'brand-voice', description: 'Rewrite copy in the house voice', source: 'personal' },
      { name: 'sql-review', description: 'Review a query plan', source: 'personal' },
    ],
    onSelectSkill: vi.fn(),
    folders: [
      { id: 'proj-1', name: 'Website Redesign' },
      { id: 'proj-2', name: 'Pricing Study' },
    ],
    onSelectFolder: vi.fn(),
  };
}

function Harness(props: Omit<ComposerPlusMenuProps, 'anchorRef' | 'contentRef'>) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  return (
    <>
      <button type="button" ref={anchorRef}>
        {TRIGGER_LABEL}
      </button>
      <ComposerPlusMenu {...props} anchorRef={anchorRef} contentRef={contentRef} />
    </>
  );
}

function renderMenu(overrides: Partial<ComposerPlusMenuProps> = {}) {
  const props = { ...baseProps(), ...overrides };
  const instance = createInstance();
  void instance.use(initReactI18next).init({ ...baseInitOptions, lng: 'en' });
  const utils = render(
    <I18nextProvider i18n={instance}>
      <Harness {...props} />
    </I18nextProvider>,
  );
  return { ...utils, props };
}

function palette() {
  return screen.getByRole('menu', { name: 'AGI Work tools' });
}

describe('ComposerPlusMenu, chat mode', () => {
  it('keeps the Skills, Connectors and Plugins entries and shows no search field', () => {
    renderMenu();

    expect(screen.getByRole('button', { name: 'Skills' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connectors' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Plugins' })).toBeInTheDocument();
    expect(screen.queryByRole('menu', { name: 'AGI Work tools' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Search the AGI Work palette')).not.toBeInTheDocument();
  });

  it('lists connected connectors only once the Connectors row is expanded', () => {
    renderMenu({ connectorsSubmenuOpen: true });

    expect(screen.getByRole('menuitemcheckbox', { name: 'Gmail' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Manage in Settings' })).toBeInTheDocument();
  });

  it('docks the send-route status to the panel bottom so it cannot scroll out of view', () => {
    const sendPreviewPresentation = summarizeSendPreview({ providerMode: 'ManagedGateway' });
    renderMenu({ sendPreviewPresentation });

    const dock = screen.getByTestId(COMPOSER_MENU_SEND_ROUTE_TESTID);
    expect(dock.className).toContain('sticky');
    expect(dock.className).toContain('-bottom-px');
  });
});

describe('ComposerPlusMenu, AGI Work palette', () => {
  beforeEach(() => {
    invalidatePalettePlugins();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          entries: [
            { id: 'research-pack', name: 'Research Pack', description: 'Desk research routines' },
            { id: 'writing-pack', name: 'Writing Pack', description: 'Long-form drafting' },
          ],
        }),
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('flattens the menu into one palette with no Skills, Connectors or Plugins submenus', () => {
    renderMenu({ workPalette: true });

    const menu = palette();
    expect(within(menu).getByRole('menuitem', { name: /Add photos & files/ })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Create image' })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Deep Research' })).toBeInTheDocument();
    expect(within(menu).queryByRole('button', { name: 'Connectors' })).not.toBeInTheDocument();
    expect(within(menu).queryByRole('button', { name: 'Plugins' })).not.toBeInTheDocument();
    expect(within(menu).getByText('Web search')).toBeInTheDocument();
  });

  it('gives every connected connector a row with its capability line and its mark', () => {
    renderMenu({ workPalette: true });

    const row = screen.getByTestId('composer-palette-connector-gmail');
    expect(row).toHaveAttribute('role', 'menuitemcheckbox');
    expect(row).toHaveAttribute('aria-checked', 'true');
    expect(within(row).getByText('email search, reading, sending, and drafts')).toBeInTheDocument();
    expect(screen.getByTestId('composer-palette-connector-notion')).toBeInTheDocument();
  });

  it('reads a connector disabled for this conversation as unchecked and toggles it back on', () => {
    const { props } = renderMenu({ workPalette: true, disabledConnectorIds: ['gmail'] });

    const row = screen.getByTestId('composer-palette-connector-gmail');
    expect(row).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(row);
    expect(props.onSetConnectorEnabled).toHaveBeenCalledWith('gmail', true);
  });

  it('shows a spinner while the connector list is still loading', () => {
    renderMenu({ workPalette: true, connectorsLoading: true, connectors: [] });

    expect(screen.getByRole('status', { name: 'Loading connected apps' })).toBeInTheDocument();
    expect(screen.queryByTestId('composer-palette-connector-gmail')).not.toBeInTheDocument();
  });

  it('filters the rows above the search field as the query is typed', () => {
    renderMenu({ workPalette: true });

    fireEvent.change(screen.getByLabelText('Search the AGI Work palette'), {
      target: { value: 'gmail' },
    });

    expect(screen.getByTestId('composer-palette-connector-gmail')).toBeInTheDocument();
    expect(screen.queryByTestId('composer-palette-connector-notion')).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Create image' })).not.toBeInTheDocument();
  });

  it('reaches the skill, folder and plugin catalogs from the same query', async () => {
    const { props } = renderMenu({ workPalette: true });

    fireEvent.change(screen.getByLabelText('Search the AGI Work palette'), {
      target: { value: 're' },
    });

    expect(screen.getByRole('menuitem', { name: /brand-voice/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Website Redesign/ })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('menuitem', { name: /Research Pack/ })).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('menuitem', { name: /Website Redesign/ }));
    expect(props.onSelectFolder).toHaveBeenCalledWith('proj-1');
  });

  it('says so when nothing matches the query', async () => {
    renderMenu({ workPalette: true });

    fireEvent.change(screen.getByLabelText('Search the AGI Work palette'), {
      target: { value: 'zzzzz' },
    });

    await waitFor(() => expect(screen.getAllByText('No matches').length).toBeGreaterThan(0));
  });

  it('keeps the search field as the last item arrow navigation reaches', async () => {
    renderMenu({ workPalette: true });

    const menu = palette();
    const items = Array.from(
      menu.querySelectorAll<HTMLElement>(
        '[role="menuitem"], [role="menuitemcheckbox"], [data-composer-palette-search]',
      ),
    );
    expect(items.at(-1)).toBe(screen.getByLabelText('Search the AGI Work palette'));

    await waitFor(() => expect(document.activeElement).toBe(items[0]));

    fireEvent.keyDown(document, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(items.at(-1));
  });

  it('closes on Escape and puts focus back on the plus button', async () => {
    const { props } = renderMenu({ workPalette: true });

    await waitFor(() => expect(palette().contains(document.activeElement)).toBe(true));

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(props.onRequestClose).toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: TRIGGER_LABEL }));
  });
});
