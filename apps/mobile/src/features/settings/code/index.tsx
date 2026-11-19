import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Check,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Code,
  Diff,
  Gauge,
  Globe,
  Keyboard,
  MonitorSmartphone,
  Type,
  WrapText,
  type LucideIcon,
} from 'lucide-react-native';
import { PressableBox as Pressable } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import {
  CLOUD_CODE_DEFAULT_SESSION_VIEW,
  CLOUD_CODE_SCREEN_TITLE,
  cloudCodeViewStatusFilter,
} from '@/src/features/cloud-code/presentation';
import {
  NETWORK_ACCESS_OPTIONS,
  networkAccessLabel,
} from '@/src/features/cloud-code/networkAccessOptions';
import { useCloudCodeAccess } from '@/src/features/cloud-code/useCloudCodeAccess';
import { useCloudCodeSessions } from '@/src/features/cloud-code/useCloudCodeSessions';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { FEATURES } from '@/lib/v1FeatureFlags';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { isShownInMode } from '@/src/features/shell/destinationScope';
import {
  SettingsGroup,
  SettingsRow,
  SettingsScreenShell,
  SettingsSwitchRow,
} from '@/src/features/settings/Common';
import { CloudAgentStatusRow } from './CloudAgentStatus';
import { GitHubConnections } from './GitHubConnections';
import {
  TRANSCRIPT_FONT_IDS,
  TRANSCRIPT_FONT_LABELS,
  codeFontOption,
  codeFontOptions,
  resolveTranscriptFontFamily,
} from './codeAppearance';
import { useCodePreferences } from './store';

const REMOTE_CONTROL_SETTINGS_ROUTE = '/(app)/settings/remote-control';

function GroupHeading({ children }: { children: string }) {
  const colors = useThemeColors();
  return (
    <Text
      accessibilityRole="header"
      style={{
        color: colors.textMuted,
        fontSize: typeScale.footnote,
        fontWeight: '600',
        marginBottom: 8,
        paddingHorizontal: 2,
      }}
    >
      {children}
    </Text>
  );
}

interface FontChoice {
  id: string;
  label: string;
  family: string | undefined;
}

