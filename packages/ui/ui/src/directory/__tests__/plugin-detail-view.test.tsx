import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PluginDetailView } from '../PluginDetailView';
import type { DirectoryPluginDetail } from '../types';

afterEach(cleanup);

const COMMAND = 'claude plugin install frontend-design@claude-plugins-official';

const detail: DirectoryPluginDetail = {
  kind: 'plugin',
  id: 'frontend-design',
  name: 'Frontend Design',
  publisher: 'Anthropic',
  description: 'Create distinctive frontend interfaces.',
  verified: true,
  installCount: 1_134_112,
  examplePrompts: ['Design a pricing page'],
  components: {
    skills: ['frontend-design', 'design-review'],
    commands: 2,
    agents: 0,
    hooks: true,
    mcpServers: [{ name: 'github', transport: 'http' }],
    lspServers: [],
  },
  installCommand: COMMAND,
  runtimeNote: null,
  homepageUrl: 'https://example.invalid/frontend-design',
  repositoryUrl: 'https://github.com/example/plugins',
  marketplaceName: 'example-marketplace',
  marketplaceUrl: 'https://github.com/example/plugins',
  worksWith: ['Web', 'CLI'],
  installed: false,
  installable: true,
};

function selectTab(name: string) {
  fireEvent.mouseDown(screen.getByRole('tab', { name }), { button: 0 });
}

function renderDetail(
  patch: Partial<DirectoryPluginDetail> = {},
  props: Partial<Parameters<typeof PluginDetailView>[0]> = {},
) {
  return render(<PluginDetailView detail={{ ...detail, ...patch }} onBack={vi.fn()} {...props} />);
}

describe('PluginDetailView', () => {
  it('leads with the name, publisher, install count, verified glyph and Install', () => {
    const onInstall = vi.fn();
    renderDetail({}, { onInstall });
    expect(screen.getByRole('heading', { name: 'Frontend Design' })).toBeTruthy();
    expect(screen.getByText('Anthropic')).toBeTruthy();
    expect(screen.getByText('1.1M')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Verified' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Install' }));
    expect(onInstall).toHaveBeenCalled();
    expect(screen.queryByTestId('plugin-install-command')).toBeNull();
  });

  it('shows Installed with an Uninstall control once installed', () => {
    const onUninstall = vi.fn();
    renderDetail({ installed: true }, { onUninstall });
    expect(screen.getByText('Installed')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Uninstall' }));
    expect(onUninstall).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Install' })).toBeNull();
  });

  it('explains a plugin the web cannot install and offers the command with a copy control', async () => {
    const onCopyValue = vi.fn().mockResolvedValue(undefined);
    renderDetail(
      {
        installable: false,
        availabilityNote: 'Desktop and CLI',
        runtimeNote: 'This plugin runs CLI hooks the web app cannot execute.',
      },
      { onCopyValue, onInstall: vi.fn() },
    );
    expect(screen.getByText('Desktop and CLI')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Install' })).toBeNull();
    expect(screen.getByText('This plugin runs CLI hooks the web app cannot execute.')).toBeTruthy();
    expect(screen.getByTestId('plugin-install-command').textContent).toBe(COMMAND);
    fireEvent.click(screen.getByRole('button', { name: 'Copy install command' }));
    expect(onCopyValue).toHaveBeenCalledWith(COMMAND);
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Copied'));
  });

  it('summarises only the components the plugin ships', () => {
    renderDetail();
    expect(screen.getByRole('heading', { name: 'Includes' })).toBeTruthy();
    expect(screen.getByText('frontend-design')).toBeTruthy();
    expect(screen.getByText('design-review')).toBeTruthy();
    expect(screen.getByText('Commands').nextElementSibling?.textContent).toBe('2');
    expect(screen.getByText('github via http')).toBeTruthy();
    expect(screen.getByText('Hooks').nextElementSibling?.textContent).toBe('Included');
    expect(screen.queryByText('Agents')).toBeNull();
    expect(screen.queryByText('Language servers')).toBeNull();
  });

  it('hides the components section when nothing was inspected', () => {
    renderDetail({
      components: {
        skills: [],
        commands: 0,
        agents: 0,
        hooks: false,
        mcpServers: [],
        lspServers: [],
      },
    });
    expect(screen.queryByRole('heading', { name: 'Includes' })).toBeNull();
  });

  it('lists example prompts under Try asking', () => {
    renderDetail();
    expect(screen.getByRole('heading', { name: 'Try asking' })).toBeTruthy();
    expect(screen.getByText('Design a pricing page')).toBeTruthy();
  });

  it('links the homepage, repository and marketplace once each', () => {
    const onOpenHref = vi.fn();
    renderDetail({}, { onOpenHref });
    fireEvent.click(screen.getByRole('button', { name: 'Homepage' }));
    expect(onOpenHref).toHaveBeenCalledWith('https://example.invalid/frontend-design');
    expect(screen.getByRole('button', { name: 'Repository' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'example-marketplace' })).toBeNull();
  });

  it('links a marketplace whose repository differs from the plugin repository', () => {
    renderDetail({ marketplaceUrl: 'https://github.com/example/marketplace' });
    expect(screen.getByRole('button', { name: 'example-marketplace' })).toBeTruthy();
  });

  it('renders the works-with chips', () => {
    renderDetail();
    expect(screen.getByText('Works with')).toBeTruthy();
    expect(screen.getByText('Web')).toBeTruthy();
    expect(screen.getByText('CLI')).toBeTruthy();
  });
});

