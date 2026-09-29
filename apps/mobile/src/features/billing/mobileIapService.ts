import { Platform } from 'react-native';
import {
  getMobileIapProductDefinition,
  type MobileIapCatalogProduct,
  type MobileIapCatalogResponse,
  type MobileIapPlatform,
  type MobileIapVerifyResponse,
  type SelfServePaidPlanTier,
} from '@agiworkforce/types';
import { api } from '@/services/api';
import { ApiHttpError } from '@/services/apiErrors';

export class BillingUpgradeRequestError extends Error {
  constructor(readonly userMessage: string) {
    super(userMessage);
  }
}

export function billingRequestMessage(error: unknown, fallback: string): string {
  if (error instanceof BillingUpgradeRequestError) return error.userMessage;
  if (error instanceof ApiHttpError && error.status >= 400 && error.status < 500) {
    return error.message;
  }
  return fallback;
}

function currentStorePlatform(): MobileIapPlatform | null {
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseCatalogProduct(value: unknown): MobileIapCatalogProduct | null {
  if (
    !isRecord(value) ||
    typeof value['key'] !== 'string' ||
    typeof value['productId'] !== 'string'
  ) {
    return null;
  }
  const definition = getMobileIapProductDefinition(value['key']);
  if (!definition || value['kind'] !== definition.kind || value['productId'].trim().length === 0) {
    return null;
  }
  if (definition.kind === 'subscription') {
    if (
      value['planTier'] !== definition.planTier ||
      value['interval'] !== definition.interval ||
      value['intendedPriceUsd'] !== definition.intendedPriceUsd
    ) {
      return null;
    }
  } else if (value['amountUsd'] !== definition.amountUsd || value['units'] !== definition.units) {
    return null;
  }
  return { ...definition, productId: value['productId'] };
}

export function parseMobileIapCatalogResponse(value: unknown): MobileIapCatalogResponse {
  if (
    !isRecord(value) ||
    typeof value['enabled'] !== 'boolean' ||
    (value['platform'] !== null &&
      value['platform'] !== 'ios' &&
      value['platform'] !== 'android') ||
    !Array.isArray(value['products']) ||
    (value['appAccountToken'] !== null && typeof value['appAccountToken'] !== 'string') ||
    (value['unavailableReason'] !== null && typeof value['unavailableReason'] !== 'string')
  ) {
    throw new Error('Native billing catalog returned an invalid response.');
  }
  const products = value['products'].map(parseCatalogProduct);
  if (products.some((product) => product === null)) {
    throw new Error('Native billing catalog contains an invalid product.');
  }
  const appAccountToken = value['appAccountToken'];
  if (
    value['enabled'] &&
    (typeof appAccountToken !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        appAccountToken,
      ))
  ) {
    throw new Error('Native billing catalog is missing its account binding.');
  }
  return {
    enabled: value['enabled'],
    platform: value['platform'] as MobileIapPlatform | null,
    appAccountToken,
    products: products as MobileIapCatalogProduct[],
    unavailableReason: value['unavailableReason'],
    unavailableCode:
      value['unavailableCode'] === 'waitlist_access_required' ? 'waitlist_access_required' : null,
  };
}

export async function fetchMobileIapCatalog(): Promise<MobileIapCatalogResponse> {
  const platform = currentStorePlatform();
  if (!platform) {
    return {
      enabled: false,
      platform: null,
      appAccountToken: null,
      products: [],
      unavailableReason: 'Native purchases require the iOS or Android app.',
      unavailableCode: null,
    };
  }
  return parseMobileIapCatalogResponse(
    await api.get<unknown>(`/api/mobile/iap/catalog?platform=${platform}`),
  );
}

export async function redeemBillingUpgradeCode(code: string): Promise<void> {
  const normalizedCode = code.trim().toUpperCase();
  if (!normalizedCode || normalizedCode.length > 50 || !/^[A-Z0-9]+$/.test(normalizedCode)) {
    throw new BillingUpgradeRequestError('Enter a valid access code.');
  }
  const { token } = await api.get<{ token?: string }>('/api/csrf');
  if (!token)
    throw new BillingUpgradeRequestError('Could not verify this request. Please try again.');
  const result = await api.post<{ ok?: boolean; accessGranted?: boolean }>(
    '/api/waitlist/access',
    { code: normalizedCode },
    { headers: { 'x-csrf-token': token } },
  );
  if (result.ok !== true || result.accessGranted !== true) {
    throw new BillingUpgradeRequestError('Upgrade access was not confirmed. Please try again.');
  }
}

export async function joinBillingUpgradeWaitlist(plan: SelfServePaidPlanTier): Promise<void> {
  const { token } = await api.get<{ token?: string }>('/api/csrf');
  if (!token)
    throw new BillingUpgradeRequestError('Could not verify this request. Please try again.');
  const result = await api.post<{ ok?: boolean; joined?: boolean }>(
    '/api/waitlist',
    { plan, billingInterval: 'monthly', source: 'mobile-billing' },
    { headers: { 'x-csrf-token': token } },
  );
  if (result.ok !== true || result.joined !== true) {
    throw new BillingUpgradeRequestError('Waitlist signup was not confirmed. Please try again.');
  }
}

export async function verifyMobileIapPurchase(input: {
  platform: MobileIapPlatform;
  productId: string;
  purchaseToken: string;
}): Promise<MobileIapVerifyResponse> {
  const response = await api.post<unknown>('/api/mobile/iap/verify', input);
  if (
    !isRecord(response) ||
    response['success'] !== true ||
    (response['kind'] !== 'subscription' && response['kind'] !== 'top_up') ||
    typeof response['productKey'] !== 'string' ||
    !['active', 'granted', 'already_processed'].includes(String(response['status']))
  ) {
    throw new Error('Native purchase verification returned an invalid response.');
  }
  return response as unknown as MobileIapVerifyResponse;
}
