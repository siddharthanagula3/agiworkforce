import { render, screen } from '@testing-library/react';
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
