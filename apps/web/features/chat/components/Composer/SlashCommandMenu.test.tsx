import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CapabilityProvider } from '@agiworkforce/unified-chat';
import { SlashCommandMenu, type SlashCommandMenuHandle } from './SlashCommandMenu';

vi.mock('@shared/stores/web-settings-store', () => ({
  useSettingsStore: (selector: (state: { customCommands: never[] }) => unknown) =>
    selector({ customCommands: [] }),
}));

vi.mock('@features/chat/services/installed-plugins', () => ({
  loadInstalledPlugins: async () => [
    { id: 'github-automation', name: 'GitHub Automation', skills: ['pr-review', 'brand-voice'] },
  ],
}));

const baseProps = {
  query: '',
  onSelect: vi.fn(),
  onClose: vi.fn(),
  skills: [],
  imageCommandAvailable: true,
  codeCommandAvailable: true,
};

describe('SlashCommandMenu media admission', () => {
  it('omits /image when the host or deployment cannot execute it', () => {
    const { rerender } = render(
      <CapabilityProvider platform="web">
        <SlashCommandMenu {...baseProps} imageCommandAvailable={false} />
      </CapabilityProvider>,
    );

    expect(screen.queryByText('/image')).toBeNull();
    expect(screen.getByText('/search')).toBeInTheDocument();

    rerender(
      <CapabilityProvider platform="web">
        <SlashCommandMenu {...baseProps} imageCommandAvailable />
      </CapabilityProvider>,
    );
    expect(screen.getByText('/image')).toBeInTheDocument();
  });

  it('omits /code when the selected model cannot run code', () => {
    const { rerender } = render(
      <CapabilityProvider platform="web">
        <SlashCommandMenu {...baseProps} codeCommandAvailable={false} />
      </CapabilityProvider>,
    );

    expect(screen.queryByText('/code')).toBeNull();

    rerender(
      <CapabilityProvider platform="web">
        <SlashCommandMenu {...baseProps} codeCommandAvailable />
      </CapabilityProvider>,
    );
    expect(screen.getByText('/code')).toBeInTheDocument();
  });

  it('finds a compound skill name by a word inside it, ranked after prefix matches', () => {
    render(
      <CapabilityProvider platform="web">
        <SlashCommandMenu
          {...baseProps}
          query="seo"
          skills={[
            { name: 'ai-seo', description: 'Optimise for AI answer engines.' },
            { name: 'seo-audit', description: 'Audit a site for search.' },
            { name: 'programmatic-seo', description: 'Build pages at scale.' },
            { name: 'copywriting', description: 'Write landing copy.' },
          ]}
        />
      </CapabilityProvider>,
    );

    const listed = screen.getAllByText(/^\//).map((node) => node.textContent);
    expect(listed).toEqual(['/seo-audit', '/ai-seo', '/programmatic-seo']);
  });

  it('says what a skill needs without making it unselectable', () => {
    const onSkillSelect = vi.fn();
    render(
      <CapabilityProvider platform="web">
        <SlashCommandMenu
          {...baseProps}
          query="document"
          onSkillSelect={onSkillSelect}
          skills={[
            {
              name: 'document-creation',
              description: 'Create polished Word documents.',
              requiredTools: ['create_office_file'],
            },
          ]}
        />
      </CapabilityProvider>,
    );

    expect(screen.getByText(/Needs create_office_file/)).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole('option', { name: /document-creation/ }));
    expect(onSkillSelect).toHaveBeenCalledWith('document-creation');
  });

  it('describes /code by what selecting it does', () => {
    render(
      <CapabilityProvider platform="web">
        <SlashCommandMenu {...baseProps} />
      </CapabilityProvider>,
    );

    expect(screen.getByText('Run code in a sandbox')).toBeInTheDocument();
    expect(screen.queryByText(/explain code/i)).toBeNull();
  });
});

