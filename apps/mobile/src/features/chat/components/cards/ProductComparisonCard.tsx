import { Alert, View } from 'react-native';
import { PressableBox } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { Scale } from 'lucide-react-native';
import type {
  InteractiveCardSource,
  ProductComparisonCardBody,
  ProductComparisonPrice,
} from '@agiworkforce/types';
import { openUntrustedUrlInAppBrowser } from '@/lib/safeOpenURL';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { SideScroller } from '../SideScroller';

export const PRICE_NOT_FOUND = 'Price not found';
export const SPEC_NOT_LISTED = 'Not listed';

const TARGET = 44;
const SPEC_COLUMN_WIDTH = 132;

export function formatProductPrice(price: ProductComparisonPrice): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: price.currency }).format(
      price.amount,
    );
  } catch {
    return `${price.amount} ${price.currency}`;
  }
}

function formatCheckedAt(checkedAt: string): string | null {
  const date = new Date(checkedAt);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function openSource(url: string): void {
  void openUntrustedUrlInAppBrowser(url).then((opened) => {
    if (opened) return;
    Alert.alert('Could not open this link', 'Check your connection and try again.');
  });
}

function SourceLinks({ sources }: { sources: InteractiveCardSource[] }) {
  const colors = useThemeColors();
  if (sources.length === 0) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 12 }}>
      {sources.map((source, index) => (
        <PressableBox
          key={source.url}
          testID="product-comparison-source"
          accessibilityRole="link"
          accessibilityLabel={`Source ${index + 1}, ${source.title}`}
          onPress={() => openSource(source.url)}
          style={{ minHeight: TARGET, flexDirection: 'row', alignItems: 'center', gap: 4 }}
        >
          <Text
            variant="inline"
            style={{
              fontSize: typeScale.caption,
              fontVariant: ['tabular-nums'],
              color: colors.textMuted,
            }}
          >
            {index + 1}
          </Text>
          <Text
            variant="inline"
            numberOfLines={1}
            style={{
              fontSize: typeScale.caption,
              color: colors.textMuted,
              textDecorationLine: 'underline',
            }}
          >
            {hostnameOf(source.url)}
          </Text>
        </PressableBox>
      ))}
    </View>
  );
}

export function ProductComparisonCard({ body }: { body: ProductComparisonCardBody }) {
  const colors = useThemeColors();
  const checked = formatCheckedAt(body.checkedAt);
  return (
    <View
      testID="interactive-card-product-comparison"
      accessibilityLabel={body.title}
      style={{
        marginTop: 12,
        overflow: 'hidden',
        borderRadius: 16,
        borderCurve: 'continuous',
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surfaceElevated,
      }}
    >
      <View style={{ paddingHorizontal: 12, paddingTop: 12, paddingBottom: 8, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Scale size={16} color={colors.teal} />
          <Text
            variant="inline"
            accessibilityRole="header"
            selectable
            style={{
              flex: 1,
              fontSize: typeScale.body,
              fontWeight: '600',
              color: colors.textPrimary,
            }}
          >
            {body.title}
          </Text>
        </View>
        {checked ? (
          <Text variant="inline" style={{ fontSize: typeScale.caption, color: colors.textMuted }}>
            {`Prices checked ${checked}`}
          </Text>
        ) : null}
      </View>

      <View style={{ gap: 8, paddingHorizontal: 12, paddingBottom: 12 }}>
        {body.products.map((product) => (
          <View
            key={product.id}
            testID="product-comparison-product"
            style={{
              gap: 4,
              padding: 12,
              borderRadius: 12,
              borderCurve: 'continuous',
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text
              variant="inline"
              selectable
              style={{ fontSize: typeScale.subhead, fontWeight: '600', color: colors.textPrimary }}
            >
              {product.name}
            </Text>
            {product.bestFor ? (
              <Text
                variant="inline"
                style={{ fontSize: typeScale.caption, color: colors.textSecondary }}
              >
                {product.bestFor}
              </Text>
            ) : null}
            {product.price ? (
              <Text variant="inline" selectable style={{ color: colors.textPrimary }}>
                <Text
                  variant="inline"
                  style={{
                    fontSize: typeScale.callout,
                    fontWeight: '600',
                    fontVariant: ['tabular-nums'],
                  }}
                >
                  {formatProductPrice(product.price)}
                </Text>
                {product.merchant ? (
                  <Text
                    variant="inline"
                    style={{ fontSize: typeScale.caption, color: colors.textSecondary }}
                  >
                    {`  at ${product.merchant}`}
                  </Text>
                ) : null}
              </Text>
            ) : (
              <Text
                variant="inline"
                style={{ fontSize: typeScale.caption, color: colors.textSecondary }}
              >
                {PRICE_NOT_FOUND}
              </Text>
            )}
            <SourceLinks sources={product.sources} />
          </View>
        ))}
      </View>

      {body.specLabels.length > 0 ? (
        <SideScroller
          testID="product-comparison-specs"
          accessibilityLabel={`Specs for ${body.title}`}
          showsHorizontalScrollIndicator={false}
          style={{ borderTopWidth: 1, borderTopColor: colors.borderLight }}
        >
          <View>
            <View
              style={{
                flexDirection: 'row',
                borderBottomWidth: 1,
                borderBottomColor: colors.borderLight,
              }}
            >
              <Text
                variant="inline"
                style={{
                  width: SPEC_COLUMN_WIDTH,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  fontSize: typeScale.caption,
                  fontWeight: '500',
                  color: colors.textSecondary,
                }}
              >
                Spec
              </Text>
              {body.products.map((product) => (
                <Text
                  variant="inline"
                  key={product.id}
                  style={{
                    width: SPEC_COLUMN_WIDTH,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    fontSize: typeScale.caption,
                    fontWeight: '500',
                    color: colors.textPrimary,
                  }}
                >
                  {product.name}
                </Text>
              ))}
            </View>
            {body.specLabels.map((label, row) => (
              <View
                key={`${row}:${label}`}
                style={{
                  flexDirection: 'row',
                  borderBottomWidth: row === body.specLabels.length - 1 ? 0 : 1,
                  borderBottomColor: colors.borderLight,
                }}
              >
                <Text
                  variant="inline"
                  style={{
                    width: SPEC_COLUMN_WIDTH,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    fontSize: typeScale.caption,
                    fontWeight: '500',
                    color: colors.textSecondary,
                  }}
                >
                  {label}
                </Text>
                {body.products.map((product) => {
                  const value = product.specs[row];
                  return (
                    <Text
                      variant="inline"
                      key={product.id}
                      selectable
                      style={{
                        width: SPEC_COLUMN_WIDTH,
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        fontSize: typeScale.subhead,
                        color: value ? colors.textPrimary : colors.textSecondary,
                      }}
                    >
                      {value || SPEC_NOT_LISTED}
                    </Text>
                  );
                })}
              </View>
            ))}
          </View>
        </SideScroller>
      ) : null}
    </View>
  );
}
