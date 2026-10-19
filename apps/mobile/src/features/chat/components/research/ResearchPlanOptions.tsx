import { useEffect, useState } from 'react';
import { TextInput, View } from 'react-native';
import { X } from 'lucide-react-native';
import {
  FILES_RESEARCH_SOURCE,
  RESEARCH_DELIVERABLE_DEPTHS,
  RESEARCH_DELIVERABLE_FORMATS,
  type ResearchDeliverableDepth,
  type ResearchDeliverableFormat,
  type ResearchDeliverableSpec,
  type ResearchSourceRequest,
} from '@agiworkforce/types';
import { normalizeWebDomain } from '@agiworkforce/cloud-contracts';
import {
  hasResearchSourceChoice,
  type ResearchPlanChoices,
} from '@/src/features/chat/utils/researchPlanChoices';
import { PressableBox } from '@/components/ui/pressable-box';
import { FEATURES } from '@/lib/v1FeatureFlags';
import { fetchConnectorDirectory } from '@/services/connectors';
import { formatConnectorName } from '@/src/features/settings/cloud-connectors/connectorStatus';
import { Switch } from '@/components/ui/switch';
import { Text } from '@/components/ui/text';
import { radii, useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';

const MAX_DOMAINS = 32;

interface ResearchConnectorOption {
  connectorId: string;
  label: string;
}

function useResearchConnectorOptions(): ResearchConnectorOption[] {
  const [options, setOptions] = useState<ResearchConnectorOption[]>([]);
  useEffect(() => {
    if (!FEATURES.connectors) return;
    let cancelled = false;
    void fetchConnectorDirectory()
      .then((directory) => {
        if (cancelled) return;
        setOptions(
          directory.connectors
            .filter((connection) => connection.needsReauthorization !== true)
            .map((connection) => ({
              connectorId: connection.toolConnectorId ?? connection.connectorId,
              label: connection.name ?? formatConnectorName(connection.connectorId),
            })),
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  return options;
}

const DEPTH_LABEL: Record<ResearchDeliverableDepth, string> = {
  'executive-summary': 'Executive summary',
  'full-report': 'Full report',
};

const DEPTH_HINT: Record<ResearchDeliverableDepth, string> = {
  'executive-summary': 'The answer in a page, only what changes a decision.',
  'full-report': 'Sections, with the reasoning and the evidence behind each.',
};

const FORMAT_LABEL: Record<ResearchDeliverableFormat, string> = {
  prose: 'Prose',
  'prose-with-tables': 'Prose with tables',
  'bullet-brief': 'Bullet brief',
};

function Choice({
  label,
  selected,
  onPress,
  testID,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  testID: string;
}) {
  const colors = useThemeColors();
  return (
    <PressableBox
      testID={testID}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={{
        minHeight: 36,
        paddingHorizontal: 12,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: selected ? colors.textPrimary : colors.border,
        backgroundColor: selected ? colors.surfaceOverlay : colors.transparent,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          fontSize: typeScale.caption,
          fontWeight: selected ? '600' : '500',
          color: selected ? colors.textPrimary : colors.textSecondary,
        }}
      >
        {label}
      </Text>
    </PressableBox>
  );
}

function DomainList({
  label,
  placeholder,
  domains,
  excluded,
  onChange,
  testID,
}: {
  label: string;
  placeholder: string;
  domains: string[];
  excluded?: boolean;
  onChange: (domains: string[]) => void;
  testID: string;
}) {
  const colors = useThemeColors();
  const [draft, setDraft] = useState('');
  const [invalid, setInvalid] = useState(false);

  const commit = () => {
    const entries = draft.split(/[\s,]+/).filter(Boolean);
    if (entries.length === 0) return;
    const normalized = entries.map(normalizeWebDomain);
    if (normalized.some((entry) => entry === null)) {
      setInvalid(true);
      return;
    }
    const next = [...domains];
    for (const domain of normalized as string[]) {
      if (!next.includes(domain) && next.length < MAX_DOMAINS) next.push(domain);
    }
    setInvalid(false);
    setDraft('');
    onChange(next);
  };

  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: typeScale.caption, color: colors.textSecondary }}>{label}</Text>
      {domains.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {domains.map((domain) => (
            <View
              key={domain}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingLeft: 10,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Text style={{ fontSize: typeScale.caption, color: colors.textPrimary }}>
                {excluded ? `Never ${domain}` : domain}
              </Text>
              <PressableBox
                onPress={() => onChange(domains.filter((entry) => entry !== domain))}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${domain} from this research run`}
                style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}
              >
                <X size={12} color={colors.textMuted} />
              </PressableBox>
            </View>
          ))}
        </View>
      ) : null}
      <TextInput
        testID={testID}
        value={draft}
        onChangeText={(text) => {
          setDraft(text);
          if (invalid) setInvalid(false);
        }}
        onSubmitEditing={commit}
        onBlur={commit}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        accessibilityLabel={label}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        returnKeyType="done"
        style={{
          minHeight: 40,
          fontSize: typeScale.caption,
          color: colors.textPrimary,
          borderWidth: 1,
          borderColor: invalid ? colors.agentError : colors.border,
          borderRadius: radii.md,
          paddingHorizontal: 8,
        }}
      />
      {invalid ? (
        <Text
          accessibilityRole="alert"
          style={{ fontSize: typeScale.caption, color: colors.agentError }}
        >
          Enter site addresses such as example.com.
        </Text>
      ) : null}
    </View>
  );
}

export function ResearchPlanOptions({
  choices,
  onChange,
}: {
  choices: ResearchPlanChoices;
  onChange: (choices: ResearchPlanChoices) => void;
}) {
  const colors = useThemeColors();
  const connectorOptions = useResearchConnectorOptions();
  const { deliverable, sources } = choices;
  const setDeliverable = (patch: Partial<ResearchDeliverableSpec>) =>
    onChange({ ...choices, deliverable: { ...deliverable, ...patch } });
  const setSources = (patch: Partial<ResearchSourceRequest>) =>
    onChange({ ...choices, sources: { ...sources, ...patch } });

  return (
    <View
      testID="research-plan-options"
      style={{ borderTopWidth: 1, borderTopColor: colors.borderLight, paddingTop: 8, gap: 10 }}
    >
      <View style={{ gap: 6 }} accessibilityRole="radiogroup" accessibilityLabel="Deliverable">
        <Text style={{ fontSize: typeScale.caption, fontWeight: '600', color: colors.textPrimary }}>
          Deliverable
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {RESEARCH_DELIVERABLE_DEPTHS.map((depth) => (
            <Choice
              key={depth}
              testID={`research-deliverable-${depth}`}
              label={DEPTH_LABEL[depth]}
              selected={deliverable.depth === depth}
              onPress={() => setDeliverable({ depth })}
            />
          ))}
        </View>
        <Text style={{ fontSize: typeScale.caption, color: colors.textMuted }}>
          {DEPTH_HINT[deliverable.depth]}
        </Text>
      </View>

      <View style={{ gap: 6 }} accessibilityRole="radiogroup" accessibilityLabel="Format">
        <Text style={{ fontSize: typeScale.caption, fontWeight: '600', color: colors.textPrimary }}>
          Format
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {RESEARCH_DELIVERABLE_FORMATS.map((format) => (
            <Choice
              key={format}
              testID={`research-format-${format}`}
              label={FORMAT_LABEL[format]}
              selected={deliverable.format === format}
              onPress={() => setDeliverable({ format })}
            />
          ))}
        </View>
      </View>

      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: typeScale.caption, fontWeight: '600', color: colors.textPrimary }}>
          Sources
        </Text>
        <Text style={{ fontSize: typeScale.caption, color: colors.textMuted }}>
          {hasResearchSourceChoice(sources)
            ? 'This run reads only what you set here.'
            : 'Searching the whole web. Add a source to narrow it.'}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }}>
          <Text style={{ flex: 1, fontSize: typeScale.caption, color: colors.textPrimary }}>
            {FILES_RESEARCH_SOURCE.label}
          </Text>
          <Switch
            testID="research-source-files"
            value={sources.files}
            onValueChange={(files) => setSources({ files })}
            accessibilityLabel={FILES_RESEARCH_SOURCE.label}
          />
        </View>
        <DomainList
          testID="research-source-allow"
          label="Only these sites"
          placeholder="example.com"
          domains={sources.allowDomains}
          onChange={(allowDomains) => setSources({ allowDomains })}
        />
        <DomainList
          testID="research-source-deny"
          label="Never these sites"
          placeholder="example.com"
          domains={sources.denyDomains}
          excluded
          onChange={(denyDomains) => setSources({ denyDomains })}
        />
        {connectorOptions.length > 0 ? (
          <View style={{ gap: 6 }} accessibilityLabel="Connected apps">
            <Text style={{ fontSize: typeScale.caption, color: colors.textSecondary }}>
              Connected apps
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {connectorOptions.map((option) => {
                const selected = sources.connectors.includes(option.connectorId);
                return (
                  <PressableBox
                    key={option.connectorId}
                    testID={`research-source-connector-${option.connectorId}`}
                    onPress={() =>
                      setSources({
                        connectors: selected
                          ? sources.connectors.filter((id) => id !== option.connectorId)
                          : [...sources.connectors, option.connectorId],
                      })
                    }
                    accessibilityRole="checkbox"
                    accessibilityLabel={option.label}
                    accessibilityState={{ checked: selected }}
                    style={{
                      minHeight: 36,
                      paddingHorizontal: 12,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: selected ? colors.textPrimary : colors.border,
                      backgroundColor: selected ? colors.surfaceOverlay : colors.transparent,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text
                      style={{
                        fontSize: typeScale.caption,
                        fontWeight: selected ? '600' : '500',
                        color: selected ? colors.textPrimary : colors.textSecondary,
                      }}
                    >
                      {option.label}
                    </Text>
                  </PressableBox>
                );
              })}
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}