const CATALOGUE = [
  { name: 'brand-voice', description: 'Your own voice guide.', source: 'personal' },
  { name: 'data-cleanup', description: 'Tidy a messy spreadsheet.', source: 'bundled' },
  { name: 'pr-review', description: 'Review a pull request.', source: 'bundled' },
  { name: 'docx', description: 'Write Word documents.', source: 'bundled' },
];

function renderGrouped(query = '') {
  return render(
    <CapabilityProvider platform="web">
      <SlashCommandMenu {...baseProps} query={query} skills={CATALOGUE} />
    </CapabilityProvider>,
  );
}

function optionNames(): string[] {
  return screen.getAllByRole('option').map((node) => node.querySelector('code')?.textContent ?? '');
}

describe('SlashCommandMenu grouping', () => {
  /**
   * Every bundled skill used to sit in one flat run under the built-ins, each
   * carrying its whole multi-sentence description, so the menu showed about one
   * skill per screen and nothing said which plugin a skill came from.
   */
  it('orders own skills, then each plugin, then the bundled catalogue', async () => {
    renderGrouped();
    await screen.findByRole('group', { name: 'GitHub Automation' });

    const groups = screen.getAllByRole('group').map((node) => node.getAttribute('aria-label'));
    expect(groups).toEqual(['GitHub Automation', 'Skills']);

    const names = optionNames();
    expect(names.indexOf('/brand-voice')).toBeLessThan(names.indexOf('/pr-review'));
    expect(names.indexOf('/pr-review')).toBeLessThan(names.indexOf('/data-cleanup'));
  });

  it('lists a plugin skill under its plugin and not again under Skills', async () => {
    renderGrouped();
    const pluginGroup = await screen.findByRole('group', { name: 'GitHub Automation' });

    expect(within(pluginGroup).getByRole('option', { name: /pr-review/ })).toBeInTheDocument();
    const bundled = screen.getByRole('group', { name: 'Skills' });
    expect(within(bundled).queryByRole('option', { name: /pr-review/ })).toBeNull();
    expect(optionNames().filter((name) => name === '/pr-review')).toHaveLength(1);
  });

  it('leaves a skill the user owns out of the plugin that also declares it', async () => {
    renderGrouped();
    const pluginGroup = await screen.findByRole('group', { name: 'GitHub Automation' });

    expect(within(pluginGroup).queryByRole('option', { name: /brand-voice/ })).toBeNull();
    expect(optionNames().filter((name) => name === '/brand-voice')).toHaveLength(1);
  });

  it('filters across groups and drops the ones left empty', async () => {
    renderGrouped('data');
    await screen.findByRole('group', { name: 'Skills' });

    expect(optionNames()).toEqual(['/data-cleanup']);
    expect(screen.queryByRole('group', { name: 'GitHub Automation' })).toBeNull();
    expect(screen.queryByRole('option', { name: /search/ })).toBeNull();
  });

  it('clamps a description to one line and keeps the whole of it in the title', async () => {
    renderGrouped();
    await screen.findByRole('group', { name: 'Skills' });

    const description = screen.getByTitle('Tidy a messy spreadsheet.');
    expect(description.className).toContain('truncate');
  });

  it('walks every row in order, group headings included', async () => {
    const ref = React.createRef<SlashCommandMenuHandle>();
    render(
      <CapabilityProvider platform="web">
        <SlashCommandMenu {...baseProps} ref={ref} skills={CATALOGUE} />
      </CapabilityProvider>,
    );
    await screen.findByRole('group', { name: 'GitHub Automation' });

    const total = screen.getAllByRole('option').length;
    expect(total).toBeGreaterThan(CATALOGUE.length);

    for (let step = 1; step < total; step += 1) {
      act(() => {
        ref.current?.handleKey('ArrowDown');
      });
      const selected = screen.getAllByRole('option').findIndex((node) => {
        return node.getAttribute('aria-selected') === 'true';
      });
      expect(selected).toBe(step);
    }
  });
});
