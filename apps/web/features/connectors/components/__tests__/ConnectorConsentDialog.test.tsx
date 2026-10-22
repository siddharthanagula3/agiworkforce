import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@agiworkforce/ui';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CONNECTOR_CONSENT_ALLOW,
  CONNECTOR_CONSENT_DENY,
  askConnectorConsent,
  connectorConsentTitle,
} from '../ConnectorConsentDialog';

async function openConsent(connector = { id: 'gmail', name: 'Gmail' }) {
  let decision!: Promise<boolean>;
  act(() => {
    decision = askConnectorConsent(connector);
  });
  await screen.findByRole('alertdialog', { name: connectorConsentTitle(connector.name) });
  return { decision };
}

afterEach(async () => {
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
});

describe('askConnectorConsent', () => {
  it('names the connector and the access it requests before anything is sent', async () => {
    const { decision } = await openConsent();

    const dialog = screen.getByRole('alertdialog', { name: 'Connect Gmail?' });
    expect(dialog.textContent).toContain('Permissions requested');
    expect(dialog.textContent).toContain('Before you connect');

    fireEvent.click(screen.getByRole('button', { name: CONNECTOR_CONSENT_DENY }));
    await expect(decision).resolves.toBe(false);
  });

  it('resolves true only when the user chooses Allow', async () => {
    const { decision } = await openConsent();
    fireEvent.click(screen.getByRole('button', { name: CONNECTOR_CONSENT_ALLOW }));
    await expect(decision).resolves.toBe(true);
  });

  it('closes a settings dialog on Escape when no consent is open', async () => {
    const settingsOpenChange = vi.fn();
    render(
      <Dialog open onOpenChange={settingsOpenChange}>
        <DialogContent>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Connectors</DialogDescription>
        </DialogContent>
      </Dialog>,
    );
    fireEvent.keyDown(await screen.findByRole('dialog', { name: 'Settings' }), { key: 'Escape' });
    expect(settingsOpenChange).toHaveBeenCalledWith(false);
  });

  it('treats Escape as Deny', async () => {
    const { decision } = await openConsent({ id: 'notion', name: 'Notion' });
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' });
    await expect(decision).resolves.toBe(false);
  });

  it('denies an earlier request that a newer one replaces', async () => {
    const { decision: first } = await openConsent({ id: 'gmail', name: 'Gmail' });
    const { decision: second } = await openConsent({ id: 'notion', name: 'Notion' });
    await expect(first).resolves.toBe(false);
    expect(screen.getAllByRole('alertdialog')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: CONNECTOR_CONSENT_DENY }));
    await expect(second).resolves.toBe(false);
  });

  it('takes Escape over the settings dialog it was opened from', async () => {
    const settingsOpenChange = vi.fn();
    render(
      <Dialog open onOpenChange={settingsOpenChange}>
        <DialogContent>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Connectors</DialogDescription>
        </DialogContent>
      </Dialog>,
    );
    const { decision } = await openConsent();
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' });
    await expect(decision).resolves.toBe(false);
    expect(settingsOpenChange).not.toHaveBeenCalled();
  });
});
