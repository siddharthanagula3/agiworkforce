import type { PluginPublisherKind, PluginSourceKind } from '@agiworkforce/types';

export const PLUGIN_SIGNATURE_ALGORITHMS = ['ed25519'] as const;
export type PluginSignatureAlgorithm = (typeof PLUGIN_SIGNATURE_ALGORITHMS)[number];

export const PLUGIN_SHIPPED_SOURCE: PluginSourceKind = 'builtin';
export const PLUGIN_SHIPPED_PUBLISHER_KIND: PluginPublisherKind = 'first-party';

export interface PluginPackageProvenance {
  source: PluginSourceKind | null;
  publisherKind: PluginPublisherKind | null;
}

export interface PluginIntegrityClaim extends PluginPackageProvenance {
  pluginId: string;
  version: string;
  sha256: string | null;
  signature: string | null;
  signatureAlgorithm: string | null;
}

/**
 * A builtin first-party pack is distributed inside the product build, so the
 * build is its publisher. Every other provenance needs a publisher signature.
 */
export function isPluginShippedWithProduct(provenance: PluginPackageProvenance): boolean {
  return (
    provenance.source === PLUGIN_SHIPPED_SOURCE &&
    provenance.publisherKind === PLUGIN_SHIPPED_PUBLISHER_KIND
  );
}

export type PluginIntegrityCode =
  | 'verified'
  | 'shipped_with_product'
  | 'hash_missing'
  | 'hash_mismatch'
  | 'signature_missing'
  | 'signature_algorithm_unsupported'
  | 'signature_invalid';

export interface PluginIntegrityVerdict {
  ok: boolean;
  code: PluginIntegrityCode;
  reason: string;
}

const SHA256_PATTERN = /^[0-9a-f]{64}$/;

export function isPluginSha256(value: unknown): value is string {
  return typeof value === 'string' && SHA256_PATTERN.test(value);
}

export function isPluginSignatureAlgorithm(value: unknown): value is PluginSignatureAlgorithm {
  return (
    typeof value === 'string' && (PLUGIN_SIGNATURE_ALGORITHMS as readonly string[]).includes(value)
  );
}

/**
 * The exact bytes a publisher signs. The id and version are bound in so a
 * signature cannot be replayed onto another entry sharing an artifact.
 */
export function pluginSignaturePayload(claim: {
  pluginId: string;
  version: string;
  sha256: string;
}): string {
  return `agiworkforce-plugin:v1\n${claim.pluginId}\n${claim.version}\n${claim.sha256}`;
}

export function pluginIntegrityVerdict(
  code: PluginIntegrityCode,
  pluginId: string,
): PluginIntegrityVerdict {
  switch (code) {
    case 'verified':
      return { ok: true, code, reason: `The ${pluginId} package matches its signed digest.` };
    case 'shipped_with_product':
      return {
        ok: true,
        code,
        reason: `The ${pluginId} pack ships with this build, so the release itself is its publisher.`,
      };
    case 'hash_missing':
      return {
        ok: false,
        code,
        reason: `The ${pluginId} package has no published checksum, so its contents cannot be verified.`,
      };
    case 'hash_mismatch':
      return {
        ok: false,
        code,
        reason: `The ${pluginId} package does not match the checksum the registry published. It was not installed.`,
      };
    case 'signature_missing':
      return {
        ok: false,
        code,
        reason: `The ${pluginId} package is not signed, so its publisher cannot be verified.`,
      };
    case 'signature_algorithm_unsupported':
      return {
        ok: false,
        code,
        reason: `The ${pluginId} package is signed with an algorithm this deployment does not accept.`,
      };
    case 'signature_invalid':
      return {
        ok: false,
        code,
        reason: `The ${pluginId} package signature does not verify against any trusted publisher key. It was not installed.`,
      };
  }
}
