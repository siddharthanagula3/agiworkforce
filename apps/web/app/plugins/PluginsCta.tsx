'use client';

import { Button, ButtonRow } from '@/features/marketing/components/system';
import { useCurrentUser } from '@/lib/identity/client';

const SETTINGS_HREF = '/apps';
const SIGNUP_HREF = '/signup?redirectTo=%2Fapps';
const SIGNED_IN_LABEL = 'Open plugin settings';
const SIGNED_OUT_LABEL = 'Sign up to install';
const CATALOGUE_LABEL = 'What a plugin bundles';
const CATALOGUE_HREF = '/features/plugins';

export function PluginsCta() {
  const { isLoaded, isSignedIn } = useCurrentUser();
  const signedIn = isLoaded && isSignedIn;

  return (
    <ButtonRow>
      <Button href={signedIn ? SETTINGS_HREF : SIGNUP_HREF}>
        {signedIn ? SIGNED_IN_LABEL : SIGNED_OUT_LABEL}
      </Button>
      <Button href={CATALOGUE_HREF} variant="secondary">
        {CATALOGUE_LABEL}
      </Button>
    </ButtonRow>
  );
}
