import { useCallback, useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { X } from 'lucide-react-native';
import {
  AGENT_DESCRIPTION_MAX_CHARS,
  AGENT_INSTRUCTIONS_MAX_CHARS,
  AGENT_NAME_MAX_CHARS,
  AGENT_OUTPUT_EXAMPLES_MAX_CHARS,
  AGENT_STARTER_MAX_CHARS,
  AGENT_STARTERS_MAX,
  addAgentConversationStarter,
  agentSelectionIncludes,
  parseAgentDailyTurnLimit,
  toggleAgentSelection,
  type AgentConfig,
} from '@agiworkforce/cloud-contracts';
import { CONNECTORS_COMING_SOON_MESSAGE, connectorsReleased } from '@agiworkforce/types';

import { Button } from '@/components/ui/Button';
import { PressableBox } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { fetchConnectorDirectory } from '@/services/connectors';
import { PROJECT_ACCENTS, PROJECT_ICONS } from '@/src/features/projects/projectAppearance';
import { fetchManagedSkills } from '@/src/features/skills/service';
import { getDisplayName } from '@/src/features/model-picker/service';
import {
  Chip,
  ErrorBanner,
  MetaText,
  SectionCard,
  TextField,
  ToggleRow,
} from '@/src/shared/components/cloud-screen';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { AgentAvatar } from './AgentAvatar';

export interface AgentChoice {
  id: string;
  name: string;
}

export interface AgentChoiceList {
  loading: boolean;
  error: string | null;
  options: AgentChoice[];
  retry: () => void;
}

function useChoiceList(loader: () => Promise<AgentChoice[]>, failure: string): AgentChoiceList {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<Omit<AgentChoiceList, 'retry'>>({
    loading: true,
    error: null,
    options: [],
  });
  useEffect(() => {
    let cancelled = false;
    setState((current) => ({ ...current, loading: true, error: null }));
    loader()
      .then((options) => {
        if (!cancelled) setState({ loading: false, error: null, options });
      })
      .catch(() => {
        if (!cancelled) setState({ loading: false, error: failure, options: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt, failure, loader]);
  return { ...state, retry: () => setAttempt((value) => value + 1) };
}

const loadConnectorChoices = async (): Promise<AgentChoice[]> => {
  const directory = await fetchConnectorDirectory();
  return directory.connectors
    .map((connection) => ({
      id: connection.toolConnectorId ?? connection.connectorId,
      name: connection.name ?? connection.connectorId,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
};

const loadSkillChoices = async (): Promise<AgentChoice[]> =>
  (await fetchManagedSkills())
    .map((skill) => ({ id: skill.name, name: skill.name }))
    .sort((left, right) => left.name.localeCompare(right.name));

export function useAgentChoices(): { connectors: AgentChoiceList; skills: AgentChoiceList } {
  const connectors = useChoiceList(loadConnectorChoices, 'Your connectors could not be loaded.');
  const skills = useChoiceList(loadSkillChoices, 'Your skills could not be loaded.');
  return { connectors, skills };
}

function SelectionField({
  legend,
  help,
  allLabel,
  emptyCopy,
  list,
  selected,
  disabled,
  onChange,
}: {
  legend: string;
  help: string;
  allLabel: string;
  emptyCopy: string;
  list: AgentChoiceList;
  selected: string[] | null;
  disabled: boolean;
  onChange: (next: string[] | null) => void;
}) {
  const colors = useThemeColors();
  const optionIds = list.options.map((option) => option.id);
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: colors.textPrimary, fontSize: typeScale.body, fontWeight: '600' }}>
        {legend}
      </Text>
      <MetaText>{help}</MetaText>
      <ToggleRow
        label={allLabel}
        value={selected === null}
        disabled={disabled}
        onValueChange={(all) => onChange(all ? null : [])}
      />
      {list.loading ? (
        <MetaText>Loading…</MetaText>
      ) : list.error ? (
        <ErrorBanner message={list.error} onRetry={list.retry} />
      ) : list.options.length === 0 ? (
        <MetaText>{emptyCopy}</MetaText>
      ) : (
        list.options.map((option) => (
          <ToggleRow
            key={option.id}
            label={option.name}
            disabled={disabled}
            value={agentSelectionIncludes(selected, option.id)}
            onValueChange={(included) =>
              onChange(toggleAgentSelection(selected, optionIds, option.id, included))
            }
          />
        ))
      )}
    </View>
  );
}

function StartersField({
  starters,
  disabled,
  onChange,
}: {
  starters: string[];
  disabled: boolean;
  onChange: (next: string[]) => void;
}) {
  const colors = useThemeColors();
  const [pending, setPending] = useState('');
  const add = useCallback(() => {
    onChange(addAgentConversationStarter(starters, pending));
    setPending('');
  }, [onChange, pending, starters]);
  return (
    <View style={{ gap: 8 }}>
      {starters.map((starter, index) => (
        <View
          key={`${starter}-${index}`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
        >
          <Text style={{ flex: 1, color: colors.textPrimary, fontSize: typeScale.footnote }}>
            {starter}
          </Text>
          <PressableBox
            onPress={() => onChange(starters.filter((_, position) => position !== index))}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={`Remove conversation starter ${index + 1}`}
            hitSlop={8}
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
          >
            <X size={16} color={colors.textMuted} />
          </PressableBox>
        </View>
      ))}
      {starters.length < AGENT_STARTERS_MAX ? (
        <View style={{ gap: 8 }}>
          <TextField
            label="Conversation starter"
            value={pending}
            editable={!disabled}
            maxLength={AGENT_STARTER_MAX_CHARS}
            placeholder="Something a person might ask first"
            onChangeText={setPending}
            onSubmitEditing={add}
            returnKeyType="done"
          />
          <Button
            title="Add starter"
            size="sm"
            variant="outline"
            disabled={disabled || !pending.trim()}
            onPress={add}
          />
        </View>
      ) : null}
    </View>
  );
}

export function AgentConfigSections({
  draft,
  disabled,
  choices,
  onChange,
  onChooseModel,
}: {
  draft: AgentConfig;
  disabled: boolean;
  choices: { connectors: AgentChoiceList; skills: AgentChoiceList };
  onChange: (patch: Partial<AgentConfig>) => void;
  onChooseModel: () => void;
}) {
  const colors = useThemeColors();
  return (
    <View style={{ gap: 12 }}>
      <SectionCard title="Identity">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <AgentAvatar icon={draft.icon} accentColor={draft.accentColor} size={48} />
          <View style={{ flex: 1 }}>
            <TextField
              label="Name"
              value={draft.name}
              editable={!disabled}
              maxLength={AGENT_NAME_MAX_CHARS}
              placeholder="Research assistant"
              onChangeText={(name) => onChange({ name })}
            />
          </View>
        </View>
        <TextField
          label="Description"
          value={draft.description}
          editable={!disabled}
          maxLength={AGENT_DESCRIPTION_MAX_CHARS}
          placeholder="What this agent is for, in a sentence"
          onChangeText={(description) => onChange({ description })}
        />
        <Text
          style={{ color: colors.textSecondary, fontSize: typeScale.footnote, fontWeight: '600' }}
        >
          Icon
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {PROJECT_ICONS.map((entry) => (
              <Chip
                key={entry.id}
                label={entry.label}
                Icon={entry.Icon}
                selected={draft.icon === entry.id}
                onPress={disabled ? undefined : () => onChange({ icon: entry.id })}
              />
            ))}
          </View>
        </ScrollView>
        <Text
          style={{ color: colors.textSecondary, fontSize: typeScale.footnote, fontWeight: '600' }}
        >
          Colour
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {PROJECT_ACCENTS.map((entry) => (
            <Chip
              key={entry.id}
              label={entry.label}
              selected={draft.accentColor === entry.id}
              onPress={disabled ? undefined : () => onChange({ accentColor: entry.id })}
            />
          ))}
        </View>
      </SectionCard>

      <SectionCard title="Behaviour">
        <TextField
          label="Instructions"
          value={draft.instructions}
          editable={!disabled}
          multiline
          minHeight={160}
          maxLength={AGENT_INSTRUCTIONS_MAX_CHARS}
          placeholder="How the agent should think, answer and use its tools"
          onChangeText={(instructions) => onChange({ instructions })}
        />
        <TextField
          label="Output examples"
          value={draft.outputExamples}
          editable={!disabled}
          multiline
          maxLength={AGENT_OUTPUT_EXAMPLES_MAX_CHARS}
          hint="Show the shape of a good answer. The agent follows the format, not the facts."
          onChangeText={(outputExamples) => onChange({ outputExamples })}
        />
        <StartersField
          starters={draft.conversationStarters}
          disabled={disabled}
          onChange={(conversationStarters) => onChange({ conversationStarters })}
        />
      </SectionCard>

      <SectionCard title="Model and tools">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: colors.textPrimary, fontSize: typeScale.body }}>Model</Text>
            <MetaText>
              {draft.model ? getDisplayName(draft.model) : 'Whatever the chat uses'}
            </MetaText>
          </View>
          {draft.model ? (
            <Button
              title="Clear"
              size="sm"
              variant="ghost"
              disabled={disabled}
              accessibilityLabel="Use whatever model the chat uses"
              onPress={() => onChange({ model: null })}
            />
          ) : null}
          <Button
            title="Choose"
            size="sm"
            variant="outline"
            disabled={disabled}
            accessibilityLabel="Choose the agent's model"
            onPress={onChooseModel}
          />
        </View>
        <ToggleRow
          label="Web search"
          value={draft.webSearch}
          disabled={disabled}
          onValueChange={(webSearch) => onChange({ webSearch })}
        />
        <ToggleRow
          label="Code execution"
          value={draft.codeExecution}
          disabled={disabled}
          onValueChange={(codeExecution) => onChange({ codeExecution })}
        />
        <ToggleRow
          label="Image generation"
          value={draft.imageGeneration}
          disabled={disabled}
          onValueChange={(imageGeneration) => onChange({ imageGeneration })}
        />
        <TextField
          label="Messages a day, per person"
          value={draft.dailyTurnLimit === null ? '' : String(draft.dailyTurnLimit)}
          editable={!disabled}
          keyboardType="number-pad"
          placeholder="No limit"
          hint="Each person can send this agent up to this many messages a day. Chats stop at the limit until midnight UTC."
          onChangeText={(text) => onChange({ dailyTurnLimit: parseAgentDailyTurnLimit(text) })}
        />
      </SectionCard>

      <SectionCard title="Connectors and skills">
        {connectorsReleased() ? (
          <SelectionField
            legend="Connectors"
            help="The agent uses only the connectors turned on here, and only ones the person chatting has connected."
            allLabel="Every connector the person has connected"
            emptyCopy="No connectors are connected."
            list={choices.connectors}
            selected={draft.connectorIds}
            disabled={disabled}
            onChange={(connectorIds) => onChange({ connectorIds })}
          />
        ) : (
          <MetaText>{CONNECTORS_COMING_SOON_MESSAGE}</MetaText>
        )}
        <SelectionField
          legend="Skills"
          help="The agent can load only the skills turned on here."
          allLabel="Every skill turned on for the person chatting"
          emptyCopy="No skills are turned on."
          list={choices.skills}
          selected={draft.skillNames}
          disabled={disabled}
          onChange={(skillNames) => onChange({ skillNames })}
        />
      </SectionCard>
    </View>
  );
}
