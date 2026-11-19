import { Alert } from 'react-native';
import {
  CONNECTOR_ACCESS_PENDING_NOTE,
  CONNECTOR_CONSENT_ALLOW,
  CONNECTOR_CONSENT_DENY,
  connectorAccessSentence,
  connectorConsentTitle,
  connectorRiskClass,
} from '@agiworkforce/cloud-contracts';

export interface ConnectorConsentTarget {
  id: string;
  name: string;
  providerSignIn: boolean;
}

export function connectorConsentMessage(target: Omit<ConnectorConsentTarget, 'name'>): string {
  const access = connectorAccessSentence(connectorRiskClass(target.id));
  return target.providerSignIn ? `${access}\n\n${CONNECTOR_ACCESS_PENDING_NOTE}` : access;
}

export function askConnectorConsent(target: ConnectorConsentTarget): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const settle = (allowed: boolean) => {
      if (settled) return;
      settled = true;
      resolve(allowed);
    };
    Alert.alert(
      connectorConsentTitle(target.name),
      connectorConsentMessage(target),
      [
        { text: CONNECTOR_CONSENT_DENY, style: 'cancel', onPress: () => settle(false) },
        { text: CONNECTOR_CONSENT_ALLOW, onPress: () => settle(true) },
      ],
      { cancelable: true, onDismiss: () => settle(false) },
    );
  });
}
