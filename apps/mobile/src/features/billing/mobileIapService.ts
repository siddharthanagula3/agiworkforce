import { Platform } from 'react-native';
import {
  getMobileIapProductDefinition,
  type MobileIapCatalogProduct,
  type MobileIapCatalogResponse,
  type MobileIapPlatform,
  type MobileIapVerifyResponse,
} from '@agiworkforce/types';
import { api } from '@/services/api';

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
    };
  }
  return parseMobileIapCatalogResponse(
    await api.get<unknown>(`/api/mobile/iap/catalog?platform=${platform}`),
  );
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
