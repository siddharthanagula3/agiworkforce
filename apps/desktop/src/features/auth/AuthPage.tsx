import { useEffect, useState } from 'react';

import {
  AuthCharacterScene,
  AuthSceneBridgeProvider,
  createSceneStore,
} from '@agiworkforce/ui/auth-scene';
import '@agiworkforce/ui/auth-scene.css';

import './auth.css';
import { AuthBrand } from './AuthBrand';
import { NativeSignInCard } from './NativeSignInCard';
import { AUTH_COLUMN_CLASS, AUTH_FORM_PANEL_CLASS, AUTH_PAGE_CLASS } from './authStyles';

interface AuthPageProps {
  onAuthSuccess?: () => void;
}

export function AuthPage({ onAuthSuccess }: AuthPageProps) {
  const [store] = useState(createSceneStore);
  useEffect(() => () => store.dispose(), [store]);

  return (
    <AuthSceneBridgeProvider value={store}>
      <div className={AUTH_PAGE_CLASS} data-auth-column="" data-testid="auth-layout">
        <AuthCharacterScene store={store} />
        <div className={AUTH_FORM_PANEL_CLASS}>
          <div className={AUTH_COLUMN_CLASS}>
            <AuthBrand />
            <NativeSignInCard onSuccess={onAuthSuccess} />
          </div>
        </div>
      </div>
    </AuthSceneBridgeProvider>
  );
}

export default AuthPage;
