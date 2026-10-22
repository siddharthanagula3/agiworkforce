import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AttachmentMenu } from '../AttachmentMenu';
import { CapabilityProvider } from '../../lib/capabilities';

afterEach(cleanup);

function renderMenu(onOpenChange = vi.fn()) {
  render(
    <CapabilityProvider platform="desktop">
      <AttachmentMenu
        open
        onOpenChange={onOpenChange}
        onAddFiles={vi.fn()}
        researchEnabled={false}
        onResearchToggle={vi.fn()}
      >
        <button type="button">Plus</button>
      </AttachmentMenu>
    </CapabilityProvider>,
  );
  return onOpenChange;
}

describe('AttachmentMenu, Add plugins', () => {
  it('lists Add plugins right after Connectors', () => {
    renderMenu();
    const labels = screen.getAllByRole('button').map((button) => button.textContent?.trim());
    const connectors = labels.indexOf('Connectors');
    expect(connectors).toBeGreaterThan(-1);
    expect(labels[connectors + 1]).toBe('Add plugins…');
  });

  it('opens the Plugins settings tab and closes the menu', () => {
    const onOpenChange = renderMenu();
    const received: unknown[] = [];
    const listener = (event: Event) => received.push((event as CustomEvent).detail);
    window.addEventListener('chat:action', listener);

    fireEvent.click(screen.getByRole('button', { name: 'Add plugins…' }));

    window.removeEventListener('chat:action', listener);
    expect(received).toEqual([{ type: 'open-settings', tab: 'plugins' }]);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
