'use client';

import Link from 'next/link';
import { ArrowRight, ShieldCheck } from 'lucide-react';

/**
 * Administration lives at `/workspace`, not here.
 *
 * Policy, sharing, and the audit trail used to stack into this one settings
 * panel, which put roughly eighty kilobytes of administrative UI behind a
 * single scroll with no addressable sections. Keeping a copy here as well would
 * give two places to change the same setting; this points at the one place.
 */
export function WorkspaceConsolePointer() {
  return (
    <Link
      href="/workspace"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        border: '1px solid var(--settings-border)',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--bg-elev)',
        padding: 20,
        textDecoration: 'none',
      }}
    >
      <ShieldCheck
        aria-hidden
        style={{ width: 18, height: 18, marginTop: 2, flexShrink: 0, color: 'var(--text-2)' }}
      />
      <span style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, flex: 1 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>
          Workspace administration
        </span>
        <span style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--text-3)' }}>
          Security posture, identity and SSO, directory provisioning, workspace policy, sharing, and
          the audit trail, with what is enforced kept separate from what is merely recorded.
        </span>
      </span>
      <ArrowRight
        aria-hidden
        style={{ width: 16, height: 16, marginTop: 3, flexShrink: 0, color: 'var(--text-3)' }}
      />
    </Link>
  );
}
