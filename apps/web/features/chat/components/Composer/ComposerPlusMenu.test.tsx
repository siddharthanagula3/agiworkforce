import { useRef } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { baseInitOptions } from '@agiworkforce/i18n';

import { ComposerPlusMenu, type ComposerPlusMenuProps } from './ComposerPlusMenu';
import { invalidatePalettePlugins } from '@features/chat/services/palette-plugin-catalog';

const TRIGGER_LABEL = 'Open composer menu';

function baseProps(): Omit<ComposerPlusMenuProps, 'anchorRef' | 'contentRef'> {
  return {
    open: true,
    onRequestClose: vi.fn(),
    closeMenu: vi.fn(),
    workPalette: false,
    onAddFiles: vi.fn(),
    onAttachLibraryFile: vi.fn(),
    mediaModeActive: false,
    attachmentsUnavailable: false,
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
    showLocalFolderRow: false,
    showDesktopActionRows: false,
    isReadingClipboard: false,
    onAttachClipboard: vi.fn(),
    onRunLocalCommand: vi.fn(),
    onUseBrowser: vi.fn(),
    deviceStepsEnabled: true,
    onToggleDeviceSteps: vi.fn(),
    onAttachFromLocalFolder: vi.fn(),
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
    officeOutputFormat: null,
    officeCreationDisabled: false,
    onSelectOfficeOutput: vi.fn(),
    memoryEnabled: true,
    memoryDisabled: false,
    onToggleMemory: vi.fn(),
    showTemporaryChat: false,
    temporaryChatSaving: false,
    isIncognito: false,
    canToggleIncognito: true,
    onToggleIncognito: vi.fn(),
    canEndTemporaryChat: false,
    onEndTemporaryChat: vi.fn(),
    skills: [
      { name: 'brand-voice', description: 'Rewrite copy in the house voice', source: 'personal' },
      { name: 'sql-review', description: 'Review a query plan', source: 'personal' },
      { name: 'ads', description: 'Plan a paid campaign', source: 'bundled' },
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
    expect(
      screen.queryByRole('button', { name: 'Attach from local folder' }),
    ).not.toBeInTheDocument();
  });

  it('toggles per-chat memory from its own row', () => {
    const { props } = renderMenu();

    const row = screen.getByRole('button', { name: 'Memory' });
    expect(row).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(row);
    expect(props.onToggleMemory).toHaveBeenCalledOnce();
  });

  it('disables the memory row and keeps its reason when the capability is off', () => {
    const { props } = renderMenu({
      memoryEnabled: false,
      memoryDisabled: true,
      memoryTitle: 'Turn on Memory in Settings.',
    });

    const row = screen.getByRole('button', { name: 'Memory' });
    expect(row).toBeDisabled();
    expect(row).toHaveAttribute('aria-pressed', 'false');
    expect(row).toHaveAttribute('title', 'Turn on Memory in Settings.');
    fireEvent.click(row);
    expect(props.onToggleMemory).not.toHaveBeenCalled();
  });

  it('lists connected connectors only once the Connectors row is expanded', () => {
    renderMenu({ connectorsSubmenuOpen: true });

    expect(screen.getByRole('group', { name: 'Connectors' })).toBeInTheDocument();
    expect(screen.queryByRole('menu', { name: 'Connectors' })).not.toBeInTheDocument();
    const row = screen.getByRole('menuitemcheckbox', { name: 'Gmail' });
    expect(row).toBeInTheDocument();
    // The same fragment the AGI Work bar popover asserts: one row component.
    expect(row.className).toContain('items-center gap-3 rounded-lg py-2 pe-3');
    expect(screen.getByRole('menuitem', { name: 'Browse connectors' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Add custom connector' })).toBeInTheDocument();
  });

  it('lists the skills under the Skills row and selects one', () => {
    const { props } = renderMenu();

    fireEvent.click(screen.getByRole('button', { name: 'Skills' }));
    expect(screen.getByRole('group', { name: 'Skills' })).toBeInTheDocument();
    expect(screen.queryByRole('menu', { name: 'Skills' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'ads' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: 'brand-voice' }));

    expect(props.onSelectSkill).toHaveBeenCalledWith('brand-voice');
    expect(props.closeMenu).toHaveBeenCalled();
  });

  it('makes the Skills settings bookmarkable from the Manage skills row', () => {
    window.location.hash = '';
    const { props } = renderMenu();

    fireEvent.click(screen.getByRole('button', { name: 'Skills' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Manage skills' }));

    expect(window.location.hash).toBe('#settings/customize-skills');
    expect(props.onOpenSettings).toHaveBeenCalledWith('skills');
    expect(props.closeMenu).toHaveBeenCalled();
    window.location.hash = '';
  });

  it('lists the installed plugins with the skills they carry', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string) => {
        if (input.includes('marketplace-installations')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ installations: [] }) });
        }
        if (input.endsWith('/installations')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({ installations: [{ pluginId: 'data-pack', enabled: true }] }),
          });
        }
        if (input.endsWith('/data-pack')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                entry: {
                  id: 'data-pack',
                  name: 'Data Pack',
                  source: 'builtin',
                  publisher: { kind: 'builtin' },
                  webInstallable: true,
                  declaredSkills: ['sql-review', 'not-installed'],
                },
              }),
          });
        }
        return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
      }),
    );
    const { props } = renderMenu();

    fireEvent.click(screen.getByRole('button', { name: 'Plugins' }));
    expect(screen.getByRole('group', { name: 'Plugins' })).toBeInTheDocument();
    expect(screen.queryByRole('menu', { name: 'Plugins' })).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Data Pack' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'sql-review' }));

    expect(props.onSelectSkill).toHaveBeenCalledWith('sql-review');
    expect(screen.queryByRole('menuitem', { name: 'not-installed' })).not.toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it('makes the Plugins settings bookmarkable from the Manage plugins row', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) })),
    );
    window.location.hash = '';
    const { props } = renderMenu();

    fireEvent.click(screen.getByRole('button', { name: 'Plugins' }));
    expect(await screen.findByText('No plugins installed yet.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Manage plugins' }));

    expect(window.location.hash).toBe('#settings/customize-plugins');
    expect(props.onOpenSettings).toHaveBeenCalledWith('plugins');
    expect(props.closeMenu).toHaveBeenCalled();
    window.location.hash = '';
    vi.unstubAllGlobals();
  });

  it('makes the settings it opens bookmarkable by setting the hash', () => {
    window.location.hash = '';
    const { props } = renderMenu({ connectorsSubmenuOpen: true });

    fireEvent.click(screen.getByRole('menuitem', { name: 'Browse connectors' }));

    expect(window.location.hash).toBe('#settings/customize-connectors');
    expect(props.onOpenSettings).toHaveBeenCalledWith('connectors');
    expect(props.closeMenu).toHaveBeenCalled();
    window.location.hash = '';
  });

  it('addresses the custom connector form itself, not the pane behind it', () => {
    window.location.hash = '';
    const { props } = renderMenu({ connectorsSubmenuOpen: true });

    fireEvent.click(screen.getByRole('menuitem', { name: 'Add custom connector' }));

    expect(window.location.hash).toBe('#settings/customize-connectors/new');
    expect(props.onOpenSettings).toHaveBeenCalledWith('connectors');
    expect(props.closeMenu).toHaveBeenCalled();
    window.location.hash = '';
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
    expect(within(menu).queryByText('Web search')).not.toBeInTheDocument();
    expect(within(menu).queryByText('Run code')).not.toBeInTheDocument();
    expect(within(menu).queryByText('Memory')).not.toBeInTheDocument();
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

  it('sends the typed term to the plugin route once, after the debounce', async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    renderMenu({ workPalette: true });
    const field = screen.getByLabelText('Search the AGI Work palette');

    for (const value of ['a', 'ad', 'ado', 'adob', 'adobe']) {
      fireEvent.change(field, { target: { value } });
    }

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('search=adobe');
  });

  it('asks the route again for a different term rather than filtering one page', async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    renderMenu({ workPalette: true });
    const field = screen.getByLabelText('Search the AGI Work palette');

    fireEvent.change(field, { target: { value: 'adobe' } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    fireEvent.change(field, { target: { value: 'figma' } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('search=figma');
  });

  it('asks for nothing while the field is empty', async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    renderMenu({ workPalette: true });

    fireEvent.change(screen.getByLabelText('Search the AGI Work palette'), {
      target: { value: '   ' },
    });

    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sets the same hash from the palette Manage in Settings row', () => {
    window.location.hash = '';
    const { props } = renderMenu({ workPalette: true });

    fireEvent.click(screen.getByRole('menuitem', { name: 'Manage in Settings' }));

    expect(window.location.hash).toBe('#settings/customize-connectors');
    expect(props.onOpenSettings).toHaveBeenCalledWith('connectors');
    window.location.hash = '';
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

describe('ComposerPlusMenu, working folder row', () => {
  const FOLDER = 'acme-repo';
  const CLEAR = 'Clear working folder';
  const folderRow = { showWorkingFolderRow: true, canPickFolder: true, folderName: FOLDER };

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders the clear control beside the picker, never inside it', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { props } = renderMenu(folderRow);

    const clear = screen.getByRole('button', { name: CLEAR });
    const picker = screen.getByRole('button', { name: FOLDER });

    expect(clear.parentElement?.closest('button')).toBeNull();
    expect(picker).not.toHaveAccessibleName(/Clear working folder/);
    expect(
      consoleError.mock.calls.some((call) => String(call[0]).includes('cannot be a descendant of')),
    ).toBe(false);

    fireEvent.click(clear);
    expect(props.onClearFolder).toHaveBeenCalledTimes(1);
    expect(props.onPickFolder).not.toHaveBeenCalled();

    fireEvent.click(picker);
    expect(props.onPickFolder).toHaveBeenCalledTimes(1);
    expect(props.onClearFolder).toHaveBeenCalledTimes(1);
  });

  it('moves focus to the picker after clearing, so it does not fall to the page', () => {
    renderMenu(folderRow);

    const clear = screen.getByRole('button', { name: CLEAR });
    clear.focus();
    fireEvent.click(clear);

    expect(document.activeElement).toBe(screen.getByRole('button', { name: FOLDER }));
  });

  it('keeps the clear control usable when this browser cannot pick a folder', () => {
    const { props } = renderMenu({ ...folderRow, canPickFolder: false });

    expect(screen.getByRole('button', { name: new RegExp(FOLDER) })).toBeDisabled();
    const clear = screen.getByRole('button', { name: CLEAR });
    expect(clear).toBeEnabled();

    fireEvent.click(clear);
    expect(props.onClearFolder).toHaveBeenCalledTimes(1);
  });

  it('makes the clear control its own palette item that arrow keys reach', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ entries: [] }) })),
    );
    invalidatePalettePlugins();
    renderMenu({ ...folderRow, workPalette: true });

    const menu = palette();
    await waitFor(() => expect(menu.contains(document.activeElement)).toBe(true));
    const picker = within(menu).getByRole('menuitem', { name: FOLDER });
    const clear = within(menu).getByRole('menuitem', { name: CLEAR });
    expect(clear.parentElement?.closest('[role="menuitem"]')).toBeNull();

    picker.focus();
    fireEvent.keyDown(document, { key: 'ArrowDown' });

    expect(document.activeElement).toBe(clear);
  });
});

