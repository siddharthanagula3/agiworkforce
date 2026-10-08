'use client';

import { createContext, useContext } from 'react';

import { NOOP_SCENE_BRIDGE, type SceneBridge } from './sceneStore';

const AuthSceneBridgeContext = createContext<SceneBridge>(NOOP_SCENE_BRIDGE);

export const AuthSceneBridgeProvider = AuthSceneBridgeContext.Provider;

export function useAuthSceneBridge(): SceneBridge {
  return useContext(AuthSceneBridgeContext);
}
