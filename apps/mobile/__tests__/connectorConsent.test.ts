import { Alert } from 'react-native';
import {
  CONNECTOR_ACCESS_PENDING_NOTE,
  CONNECTOR_ACCESS_SENTENCES,
  CONNECTOR_CONSENT_ALLOW,
  CONNECTOR_CONSENT_DENY,
  DISCOVERED_CONNECTOR_ACCESS_SENTENCE,
} from '@agiworkforce/cloud-contracts';
import { askConnectorConsent } from '@/src/features/settings/cloud-connectors/connectorConsent';

type Button = { text?: string; style?: string; onPress?: () => void };
type Options = { cancelable?: boolean; onDismiss?: () => void };

describe('askConnectorConsent', () => {
  afterEach(() => jest.restoreAllMocks());

  function ask(target = { id: 'linear', name: 'Linear', providerSignIn: true }) {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const answer = askConnectorConsent(target);
    const [title, message, buttons, options] = alert.mock.calls[0]! as [
      string,
      string,
      Button[],
      Options,
    ];
    return { answer, title, message, buttons, options };
  }

  it('asks Connect <name>? with the shared copy and Deny before Allow', () => {
    const { title, message, buttons, options } = ask();
    expect(title).toBe('Connect Linear?');
    expect(message).toBe(
      `${CONNECTOR_ACCESS_SENTENCES['read-write']}\n\n${CONNECTOR_ACCESS_PENDING_NOTE}`,
    );
    expect(buttons.map((button) => button.text)).toEqual([
      CONNECTOR_CONSENT_DENY,
      CONNECTOR_CONSENT_ALLOW,
    ]);
    expect(buttons[0]!.style).toBe('cancel');
    expect(options.cancelable).toBe(true);
  });

  it('says whether the connector reads only or changes data before anything starts', () => {
    expect(ask({ id: 'stripe', name: 'Stripe', providerSignIn: false }).message).toBe(
      CONNECTOR_ACCESS_SENTENCES['high-impact'],
    );
    jest.restoreAllMocks();
    expect(
      ask({ id: 'google-contacts', name: 'Google Contacts', providerSignIn: true }).message,
    ).toBe(`${CONNECTOR_ACCESS_SENTENCES['read-only']}\n\n${CONNECTOR_ACCESS_PENDING_NOTE}`);
    jest.restoreAllMocks();
    expect(ask({ id: 'acme-notes', name: 'Acme Notes', providerSignIn: false }).message).toBe(
      DISCOVERED_CONNECTOR_ACCESS_SENTENCE,
    );
  });

  it('answers true only for Allow', async () => {
    const allowed = ask();
    allowed.buttons[1]!.onPress?.();
    await expect(allowed.answer).resolves.toBe(true);
    jest.restoreAllMocks();

    const denied = ask();
    denied.buttons[0]!.onPress?.();
    await expect(denied.answer).resolves.toBe(false);
    jest.restoreAllMocks();

    const dismissed = ask();
    dismissed.options.onDismiss?.();
    dismissed.buttons[1]!.onPress?.();
    await expect(dismissed.answer).resolves.toBe(false);
  });
});