describe('PluginDetailView installed controls', () => {
  const settings = {
    pluginId: 'frontend-design',
    skills: [
      { name: 'frontend-design', enabled: true },
      { name: 'design-review', enabled: false },
    ],
    connectors: [
      { id: 'github', name: 'GitHub', connected: true },
      { id: 'linear', name: 'Linear', connected: false },
    ],
    loading: false,
    saving: false,
    error: null,
  };

  it('offers no enable switch until the plugin is installed', () => {
    renderDetail({ installed: false }, { onSetEnabled: vi.fn() });
    expect(screen.queryByRole('switch', { name: 'Enabled' })).toBeNull();
  });

  it('shows the stored enable position and reports a change once', () => {
    const onSetEnabled = vi.fn();
    renderDetail({ installed: true, enabled: false }, { onSetEnabled });
    const toggle = screen.getByRole('switch', { name: 'Enabled' });
    expect(toggle.getAttribute('data-state')).toBe('unchecked');
    fireEvent.click(toggle);
    expect(onSetEnabled).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('treats a missing enabled field as on rather than off', () => {
    renderDetail({ installed: true }, { onSetEnabled: vi.fn() });
    expect(screen.getByRole('switch', { name: 'Enabled' }).getAttribute('data-state')).toBe(
      'checked',
    );
  });

  it('lists each declared skill at its stored position and reports a change', () => {
    const onSetSkillEnabled = vi.fn();
    renderDetail({ installed: true }, { settings, onSetSkillEnabled });
    expect(
      screen.getByRole('switch', { name: 'Use frontend-design' }).getAttribute('data-state'),
    ).toBe('checked');
    const off = screen.getByRole('switch', { name: 'Use design-review' });
    expect(off.getAttribute('data-state')).toBe('unchecked');
    fireEvent.click(off);
    expect(onSetSkillEnabled).toHaveBeenCalledExactlyOnceWith('design-review', true);
  });

  it('says which required connectors are missing under the Connectors tab', () => {
    renderDetail({ installed: true }, { settings });
    selectTab('Connectors');
    expect(screen.getByText('GitHub')).toBeTruthy();
    expect(screen.getByText('Connected')).toBeTruthy();
    expect(screen.getByText('Not connected')).toBeTruthy();
  });

  it('opens the Skills tab first and carries the leader copy on both', () => {
    renderDetail({ installed: true }, { settings });
    expect(screen.getByRole('tab', { name: 'Skills' }).getAttribute('data-state')).toBe('active');
    expect(
      screen.getByText(
        'Invoke by typing / in chat, or let AGI use them automatically for relevant tasks.',
      ),
    ).toBeTruthy();
    selectTab('Connectors');
    expect(
      screen.getByText(
        'Tools and data sources this plugin connects to. Connect each one so AGI can use it.',
      ),
    ).toBeTruthy();
  });

  it('writes each skill as a slash command with its description', () => {
    renderDetail(
      { installed: true },
      {
        settings: {
          ...settings,
          skills: [
            { name: 'frontend-design', enabled: true, description: 'Create distinctive pages.' },
          ],
        },
      },
    );
    expect(screen.getByText('/frontend-design')).toBeTruthy();
    expect(screen.getByText('Create distinctive pages.')).toBeTruthy();
  });

  it('offers Connect on a connector that is not connected and hands back its id', () => {
    const onOpenConnector = vi.fn();
    renderDetail({ installed: true }, { settings, onOpenConnector });
    selectTab('Connectors');
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    expect(onOpenConnector).toHaveBeenCalledExactlyOnceWith('linear');
    expect(screen.queryByText('Not connected')).toBeNull();
  });

  it('drops the Includes skill chips once the tabs list the same skills', () => {
    renderDetail({ installed: true }, { settings });
    expect(screen.getByRole('heading', { name: 'Includes' })).toBeTruthy();
    expect(screen.getByText('Commands').nextElementSibling?.textContent).toBe('2');
    expect(screen.getByText('Hooks').nextElementSibling?.textContent).toBe('Included');
    expect(screen.queryByText('frontend-design')).toBeNull();
    expect(screen.getByText('/frontend-design')).toBeTruthy();
  });

  it('keeps the Includes skill chips when no tabs are shown', () => {
    renderDetail({ installed: true });
    expect(screen.queryByRole('tab', { name: 'Skills' })).toBeNull();
    expect(screen.getByText('frontend-design')).toBeTruthy();
    expect(screen.getByText('design-review')).toBeTruthy();
  });

  it('states the source and the last updated date as facts', () => {
    renderDetail({
      installed: true,
      sourceLabel: 'Marketplace',
      sourceUrl: 'https://github.com/example/plugins',
      updatedAt: '2026-09-04T00:00:00.000Z',
    });
    expect(screen.getByText('Source')).toBeTruthy();
    expect(screen.getByText('Last updated')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /Marketplace/ }).length).toBeGreaterThan(0);
  });

  it('freezes the skill switches while a save is in flight', () => {
    renderDetail(
      { installed: true },
      { settings: { ...settings, saving: true }, onSetSkillEnabled: vi.fn() },
    );
    expect(screen.getByRole('switch', { name: 'Use design-review' }).hasAttribute('disabled')).toBe(
      true,
    );
  });

  it('shows a failed settings read as an alert instead of an empty skill list', () => {
    renderDetail(
      { installed: true },
      { settings: { ...settings, skills: [], connectors: [], error: 'Could not read settings.' } },
    );
    expect(screen.getByRole('alert').textContent).toContain('Could not read settings.');
  });

  it('renders the version the adapter supplies', () => {
    renderDetail({ version: '2.1.0' });
    expect(screen.getByText('2.1.0')).toBeTruthy();
  });
});
