import * as vscode from 'vscode';
import {
  createAccountProductAnalytics,
  type ProductAnalyticsEmitter,
  type ProductAnalyticsEventName,
  type ProductAnalyticsOutcome,
  type ProductAnalyticsProperties,
} from '@agiworkforce/types';
import { Config } from '../../platform/config';
import { platformRequestHeaders } from '../../platform/platformHeaders';
import { getAccountToken, getCloudWebOrigin } from '../../utils/api';

let analytics: ProductAnalyticsEmitter | undefined;

async function requestAccountJson(
  secrets: vscode.SecretStorage,
  path: string,
  init?: { method: 'POST'; body: string },
): Promise<unknown> {
  const token = await getAccountToken(secrets, { renew: false });
  if (token === undefined || token === '') return null;
  const response = await fetch(`${getCloudWebOrigin()}${path}`, {
    method: init?.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...platformRequestHeaders(),
    },
    ...(init ? { body: init.body } : {}),
  });
  return response.ok ? response.json() : null;
}

export function activateProductAnalytics(context: vscode.ExtensionContext): vscode.Disposable {
  const current = createAccountProductAnalytics({
    surface: 'vscode',
    isEnabled: () => Config.telemetryEnabled() && vscode.env.isTelemetryEnabled,
    request: (path, init) => requestAccountJson(context.secrets, path, init),
  });
  analytics = current;
  return new vscode.Disposable(() => {
    void current.flush();
    if (analytics === current) analytics = undefined;
  });
}

export type ProductAnalyticsTrustMode = 'local' | 'byok' | 'managed' | 'unknown';

export function trackProductEvent(
  name: ProductAnalyticsEventName,
  trustMode: ProductAnalyticsTrustMode | undefined,
  input?: { outcome?: ProductAnalyticsOutcome; properties?: ProductAnalyticsProperties },
): void {
  if (trustMode !== 'managed') return;
  try {
    analytics?.track(name, input);
  } catch {
    return;
  }
}
