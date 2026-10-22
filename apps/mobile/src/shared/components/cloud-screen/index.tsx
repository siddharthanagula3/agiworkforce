import { useCallback, useState, type ReactNode } from 'react';
import { Alert, TextInput, View, type LayoutChangeEvent, type TextInputProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Cloud, RefreshCw, type LucideIcon } from 'lucide-react-native';

import { Button } from '@/components/ui/button';
import { PressableBox } from '@/components/ui/pressable-box';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';

const HEADER_SLOT_MIN_WIDTH = 44;

export function ScreenHeader({
  title,
  onBack,
  trailing,
}: {
  title: string;
  onBack: () => void;
  trailing?: ReactNode;
}) {
  const colors = useThemeColors();
  const [slotWidth, setSlotWidth] = useState(HEADER_SLOT_MIN_WIDTH);
  const growSlots = useCallback((event: LayoutChangeEvent) => {
    const measured = Math.ceil(event.nativeEvent.layout.width);
    setSlotWidth((current) => Math.max(current, measured));
  }, []);
  return (
    <View
      style={{
        minHeight: 52,
        paddingHorizontal: 8,
        flexDirection: 'row',
        alignItems: 'center',
      }}
    >
      <View style={{ minWidth: slotWidth, alignItems: 'flex-start' }} onLayout={growSlots}>
        <PressableBox
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={8}
          style={{
            width: HEADER_SLOT_MIN_WIDTH,
            height: HEADER_SLOT_MIN_WIDTH,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ArrowLeft size={21} color={colors.textPrimary} />
        </PressableBox>
      </View>
      <Text
        accessibilityRole="header"
        numberOfLines={1}
        style={{
          flex: 1,
          color: colors.textPrimary,
          fontSize: typeScale.headline,
          fontWeight: '600',
          textAlign: 'center',
        }}
      >
        {title}
      </Text>
      <View style={{ minWidth: slotWidth, alignItems: 'flex-end' }} onLayout={growSlots}>
        {trailing}
      </View>
    </View>
  );
}

export function CloudFeatureGate({
  title,
  feature,
  description,
  signedIn,
  onBack,
  onContinue,
}: {
  title: string;
  feature: string;
  description: string;
  signedIn: boolean;
  onBack: () => void;
  onContinue: () => void;
}) {
  const colors = useThemeColors();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceBase }}>
      <ScreenHeader title={title} onBack={onBack} />
      <View
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}
      >
        <View
          style={{
            width: 68,
            height: 68,
            borderRadius: 22,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.accentSurface,
          }}
        >
          <Cloud size={30} color={colors.textPrimary} />
        </View>
        <Text
          style={{
            marginTop: 20,
            color: colors.textPrimary,
            fontSize: typeScale.title3,
            fontWeight: '700',
            textAlign: 'center',
          }}
        >
          {`${feature} are available in AGI Cloud`}
        </Text>
        <Text
          style={{
            marginTop: 9,
            color: colors.textSecondary,
            fontSize: typeScale.subhead,
            lineHeight: 21,
            textAlign: 'center',
          }}
        >
          {description}
        </Text>
        <Button
          title={signedIn ? 'Switch to AGI Cloud' : 'Sign in to AGI Cloud'}
          onPress={onContinue}
          size="lg"
          accessibilityHint="Opens AGI Cloud without sending Local Mode data"
          style={{ marginTop: 24, minWidth: 210 }}
        />
      </View>
    </SafeAreaView>
  );
}

