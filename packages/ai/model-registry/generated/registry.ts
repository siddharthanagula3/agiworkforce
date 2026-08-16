import registry from './registry.json';

export const modelRegistry = registry;
export type ModelRegistry = typeof modelRegistry;
export type ModelKey = keyof ModelRegistry['models'];
export type ProviderId = keyof ModelRegistry['providerModelKeys'];
export type RouteId = keyof ModelRegistry['routes'];
export type HarnessId = keyof ModelRegistry['harnesses'];
export type RuntimeProfileId = keyof ModelRegistry['runtimeProfiles'];
export default registry;
