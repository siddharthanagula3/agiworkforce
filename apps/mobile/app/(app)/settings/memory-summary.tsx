import { useEffect, useMemo } from 'react';
import { View } from 'react-native';
import { Brain } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { SettingsGroup, SettingsInfo, SettingsScreenShell } from '@/src/features/settings/common';
import { useMemoryStore } from '@/src/features/memory/store';
import { summarizeMemoryFacts } from '@/src/features/memory/services/consolidation';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useLocalSettingsStore } from '@/stores/settings/localSettingsStore';
import { useCloudSettingsStore } from '@/stores/settings/cloudSettingsStore';
import { useThemeColors } from '@/src/ui/theme';

function formatGeneratedOn(date: Date): string {
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatMemoryCount(count: number): string {
  return count === 1 ? '1 memory' : `${count} memories`;
}

export default function MemorySummaryScreen() {
  const colors = useThemeColors();
  const isCloud = useChatAppModeStore((s) => s.appMode) === 'cloud';
  const entries = useMemoryStore((s) => s.entries);
  const loading = useMemoryStore((s) => s.loading);
  const fetchMemories = useMemoryStore((s) => s.fetchMemories);
  const localMemoryEnabled = useLocalSettingsStore((s) => s.memoryEnabled);
  const cloudMemoryEnabled = useCloudSettingsStore((s) => s.memoryEnabled);
  const memoryEnabled = isCloud ? cloudMemoryEnabled : localMemoryEnabled;

  useEffect(() => {
    void fetchMemories();
  }, [fetchMemories]);

  const summary = useMemo(() => summarizeMemoryFacts(entries), [entries]);
  const generatedOn = formatGeneratedOn(new Date());

  return (
    <SettingsScreenShell title="Memory summary" backHref="/(app)/settings/memory">
      <SettingsInfo
        title={isCloud ? 'Cloud account memory' : 'On-device memory'}
        body={
          isCloud
            ? 'Grouped from the memories stored on your AGI account. Nothing here is sent anywhere to build this view.'
            : 'Grouped from the memories stored on this device. Nothing here leaves the device to build this view.'
        }
        icon={Brain}
      />

      {!memoryEnabled ? (
        <View
          style={{
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.warningBorder,
            backgroundColor: colors.warningSurface,
            padding: 12,
            marginBottom: 24,
          }}
        >
          <Text style={{ color: colors.agentWarning, fontSize: 13, lineHeight: 18 }}>
            Memory is off, so none of these are used in new chats. They stay saved until you delete
            them.
          </Text>
        </View>
      ) : null}

      {summary.sections.length === 0 ? (
        <View style={{ paddingVertical: 32, alignItems: 'center' }}>
          <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '600' }}>
            {loading ? 'Loading memories…' : 'Nothing learned yet'}
          </Text>
          <Text
            style={{
              color: colors.textMuted,
              fontSize: 13,
              lineHeight: 19,
              marginTop: 6,
              textAlign: 'center',
            }}
          >
            {loading
              ? 'Reading stored memories.'
              : 'Once memories are saved they are grouped here so you can review everything at once.'}
          </Text>
        </View>
      ) : (
        summary.sections.map((section) => (
          <View key={section.key}>
            <Text
              style={{
                color: colors.textMuted,
                fontSize: 12,
                fontWeight: '700',
                paddingHorizontal: 2,
                textTransform: 'uppercase',
              }}
            >
              {section.title}
            </Text>
            <Text
              style={{
                color: colors.textMuted,
                fontSize: 12,
                lineHeight: 17,
                marginBottom: 8,
                paddingHorizontal: 2,
              }}
            >
              {section.description}
            </Text>
            <SettingsGroup>
              {section.facts.map((fact, index) => (
                <View
                  key={`${section.key}-${index}`}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    borderBottomWidth: index === section.facts.length - 1 ? 0 : 1,
                    borderBottomColor: colors.border,
                  }}
                >
                  <Text style={{ color: colors.textPrimary, fontSize: 14, lineHeight: 20 }}>
                    {fact}
                  </Text>
                </View>
              ))}
            </SettingsGroup>
          </View>
        ))
      )}

      {/* Provenance — states exactly what this view was built from and when. */}
      <Text
        style={{
          color: colors.textMuted,
          fontSize: 12,
          lineHeight: 18,
        }}
      >
        {`Generated from ${formatMemoryCount(summary.sourceCount)} on ${generatedOn}. ${
          isCloud ? 'Source: your AGI account memories.' : 'Source: memories saved on this device.'
        }`}
      </Text>
    </SettingsScreenShell>
  );
}
