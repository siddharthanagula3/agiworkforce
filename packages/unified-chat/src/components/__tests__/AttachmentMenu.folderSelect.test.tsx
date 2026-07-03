/**
 * Task #10 (desktop QA): "Select folder" reachability in the live composer's
 * attachment menu — capability-gated via `canUseWorkingDirectory`.
 *
 * The Popover is externally controlled (`open` prop), so rendering with
 * `open={true}` exercises `Popover.Content` directly without needing to
 * simulate the trigger click (avoids jsdom gaps around pointer-capture APIs).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { AttachmentMenu } from '../AttachmentMenu';
import { CapabilityProvider } from '../../lib/capabilities';

afterEach(cleanup);

const baseProps = {
  open: true,
  onOpenChange: vi.fn(),
  onAddFiles: vi.fn(),
  webSearchEnabled: false,
  onWebSearchToggle: vi.fn(),
  researchEnabled: false,
  onResearchToggle: vi.fn(),
};

describe('AttachmentMenu — Select folder', () => {
  it('renders "Select folder" on desktop (canUseWorkingDirectory) and calls back on click', () => {
    const onSelectFolder = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <CapabilityProvider platform="desktop">
        <AttachmentMenu {...baseProps} onOpenChange={onOpenChange} onSelectFolder={onSelectFolder}>
          <button type="button">Plus</button>
        </AttachmentMenu>
      </CapabilityProvider>,
    );

    const item = screen.getByText('Select folder');
    expect(item).toBeTruthy();

    item.click();

    expect(onSelectFolder).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('shows the current folder label instead of the generic prompt when scoped', () => {
    render(
      <CapabilityProvider platform="desktop">
        <AttachmentMenu {...baseProps} currentFolderLabel="~/Projects/agiworkforce">
          <button type="button">Plus</button>
        </AttachmentMenu>
      </CapabilityProvider>,
    );

    expect(screen.getByText('Folder: ~/Projects/agiworkforce')).toBeTruthy();
    expect(screen.queryByText('Select folder')).toBeNull();
  });

  it('does not render "Select folder" on web (canUseWorkingDirectory is false)', () => {
    render(
      <CapabilityProvider platform="web">
        <AttachmentMenu {...baseProps} onSelectFolder={vi.fn()}>
          <button type="button">Plus</button>
        </AttachmentMenu>
      </CapabilityProvider>,
    );

    expect(screen.queryByText('Select folder')).toBeNull();
  });

  it('does not render "Select folder" on mobile (canUseWorkingDirectory is false)', () => {
    render(
      <CapabilityProvider platform="mobile">
        <AttachmentMenu {...baseProps} onSelectFolder={vi.fn()}>
          <button type="button">Plus</button>
        </AttachmentMenu>
      </CapabilityProvider>,
    );

    expect(screen.queryByText('Select folder')).toBeNull();
  });
});
