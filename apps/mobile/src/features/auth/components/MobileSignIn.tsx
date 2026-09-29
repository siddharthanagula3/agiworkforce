import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { useSignIn } from '@clerk/expo';
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
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { authErrorMessage, isNativeAppleCancellation } from './authErrorMessage';
import {
  POST_AUTH_INTENT_PARAM,
  type PostAuthIntent,
} from '@/src/features/auth/services/postAuthIntent';

WebBrowser.maybeCompleteAuthSession();

type SignInStep = 'email' | 'password' | 'code';

export function MobileSignIn({
  onNativeFallback,
  onSignUp,
  postAuthIntent,
}: {
  onNativeFallback: () => void;
  onSignUp: () => void;
  postAuthIntent?: PostAuthIntent | null;
}) {
  const { colors, isDark } = useTheme();
  const { signIn, fetchStatus } = useSignIn();
  const signInRef = useRef(signIn);
  signInRef.current = signIn;
  const { startSSOFlow } = useSSO();
  const { startAppleAuthenticationFlow } = useSignInWithApple();
  const providers = resolveAuthProviders(process.env.EXPO_PUBLIC_AGI_AUTH_PROVIDERS).filter(
    (provider) => provider.id !== 'apple' || Platform.OS === 'ios',
  );
  const appleConfigured = providers.some((provider) => provider.id === 'apple');
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [step, setStep] = useState<SignInStep>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [codeDeliveryFailed, setCodeDeliveryFailed] = useState(false);
  const [working, setWorking] = useState(false);
  const [pendingProvider, setPendingProvider] = useState<AuthProviderId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accountMissing, setAccountMissing] = useState(false);
  const requestInFlight = useRef(false);
  const busy = working || fetchStatus === 'fetching';
  const emailCodeAvailable = signIn?.supportedFirstFactors.some(
    (factor) => factor.strategy === 'email_code',
  );
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

  const perform = async (action: () => Promise<void>) => {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    setWorking(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(authErrorMessage(cause, 'sign-in'));
    } finally {
      requestInFlight.current = false;
      setWorking(false);
      setPendingProvider(null);
    }
  };

  const finalize = async () => {
    const result = await signInRef.current.finalize({
      navigate: ({ session }) => {
        if (session?.currentTask) onNativeFallback();
      },
    });
    if (result.error) setError(authErrorMessage(result.error, 'sign-in'));
  };

  const resolveState = async () => {
    const current = signInRef.current;
    if (current.status === 'complete') {
      await finalize();
      return;
    }
    if (current.status !== 'needs_first_factor') {
      onNativeFallback();
      return;
    }
    if (current.supportedFirstFactors.some((factor) => factor.strategy === 'password')) {
      setStep('password');
      return;
    }
    if (current.supportedFirstFactors.some((factor) => factor.strategy === 'email_code')) {
      await sendEmailCode();
      return;
    }
    onNativeFallback();
  };

  const sendEmailCode = async () => {
    const sent = await signInRef.current.emailCode.sendCode();
    setStep('code');
    setCode('');
    if (sent.error) {
      setCodeDeliveryFailed(true);
      setError(authErrorMessage(sent.error, 'send-code'));
      return;
    }
    setCodeDeliveryFailed(false);
  };

  const startEmail = () =>
    void perform(async () => {
      setAccountMissing(false);
      const identifier = email.trim();
      if (!identifier) return;
      if (!validateEmail(identifier)) {
        setError('Enter a valid email address.');
        return;
      }
      const result = await signInRef.current.create({ identifier });
      if (result.error) {
        const missing = classifyAuthError(result.error).kind === 'identifier_not_found';
        setAccountMissing(missing);
        setError(authErrorMessage(result.error, 'sign-in'));
        return;
      }
      await resolveState();
    });

  const submitPassword = () =>
    void perform(async () => {
      if (!password) return;
      const result = await signInRef.current.password({ password });
      if (result.error) {
        setError(authErrorMessage(result.error, 'sign-in'));
        return;
      }
      if (signInRef.current.status === 'complete') await finalize();
      else onNativeFallback();
    });

  const submitCode = () =>
    void perform(async () => {
      if (!code.trim()) return;
      const result = await signInRef.current.emailCode.verifyCode({ code: code.trim() });
      if (result.error) {
        setError(authErrorMessage(result.error, 'sign-in'));
        return;
      }
      if (signInRef.current.status === 'complete') await finalize();
      else onNativeFallback();
    });

  const resendCode = () =>
    void perform(async () => {
      await sendEmailCode();
    });

  const switchToEmailCode = () =>
    void perform(async () => {
      if (
        !signInRef.current.supportedFirstFactors.some((factor) => factor.strategy === 'email_code')
      )
        return;
      await sendEmailCode();
    });

  const startProvider = (provider: AuthProviderId) =>
    void perform(async () => {
      setPendingProvider(provider);
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
    });

  const startApple = () =>
    void perform(async () => {
      if (!appleAvailable) return;
      setPendingProvider('apple');
      let result: Awaited<ReturnType<typeof startAppleAuthenticationFlow>>;
      try {
        result = await startAppleAuthenticationFlow();
      } catch (cause) {
        if (isNativeAppleCancellation(cause)) return;
        throw cause;
      }
      if (result.createdSessionId && result.setActive) {
        await result.setActive({
          session: result.createdSessionId,
          navigate: ({ session }) => {
            if (session?.currentTask) onNativeFallback();
          },
        });
      }
    });

  const changeEmail = () =>
    void perform(async () => {
      const result = await signInRef.current.reset();
      if (result.error) {
        setError(authErrorMessage(result.error, 'sign-in'));
        return;
      }
      setPassword('');
      setCode('');
      setCodeDeliveryFailed(false);
      setStep('email');
    });

  const button = (label: string, onPress: () => void, disabled: boolean, testID: string) => (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={{
        minHeight: 52,
        borderRadius: 26,
        backgroundColor: colors.teal,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 28,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {busy ? (
        <ActivityIndicator color={colors.accentText} />
      ) : (
        <Text style={{ color: colors.accentText, fontSize: typeScale.callout, fontWeight: '600' }}>
          {label}
        </Text>
      )}
    </Pressable>
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      testID="mobile-custom-sign-in"
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
            {step === 'email'
              ? 'Welcome back'
              : step === 'password'
                ? 'Enter your password'
                : 'Check your email'}
          </Text>
          {step === 'email' ? (
            <>
              <View style={{ gap: 12 }}>
                {providers.map((provider) =>
                  provider.id === 'apple' ? (
                    appleAvailable ? (
                      <View
                        key={provider.id}
                        testID="mobile-sign-in-apple"
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
                          onPress={startApple}
                        />
                      </View>
                    ) : null
                  ) : (
                    <Pressable
                      key={provider.id}
                      testID={`mobile-sign-in-${provider.id}`}
                      accessibilityRole="button"
                      disabled={busy}
                      onPress={() => startProvider(provider.id)}
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
                testID="mobile-sign-in-email"
                accessibilityLabel="Email address"
                value={email}
                onChangeText={(value) => {
                  setEmail(value);
                  setAccountMissing(false);
                  setError(null);
                }}
                keyboardType="email-address"
                textContentType="emailAddress"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="go"
                onSubmitEditing={startEmail}
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
              {button('Continue', startEmail, busy || !email.trim(), 'mobile-sign-in-continue')}
            </>
          ) : (
            <>
              <Text style={{ color: colors.textSecondary, textAlign: 'center', marginBottom: 24 }}>
                {step === 'password'
                  ? email.trim()
                  : codeDeliveryFailed
                    ? `We couldn't send a code to ${email.trim()}. Try sending it again.`
                    : `Enter the code sent to ${email.trim()}.`}
              </Text>
              {step === 'code' && codeDeliveryFailed ? null : (
                <TextInput
                  testID={step === 'password' ? 'mobile-sign-in-password' : 'mobile-sign-in-code'}
                  accessibilityLabel={step === 'password' ? 'Password' : 'Verification code'}
                  value={step === 'password' ? password : code}
                  onChangeText={step === 'password' ? setPassword : setCode}
                  secureTextEntry={step === 'password'}
                  keyboardType={step === 'code' ? 'number-pad' : 'default'}
                  textContentType={step === 'code' ? 'oneTimeCode' : 'password'}
                  autoComplete={step === 'code' ? 'one-time-code' : 'current-password'}
                  autoCapitalize="none"
                  onSubmitEditing={step === 'password' ? submitPassword : submitCode}
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
              )}
              {step === 'code' && codeDeliveryFailed
                ? null
                : button(
                    'Continue',
                    step === 'password' ? submitPassword : submitCode,
                    busy || !(step === 'password' ? password : code.trim()),
                    step === 'password'
                      ? 'mobile-sign-in-submit-password'
                      : 'mobile-sign-in-submit-code',
                  )}
              {step === 'code' ? (
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={resendCode}
                  style={{
                    minHeight: 44,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginTop: 8,
                  }}
                >
                  <Text style={{ color: colors.teal }}>Send a new code</Text>
                </Pressable>
              ) : null}
              {step === 'password' && emailCodeAvailable ? (
                <Pressable
                  testID="mobile-sign-in-use-email-code"
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={switchToEmailCode}
                  style={{
                    minHeight: 44,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginTop: 8,
                  }}
                >
                  <Text style={{ color: colors.teal }}>Use an email code instead</Text>
                </Pressable>
              ) : null}
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={changeEmail}
                style={{
                  minHeight: 44,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginTop: 8,
                }}
              >
                <Text style={{ color: colors.textSecondary }}>Use a different email</Text>
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
          {accountMissing && step === 'email' ? (
            <Pressable
              testID="mobile-sign-in-account-missing-sign-up"
              accessibilityRole="button"
              disabled={busy}
              onPress={onSignUp}
              style={{
                minHeight: 44,
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: 8,
              }}
            >
              <Text style={{ color: colors.teal, fontSize: typeScale.subhead, fontWeight: '600' }}>
                Create an account instead
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            testID="mobile-sign-in-native-options"
            accessibilityRole="button"
            disabled={busy}
            onPress={onNativeFallback}
            style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 20 }}
          >
            <Text style={{ color: colors.teal, fontSize: typeScale.subhead, fontWeight: '600' }}>
              {step === 'password' ? 'Forgot password or try another way' : 'More sign-in options'}
            </Text>
          </Pressable>
          {step === 'email' ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: 20,
              }}
            >
              <Text style={{ color: colors.textSecondary, fontSize: typeScale.subhead }}>
                New to AGI?
              </Text>
              <Pressable
                testID="cloud-auth-signUp"
                accessibilityRole="button"
                disabled={busy}
                onPress={onSignUp}
                style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 6 }}
              >
                <Text
                  style={{ color: colors.teal, fontSize: typeScale.subhead, fontWeight: '600' }}
                >
                  Create an account
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
