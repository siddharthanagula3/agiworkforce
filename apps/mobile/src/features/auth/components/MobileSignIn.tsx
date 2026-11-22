import { FREE_PLAN_TRAINING_SIGNUP_NOTICE } from '@agiworkforce/compliance';
import { LoadingIndicator } from '@/components/ui/LoadingIndicator';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from 'react-native';
import { useClerk, useSignIn } from '@clerk/expo';
import { useSignInWithApple } from '@clerk/expo/apple';
import { useSSO } from '@clerk/expo/experimental';
import * as AppleAuthentication from 'expo-apple-authentication';
import { withMobileSsoCallback } from '../services/mobileSsoCallback';
import * as WebBrowser from 'expo-web-browser';
import {
  classifyAuthError,
  resolveAuthProviders,
  type AuthProviderId,
} from '@agiworkforce/client-runtime';
import { validateEmail } from '@agiworkforce/utils';
import { PressableBox as Pressable } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/src/ui/theme';
import { radii, typeScale } from '@/src/ui/theme/tokens';
import {
  ACCOUNT_SUSPENDED_MESSAGE,
  authErrorMessage,
  isNativeAppleCancellation,
  suspensionAppealUrl,
} from './authErrorMessage';
import { openUntrustedUrlInAppBrowser } from '@/lib/safeOpenURL';
import {
  appleFlowWithoutSession,
  buildIncludesSignInWithApple,
  loginProvidersToRender,
} from '@/src/features/auth/services/loginProviders';
import {
  forgetRememberedAccount,
  readRememberedAccountForSignIn,
  REMEMBERED_EMAIL_METHOD,
  rememberAccount,
  type RememberedAccount,
  type RememberedAccountMethod,
} from '@/src/features/auth/services/rememberedAccount';
import { keyboardAvoidingBehavior } from '@/src/features/chat/chrome/keyboardSafeComposer';
import { useAuthEmailFieldReveal } from './useAuthEmailFieldReveal';

WebBrowser.maybeCompleteAuthSession();

type SignInStep = 'email' | 'password' | 'code';
type CodeFactor = 'first' | 'second';

