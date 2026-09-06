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
