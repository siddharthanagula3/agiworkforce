export {
  describePluginPermissionExpansion,
  diffPluginPermissions,
  normalizePluginPermissions,
  pluginPermissionsExpand,
} from './permissions';
export type { PluginPermissionDiff } from './permissions';

export {
  PLUGIN_SCAN_RULES,
  PLUGIN_SCAN_RULES_VERSION,
  describePluginScan,
  scanPluginPackage,
} from './packageScan';
export type {
  PluginScanFile,
  PluginScanFinding,
  PluginScanResult,
  PluginScanRule,
  PluginScanSeverity,
  PluginScanVerdict,
} from './packageScan';

export {
  PLUGIN_SHIPPED_PUBLISHER_KIND,
  PLUGIN_SHIPPED_SOURCE,
  PLUGIN_SIGNATURE_ALGORITHMS,
  isPluginSha256,
  isPluginShippedWithProduct,
  isPluginSignatureAlgorithm,
  pluginIntegrityVerdict,
  pluginSignaturePayload,
} from './signature';
export type {
  PluginIntegrityClaim,
  PluginIntegrityCode,
  PluginIntegrityVerdict,
  PluginPackageProvenance,
  PluginSignatureAlgorithm,
} from './signature';
