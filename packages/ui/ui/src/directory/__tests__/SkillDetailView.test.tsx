import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SkillDetailView } from '../SkillDetailView';
import type { DirectorySkillDetail } from '../types';

afterEach(cleanup);

const detail: DirectorySkillDetail = {
  kind: 'skill',
  id: 'canvas-design',
  name: 'canvas-design',
  publisher: 'AGI',
  description: 'Create visual art',
  files: [{ path: 'SKILL.md', content: 'Do the thing.' }],
  installed: true,
};

function renderDetail(
  patch: Partial<DirectorySkillDetail> = {},
  props: Partial<Parameters<typeof SkillDetailView>[0]> = {},
) {
  return render(<SkillDetailView detail={{ ...detail, ...patch }} onBack={vi.fn()} {...props} />);
}

describe('SkillDetailView enable and try controls', () => {
  it('binds the enable switch to the install state and reports a change once', () => {
    const onSetEnabled = vi.fn();
    renderDetail({}, { onSetEnabled });
    const toggle = screen.getByRole('switch', { name: 'Enable skill' });
    expect(toggle.getAttribute('data-state')).toBe('checked');
    fireEvent.click(toggle);
    expect(onSetEnabled).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('drops the redundant Uninstall button once the switch owns that state', () => {
    renderDetail({}, { onSetEnabled: vi.fn(), onUninstall: vi.fn() });
    expect(screen.queryByRole('button', { name: 'Uninstall' })).toBeNull();
    expect(screen.getByText('Installed')).toBeTruthy();
  });

  it('keeps Install and offers no switch on a skill that is not installed', () => {
    const onInstall = vi.fn();
    renderDetail({ installed: false }, { onInstall, onSetEnabled: vi.fn() });
    expect(screen.queryByRole('switch', { name: 'Enable skill' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Install' }));
    expect(onInstall).toHaveBeenCalledTimes(1);
  });

  it('offers no switch on a skill this account wrote, since nothing backs it', () => {
    renderDetail({ editable: true }, { onOpenSettings: vi.fn(), onSetEnabled: vi.fn() });
    expect(screen.queryByRole('switch', { name: 'Enable skill' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Settings canvas-design' })).toBeTruthy();
  });

  it('hands the skill to the composer from Try in chat', () => {
    const onTryInChat = vi.fn();
    renderDetail({}, { onTryInChat });
    fireEvent.click(screen.getByRole('button', { name: 'Try in chat' }));
    expect(onTryInChat).toHaveBeenCalledTimes(1);
  });

  it('hides Try in chat until the skill is installed', () => {
    renderDetail({ installed: false }, { onTryInChat: vi.fn() });
    expect(screen.queryByRole('button', { name: 'Try in chat' })).toBeNull();
  });

  it('keeps Delete skill on an authored skill', () => {
    const onDelete = vi.fn();
    renderDetail({ editable: true }, { onOpenSettings: vi.fn(), onDelete });
    fireEvent.click(screen.getByRole('button', { name: 'Delete skill' }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
