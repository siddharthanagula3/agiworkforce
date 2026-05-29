import { Platform, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as WebBrowser from 'expo-web-browser';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Text } from '@/components/ui/text';
import { useAuthStore } from '@/src/features/auth/store';
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
    await WebBrowser.openBrowserAsync('https://agiworkforce.com/login');
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
