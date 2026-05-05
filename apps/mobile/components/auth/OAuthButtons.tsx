import { Platform, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Text } from '@/components/ui/text';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/services/supabase';
import * as Crypto from 'expo-crypto';

WebBrowser.maybeCompleteAuthSession();

export function OAuthButtons() {
  const { signInWithApple, isLoading } = useAuthStore();

  const handleAppleSignIn = async () => {
    try {
      const rawNonce = await Crypto.getRandomBytesAsync(32);
      const nonce = Array.from(new Uint8Array(rawNonce))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      const hashedNonce = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        nonce,
      );

      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });

      if (credential.identityToken) {
        await signInWithApple(credential.identityToken, nonce);
      }
    } catch (err) {
      // User cancelled — not an error
      if ((err as { code?: string }).code === 'ERR_REQUEST_CANCELED') return;
      throw err;
    }
  };

  const handleGoogleSignIn = async () => {
    // HIGH-MOB-04 fix (2026-05-04): two changes from the previous
    // implementation:
    //
    // 1. The redirect target is now a server-side callback
    //    (https://agiworkforce.com/auth/callback) rather than the custom
    //    `agiworkforce://` scheme. On Android, any APK can register a custom
    //    scheme and intercept the OAuth redirect; HTTPS App Links require domain
    //    ownership verification so they cannot be hijacked.
    //
    //    NOTE: this requires that https://agiworkforce.com/auth/callback is live
    //    (it is — Supabase's default OAuth callback URL) and that the Android
    //    assetlinks.json + iOS AASA are served at /.well-known/ on
    //    agiworkforce.com. Those files must be deployed server-side — tracked as
    //    a prerequisite before this flow is enabled in production.
    //
    // 2. Supabase's `exchangeCodeForSession` exchanges the PKCE code for tokens
    //    server-side via the Supabase Auth API, so the access_token never
    //    appears in the redirect URL that the OS might log to logcat/syslog.
    const redirectUrl = 'https://agiworkforce.com/auth/callback';

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
        skipBrowserRedirect: true,
        // PKCE is the default in Supabase JS v2; make it explicit.
        queryParams: { response_type: 'code' },
      },
    });

    if (error || !data.url) return;

    // Validate OAuth URL origin before opening browser
    try {
      const urlOrigin = new URL(data.url).origin;
      const isAllowed =
        urlOrigin === 'https://accounts.google.com' ||
        urlOrigin.endsWith('.supabase.co') ||
        urlOrigin.endsWith('.supabase.in');
      if (!isAllowed) {
        console.warn('[OAuth] Unexpected URL origin:', urlOrigin);
        return;
      }
    } catch {
      console.warn('[OAuth] Invalid URL from Supabase:', data.url);
      return;
    }

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);
    if (result.type === 'success') {
      const callbackUrl = result.url;

      // Extract the PKCE `code` query param — NOT tokens from the fragment.
      // Tokens never appear in the URL so they cannot leak to logcat.
      try {
        const parsed = new URL(callbackUrl);
        const code = parsed.searchParams.get('code');
        if (code) {
          // Exchange the authorization code for a session server-side.
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) {
            console.warn('[OAuth] Code exchange failed:', exchangeError.message);
          }
        }
      } catch {
        console.warn('[OAuth] Could not parse callback URL');
      }
    }
  };

  return (
    <View className="gap-4">
      <View className="flex-row items-center gap-3">
        <Separator className="flex-1" />
        <Text className="text-xs text-white/40">OR</Text>
        <Separator className="flex-1" />
      </View>

      {Platform.OS === 'ios' && (
        <Button
          title="Continue with Apple"
          variant="outline"
          onPress={handleAppleSignIn}
          loading={isLoading}
        />
      )}

      <Button
        title="Continue with Google"
        variant="outline"
        onPress={handleGoogleSignIn}
        loading={isLoading}
      />
    </View>
  );
}