export function SectionCard({
  title,
  description,
  children,
  testID,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  testID?: string;
}) {
  const colors = useThemeColors();
  return (
    <View
      testID={testID}
      style={{
        borderRadius: 16,
        borderCurve: 'continuous',
        padding: 15,
        gap: 10,
        backgroundColor: colors.surfaceElevated,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      {title ? (
        <Text
          accessibilityRole="header"
          style={{ color: colors.textPrimary, fontSize: typeScale.subhead, fontWeight: '700' }}
        >
          {title}
        </Text>
      ) : null}
      {description ? (
        <Text style={{ color: colors.textSecondary, fontSize: typeScale.footnote, lineHeight: 19 }}>
          {description}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

export function TextField({
  label,
  hint,
  multiline,
  minHeight,
  ...props
}: TextInputProps & { label: string; hint?: string; minHeight?: number }) {
  const colors = useThemeColors();
  return (
    <View style={{ gap: 6 }}>
      <Text
        style={{ color: colors.textSecondary, fontSize: typeScale.footnote, fontWeight: '600' }}
      >
        {label}
      </Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.textMuted}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        {...props}
        style={{
          minHeight: minHeight ?? (multiline ? 120 : 44),
          borderRadius: 12,
          paddingHorizontal: 12,
          paddingVertical: multiline ? 10 : 0,
          backgroundColor: colors.inputSurface,
          borderWidth: 1,
          borderColor: colors.border,
          color: colors.textPrimary,
          fontSize: typeScale.body,
        }}
      />
      {hint ? (
        <Text style={{ color: colors.textMuted, fontSize: typeScale.caption, lineHeight: 17 }}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

export function ToggleRow({
  label,
  description,
  value,
  onValueChange,
  disabled,
}: {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  const colors = useThemeColors();
  return (
    <View style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: colors.textPrimary, fontSize: typeScale.body }}>{label}</Text>
        {description ? (
          <Text style={{ color: colors.textMuted, fontSize: typeScale.caption, lineHeight: 17 }}>
            {description}
          </Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        accessibilityLabel={label}
      />
    </View>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  accessibilityLabel,
  Icon,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
  Icon?: LucideIcon;
}) {
  const colors = useThemeColors();
  const content = (
    <>
      {Icon ? <Icon size={14} color={colors.textSecondary} /> : null}
      <Text
        style={{
          color: selected ? colors.textPrimary : colors.textSecondary,
          fontSize: typeScale.footnote,
          fontWeight: selected ? '700' : '500',
        }}
      >
        {label}
      </Text>
    </>
  );
  const style = {
    minHeight: 36,
    borderRadius: 999,
    paddingHorizontal: 12,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    borderWidth: 1,
    borderColor: selected ? colors.accentBorder : colors.border,
    backgroundColor: selected ? colors.accentSurface : 'transparent',
  };
  if (!onPress) return <View style={style}>{content}</View>;
  return (
    <PressableBox
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: Boolean(selected) }}
      hitSlop={4}
      style={style}
    >
      {content}
    </PressableBox>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const colors = useThemeColors();
  return (
    <View
      accessibilityRole="alert"
      style={{
        borderRadius: 14,
        borderCurve: 'continuous',
        padding: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: colors.dangerSurface,
        borderWidth: 1,
        borderColor: colors.dangerBorder,
      }}
    >
      <Text
        selectable
        style={{ flex: 1, color: colors.agentError, fontSize: typeScale.caption, lineHeight: 18 }}
      >
        {message}
      </Text>
      {onRetry ? (
        <PressableBox
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel="Try again"
          hitSlop={8}
          style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 6 }}
        >
          <Text
            style={{ color: colors.agentError, fontSize: typeScale.caption, fontWeight: '700' }}
          >
            Retry
          </Text>
        </PressableBox>
      ) : null}
    </View>
  );
}

export function LoadingRows({ count = 3 }: { count?: number }) {
  return (
    <View accessibilityLabel="Loading" style={{ paddingHorizontal: 16, paddingTop: 12, gap: 12 }}>
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} width="100%" height={88} borderRadius={16} />
      ))}
    </View>
  );
}

export function EmptyState({
  title,
  body,
  Icon,
  action,
}: {
  title: string;
  body: string;
  Icon?: LucideIcon;
  action?: ReactNode;
}) {
  const colors = useThemeColors();
  const Glyph = Icon ?? RefreshCw;
  return (
    <View
      style={{
        flex: 1,
        minHeight: 300,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 28,
      }}
    >
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 22,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.neutralSurface,
        }}
      >
        <Glyph size={27} color={colors.textMuted} />
      </View>
      <Text
        style={{
          marginTop: 18,
          color: colors.textPrimary,
          fontSize: typeScale.headline,
          fontWeight: '700',
          textAlign: 'center',
        }}
      >
        {title}
      </Text>
      <Text
        style={{
          marginTop: 8,
          color: colors.textSecondary,
          fontSize: typeScale.subhead,
          lineHeight: 21,
          textAlign: 'center',
        }}
      >
        {body}
      </Text>
      {action ? <View style={{ marginTop: 20 }}>{action}</View> : null}
    </View>
  );
}

export function MetaText({ children }: { children: ReactNode }) {
  const colors = useThemeColors();
  return (
    <Text style={{ color: colors.textMuted, fontSize: typeScale.caption, lineHeight: 17 }}>
      {children}
    </Text>
  );
}

export function confirmIrreversible({
  title,
  consequence,
  actionLabel,
}: {
  title: string;
  consequence: string;
  actionLabel: string;
}): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      title,
      consequence,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: actionLabel, style: 'destructive', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
