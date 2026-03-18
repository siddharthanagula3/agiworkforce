import { useState } from 'react';
import { View, Alert } from 'react-native';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/authStore';

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const { signInWithEmail, signUpWithEmail, resetPassword, isLoading } = useAuthStore();

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Missing fields', 'Please enter both email and password.');
      return;
    }

    try {
      if (isSignUp) {
        await signUpWithEmail(email.trim(), password);
      } else {
        await signInWithEmail(email.trim(), password);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong';
      Alert.alert('Error', message);
    }
  };

  const handleResetPassword = async () => {
    if (!email.trim()) {
      Alert.alert('Missing email', 'Please enter your email address.');
      return;
    }
    try {
      await resetPassword(email.trim());
      Alert.alert('Check Your Email', 'We sent a password reset link to your email.');
      setIsForgotPassword(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send reset link';
      Alert.alert('Error', message);
    }
  };

  if (isForgotPassword) {
    return (
      <View className="gap-4">
        <Input
          label="Email"
          placeholder="you@example.com"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
        />
        <Button
          title="Send Reset Link"
          onPress={handleResetPassword}
          loading={isLoading}
          className="mt-2"
        />
        <Button
          title="Back to Sign In"
          variant="ghost"
          onPress={() => setIsForgotPassword(false)}
        />
      </View>
    );
  }

  return (
    <View className="gap-4">
      <Input
        label="Email"
        placeholder="you@example.com"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
      />

      <Input
        label="Password"
        placeholder="Enter your password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete={isSignUp ? 'new-password' : 'current-password'}
        textContentType={isSignUp ? 'newPassword' : 'password'}
      />

      <Button
        title={isSignUp ? 'Create Account' : 'Sign In'}
        onPress={handleSubmit}
        loading={isLoading}
        className="mt-2"
      />

      {!isSignUp && (
        <Button
          title="Forgot Password?"
          variant="ghost"
          onPress={() => setIsForgotPassword(true)}
        />
      )}

      <Button
        title={isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
        variant="ghost"
        onPress={() => setIsSignUp(!isSignUp)}
      />
    </View>
  );
}
