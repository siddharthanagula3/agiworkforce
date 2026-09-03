import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { AttachmentMenu } from '../AttachmentMenu';
import { CapabilityProvider } from '../../lib/capabilities';

afterEach(cleanup);

const baseProps = {
  open: true,
  onOpenChange: vi.fn(),
  onAddFiles: vi.fn(),
  researchEnabled: false,
  onResearchToggle: vi.fn(),
};

describe('AttachmentMenu, automatic Web search', () => {
  it('does not expose automatic Web search as a user-facing menu toggle', () => {
    render(
      <CapabilityProvider platform="desktop">
        <AttachmentMenu {...baseProps}>
          <button type="button">Plus</button>
        </AttachmentMenu>
      </CapabilityProvider>,
    );

    expect(screen.queryByRole('button', { name: 'Web search' })).toBeNull();
    expect(screen.queryByText('Web search')).toBeNull();
  });

  it('renders only the host-backed explicit Local search control and reports the choice', () => {
    const onExplicitWebSearchToggle = vi.fn();
    render(
      <CapabilityProvider platform="desktop">
        <AttachmentMenu
          {...baseProps}
          explicitWebSearchEnabled
          onExplicitWebSearchToggle={onExplicitWebSearchToggle}
        >
          <button type="button">Plus</button>
        </AttachmentMenu>
      </CapabilityProvider>,
    );

    const control = screen.getByRole('button', { name: 'Search the web' });
    expect(control.title).toBe('Allows network access for this message');
    control.click();
    expect(onExplicitWebSearchToggle).toHaveBeenCalledOnce();
  });
});

describe('AttachmentMenu, Select folder', () => {
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
        <AttachmentMenu
          {...baseProps}
          onSelectFolder={vi.fn()}
          currentFolderLabel="~/Projects/agiworkforce"
        >
          <button type="button">Plus</button>
        </AttachmentMenu>
      </CapabilityProvider>,
    );

    expect(screen.getByText('Folder: ~/Projects/agiworkforce')).toBeTruthy();
    expect(screen.queryByText('Select folder')).toBeNull();
  });

  it('hides the folder row when the host withholds onSelectFolder (privacy-gated hosts)', () => {
    render(
      <CapabilityProvider platform="desktop">
        <AttachmentMenu {...baseProps} currentFolderLabel="~/Projects/agiworkforce">
          <button type="button">Plus</button>
        </AttachmentMenu>
      </CapabilityProvider>,
    );

    expect(screen.queryByText(/Folder:/)).toBeNull();
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

describe('AttachmentMenu, Record a skill host bridge', () => {
  it('renders the action only when the host provides a real recorder', () => {
    const onRecordSkill = vi.fn();
    const onOpenChange = vi.fn();

    const { rerender } = render(
      <CapabilityProvider platform="desktop">
        <AttachmentMenu {...baseProps} onOpenChange={onOpenChange}>
          <button type="button">Plus</button>
        </AttachmentMenu>
      </CapabilityProvider>,
    );
    expect(screen.queryByText('Record a skill')).toBeNull();

    rerender(
      <CapabilityProvider platform="desktop">
        <AttachmentMenu {...baseProps} onOpenChange={onOpenChange} onRecordSkill={onRecordSkill}>
          <button type="button">Plus</button>
        </AttachmentMenu>
      </CapabilityProvider>,
    );

    screen.getByText('Record a skill').click();
    expect(onRecordSkill).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe('AttachmentMenu, Research capability honesty', () => {
  it('omits Research when the active runtime cannot transport research requests', () => {
    render(
      <CapabilityProvider platform="desktop">
        <AttachmentMenu {...baseProps} supportsResearch={false}>
          <button type="button">Plus</button>
        </AttachmentMenu>
      </CapabilityProvider>,
    );

    expect(screen.queryByText('Research')).toBeNull();
  });

  it('renders Research when the active runtime explicitly supports it', () => {
    render(
      <CapabilityProvider platform="web">
        <AttachmentMenu {...baseProps} supportsResearch>
          <button type="button">Plus</button>
        </AttachmentMenu>
      </CapabilityProvider>,
    );

    expect(screen.getByText('Research')).toBeTruthy();
  });
});

describe('AttachmentMenu, source action honesty', () => {
  it('omits project and connector source actions when the host has no real picker flow', () => {
    render(
      <CapabilityProvider platform="desktop">
        <AttachmentMenu {...baseProps}>
          <button type="button">Plus</button>
        </AttachmentMenu>
      </CapabilityProvider>,
    );

    expect(screen.queryByText('Add to project')).toBeNull();
    expect(screen.queryByText('Add from Google Drive')).toBeNull();
    expect(screen.queryByText('Add from GitHub')).toBeNull();
  });

  it('renders and invokes only source actions explicitly implemented by the host', () => {
    const onAddToProject = vi.fn();
    render(
      <CapabilityProvider platform="desktop">
        <AttachmentMenu {...baseProps} onAddToProject={onAddToProject}>
          <button type="button">Plus</button>
        </AttachmentMenu>
      </CapabilityProvider>,
    );

    screen.getByRole('button', { name: 'Add to project' }).click();
    expect(onAddToProject).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Add from Google Drive')).toBeNull();
    expect(screen.queryByText('Add from GitHub')).toBeNull();
  });
});
