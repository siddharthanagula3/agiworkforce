'use client';

import { PROVIDER_DISPLAY, type ProviderId } from '@agiworkforce/types';
import { ProviderMark, hasProviderMark } from '@shared/components/ProviderMark';
import { AgiMark } from '@shared/components/agi/AgiMark';

const MANAGED_CLOUD_PROVIDER_KEY = 'managed_cloud';
const UNKNOWN_PROVIDER_BRAND_COLOR = 'var(--chat-text-muted)';

/**
 * Map a model-store providerKey (from models.json) to a ProviderId
 * as defined in PROVIDER_DISPLAY. Most keys are 1:1; managed_cloud
 * maps to agi-cloud.
 */
export function toProviderId(providerKey: string): ProviderId | null {
  if (providerKey === MANAGED_CLOUD_PROVIDER_KEY) return 'agi-cloud';
  if (providerKey in PROVIDER_DISPLAY) return providerKey as ProviderId;
  return null;
}

/** Returns the /providers/<id>.svg URL or null when provider is unknown. */
export function providerLogoUrl(providerKey: string): string | null {
  const id = toProviderId(providerKey);
  if (!id) return null;
  return `/providers/${id}.svg`;
}

/** The provider's brand colour, or the muted token when the provider is unknown. */
export function providerBrandColor(providerKey: string): string {
  const id = toProviderId(providerKey);
  return id
    ? (PROVIDER_DISPLAY[id].brandColor ?? UNKNOWN_PROVIDER_BRAND_COLOR)
    : UNKNOWN_PROVIDER_BRAND_COLOR;
}

/** Provider logo: AGI mark for Auto modes → official vector mark → local SVG → brand dot. */
export function ProviderLogo({ providerKey, size = 14 }: { providerKey?: string; size?: number }) {
  // No resolved provider (e.g. a model without a provider) → render no logo
  // rather than crashing on providerKey.toLowerCase().
  if (!providerKey) return null;
  // Auto modes (managed cloud) carry the AGI brand mark in the brand accent colour.
  if (providerKey === MANAGED_CLOUD_PROVIDER_KEY) {
    return (
      <span className="inline-flex shrink-0 items-center justify-center text-[var(--chat-accent-primary-text)]">
        <AgiMark size={size} mono />
      </span>
    );
  }

  // Prefer the official, theme-adaptive mark (OpenAI/Claude/Gemini/DeepSeek/etc.).
  const markKey = toProviderId(providerKey) ?? providerKey;
  if (hasProviderMark(markKey)) {
    return (
      <span className="inline-flex shrink-0 items-center justify-center text-[var(--chat-text-secondary)]">
        <ProviderMark providerKey={markKey} size={size} />
      </span>
    );
  }

  const logoUrl = providerLogoUrl(providerKey);
  const brandColor = providerBrandColor(providerKey);

  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt=""
        aria-hidden="true"
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className="shrink-0 rounded-sm object-contain"
        onError={(e) => {
          // Fallback: hide image; parent still has brand-color dot as sibling
          (e.target as HTMLImageElement).style.display = 'none';
        }}
      />
    );
  }

  return (
    <span
      className="shrink-0 rounded-full"
      style={{ width: size, height: size, background: brandColor, display: 'inline-block' }}
      aria-hidden="true"
    />
  );
}
