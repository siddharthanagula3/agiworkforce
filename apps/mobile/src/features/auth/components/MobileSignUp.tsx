import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { useSignUp } from '@clerk/expo';
import { useSignInWithApple } from '@clerk/expo/apple';
import { useSSO } from '@clerk/expo/experimental';
import * as AppleAuthentication from 'expo-apple-authentication';
import { createURL } from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import {
  classifyAuthError,
  resolveAuthProviders,
  type AuthProviderId,
} from '@agiworkforce/client-runtime';
import { validateEmail } from '@agiworkforce/utils';
import {
  FREE_PLAN_TRAINING_DATA_DISCLOSURE,
  FREE_PLAN_TRAINING_NOTICE_LEAD,
  FREE_PLAN_TRAINING_NOTICE_TAIL,
  FREE_PLAN_TRAINING_NOTICE_TITLE,
} from '@agiworkforce/compliance';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { Text } from '@/components/ui/text';
import { API_URL } from '@/lib/constants';
import { openExternalUrl } from '@/lib/safeOpenURL';
import { useTheme } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { authErrorMessage, isNativeAppleCancellation } from './authErrorMessage';
import {
  POST_AUTH_INTENT_PARAM,
  type PostAuthIntent,
} from '@/src/features/auth/services/postAuthIntent';

WebBrowser.maybeCompleteAuthSession();

