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
});
