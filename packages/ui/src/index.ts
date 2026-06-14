/**
 * @agiworkforce/ui — cross-surface PURE UI: pure-presentation components and
 * plain config/contract data shared by web (apps/web) and desktop (apps/desktop).
 *
 * Boundary rule: ONLY pure presentation (no data/IO, currentColor SVG) and
 * config/contract (plain data) live here. Anything that imports a store, calls
 * invoke()/fetch(), or reads Next/RSC stays per-surface.
 */

export { ProviderMark, hasProviderMark } from './ProviderMark';
export { AgiMark } from './AgiMark';
export {
  SETTINGS_NAV,
  SETTINGS_NAV_GROUPS,
  type SettingsNavEntry,
  type SettingsNavGroup,
  type SettingsNavKey,
} from './settings-nav';