function FontChoiceRow({
  testID,
  label,
  icon: Icon,
  choices,
  value,
  onSelect,
  isLast,
}: {
  testID: string;
  label: string;
  icon: LucideIcon;
  choices: readonly FontChoice[];
  value: string;
  onSelect: (id: string) => void;
  isLast?: boolean;
}) {
  const colors = useThemeColors();
  const [open, setOpen] = useState(false);
  const current = choices.find((choice) => choice.id === value) ?? choices[0];

  return (
    <View>
      <Pressable
        onPress={() => setOpen((expanded) => !expanded)}
        accessibilityRole="button"
        accessibilityLabel={`${label}. ${current?.label ?? ''}`}
        accessibilityState={{ expanded: open }}
        testID={testID}
        style={{
          minHeight: 52,
          paddingHorizontal: 14,
          paddingVertical: 8,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          borderBottomWidth: isLast && !open ? 0 : 1,
          borderBottomColor: colors.border,
        }}
      >
        <Icon size={19} color={colors.textSecondary} />
        <Text
          numberOfLines={2}
          style={{ flex: 1, color: colors.textPrimary, fontSize: typeScale.body }}
        >
          {label}
        </Text>
        <Text
          numberOfLines={2}
          style={{
            color: colors.textMuted,
            fontSize: typeScale.footnote,
            maxWidth: 150,
            textAlign: 'right',
            ...(current?.family ? { fontFamily: current.family } : {}),
          }}
        >
          {current?.label}
        </Text>
        <ChevronsUpDown size={17} color={colors.textMuted} />
      </Pressable>
      {open ? (
        <View accessibilityRole="radiogroup">
          {choices.map((choice, index) => (
            <Pressable
              key={choice.id}
              onPress={() => {
                onSelect(choice.id);
                setOpen(false);
              }}
              accessibilityRole="radio"
              accessibilityState={{ checked: value === choice.id }}
              accessibilityLabel={choice.label}
              testID={`${testID}-${choice.id}`}
              style={{
                minHeight: 48,
                paddingHorizontal: 14,
                paddingVertical: 8,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                borderBottomWidth: isLast && index === choices.length - 1 ? 0 : 1,
                borderBottomColor: colors.border,
              }}
            >
              <Text
                style={{
                  flex: 1,
                  color: colors.textPrimary,
                  fontSize: typeScale.body,
                  ...(choice.family ? { fontFamily: choice.family } : {}),
                }}
              >
                {choice.label}
              </Text>
              {value === choice.id ? <Check size={18} color={colors.textPrimary} /> : null}
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function AppearanceSettings({ showTranscriptFont }: { showTranscriptFont: boolean }) {
  const codeFont = useCodePreferences((state) => state.codeFont);
  const setCodeFont = useCodePreferences((state) => state.setCodeFont);
  const transcriptFont = useCodePreferences((state) => state.transcriptFont);
  const setTranscriptFont = useCodePreferences((state) => state.setTranscriptFont);

  const codeChoices = codeFontOptions();
  const transcriptChoices = TRANSCRIPT_FONT_IDS.map((id) => ({
    id,
    label: TRANSCRIPT_FONT_LABELS[id],
    family: resolveTranscriptFontFamily(id, codeFont),
  }));

  return (
    <>
      <GroupHeading>Appearance</GroupHeading>
      <SettingsGroup>
        <FontChoiceRow
          testID="code-font"
          label="Code font"
          icon={Code}
          choices={codeChoices}
          value={codeFontOption(codeFont).id}
          onSelect={(id) => {
            const choice = codeChoices.find((option) => option.id === id);
            if (choice) setCodeFont(choice.id);
          }}
          isLast={!showTranscriptFont}
        />
        {showTranscriptFont ? (
          <FontChoiceRow
            testID="code-transcript-font"
            label="Transcript font"
            icon={Type}
            choices={transcriptChoices}
            value={transcriptFont}
            onSelect={(id) => {
              const choice = TRANSCRIPT_FONT_IDS.find((option) => option === id);
              if (choice) setTranscriptFont(choice);
            }}
            isLast
          />
        ) : null}
      </SettingsGroup>
    </>
  );
}

function NetworkAccessSetting() {
  const colors = useThemeColors();
  const [open, setOpen] = useState(false);
  const value = useCodePreferences((state) => state.defaultNetworkAccess);
  const setValue = useCodePreferences((state) => state.setDefaultNetworkAccess);

  return (
    <SettingsGroup footnote="Where new cloud sessions start. You can change it for each session. Full internet always asks first.">
      <Pressable
        onPress={() => setOpen((current) => !current)}
        accessibilityRole="button"
        accessibilityLabel={`Network access. ${networkAccessLabel(value)}`}
        accessibilityState={{ expanded: open }}
        testID="code-network-access"
        style={{
          minHeight: 52,
          paddingHorizontal: 14,
          paddingVertical: 8,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <Globe size={19} color={colors.textSecondary} />
        <Text
          numberOfLines={2}
          style={{ flex: 1, color: colors.textPrimary, fontSize: typeScale.body }}
        >
          Network access
        </Text>
        <Text
          numberOfLines={2}
          style={{
            color: colors.textMuted,
            fontSize: typeScale.footnote,
            maxWidth: 150,
            textAlign: 'right',
          }}
        >
          {networkAccessLabel(value)}
        </Text>
        {open ? (
          <ChevronUp size={17} color={colors.textMuted} />
        ) : (
          <ChevronDown size={17} color={colors.textMuted} />
        )}
      </Pressable>
      {open ? (
        <View accessibilityRole="radiogroup">
          {NETWORK_ACCESS_OPTIONS.map((option, index) => (
            <Pressable
              key={option.id}
              onPress={() => {
                setValue(option.id);
                setOpen(false);
              }}
              accessibilityRole="radio"
              accessibilityState={{ checked: value === option.id }}
              accessibilityLabel={`${option.label}. ${option.description}`}
              testID={`code-network-${option.id}`}
              style={{
                minHeight: 56,
                paddingHorizontal: 14,
                paddingVertical: 8,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                borderTopWidth: index === 0 ? 1 : 0,
                borderBottomWidth: index === NETWORK_ACCESS_OPTIONS.length - 1 ? 0 : 1,
                borderColor: colors.border,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.textPrimary, fontSize: typeScale.body }}>
                  {option.label}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: typeScale.footnote }}>
                  {option.description}
                </Text>
              </View>
              {value === option.id ? <Check size={18} color={colors.textPrimary} /> : null}
            </Pressable>
          ))}
        </View>
      ) : null}
    </SettingsGroup>
  );
}

function CloudConnectionsSection() {
  const { status, availability, load } = useCloudCodeSessions(
    cloudCodeViewStatusFilter(CLOUD_CODE_DEFAULT_SESSION_VIEW),
  );
  const retry = useCallback(() => {
    void load('initial');
  }, [load]);

  return (
    <>
      <GroupHeading>Connections</GroupHeading>
      <SettingsGroup>
        <CloudAgentStatusRow
          loading={status === 'loading'}
          availability={availability}
          failed={status === 'error'}
          onRetry={retry}
        />
        <GitHubConnections />
      </SettingsGroup>
      <NetworkAccessSetting />
    </>
  );
}

function ComposerSettings() {
  const dismissKeyboardAfterSend = useCodePreferences((state) => state.dismissKeyboardAfterSend);
  const setDismissKeyboardAfterSend = useCodePreferences(
    (state) => state.setDismissKeyboardAfterSend,
  );
  const showContextUsage = useCodePreferences((state) => state.showContextUsage);
  const setShowContextUsage = useCodePreferences((state) => state.setShowContextUsage);

  return (
    <>
      <GroupHeading>Composer</GroupHeading>
      <SettingsGroup>
        <SettingsSwitchRow
          testID="code-dismiss-keyboard-after-send"
          label="Dismiss keyboard after sending"
          icon={Keyboard}
          value={dismissKeyboardAfterSend}
          onValueChange={setDismissKeyboardAfterSend}
        />
        <SettingsSwitchRow
          testID="code-show-context-usage"
          label="Show context window usage"
          icon={Gauge}
          value={showContextUsage}
          onValueChange={setShowContextUsage}
          isLast
        />
      </SettingsGroup>
    </>
  );
}

export default function CodeSettingsScreen() {
  const router = useRouter();
  const wrapLongLines = useCodePreferences((state) => state.wrapLongLines);
  const setWrapLongLines = useCodePreferences((state) => state.setWrapLongLines);
  const showDiffSigns = useCodePreferences((state) => state.showDiffSigns);
  const setShowDiffSigns = useCodePreferences((state) => state.setShowDiffSigns);
  const appMode = useChatAppModeStore((state) => state.appMode);
  const cloudAccess = useCloudCodeAccess();
  const offersRemoteControl =
    FEATURES.companion && isShownInMode(REMOTE_CONTROL_SETTINGS_ROUTE, appMode);

  const openRemoteControl = useCallback(() => {
    router.push(REMOTE_CONTROL_SETTINGS_ROUTE as Parameters<typeof router.push>[0]);
  }, [router]);

  return (
    <SettingsScreenShell title={CLOUD_CODE_SCREEN_TITLE}>
      <AppearanceSettings showTranscriptFont={cloudAccess.ready} />
      {cloudAccess.ready ? <CloudConnectionsSection /> : null}
      <SettingsGroup>
        <SettingsSwitchRow
          testID="code-wrap-long-lines"
          label="Wrap long lines"
          description="Wrap code and diffs instead of scrolling sideways."
          icon={WrapText}
          value={wrapLongLines}
          onValueChange={setWrapLongLines}
        />
        <SettingsSwitchRow
          testID="code-show-diff-signs"
          label="Show + and - signs in diffs"
          description="Mark added and removed lines with + and -, as well as color."
          icon={Diff}
          value={showDiffSigns}
          onValueChange={setShowDiffSigns}
          isLast
        />
      </SettingsGroup>
      {cloudAccess.ready ? <ComposerSettings /> : null}
      {offersRemoteControl ? (
        <SettingsGroup>
          <SettingsRow
            label="Remote control"
            icon={MonitorSmartphone}
            onPress={openRemoteControl}
            isLast
          />
        </SettingsGroup>
      ) : null}
    </SettingsScreenShell>
  );
}
