'use client';

import { useEffect, useState, type ReactNode } from 'react';

import {
  AuthCharacterScene,
  AuthSceneBridgeProvider,
  createSceneStore,
} from '@agiworkforce/ui/auth-scene';
import '@agiworkforce/ui/auth-scene.css';

import './auth.css';
import { AuthBrand } from './AuthBrand';
import {
  AUTH_COLUMN_CLASS,
  AUTH_FORM_PANEL_CLASS,
  AUTH_PAGE_CLASS,
  AUTH_SPLIT_COLUMN_CLASS,
  AUTH_SPLIT_PAGE_CLASS,
} from './authStyles';

export function AuthShell({
  children,
  embedded,
  scene,
}: {
  children: ReactNode;
  embedded: boolean;
  scene: boolean;
}) {
  const [store] = useState(createSceneStore);
  useEffect(() => () => store.dispose(), [store]);
  const split = scene && !embedded;

  return (
    <AuthSceneBridgeProvider value={store}>
      <div
        className={split ? AUTH_SPLIT_PAGE_CLASS : AUTH_PAGE_CLASS}
        data-auth-column=""
        data-auth-shell={split ? 'split' : 'plain'}
        data-testid="auth-layout"
        data-embedded={String(embedded)}
      >
        {split ? (
          <>
            <AuthCharacterScene store={store} />
            <div className={AUTH_FORM_PANEL_CLASS}>
              <main id="main-content" className={AUTH_SPLIT_COLUMN_CLASS}>
                <AuthBrand />
                {children}
              </main>
            </div>
          </>
        ) : (
          <main id="main-content" className={AUTH_COLUMN_CLASS}>
            <AuthBrand />
            {children}
          </main>
        )}
      </div>
    </AuthSceneBridgeProvider>
  );
}