export function MobileSignIn({
  addingAccount = false,
  onNativeFallback,
  onSignUp,
}: {
  addingAccount?: boolean;
  onNativeFallback: () => void;
  onSignUp: (email?: string) => void;
}) {
  const { colors, isDark } = useTheme();
  const clerk = useClerk();
  const { signIn, fetchStatus } = useSignIn();
  const signInRef = useRef(signIn);
  signInRef.current = signIn;
  const { startSSOFlow } = useSSO();
  const { startAppleAuthenticationFlow } = useSignInWithApple();
  const appleSignInBuilt = Platform.OS === 'ios' && buildIncludesSignInWithApple();
  const [appleAvailable, setAppleAvailable] = useState(false);
  const providers = loginProvidersToRender(
    resolveAuthProviders(process.env.EXPO_PUBLIC_AGI_AUTH_PROVIDERS),
    Platform.OS,
    appleSignInBuilt && appleAvailable,
  );
  const [step, setStep] = useState<SignInStep>('email');
  const [email, setEmail] = useState('');
  const [admittedEmail, setAdmittedEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [codeFactor, setCodeFactor] = useState<CodeFactor>('first');
  const [codeRecipient, setCodeRecipient] = useState('');
  const [codeDeliveryFailed, setCodeDeliveryFailed] = useState(false);
  const [working, setWorking] = useState(false);
  const [pendingProvider, setPendingProvider] = useState<AuthProviderId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accountMissing, setAccountMissing] = useState(false);
  const [remembered, setRemembered] = useState<RememberedAccount | null>(null);
  const requestInFlight = useRef(false);
  const admittedEmailRef = useRef('');
  const busy = working || fetchStatus === 'fetching';
  const continueAsAccount =
    !addingAccount &&
    remembered &&
    (remembered.method === REMEMBERED_EMAIL_METHOD ||
      providers.some((provider) => provider.id === remembered.method))
      ? remembered
      : null;
  const emailCodeAvailable = signIn?.supportedFirstFactors.some(
    (factor) => factor.strategy === 'email_code',
  );
  const hasVisibleProvider = providers.length > 0;

  useEffect(() => {
    if (!appleSignInBuilt) return;
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
  }, [appleSignInBuilt]);

  useEffect(() => {
    let active = true;
    void readRememberedAccountForSignIn().then((account) => {
      if (active) setRemembered(account);
    });
    return () => {
      active = false;
    };
  }, []);

  const rememberSignedIn = async (method: RememberedAccountMethod, knownEmail?: string) => {
    const email = knownEmail ?? clerk.user?.primaryEmailAddress?.emailAddress;
    if (email) await rememberAccount({ email, method });
  };

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
    if (result.error) {
      setError(authErrorMessage(result.error, 'sign-in'));
      return;
    }
    await rememberSignedIn(REMEMBERED_EMAIL_METHOD, admittedEmailRef.current);
  };

  const settleSSOResult = async (
    result: Awaited<ReturnType<typeof startSSOFlow>>,
    method: RememberedAccountMethod,
    knownEmail?: string,
  ) => {
    if (result.authSessionResult?.type === 'cancel' || result.authSessionResult?.type === 'dismiss')
      return;
    if (!result.authSessionResult && !result.createdSessionId) {
      setError('Sign-in is still loading. Please try again.');
      return;
    }
    if (
      result.createdSessionId ||
      result.signIn?.existingSession ||
      result.signUp?.existingSession
    ) {
      await rememberSignedIn(method, knownEmail);
      return;
    }
    if (result.authSessionResult?.type === 'success') onNativeFallback();
  };

  const startEnterpriseSso = async (identifier: string) => {
    const result = await withMobileSsoCallback((redirectUrl) =>
      startSSOFlow({
        strategy: 'enterprise_sso',
        identifier,
        redirectUrl,
      }),
    );
    await settleSSOResult(result, REMEMBERED_EMAIL_METHOD, identifier);
  };

  const resolveState = async (identifier: string) => {
    const current = signInRef.current;
    if (current.status === 'complete') {
      await finalize();
      return;
    }
    if (current.status !== 'needs_first_factor') {
      onNativeFallback();
      return;
    }
    if (current.supportedFirstFactors.some((factor) => factor.strategy === 'enterprise_sso')) {
      await startEnterpriseSso(identifier);
      return;
    }
    if (current.supportedFirstFactors.some((factor) => factor.strategy === 'password')) {
      setStep('password');
      return;
    }
    if (current.supportedFirstFactors.some((factor) => factor.strategy === 'email_code')) {
      await sendEmailCode('first');
      return;
    }
    onNativeFallback();
  };

  const continueAfterFirstFactor = async () => {
    const current = signInRef.current;
    if (current.status === 'complete') {
      await finalize();
      return;
    }
    const secondStepByEmail =
      (current.status === 'needs_second_factor' || current.status === 'needs_client_trust') &&
      current.supportedSecondFactors.some((factor) => factor.strategy === 'email_code');
    if (secondStepByEmail) {
      await sendEmailCode('second');
      return;
    }
    onNativeFallback();
  };

  const sendEmailCode = async (factor: CodeFactor) => {
    const current = signInRef.current;
    const emailFactor =
      factor === 'second'
        ? current.supportedSecondFactors.find((candidate) => candidate.strategy === 'email_code')
        : undefined;
    const sent =
      factor === 'first' ? await current.emailCode.sendCode() : await current.mfa.sendEmailCode();
    setCodeFactor(factor);
    setCodeRecipient(emailFactor?.strategy === 'email_code' ? emailFactor.safeIdentifier : '');
    setStep('code');
    setCode('');
    if (sent.error) {
      setCodeDeliveryFailed(true);
      setError(authErrorMessage(sent.error, 'send-code'));
      return;
    }
    setCodeDeliveryFailed(false);
  };

  const signInWithEmail = (typed: string, fromRememberedAccount = false) =>
    void perform(async () => {
      setAccountMissing(false);
      const identifier = typed.trim();
      if (!identifier) return;
      if (!validateEmail(identifier)) {
        setError('Enter a valid email address.');
        return;
      }
      const result = await signInRef.current.create({ identifier });
      if (result.error) {
        const missing = classifyAuthError(result.error).kind === 'identifier_not_found';
        if (missing && !fromRememberedAccount) {
          onSignUp(identifier);
          return;
        }
        setAccountMissing(missing);
        setError(authErrorMessage(result.error, 'sign-in'));
        return;
      }
      setAdmittedEmail(identifier);
      admittedEmailRef.current = identifier;
      await resolveState(identifier);
    });

  const startEmail = () => signInWithEmail(email);

  const submitPassword = () =>
    void perform(async () => {
      if (!password) return;
      const result = await signInRef.current.password({ password });
      if (result.error) {
        setError(authErrorMessage(result.error, 'sign-in'));
        return;
      }
      await continueAfterFirstFactor();
    });

  const submitCode = () =>
    void perform(async () => {
      if (!code.trim()) return;
      const current = signInRef.current;
      const result =
        codeFactor === 'first'
          ? await current.emailCode.verifyCode({ code: code.trim() })
          : await current.mfa.verifyEmailCode({ code: code.trim() });
      if (result.error) {
        setError(authErrorMessage(result.error, 'sign-in'));
        return;
      }
      if (codeFactor === 'first') {
        await continueAfterFirstFactor();
        return;
      }
      if (signInRef.current.status === 'complete') await finalize();
      else onNativeFallback();
    });

  const resendCode = () =>
    void perform(async () => {
      await sendEmailCode(codeFactor);
    });

  const switchToEmailCode = () =>
    void perform(async () => {
      if (
        !signInRef.current.supportedFirstFactors.some((factor) => factor.strategy === 'email_code')
      )
        return;
      await sendEmailCode('first');
    });

  const startProvider = (provider: AuthProviderId) =>
    void perform(async () => {
      setPendingProvider(provider);
      const result = await withMobileSsoCallback((redirectUrl) =>
        startSSOFlow({
          strategy: `oauth_${provider}`,
          redirectUrl,
        }),
      );
      await settleSSOResult(result, provider);
    });

  const startApple = () =>
    void perform(async () => {
      if (!appleAvailable) return;
      setPendingProvider('apple');
      const before = { signIn: clerk.client?.signIn?.id, signUp: clerk.client?.signUp?.id };
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
        await rememberSignedIn('apple');
        return;
      }
      const outcome = appleFlowWithoutSession(result, before);
      if (outcome === 'not_loaded') setError('Sign-in is still loading. Please try again.');
      else if (outcome === 'incomplete') onNativeFallback();
    });

  const continueAs = (account: RememberedAccount) => {
    if (account.method === REMEMBERED_EMAIL_METHOD) {
      setEmail(account.email);
      signInWithEmail(account.email, true);
    } else if (account.method === 'apple') startApple();
    else startProvider(account.method);
  };

  const forgetAccount = () => {
    if (remembered && email.trim().toLowerCase() === remembered.email.toLowerCase()) setEmail('');
    setRemembered(null);
    void forgetRememberedAccount();
  };

  const changeEmail = () =>
    void perform(async () => {
      const result = await signInRef.current.reset();
      if (result.error) {
        setError(authErrorMessage(result.error, 'sign-in'));
        return;
      }
      setPassword('');
      setCode('');
      setCodeFactor('first');
      setCodeRecipient('');
      setCodeDeliveryFailed(false);
      setStep('email');
    });

  const emailReveal = useAuthEmailFieldReveal();

  const button = (label: string, onPress: () => void, disabled: boolean, testID: string) => (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={{
        minHeight: 52,
        borderRadius: radii.xl,
        backgroundColor: colors.textPrimary,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 28,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {busy ? (
        <LoadingIndicator />
      ) : (
        <Text style={{ color: colors.surfaceBase, fontSize: typeScale.callout, fontWeight: '600' }}>
          {label}
        </Text>
      )}
    </Pressable>
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={keyboardAvoidingBehavior('screen')}
      testID="mobile-custom-sign-in"
    >
      <ScrollView
        ref={emailReveal.scrollRef}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'flex-start',
          paddingHorizontal: 24,
          paddingTop: 28,
          paddingBottom: 32,
        }}
        {...emailReveal.scrollProps}
      >
        <View style={{ width: '100%', maxWidth: 392, alignSelf: 'center' }}>
          <Text
            accessibilityRole="header"
            style={{
              color: colors.textPrimary,
              fontSize: typeScale.largeTitle,
              fontWeight: '700',
              textAlign: 'left',
              marginBottom: 24,
            }}
          >
            {step === 'email'
              ? addingAccount
                ? 'Add an account'
                : 'Log in or sign up'
              : step === 'password'
                ? 'Enter your password'
                : 'Check your email'}
          </Text>
          {step === 'email' ? (
            <>
              <View style={{ gap: 12 }}>
                {providers.map((provider) =>
                  provider.id === 'apple' ? (
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
                        cornerRadius={radii.xl}
                        style={{ height: 52, width: '100%' }}
                        onPress={startApple}
                      />
                    </View>
                  ) : (
                    <Pressable
                      key={provider.id}
                      testID={`mobile-sign-in-${provider.id}`}
                      accessibilityRole="button"
                      disabled={busy}
                      onPress={() => startProvider(provider.id)}
                      style={{
                        minHeight: 52,
                        borderRadius: radii.xl,
                        borderWidth: 1,
                        borderColor: colors.border,
                        backgroundColor: colors.surfaceElevated,
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
                {continueAsAccount ? (
                  <Pressable
                    testID="mobile-sign-in-continue-as"
                    accessibilityRole="button"
                    accessibilityLabel={`Continue as ${continueAsAccount.email}`}
                    disabled={busy}
                    onPress={() => continueAs(continueAsAccount)}
                    style={{
                      minHeight: 52,
                      borderRadius: radii.xl,
                      borderWidth: 1,
                      borderColor: colors.border,
                      alignItems: 'center',
                      justifyContent: 'center',
                      paddingHorizontal: 20,
                      paddingVertical: 8,
                      opacity: busy ? 0.5 : 1,
                    }}
                  >
                    <Text
                      style={{
                        color: colors.textPrimary,
                        fontSize: typeScale.callout,
                        fontWeight: '500',
                        textAlign: 'center',
                      }}
                    >
                      {`Continue as ${continueAsAccount.email}`}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
              {continueAsAccount ? (
                <Pressable
                  testID="mobile-sign-in-not-you"
                  accessibilityRole="button"
                  accessibilityLabel={`Not you? Forget ${continueAsAccount.email} on this device`}
                  disabled={busy}
                  onPress={forgetAccount}
                  style={{
                    minHeight: 44,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginTop: 4,
                  }}
                >
                  <Text style={{ color: colors.textSecondary, fontSize: typeScale.subhead }}>
                    Not you?
                  </Text>
                </Pressable>
              ) : null}
              {hasVisibleProvider || continueAsAccount ? (
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
                    or
                  </Text>
                  <View style={{ height: 1, flex: 1, backgroundColor: colors.border }} />
                </View>
              ) : null}
              <View {...emailReveal.blockProps}>
                <Text
                  style={{
                    color: colors.textPrimary,
                    fontSize: typeScale.subhead,
                    fontWeight: '600',
                    textAlign: 'left',
                    marginBottom: 8,
                  }}
                >
                  Email address
                </Text>
                <TextInput
                  {...emailReveal.inputProps}
                  placeholder="name@example.com"
                  placeholderTextColor={colors.textMuted}
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
                    borderRadius: radii.xl,
                    borderWidth: 1,
                    borderColor: colors.border,
                    color: colors.textPrimary,
                    backgroundColor: colors.surfaceElevated,
                    fontSize: typeScale.callout,
                    textAlign: 'left',
                    paddingHorizontal: 16,
                  }}
                />
                {button('Continue', startEmail, busy || !email.trim(), 'mobile-sign-in-continue')}
              </View>
            </>
          ) : (
            <>
              <Text style={{ color: colors.textSecondary, textAlign: 'center', marginBottom: 24 }}>
                {step === 'password'
                  ? admittedEmail
                  : codeDeliveryFailed
                    ? `We couldn't send a code to ${codeRecipient || admittedEmail}. Try sending it again.`
                    : `Enter the code sent to ${codeRecipient || admittedEmail}.`}
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
                    borderRadius: radii.xl,
                    borderWidth: 1,
                    borderColor: colors.border,
                    color: colors.textPrimary,
                    backgroundColor: colors.surfaceElevated,
                    fontSize: typeScale.callout,
                    textAlign: 'left',
                    paddingHorizontal: 16,
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
          {error === ACCOUNT_SUSPENDED_MESSAGE ? (
            <Pressable
              testID="mobile-sign-in-appeal"
              accessibilityRole="button"
              accessibilityLabel="Appeal this suspension"
              onPress={() => void openUntrustedUrlInAppBrowser(suspensionAppealUrl())}
              style={{
                minHeight: 44,
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: 6,
              }}
            >
              <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>
                Appeal this suspension
              </Text>
            </Pressable>
          ) : null}
          {accountMissing && step === 'email' ? (
            <Pressable
              testID="mobile-sign-in-account-missing-sign-up"
              accessibilityRole="button"
              disabled={busy}
              onPress={() => onSignUp()}
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
            <View style={{ gap: 8, marginTop: 20 }}>
              <Text style={{ color: colors.textSecondary, fontSize: typeScale.footnote }}>
                By continuing, you agree to the Terms of Use and acknowledge the Privacy Policy.
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: typeScale.footnote }}>
                {FREE_PLAN_TRAINING_SIGNUP_NOTICE}
              </Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
