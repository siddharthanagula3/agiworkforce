import { useState, useRef } from 'react';
import { View, Alert, type TextInput as RNTextInput } from 'react-native';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/src/features/auth/store';

const MIN_PASSWORD_LENGTH = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface FieldErrors {
  email?: string;
  password?: string;
}

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const { signInWithEmail, signUpWithEmail, resetPassword, isLoading } = useAuthStore();
  const passwordRef = useRef<RNTextInput>(null);

  const clearFieldError = (field: keyof FieldErrors) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const validateSubmit = (): boolean => {
    const errors: FieldErrors = {};
    const normalizedEmail = email.trim();

    if (!normalizedEmail) {
      errors.email = 'Email is required.';
    } else if (!EMAIL_RE.test(normalizedEmail)) {
      errors.email = 'Enter a valid email address.';
    }

    if (!isForgotPassword) {
      if (!password) {
        errors.password = 'Password is required.';
      } else if (isSignUp && password.length < MIN_PASSWORD_LENGTH) {
        errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
      }
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateSubmit()) return;
    const normalizedEmail = email.trim();
    try {
      if (isSignUp) {
        await signUpWithEmail(normalizedEmail, password);
      } else {
        await signInWithEmail(normalizedEmail, password);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong';
      // Unexpected errors (network, server) surface via Alert; field errors are inline.
      Alert.alert('Sign-in error', message);
    }
  };

  const handleResetPassword = async () => {
    const errors: FieldErrors = {};
    if (!email.trim()) {
      errors.email = 'Enter your email address.';
      setFieldErrors(errors);
      return;
    }
    if (!EMAIL_RE.test(email.trim())) {
      errors.email = 'Enter a valid email address.';
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    try {
      await resetPassword(email.trim());
      Alert.alert('Check your inbox', 'We sent a password reset link to your email.');
      setIsForgotPassword(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send reset link';
      Alert.alert('Reset failed', message);
    }
  };

  if (isForgotPassword) {
    return (
      <View style={{ gap: 16 }}>
        <Input
          label="Email"
          placeholder="you@example.com"
          value={email}
          onChangeText={(t: string) => {
            setEmail(t);
            clearFieldError('email');
          }}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          returnKeyType="send"
          onSubmitEditing={handleResetPassword}
          error={fieldErrors.email}
          accessibilityLabel="Email"
          accessibilityHint="Enter the email address for your account"
        />
        <Button
          title={isLoading ? 'Sending…' : 'Send reset link'}
          onPress={handleResetPassword}
          loading={isLoading}
          disabled={isLoading}
          size="lg"
          accessibilityLabel={isLoading ? 'Sending reset link' : 'Send reset link'}
          accessibilityState={{ busy: isLoading }}
        />
        <Button
          title="Back to sign in"
          variant="ghost"
          onPress={() => {
            setIsForgotPassword(false);
            setFieldErrors({});
          }}
          accessibilityLabel="Back to sign in"
        />
      </View>
    );
  }

  return (
    <View style={{ gap: 16 }}>
      <Input
        label="Email"
        placeholder="you@example.com"
        value={email}
        onChangeText={(t: string) => {
          setEmail(t);
          clearFieldError('email');
        }}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
        error={fieldErrors.email}
        accessibilityLabel="Email"
      />

      <Input
        ref={passwordRef}
        label="Password"
        placeholder={isSignUp ? 'Create a password' : 'Enter your password'}
        value={password}
        onChangeText={(t: string) => {
          setPassword(t);
          clearFieldError('password');
        }}
        secureTextEntry
        autoComplete={isSignUp ? 'new-password' : 'current-password'}
        textContentType={isSignUp ? 'newPassword' : 'password'}
        returnKeyType="go"
        onSubmitEditing={handleSubmit}
        error={fieldErrors.password}
        accessibilityLabel="Password"
      />

      <Button
        title={
          isLoading
            ? isSignUp
              ? 'Creating account…'
              : 'Signing in…'
            : isSignUp
              ? 'Create account'
              : 'Sign in'
        }
        onPress={handleSubmit}
        loading={isLoading}
        disabled={isLoading}
        size="lg"
        accessibilityLabel={isSignUp ? 'Create account' : 'Sign in'}
        accessibilityState={{ busy: isLoading }}
      />

      {!isSignUp && (
        <Button
          title="Forgot password?"
          variant="ghost"
          onPress={() => {
            setIsForgotPassword(true);
            setFieldErrors({});
          }}
          accessibilityLabel="Forgot password"
        />
      )}

      <Button
        title={isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
        variant="ghost"
        onPress={() => {
          setIsSignUp(!isSignUp);
          setFieldErrors({});
          setPassword('');
        }}
        accessibilityLabel={isSignUp ? 'Switch to sign in' : 'Switch to sign up'}
      />
    </View>
  );
}