describe('ComposerPlusMenu, free image and video offer', () => {
  const LAST_DAY = '2026-10-20';
  const NOTE = "Today's free limit is used. Resets in 3 hours.";
  const mediaRows = {
    hostCanGenerateVideo: true,
    videoModelsAvailable: true,
    canUseImageGeneration: false,
    canUseVideoGeneration: false,
  };

  it('shows Limited with a clock and the plain line instead of Upgrade while the offer is ready', () => {
    renderMenu({
      ...mediaRows,
      imageAccess: { label: 'limited', lastDay: LAST_DAY },
      imageOfferNote: NOTE,
      videoAccess: { label: 'upgrade' },
      videoOfferNote: null,
    });

    const image = screen.getByText('Create image').closest('button')!;
    expect(image).toHaveTextContent('Limited');
    expect(image).not.toHaveTextContent(/upgrade/i);
    expect(
      image.querySelector('svg[aria-hidden="true"]:not(.text-muted-foreground)'),
    ).not.toBeNull();
    expect(image).not.toHaveAttribute('title');
    expect(image).toHaveAccessibleDescription(NOTE);
    expect(screen.getByText(NOTE)).toBeVisible();

    const video = screen.getByText('Create video').closest('button')!;
    expect(video).toHaveTextContent(/upgrade/i);
    expect(video).not.toHaveTextContent('Limited');
    expect(video).toHaveAttribute(
      'title',
      expect.stringMatching(/^Video generation is available on /),
    );
    expect(screen.getAllByText(NOTE)).toHaveLength(1);
  });

  it('says Upgrade by itself when the offer is not ready, and names no free capacity', () => {
    renderMenu({
      ...mediaRows,
      imageAccess: { label: 'upgrade' },
      imageOfferNote: NOTE,
      videoAccess: { label: 'upgrade' },
    });

    const image = screen.getByText('Create image').closest('button')!;
    expect(image).toHaveTextContent(/upgrade/i);
    expect(image).toHaveAttribute('title', 'Image generation is available on Pro and above.');
    expect(screen.queryByText('Limited')).not.toBeInTheDocument();
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
  });

  it('holds back both labels while the offer is still being checked', () => {
    renderMenu({ ...mediaRows, imageAccess: { label: 'upgrade' }, freeMediaOfferChecking: true });

    const image = screen.getByText('Create image').closest('button')!;
    expect(image).toHaveTextContent('Checking');
    expect(image).not.toHaveTextContent(/upgrade|limited/i);
  });

  it('adds no label to a plan that includes the capability', () => {
    renderMenu({
      ...mediaRows,
      canUseImageGeneration: true,
      imageAccess: { label: 'included' },
      imageOfferNote: NOTE,
    });

    const image = screen.getByText('Create image').closest('button')!;
    expect(image).not.toHaveTextContent(/upgrade|limited|checking/i);
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
  });
});

describe('ComposerPlusMenu, desktop host', () => {
  it('offers the local folder row on desktop and reports the choice', () => {
    const { props } = renderMenu({ showLocalFolderRow: true });

    fireEvent.click(screen.getByRole('button', { name: 'Attach from local folder' }));

    expect(props.onAttachFromLocalFolder).toHaveBeenCalledTimes(1);
  });
});
