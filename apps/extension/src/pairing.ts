/**
 * @deprecated import from 'features/native-bridge' instead.
 *
 * Re-export shim — canonical source has moved to
 * `src/features/native-bridge/pairing.ts`. This file is kept so that:
 *   - Existing test imports (`../src/pairing`) resolve unchanged.
 *   - `popup.ts` keeps its current import path unchanged.
 * Do not add new imports to this path.
 */
export * from './features/native-bridge/pairing';
