import 'server-only';

import { z } from 'zod';
import {
  MOBILE_IAP_PRODUCT_DEFINITIONS,
  getMobileIapProductDefinition,
  type MobileIapCatalogProduct,
  type MobileIapPlatform,
  type MobileIapProductKey,
} from '@agiworkforce/types';

const ProductIdMapSchema = z.record(z.string().min(1).max(80), z.string().trim().min(1).max(200));

const PLATFORM_ENV: Record<MobileIapPlatform, string> = {
  ios: 'MOBILE_IAP_APPLE_PRODUCT_IDS_JSON',
  android: 'MOBILE_IAP_GOOGLE_PRODUCT_IDS_JSON',
};

export interface MobileIapCatalogState {
  enabled: boolean;
  products: MobileIapCatalogProduct[];
  unavailableReason: string | null;
}

function deploymentEnablesMobileIap(): boolean {
  const value = process.env['MOBILE_IAP_ENABLED']?.trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes';
}

function parseProductIdMap(platform: MobileIapPlatform): Map<MobileIapProductKey, string> {
  const raw = process.env[PLATFORM_ENV[platform]]?.trim();
  if (!raw) return new Map();

  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    throw new Error(`${PLATFORM_ENV[platform]} must be valid JSON.`);
  }

  const parsed = ProductIdMapSchema.safeParse(decoded);
  if (!parsed.success) {
    throw new Error(`${PLATFORM_ENV[platform]} must map logical product keys to store IDs.`);
  }

  const configured = new Map<MobileIapProductKey, string>();
  const usedStoreIds = new Set<string>();
  for (const [key, productId] of Object.entries(parsed.data)) {
    const definition = getMobileIapProductDefinition(key);
    if (!definition) {
      throw new Error(`${PLATFORM_ENV[platform]} contains an unknown product key: ${key}`);
    }
    if (usedStoreIds.has(productId)) {
      throw new Error(`${PLATFORM_ENV[platform]} assigns the same store ID more than once.`);
    }
    usedStoreIds.add(productId);
    configured.set(definition.key, productId);
  }
  return configured;
}

export function getMobileIapCatalogState(platform: MobileIapPlatform): MobileIapCatalogState {
  if (!deploymentEnablesMobileIap()) {
    return {
      enabled: false,
      products: [],
      unavailableReason: 'Native purchases are not enabled for this deployment.',
    };
  }

  const configured = parseProductIdMap(platform);
  const products = MOBILE_IAP_PRODUCT_DEFINITIONS.flatMap((definition) => {
    const productId = configured.get(definition.key);
    return productId ? [{ ...definition, productId }] : [];
  });

  if (products.length === 0) {
    return {
      enabled: false,
      products: [],
      unavailableReason:
        platform === 'ios'
          ? 'App Store products have not been registered for this build.'
          : 'Google Play products have not been registered for this build.',
    };
  }

  return { enabled: true, products, unavailableReason: null };
}

export function resolveMobileIapProduct(
  platform: MobileIapPlatform,
  productId: string,
): MobileIapCatalogProduct | null {
  return (
    getMobileIapCatalogState(platform).products.find(
      (product) => product.productId === productId,
    ) ?? null
  );
}

export function mobileIapCatalogStorageIsRequired(): boolean {
  return deploymentEnablesMobileIap();
}
