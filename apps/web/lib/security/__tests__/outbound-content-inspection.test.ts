import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { mockRecordAuditEvent } = vi.hoisted(() => ({
  mockRecordAuditEvent: vi.fn(async (_event: unknown) => undefined),
}));

vi.mock('@/lib/security-audit', () => ({ recordAuditEvent: mockRecordAuditEvent }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import {
  inspectOutboundContent,
  registerOutboundContentScanner,
  type OutboundContentScanner,
} from '../outbound-content-inspection';

const SECRET = `sk_live_${'b'.repeat(30)}`;

function inspect(value: unknown, mode: 'warn' | 'redact' | 'block') {
  return inspectOutboundContent({
    channel: 'connector_write',
    value,
    userId: 'user-1',
    organizationId: 'org-1',
    resourceId: 'slack:post_message',
    resolveMode: async () => ({ mode, organizationId: 'org-1' }),
  });
}

beforeEach(() => mockRecordAuditEvent.mockClear());

describe('outbound content inspection', () => {
  it('lets clean content through without reading policy or writing audit', async () => {
    const resolveMode = vi.fn();
    const verdict = await inspectOutboundContent({
      channel: 'share',
      value: { text: 'hello' },
      userId: 'user-1',
      organizationId: null,
      resolveMode,
    });

    expect(verdict.action).toBe('allowed');
    expect(resolveMode).not.toHaveBeenCalled();
    expect(mockRecordAuditEvent).not.toHaveBeenCalled();
  });

  it('blocks a connector write carrying a secret when the workspace blocks secrets', async () => {
    const verdict = await inspect({ channel: '#general', text: `key ${SECRET}` }, 'block');

    expect(verdict.action).toBe('blocked');
    expect(mockRecordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'dlp_content_blocked',
        outcome: 'denied',
        detail: expect.objectContaining({ resourceType: 'connector_write', status: 'blocked' }),
      }),
    );
    expect(JSON.stringify(mockRecordAuditEvent.mock.calls)).not.toContain(SECRET);
  });

  it('redacts the secret and keeps the rest of the payload when the workspace redacts', async () => {
    const verdict = await inspect({ channel: '#general', text: `key ${SECRET}` }, 'redact');

    expect(verdict.action).toBe('redacted');
    if (verdict.action !== 'redacted') return;
    expect(verdict.value).toEqual({ channel: '#general', text: 'key [REDACTED]' });
  });

  it('fails closed when the policy cannot be read', async () => {
    const verdict = await inspectOutboundContent({
      channel: 'share',
      value: `key ${SECRET}`,
      userId: 'user-1',
      organizationId: null,
      resolveMode: async () => {
        throw new Error('database unavailable');
      },
    });

    expect(verdict.action).toBe('blocked');
  });

  it('calls a registered DLP provider and blocks on its finding', async () => {
    const vendor: OutboundContentScanner = {
      id: 'vendor_dlp',
      scan: vi.fn(async ({ value }) =>
        JSON.stringify(value).includes('4111 1111 1111 1111')
          ? [{ scanner: 'vendor_dlp', name: 'payment_card', severity: 'high', count: 1 }]
          : [],
      ),
    };
    const unregister = registerOutboundContentScanner(vendor);
    try {
      const verdict = await inspect({ text: 'card 4111 1111 1111 1111' }, 'block');
      expect(vendor.scan).toHaveBeenCalledWith(
        expect.objectContaining({ channel: 'connector_write' }),
      );
      expect(verdict.action).toBe('blocked');
    } finally {
      unregister();
    }
  });

  it('blocks a prompt on a registered provider finding and audits the prompt channel', async () => {
    const vendor: OutboundContentScanner = {
      id: 'vendor_dlp',
      scan: async ({ value }) =>
        JSON.stringify(value).includes('patient record')
          ? [{ scanner: 'vendor_dlp', name: 'phi', severity: 'high', count: 1 }]
          : [],
    };
    const unregister = registerOutboundContentScanner(vendor);
    try {
      const verdict = await inspectOutboundContent({
        channel: 'prompt',
        value: [{ role: 'user', content: 'summarise this patient record' }],
        userId: 'user-1',
        organizationId: 'org-1',
        resolveMode: async () => ({ mode: 'block', organizationId: 'org-1' }),
      });

      expect(verdict.action).toBe('blocked');
      expect(mockRecordAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'dlp_content_blocked',
          detail: expect.objectContaining({ resourceType: 'prompt', source: 'vendor_dlp:phi' }),
        }),
      );
    } finally {
      unregister();
    }
  });

  it('leaves the prompt and upload channels to their own secret gates', async () => {
    for (const channel of ['prompt', 'upload'] as const) {
      const resolveMode = vi.fn();
      const verdict = await inspectOutboundContent({
        channel,
        value: `key ${SECRET}`,
        userId: 'user-1',
        organizationId: 'org-1',
        resolveMode,
      });

      expect(verdict.action).toBe('allowed');
      expect(resolveMode).not.toHaveBeenCalled();
    }
  });

  it('decides an upload on findings the upload scanner reported but did not refuse', async () => {
    const verdict = await inspectOutboundContent({
      channel: 'upload',
      value: { fileName: 'notes.txt' },
      userId: 'user-1',
      organizationId: 'org-1',
      resourceId: 'chat-attachments/user-1/notes.txt',
      priorFindings: [
        { scanner: 'upload_scan', name: 'credential_material', severity: 'medium', count: 2 },
      ],
      resolveMode: async () => ({ mode: 'block', organizationId: 'org-1' }),
    });

    expect(verdict.action).toBe('blocked');
    expect(mockRecordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'dlp_content_blocked',
        detail: expect.objectContaining({ resourceType: 'upload', count: 2 }),
      }),
    );
  });

  it('blocks rather than claiming a redaction no scanner can perform', async () => {
    const unregister = registerOutboundContentScanner({
      id: 'vendor_dlp',
      scan: async () => [{ scanner: 'vendor_dlp', name: 'phi', severity: 'high', count: 1 }],
    });
    try {
      const verdict = await inspectOutboundContent({
        channel: 'prompt',
        value: [{ role: 'user', content: 'a record' }],
        userId: 'user-1',
        organizationId: 'org-1',
        resolveMode: async () => ({ mode: 'redact', organizationId: 'org-1' }),
      });

      expect(verdict.action).toBe('blocked');
    } finally {
      unregister();
    }
  });

  it('refuses to send when a scanner errors and the workspace does not merely warn', async () => {
    const unregister = registerOutboundContentScanner({
      id: 'broken',
      scan: async () => {
        throw new Error('scanner down');
      },
    });
    try {
      expect((await inspect({ text: 'hello' }, 'redact')).action).toBe('blocked');
      expect((await inspect({ text: 'hello' }, 'warn')).action).toBe('allowed');
    } finally {
      unregister();
    }
  });
});
