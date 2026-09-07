import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CapabilityProvider } from '@agiworkforce/unified-chat';
import { SlashCommandMenu } from './SlashCommandMenu';

vi.mock('@shared/stores/web-settings-store', () => ({
  useSettingsStore: (selector: (state: { customCommands: never[] }) => unknown) =>
    selector({ customCommands: [] }),
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
