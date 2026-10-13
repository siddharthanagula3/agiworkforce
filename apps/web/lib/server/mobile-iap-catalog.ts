import 'server-only';

import { z } from 'zod';
import {
  MOBILE_IAP_ANDROID_REPLACEMENT_MODES,
  MOBILE_IAP_DEFAULT_ANDROID_REPLACEMENT_MODES,
  MOBILE_IAP_PRODUCT_DEFINITIONS,
  getMobileIapProductDefinition,
  type MobileIapAndroidReplacementModes,
  type MobileIapCatalogProduct,
  type MobileIapPlatform,
  type MobileIapProductKey,
  type MobileIapStoreOffer,
} from '@agiworkforce/types';

const StoreProductIdSchema = z.string().trim().min(1).max(200);
const GoogleOfferIdSchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9][a-z0-9-]{0,62}$/);
const ProductEntrySchema = z.union([
  StoreProductIdSchema,
  z
    .object({
      productId: StoreProductIdSchema,
      basePlanId: GoogleOfferIdSchema.optional(),
      offerId: GoogleOfferIdSchema.nullable().optional(),
    })
    .strict(),
]);
const ProductIdMapSchema = z.record(z.string().min(1).max(80), ProductEntrySchema);

const ReplacementModesSchema = z
  .object({
    upgrade: z.enum(MOBILE_IAP_ANDROID_REPLACEMENT_MODES),
    downgrade: z.enum(MOBILE_IAP_ANDROID_REPLACEMENT_MODES),
  })
  .strict();

const REPLACEMENT_MODES_ENV = 'MOBILE_IAP_GOOGLE_REPLACEMENT_MODES_JSON';

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

interface ConfiguredStoreProduct {
  productId: string;
  googleOffer: MobileIapStoreOffer | null;
}

function parseProductIdMap(
  platform: MobileIapPlatform,
): Map<MobileIapProductKey, ConfiguredStoreProduct> {
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

  const entries = Object.entries(parsed.data).map(([key, entry]) => {
    const definition = getMobileIapProductDefinition(key);
    if (!definition) {
      throw new Error(`${PLATFORM_ENV[platform]} contains an unknown product key: ${key}`);
    }
    return { definition, entry: typeof entry === 'string' ? { productId: entry } : entry };
  });
  const storeIds = entries.map(({ entry }) => entry.productId);
  if (new Set(storeIds).size !== storeIds.length) {
    throw new Error(`${PLATFORM_ENV[platform]} assigns the same store ID more than once.`);
  }

  const configured = new Map<MobileIapProductKey, ConfiguredStoreProduct>();
  for (const { definition, entry } of entries) {
    const sellsGoogleSubscription = platform === 'android' && definition.kind === 'subscription';
    if (sellsGoogleSubscription && !entry.basePlanId) {
      throw new Error(
        `${PLATFORM_ENV[platform]} must name the base plan for ${definition.key}: {"productId": "...", "basePlanId": "..."}.`,
      );
    }
    if (!sellsGoogleSubscription && (entry.basePlanId !== undefined || entry.offerId != null)) {
      throw new Error(
        `${PLATFORM_ENV[platform]} sets a base plan or offer on ${definition.key}, which only a Google Play subscription has.`,
      );
    }
    configured.set(definition.key, {
      productId: entry.productId,
      googleOffer: entry.basePlanId
        ? { basePlanId: entry.basePlanId, offerId: entry.offerId ?? null }
        : null,
    });
  }
  return configured;
}

function configuredProducts(platform: MobileIapPlatform): MobileIapCatalogProduct[] {
  const configured = parseProductIdMap(platform);
  return MOBILE_IAP_PRODUCT_DEFINITIONS.flatMap((definition) => {
    const store = configured.get(definition.key);
    if (!store) return [];
    return store.googleOffer
      ? [{ ...definition, productId: store.productId, googleOffer: store.googleOffer }]
      : [{ ...definition, productId: store.productId }];
  });
}

export function getMobileIapCatalogState(platform: MobileIapPlatform): MobileIapCatalogState {
  if (!deploymentEnablesMobileIap()) {
    return {
      enabled: false,
      products: [],
      unavailableReason: 'Native purchases are not enabled for this deployment.',
    };
  }

  const products = configuredProducts(platform);

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
  return configuredProducts(platform).find((product) => product.productId === productId) ?? null;
}

export function mobileIapCatalogStorageIsRequired(): boolean {
  return deploymentEnablesMobileIap();
}

export function getMobileIapAndroidReplacementModes(): MobileIapAndroidReplacementModes {
  const raw = process.env[REPLACEMENT_MODES_ENV]?.trim();
  if (!raw) return MOBILE_IAP_DEFAULT_ANDROID_REPLACEMENT_MODES;
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    throw new Error(`${REPLACEMENT_MODES_ENV} must be valid JSON.`);
  }
  const parsed = ReplacementModesSchema.safeParse(decoded);
  if (!parsed.success) {
    throw new Error(
      `${REPLACEMENT_MODES_ENV} must set a replacement mode for upgrade and downgrade.`,
    );
  }
  if (parsed.data.downgrade === 'charge-prorated-price') {
    throw new Error(`${REPLACEMENT_MODES_ENV} cannot charge a prorated price on a downgrade.`);
  }
  return parsed.data;
}
