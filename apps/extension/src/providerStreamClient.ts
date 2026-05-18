/**
 * @deprecated import from 'features/native-bridge' instead.
 *
 * Re-export shim — canonical source has moved to
 * `src/features/native-bridge/providerStreamClient.ts`. This file is kept so
 * that existing import paths (background.ts, test imports, vi.mock paths)
 * resolve without change. Do not add new imports to this path.
 */
export * from './features/native-bridge/providerStreamClient';