export function MobileSignUp({
  onNativeFallback,
  onSignIn,
  postAuthIntent,
}: {
  onNativeFallback: () => void;
  onSignIn: () => void;
  postAuthIntent?: PostAuthIntent | null;
}) {
  const { colors, isDark } = useTheme();
  const { signUp, fetchStatus } = useSignUp();
  const signUpRef = useRef(signUp);
  signUpRef.current = signUp;
  const { startSSOFlow } = useSSO();
  const { startAppleAuthenticationFlow } = useSignInWithApple();
  const providers = resolveAuthProviders(process.env.EXPO_PUBLIC_AGI_AUTH_PROVIDERS).filter(
    (provider) => provider.id !== 'apple' || Platform.OS === 'ios',
  );
  const appleConfigured = providers.some((provider) => provider.id === 'apple');
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);
  const [codeDeliveryFailed, setCodeDeliveryFailed] = useState(false);
  const [working, setWorking] = useState(false);
  const requestInFlight = useRef(false);
  const [pendingProvider, setPendingProvider] = useState<AuthProviderId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accountExists, setAccountExists] = useState(false);
  const [socialRecoveryAvailable, setSocialRecoveryAvailable] = useState(false);
  const busy = fetchStatus === 'fetching' || pendingProvider !== null || working;
  const verifying = verificationEmail !== null;
  const hasVisibleProvider = providers.some(
    (provider) => provider.id !== 'apple' || appleAvailable,
  );

  useEffect(() => {
    if (!appleConfigured) return;
    let active = true;
    void AppleAuthentication.isAvailableAsync()
      .then((available) => {
        if (active) setAppleAvailable(available);
      })
      .catch(() => {
        if (active) setAppleAvailable(false);
      });
    return () => {
      active = false;
    };
  }, [appleConfigured]);

  const runRequest = async (request: () => Promise<void>) => {
    if (requestInFlight.current || busy) return;
    requestInFlight.current = true;
    setWorking(true);
    try {
      await request();
    } finally {
      requestInFlight.current = false;
      setWorking(false);
    }
  };

  const startEmail = async () => {
    const emailAddress = email.trim();
    if (!emailAddress) return;
    if (!validateEmail(emailAddress)) {
      setError('Enter a valid email address.');
      return;
    }
    await runRequest(async () => {
      setError(null);
      setAccountExists(false);
      setCodeDeliveryFailed(false);
      setSocialRecoveryAvailable(false);
      try {
        const created = await signUpRef.current.create({ emailAddress, legalAccepted: true });
        if (created.error) {
          const exists = classifyAuthError(created.error).kind === 'identifier_exists';
          setAccountExists(exists);
          setError(authErrorMessage(created.error, 'sign-up'));
          return;
        }
        setVerificationEmail(emailAddress);
        const sent = await signUpRef.current.verifications.sendEmailCode();
        if (sent.error) {
          setCodeDeliveryFailed(true);
          setError(authErrorMessage(sent.error, 'send-code'));
        }
      } catch (cause) {
        const exists = classifyAuthError(cause).kind === 'identifier_exists';
        setAccountExists(exists);
        setCodeDeliveryFailed(!exists);
        setError(authErrorMessage(cause, 'sign-up'));
      }
    });
  };

  const resendEmail = async () => {
    await runRequest(async () => {
      setError(null);
      try {
        const sent = await signUpRef.current.verifications.sendEmailCode();
        if (sent.error) {
          setCodeDeliveryFailed(true);
          setError(authErrorMessage(sent.error, 'send-code'));
        } else {
          setCodeDeliveryFailed(false);
        }
      } catch (cause) {
        setCodeDeliveryFailed(true);
        setError(authErrorMessage(cause, 'send-code'));
      }
    });
  };

  const verifyEmail = async () => {
    if (!code.trim() || codeDeliveryFailed) return;
    await runRequest(async () => {
      setError(null);
      try {
        const verified = await signUpRef.current.verifications.verifyEmailCode({
          code: code.trim(),
        });
        if (verified.error) {
          setError(authErrorMessage(verified.error, 'sign-up'));
          return;
        }
        if (signUpRef.current.status !== 'complete') {
          onNativeFallback();
          return;
        }
        const finalized = await signUpRef.current.finalize({
          navigate: ({ session }) => {
            if (session?.currentTask) onNativeFallback();
          },
        });
        if (finalized.error) setError(authErrorMessage(finalized.error, 'sign-up'));
      } catch (cause) {
        setError(authErrorMessage(cause, 'sign-up'));
      }
    });
  };

  const startProvider = async (provider: AuthProviderId) => {
    await runRequest(async () => {
      setPendingProvider(provider);
      setError(null);
      setSocialRecoveryAvailable(false);
      try {
        const result = await startSSOFlow({
          strategy: `oauth_${provider}`,
          redirectUrl: createURL(
            '/login',
            postAuthIntent
              ? { queryParams: { [POST_AUTH_INTENT_PARAM]: postAuthIntent } }
              : undefined,
          ),
        });
        if (
          result.authSessionResult?.type === 'cancel' ||
          result.authSessionResult?.type === 'dismiss'
        )
          return;
        if (!result.authSessionResult && !result.createdSessionId) {
          setError('Sign-in is still loading. Please try again.');
          return;
        }
        if (
          result.authSessionResult?.type === 'success' &&
          !result.createdSessionId &&
          !result.signIn?.existingSession &&
          !result.signUp?.existingSession
        ) {
          onNativeFallback();
        }
      } catch (cause) {
        setError(authErrorMessage(cause, 'sign-up'));
        setSocialRecoveryAvailable(true);
      } finally {
        setPendingProvider(null);
      }
    });
  };

  const startApple = async () => {
    if (!appleAvailable) return;
    await runRequest(async () => {
      setPendingProvider('apple');
      setError(null);
      setSocialRecoveryAvailable(false);
      try {
        const result = await startAppleAuthenticationFlow();
        if (result.createdSessionId && result.setActive) {
          await result.setActive({
            session: result.createdSessionId,
            navigate: ({ session }) => {
              if (session?.currentTask) onNativeFallback();
            },
          });
        }
      } catch (cause) {
        if (isNativeAppleCancellation(cause)) return;
        setError(authErrorMessage(cause, 'sign-up'));
        setSocialRecoveryAvailable(true);
      } finally {
        setPendingProvider(null);
      }
    });
  };

  const returnToEmail = async () => {
    await runRequest(async () => {
      try {
        const reset = await signUpRef.current.reset();
        if (reset.error) {
          setError(authErrorMessage(reset.error, 'sign-up'));
          return;
        }
        setVerificationEmail(null);
        setCodeDeliveryFailed(false);
        setCode('');
        setError(null);
      } catch (cause) {
        setError(authErrorMessage(cause, 'sign-up'));
      }
    });
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      testID="mobile-custom-sign-up"
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'flex-start',
          paddingHorizontal: 24,
          paddingTop: 42,
          paddingBottom: 32,
        }}
      >
        <View style={{ width: '100%', maxWidth: 340, alignSelf: 'center' }}>
          <Text
            accessibilityRole="header"
            style={{
              color: colors.textPrimary,
              fontSize: typeScale.largeTitle,
              fontWeight: '700',
              textAlign: 'center',
              marginBottom: 32,
            }}
          >
            {verifying ? 'Verify your email' : 'Create an account'}
          </Text>
          {verifying ? (
            <>
              <Text
                style={{
                  color: colors.textSecondary,
                  fontSize: typeScale.body,
                  textAlign: 'center',
                  marginBottom: 24,
                }}
              >
                {codeDeliveryFailed
                  ? `We couldn't send a code to ${verificationEmail}. Try sending a new code.`
                  : `Enter the code sent to ${verificationEmail}.`}
              </Text>
              {!codeDeliveryFailed ? (
                <>
                  <Text
                    style={{
                      color: colors.textPrimary,
                      fontSize: typeScale.subhead,
                      fontWeight: '600',
                      textAlign: 'center',
                      marginBottom: 10,
                    }}
                  >
                    Verification code
                  </Text>
                  <TextInput
                    testID="mobile-sign-up-code"
                    accessibilityLabel="Verification code"
                    value={code}
                    onChangeText={setCode}
                    keyboardType="number-pad"
                    textContentType="oneTimeCode"
                    autoComplete="one-time-code"
                    autoCapitalize="none"
                    style={{
                      minHeight: 52,
                      borderRadius: 26,
                      borderWidth: 1,
                      borderColor: colors.border,
                      color: colors.textPrimary,
                      backgroundColor: colors.surfaceElevated,
                      fontSize: typeScale.callout,
                      textAlign: 'center',
                      paddingHorizontal: 20,
                    }}
                  />
                  <Pressable
                    testID="mobile-sign-up-verify"
                    accessibilityRole="button"
                    disabled={busy || !code.trim()}
                    onPress={() => void verifyEmail()}
                    style={{
                      minHeight: 52,
                      borderRadius: 26,
                      backgroundColor: colors.teal,
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginTop: 28,
                      opacity: busy || !code.trim() ? 0.5 : 1,
                    }}
                  >
                    {busy ? (
                      <ActivityIndicator color={colors.accentText} />
                    ) : (
                      <Text
                        style={{
                          color: colors.accentText,
                          fontSize: typeScale.callout,
                          fontWeight: '600',
                        }}
                      >
                        Verify and continue
                      </Text>
                    )}
                  </Pressable>
                </>
              ) : null}
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={() => void resendEmail()}
                style={{
                  minHeight: 44,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginTop: 8,
                }}
              >
                <Text style={{ color: colors.teal }}>Send a new code</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={() => void returnToEmail()}
                style={{
                  minHeight: 44,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginTop: 12,
                }}
              >
                <Text style={{ color: colors.textSecondary }}>Use a different email</Text>
              </Pressable>
            </>
          ) : (
            <>
              <View style={{ gap: 12 }}>
                {providers.map((provider) =>
                  provider.id === 'apple' ? (
                    appleAvailable ? (
                      <View
                        key={provider.id}
                        testID="mobile-sign-up-apple"
                        pointerEvents={busy ? 'none' : 'auto'}
                        style={{ opacity: busy ? 0.5 : 1 }}
                      >
                        <AppleAuthentication.AppleAuthenticationButton
                          buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                          buttonStyle={
                            isDark
                              ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                              : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
                          }
                          cornerRadius={26}
                          style={{ height: 52, width: '100%' }}
                          onPress={() => void startApple()}
                        />
                      </View>
                    ) : null
                  ) : (
                    <Pressable
                      key={provider.id}
                      testID={`mobile-sign-up-${provider.id}`}
                      accessibilityRole="button"
                      disabled={busy}
                      onPress={() => void startProvider(provider.id)}
                      style={{
                        minHeight: 52,
                        borderRadius: 26,
                        borderWidth: 1,
                        borderColor: colors.border,
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: busy ? 0.5 : 1,
                      }}
                    >
                      <Text
                        style={{
                          color: colors.textPrimary,
                          fontSize: typeScale.callout,
                          fontWeight: '500',
                        }}
                      >
                        {pendingProvider === provider.id
                          ? 'Opening…'
                          : `Continue with ${provider.label}`}
                      </Text>
                    </Pressable>
                  ),
                )}
              </View>
              {hasVisibleProvider ? (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    marginVertical: 24,
                  }}
                >
                  <View style={{ height: 1, flex: 1, backgroundColor: colors.border }} />
                  <Text
                    style={{
                      color: colors.textMuted,
                      fontSize: typeScale.footnote,
                      fontWeight: '600',
                    }}
                  >
                    OR
                  </Text>
                  <View style={{ height: 1, flex: 1, backgroundColor: colors.border }} />
                </View>
              ) : null}
              <Text
                style={{
                  color: colors.textPrimary,
                  fontSize: typeScale.subhead,
                  fontWeight: '600',
                  textAlign: 'center',
                  marginBottom: 10,
                }}
              >
                Email address
              </Text>
              <TextInput
                testID="mobile-sign-up-email"
                accessibilityLabel="Email address"
                value={email}
                onChangeText={(value) => {
                  setEmail(value);
                  setAccountExists(false);
                  setError(null);
                }}
                keyboardType="email-address"
                textContentType="emailAddress"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="go"
                onSubmitEditing={() => void startEmail()}
                style={{
                  minHeight: 52,
                  borderRadius: 26,
                  borderWidth: 1,
                  borderColor: colors.border,
                  color: colors.textPrimary,
                  backgroundColor: colors.surfaceElevated,
                  fontSize: typeScale.callout,
                  textAlign: 'center',
                  paddingHorizontal: 20,
                }}
              />
              <Pressable
                testID="mobile-sign-up-continue"
                accessibilityRole="button"
                disabled={busy || !email.trim()}
                onPress={() => void startEmail()}
                style={{
                  minHeight: 52,
                  borderRadius: 26,
                  backgroundColor: colors.teal,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginTop: 28,
                  opacity: busy || !email.trim() ? 0.5 : 1,
                }}
              >
                {busy ? (
                  <ActivityIndicator color={colors.accentText} />
                ) : (
                  <Text
                    style={{
                      color: colors.accentText,
                      fontSize: typeScale.callout,
                      fontWeight: '600',
                    }}
                  >
                    Continue
                  </Text>
                )}
              </Pressable>
            </>
          )}
          {error ? (
            <Text
              accessibilityRole="alert"
              style={{
                color: colors.agentError,
                textAlign: 'center',
                fontSize: typeScale.subhead,
                marginTop: 14,
              }}
            >
              {error}
            </Text>
          ) : null}
          {accountExists && !verifying ? (
            <Pressable
              testID="mobile-sign-up-account-exists-sign-in"
              accessibilityRole="button"
              disabled={busy}
              onPress={onSignIn}
              style={{
                minHeight: 44,
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: 8,
              }}
            >
              <Text style={{ color: colors.teal, fontSize: typeScale.subhead, fontWeight: '600' }}>
                Log in instead
              </Text>
            </Pressable>
          ) : null}
          {socialRecoveryAvailable ? (
            <Pressable
              testID="mobile-sign-up-native-recovery"
              accessibilityRole="button"
              onPress={onNativeFallback}
              style={{
                minHeight: 44,
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: 8,
              }}
            >
              <Text style={{ color: colors.teal, fontSize: typeScale.subhead, fontWeight: '600' }}>
                Continue with another sign-up method
              </Text>
            </Pressable>
          ) : null}
          {!verifying ? (
            <>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginTop: 28,
                }}
              >
                <Text style={{ color: colors.textSecondary, fontSize: typeScale.subhead }}>
                  Already have an account?
                </Text>
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={onSignIn}
                  style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 6 }}
                >
                  <Text
                    style={{ color: colors.teal, fontSize: typeScale.subhead, fontWeight: '600' }}
                  >
                    Log in
                  </Text>
                </Pressable>
              </View>
              <Text
                style={{
                  color: colors.textSecondary,
                  textAlign: 'center',
                  fontSize: typeScale.footnote,
                  lineHeight: 20,
                  marginTop: 16,
                }}
              >
                By signing up, you agree to the{' '}
                <Text
                  accessibilityRole="link"
                  onPress={() => void openExternalUrl(new URL('/terms', API_URL).toString())}
                  style={{
                    color: colors.textSecondary,
                    fontSize: typeScale.footnote,
                    lineHeight: 20,
                    textDecorationLine: 'underline',
                  }}
                >
                  Terms of Use
                </Text>{' '}
                and acknowledge the{' '}
                <Text
                  accessibilityRole="link"
                  onPress={() => void openExternalUrl(new URL('/privacy', API_URL).toString())}
                  style={{
                    color: colors.textSecondary,
                    fontSize: typeScale.footnote,
                    lineHeight: 20,
                    textDecorationLine: 'underline',
                  }}
                >
                  Privacy Policy
                </Text>
                .
              </Text>
              <View
                testID="cloud-sign-up-data-use"
                style={{ alignItems: 'center', gap: 4, marginTop: 24 }}
              >
                <Text
                  style={{
                    color: colors.textPrimary,
                    fontSize: typeScale.footnote,
                    fontWeight: '600',
                  }}
                >
                  {FREE_PLAN_TRAINING_NOTICE_TITLE}
                </Text>
                <Text
                  style={{
                    color: colors.textSecondary,
                    fontSize: typeScale.caption,
                    lineHeight: 18,
                    textAlign: 'center',
                  }}
                >
                  {FREE_PLAN_TRAINING_NOTICE_LEAD} {FREE_PLAN_TRAINING_DATA_DISCLOSURE}{' '}
                  {FREE_PLAN_TRAINING_NOTICE_TAIL}
                </Text>
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel="Read how Free model providers may use your data"
                  onPress={() => void openExternalUrl(new URL('/data-use', API_URL).toString())}
                  style={{ minHeight: 44, justifyContent: 'center' }}
                >
                  <Text
                    style={{ color: colors.teal, fontSize: typeScale.caption, fontWeight: '600' }}
                  >
                    How Free model data is used
                  </Text>
                </Pressable>
              </View>
            </>
          ) : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
