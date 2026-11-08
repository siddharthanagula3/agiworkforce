import { StyleSheet, View, type ViewProps } from 'react-native';
import { useTranslation } from 'react-i18next';
import { loadingMarkSizes } from '@/src/ui/theme/tokens';
import { AgiMark } from './AgiMark';

interface LoadingIndicatorProps extends ViewProps {
  size?: keyof typeof loadingMarkSizes | number;
}

export function LoadingIndicator({
  size = 'small',
  style,
  accessible = true,
  accessibilityRole = 'progressbar',
  accessibilityLabel,
  accessibilityState,
  ...props
}: LoadingIndicatorProps) {
  const { t } = useTranslation('common', { useSuspense: false });
  const pixels = typeof size === 'number' ? size : loadingMarkSizes[size];
  return (
    <View
      {...props}
      accessible={accessible}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel ?? t('loading')}
      accessibilityState={{ ...accessibilityState, busy: true }}
      style={[styles.container, style]}
    >
      <AgiMark size={pixels} spinning />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center' },
});
