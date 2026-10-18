'use client';

import { SettingsPageLink } from '../components/SettingsSectionLink';
import { ChevronRight } from 'lucide-react';

/**
 * Administration lives at `/workspace`, not here.
 *
 * Policy, sharing, and the audit trail have addressable sections there.
 * Keeping a copy here as well would give two places to change the same
 * setting; this points at the one place, as a plain row rather than a
 * promotional card.
 */
export function WorkspaceConsolePointer() {
  return (
    <SettingsPageLink
      href="/workspace"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--space-4)',
        padding: 'var(--space-4) 0',
        borderBottom: '1px solid var(--settings-border)',
        textDecoration: 'none',
      }}
    >
      <span style={{ fontSize: 14, color: 'var(--text-1)' }}>Workspace administration</span>
      <ChevronRight
        aria-hidden="true"
        style={{ width: 16, height: 16, flexShrink: 0, color: 'var(--text-3)' }}
      />
    </SettingsPageLink>
  );
}
