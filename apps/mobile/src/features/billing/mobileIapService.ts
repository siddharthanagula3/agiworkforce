import { Platform } from 'react-native';
import { getStorefront } from 'expo-iap';
import {
  MOBILE_IAP_ANDROID_REPLACEMENT_MODES,
  getMobileIapProductDefinition,
  type MobileIapAndroidReplacementMode,
  type MobileIapAndroidReplacementModes,
  type MobileIapCatalogProduct,
  type MobileIapCatalogResponse,
  type MobileIapPlatform,
  type MobileIapStoreOffer,
  type MobileIapVerifyResponse,
} from '@agiworkforce/types';
import { api } from '@/services/api';
import { ApiHttpError } from '@/services/apiErrors';

export function billingRequestMessage(error: unknown, fallback: string): string {
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

function parseStoreOffer(value: unknown): MobileIapStoreOffer | null {
  if (!isRecord(value) || typeof value['basePlanId'] !== 'string' || !value['basePlanId']) {
    return null;
  }
  const offerId = value['offerId'];
  if (offerId !== null && offerId !== undefined && typeof offerId !== 'string') return null;
  return { basePlanId: value['basePlanId'], offerId: offerId ?? null };
}

function isReplacementMode(value: unknown): value is MobileIapAndroidReplacementMode {
  return (MOBILE_IAP_ANDROID_REPLACEMENT_MODES as readonly unknown[]).includes(value);
}

function parseReplacementModes(value: unknown): MobileIapAndroidReplacementModes | null {
  if (!isRecord(value)) return null;
  const { upgrade, downgrade } = value;
  return isReplacementMode(upgrade) && isReplacementMode(downgrade) ? { upgrade, downgrade } : null;
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
    const googleOffer = parseStoreOffer(value['googleOffer']);
    return googleOffer
      ? { ...definition, productId: value['productId'], googleOffer }
      : { ...definition, productId: value['productId'] };
  }
  if (value['amountUsd'] !== definition.amountUsd || value['units'] !== definition.units) {
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
  const androidReplacementModes = parseReplacementModes(value['androidReplacementModes']);
  const subscriptionsUnavailableReason = value['subscriptionsUnavailableReason'];
  const consumableProductIds = value['consumableProductIds'];
  return {
    enabled: value['enabled'],
    platform: value['platform'] as MobileIapPlatform | null,
    appAccountToken,
    products: products as MobileIapCatalogProduct[],
    unavailableReason: value['unavailableReason'],
    ...(androidReplacementModes ? { androidReplacementModes } : {}),
    ...(typeof subscriptionsUnavailableReason === 'string' && subscriptionsUnavailableReason
      ? { subscriptionsUnavailableReason }
      : {}),
    ...(Array.isArray(consumableProductIds)
      ? {
          consumableProductIds: consumableProductIds.filter(
            (id): id is string => typeof id === 'string' && id.length > 0,
          ),
        }
      : {}),
  };
}

export async function readStorefront(): Promise<string | null> {
  try {
    return (await getStorefront()).trim() || null;
  } catch {
    return null;
  }
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
  const query = new URLSearchParams({ platform });
  const storefront = await readStorefront();
  if (storefront) query.set('storefront', storefront);
  return parseMobileIapCatalogResponse(
    await api.get<unknown>(`/api/mobile/iap/catalog?${query.toString()}`),
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
