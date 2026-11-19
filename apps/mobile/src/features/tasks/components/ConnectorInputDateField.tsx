import { useState } from 'react';
import { Platform, View } from 'react-native';
import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerChangeEvent,
} from '@react-native-community/datetimepicker';
import { CalendarDays } from 'lucide-react-native';
import { PressableBox } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { useThemeColors } from '@/src/ui/theme';
import { radii, spacing, typeScale } from '@/src/ui/theme/tokens';

export type ConnectorDateFormat = 'date' | 'date-time';

const DATE_VALUE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_TIME_VALUE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/;
const CHOOSE_DATE = 'Choose a date';
const CHOOSE_DATE_TIME = 'Choose a date and time';
const NOT_SET = 'not set';
const CLEAR_LABEL = 'Clear';

function pad(value: number): string {
  return value.toString().padStart(2, '0');
}

function parseValue(format: ConnectorDateFormat, value: string): Date | null {
  if (format === 'date') {
    const match = DATE_VALUE.exec(value);
    return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12) : null;
  }
  const match = DATE_TIME_VALUE.exec(value);
  return match
    ? new Date(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3]),
        Number(match[4]),
        Number(match[5]),
      )
    : null;
}

function startingDate(format: ConnectorDateFormat): Date {
  const now = new Date();
  return format === 'date'
    ? new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12)
    : new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes());
}

function connectorDateValue(format: ConnectorDateFormat, date: Date): string {
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return format === 'date' ? day : `${day}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function shownValue(format: ConnectorDateFormat, value: string): string | null {
  if (!value) return null;
  const date = parseValue(format, value);
  if (!date) return value;
  return format === 'date'
    ? date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    : date.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
}

export function ConnectorInputDateField({
  format,
  label,
  title,
  value,
  clearable,
  disabled,
  error,
  onChange,
}: {
  format: ConnectorDateFormat;
  label: string;
  title: string;
  value: string;
  clearable: boolean;
  disabled: boolean;
  error: string | null;
  onChange: (value: string) => void;
}) {
  const colors = useThemeColors();
  const [iosOpen, setIosOpen] = useState(false);
  const pickerValue = parseValue(format, value) ?? startingDate(format);
  const shown = shownValue(format, value);

  const pick = (_event: DateTimePickerChangeEvent, date: Date) => {
    onChange(connectorDateValue(format, date));
  };

  const open = () => {
    if (disabled) return;
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: pickerValue,
        mode: 'date',
        onValueChange: (event, date) => {
          if (format === 'date') {
            pick(event, date);
            return;
          }
          DateTimePickerAndroid.open({ value: date, mode: 'time', onValueChange: pick });
        },
      });
      return;
    }
    setIosOpen((current) => !current);
  };

  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={{ color: colors.textSecondary, fontSize: typeScale.footnote }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <PressableBox
          onPress={open}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={`${title}, ${shown ?? NOT_SET}`}
          accessibilityHint={
            format === 'date' ? 'Opens a date picker' : 'Opens a date and time picker'
          }
          accessibilityState={{
            disabled,
            ...(Platform.OS === 'ios' ? { expanded: iosOpen && !disabled } : {}),
          }}
          style={{
            flex: 1,
            minHeight: 44,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
            paddingHorizontal: spacing.md,
            borderRadius: radii.md,
            borderWidth: 1,
            borderColor: error ? colors.agentError : colors.border,
            backgroundColor: colors.surfaceElevated,
            opacity: disabled ? 0.5 : 1,
          }}
        >
          <CalendarDays size={16} color={colors.textMuted} />
          <Text
            style={{
              color: shown ? colors.textPrimary : colors.textMuted,
              fontSize: typeScale.subhead,
            }}
          >
            {shown ?? (format === 'date' ? CHOOSE_DATE : CHOOSE_DATE_TIME)}
          </Text>
        </PressableBox>
        {clearable && value && !disabled ? (
          <PressableBox
            onPress={() => onChange('')}
            accessibilityRole="button"
            accessibilityLabel={`${CLEAR_LABEL} ${title}`}
            style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: colors.textSecondary, fontSize: typeScale.footnote }}>
              {CLEAR_LABEL}
            </Text>
          </PressableBox>
        ) : null}
      </View>
      {Platform.OS === 'ios' && iosOpen && !disabled ? (
        <DateTimePicker
          testID="connector-input-date-picker"
          value={pickerValue}
          mode={format === 'date' ? 'date' : 'datetime'}
          display="inline"
          onValueChange={pick}
        />
      ) : null}
      {error ? (
        <Text style={{ color: colors.agentError, fontSize: typeScale.caption }}>{error}</Text>
      ) : null}
    </View>
  );
}
