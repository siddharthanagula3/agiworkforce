import { useState } from 'react';
import { ScrollView, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ACCOUNT_AGE_REQUIREMENT_NOTICE,
  ACCOUNT_MINIMUM_AGE,
  accountAgeRefusalMessage,
  evaluateAccountAge,
} from '@agiworkforce/types';
import { PressableBox as Pressable } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { AgeRefused } from '@/src/features/auth/components/AgeRefused';
import { useAdultEligibilityStore } from '@/src/features/auth/store/adultEligibilityStore';

type AccountAgeCheckProps = {
  userId: string;
  onContinueLocal: () => void;
  onSignOut: () => void;
};

export function AccountAgeCheck({ userId, onContinueLocal, onSignOut }: AccountAgeCheckProps) {
  const colors = useThemeColors();
  const status = useAdultEligibilityStore((state) => state.status);
  const storeError = useAdultEligibilityStore((state) => state.error);
  const [ageText, setAgeText] = useState('');
  const [entryError, setEntryError] = useState<string | null>(null);

  if (status === 'ineligible') {
    return (
      <AgeRefused
        scope="account"
        threshold={ACCOUNT_MINIMUM_AGE}
        signedIn
        onSignOut={onSignOut}
        onContinueLocal={onContinueLocal}
      />
    );
  }

  const asking = status === 'age_required';
  const message = entryError ?? storeError;

  const submit = () => {
    const verdict = evaluateAccountAge(ageText);
    if (verdict === 'missing' || verdict === 'invalid') {
      setEntryError(accountAgeRefusalMessage(verdict));
      return;
    }
    setEntryError(null);
    const age = Number(ageText.trim());
    setAgeText('');
    void useAdultEligibilityStore.getState().submitAge(userId, age);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceBase }}>
      <ScrollView
        testID="mobile-age-check"
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 24, gap: 18, flexGrow: 1 }}
      >
        <Text style={{ color: colors.textPrimary, fontSize: typeScale.title2, fontWeight: '700' }}>
          {asking ? 'Your age' : 'AGI Cloud sign-in could not finish'}
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: typeScale.subhead, lineHeight: 21 }}>
          {asking ? ACCOUNT_AGE_REQUIREMENT_NOTICE : storeError}
        </Text>
        {asking ? (
          <>
            <TextInput
              testID="mobile-age-check-input"
              value={ageText}
              onChangeText={(text) => {
                setAgeText(text.replace(/[^0-9]/g, ''));
                setEntryError(null);
              }}
              keyboardType="number-pad"
              maxLength={3}
              placeholder="Enter your age"
              placeholderTextColor={colors.textMuted}
              returnKeyType="done"
              onSubmitEditing={submit}
              accessibilityLabel="Enter your age in years"
              style={{
                minHeight: 52,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: message ? colors.agentError : colors.border,
                paddingHorizontal: 16,
                color: colors.textPrimary,
                fontSize: typeScale.title3,
              }}
            />
            {message ? (
              <Text
                testID="mobile-age-check-error"
                accessibilityRole="alert"
                style={{ color: colors.agentError, fontSize: typeScale.footnote }}
              >
                {message}
              </Text>
            ) : null}
            <Pressable
              testID="mobile-age-check-continue"
              accessibilityRole="button"
              accessibilityState={{ disabled: ageText.length === 0 }}
              disabled={ageText.length === 0}
              onPress={submit}
              style={{
                minHeight: 48,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 12,
                backgroundColor: colors.teal,
                opacity: ageText.length === 0 ? 0.5 : 1,
              }}
            >
              <Text style={{ color: colors.surfaceBase, fontWeight: '700' }}>Continue</Text>
            </Pressable>
          </>
        ) : (
          <Pressable
            testID="mobile-age-check-retry"
            accessibilityRole="button"
            onPress={() => void useAdultEligibilityStore.getState().verify(userId)}
          >
            <Text style={{ color: colors.teal, fontWeight: '700' }}>Retry</Text>
          </Pressable>
        )}
        <Pressable accessibilityRole="button" onPress={onContinueLocal}>
          <Text style={{ color: colors.textSecondary }}>Continue in Local Mode</Text>
        </Pressable>
        <Pressable
          testID="mobile-age-check-sign-out"
          accessibilityRole="button"
          onPress={onSignOut}
          style={{ minHeight: 44, justifyContent: 'center' }}
        >
          <Text style={{ color: colors.textSecondary }}>Log out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
