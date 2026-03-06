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
    const redirectUrl = Linking.createURL('auth/callback');
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
        skipBrowserRedirect: true,
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
      const url = result.url;
      // Extract tokens from URL fragment and set session
      const params = new URLSearchParams(url.split('#')[1]);
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      if (accessToken && refreshToken) {
        await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
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
