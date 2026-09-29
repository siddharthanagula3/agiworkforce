import { useState } from 'react';
import { Platform, View } from 'react-native';
import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerChangeEvent,
} from '@react-native-community/datetimepicker';
import { CalendarDays, Clock } from 'lucide-react-native';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';

type ScheduleFieldMode = 'date' | 'time';

interface ScheduleDateTimeFieldProps {
  mode: ScheduleFieldMode;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

function pad(value: number): string {
  return value.toString().padStart(2, '0');
}

function toPickerDate(mode: ScheduleFieldMode, value: string): Date {
  const now = new Date();
  if (mode === 'date') {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    return match
      ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12)
      : new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  }
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  const date = new Date(now);
  date.setHours(match ? Number(match[1]) : 9, match ? Number(match[2]) : 0, 0, 0);
  return date;
}

function fromPickerDate(mode: ScheduleFieldMode, date: Date): string {
  return mode === 'date'
    ? `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    : `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function displayValue(mode: ScheduleFieldMode, value: string): string | null {
  if (!value) return null;
  const date = toPickerDate(mode, value);
  return mode === 'date'
    ? date.toLocaleDateString(undefined, {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function ScheduleDateTimeField({
  mode,
  label,
  value,
  onChange,
  error,
}: ScheduleDateTimeFieldProps) {
  const colors = useThemeColors();
  const [iosOpen, setIosOpen] = useState(false);
  const pickerValue = toPickerDate(mode, value);
  const shown = displayValue(mode, value);
  const Icon = mode === 'date' ? CalendarDays : Clock;

  const handleValueChange = (_event: DateTimePickerChangeEvent, date: Date) => {
    onChange(fromPickerDate(mode, date));
  };

  const open = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: pickerValue,
        mode,
        ...(mode === 'date' ? { minimumDate: new Date() } : {}),
        onValueChange: handleValueChange,
      });
      return;
    }
    setIosOpen((current) => !current);
  };

  return (
    <View>
      <Text className="text-sm text-white/70 mb-2">{label}</Text>
      <Pressable
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${shown ?? 'not set'}`}
        accessibilityHint={mode === 'date' ? 'Opens a date picker' : 'Opens a time picker'}
        accessibilityState={{ expanded: Platform.OS === 'ios' ? iosOpen : undefined }}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          minHeight: 44,
          paddingHorizontal: 12,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: error ? colors.agentError : colors.border,
          backgroundColor: colors.surfaceElevated,
        }}
      >
        <Icon size={16} color={colors.textMuted} />
        <Text
          style={{ color: shown ? colors.textPrimary : colors.textMuted, fontSize: typeScale.body }}
        >
          {shown ?? (mode === 'date' ? 'Choose a date' : 'Choose a time')}
        </Text>
      </Pressable>
      {Platform.OS === 'ios' && iosOpen ? (
        <DateTimePicker
          value={pickerValue}
          mode={mode}
          display={mode === 'date' ? 'inline' : 'spinner'}
          {...(mode === 'date' ? { minimumDate: new Date() } : {})}
          onValueChange={handleValueChange}
        />
      ) : null}
      {error ? <Text className="text-xs text-red-400 mt-1">{error}</Text> : null}
    </View>
  );
}
