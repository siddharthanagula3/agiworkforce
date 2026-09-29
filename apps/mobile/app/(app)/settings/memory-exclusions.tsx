import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, TextInput, View } from 'react-native';
import { Ban, Bot, Globe, Laptop, Smartphone, X, type LucideIcon } from 'lucide-react-native';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { Text } from '@/components/ui/text';
import {
  SettingsGroup,
  SettingsInfo,
  SettingsScreenShell,
  SettingsSwitchRow,
} from '@/src/features/settings/common';
import { fetchPreferenceNamespace, savePreferenceNamespace } from '@/services/preferences';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { toUserMessage } from '@/services/userMessage';

const PREFERENCE_NAMESPACE = 'memory';
const MAX_TERMS = 50;
const MIN_TERM_LENGTH = 3;
const MAX_TERM_LENGTH = 100;

const MEMORY_SOURCES: ReadonlyArray<{ id: string; label: string; icon: LucideIcon }> = [
  { id: 'auto', label: 'Automatically captured from chats', icon: Bot },
  { id: 'web', label: 'Saved on the web app', icon: Globe },
  { id: 'desktop', label: 'Saved on Desktop', icon: Laptop },
  { id: 'mobile', label: 'Saved on mobile', icon: Smartphone },
];

interface MemoryExclusions {
  excludedTerms: string[];
  suppressedSources: string[];
}

function normalizeTerms(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const term = entry.trim().toLowerCase();
    if (term.length < MIN_TERM_LENGTH) continue;
    seen.add(term);
    if (seen.size >= MAX_TERMS) break;
  }
  return [...seen];
}

function normalizeSources(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const known = new Set(MEMORY_SOURCES.map((source) => source.id));
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const id = entry.trim().toLowerCase();
    if (known.has(id)) seen.add(id);
  }
  return [...seen];
}

export default function MemoryExclusionsScreen() {
  const colors = useThemeColors();
  const [exclusions, setExclusions] = useState<MemoryExclusions>({
    excludedTerms: [],
    suppressedSources: [],
  });
  const [draft, setDraft] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchPreferenceNamespace(PREFERENCE_NAMESPACE)
      .then((stored) => {
        if (cancelled) return;
        const settings = stored as Record<string, unknown>;
        setExclusions({
          excludedTerms: normalizeTerms(settings['excludedTerms']),
          suppressedSources: normalizeSources(settings['suppressedSources']),
        });
        setError(null);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(toUserMessage(cause, 'Could not load what memory leaves out.'));
        }
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback(async (next: MemoryExclusions) => {
    setSaving(true);
    try {
      await savePreferenceNamespace(PREFERENCE_NAMESPACE, next);
      setExclusions(next);
      setError(null);
    } catch (cause) {
      setError(toUserMessage(cause, 'Could not save that change.'));
    } finally {
      setSaving(false);
    }
  }, []);

  const addTerm = useCallback(() => {
    const term = draft.trim().toLowerCase();
    if (term.length < MIN_TERM_LENGTH) {
      setError(
        `Enter at least ${MIN_TERM_LENGTH} characters, shorter terms match almost anything.`,
      );
      return;
    }
    if (exclusions.excludedTerms.includes(term)) {
      setDraft('');
      return;
    }
    if (exclusions.excludedTerms.length >= MAX_TERMS) {
      setError(`You can store up to ${MAX_TERMS} exclusions.`);
      return;
    }
    setDraft('');
    void persist({ ...exclusions, excludedTerms: [...exclusions.excludedTerms, term] });
  }, [draft, exclusions, persist]);

  const removeTerm = useCallback(
    (term: string) => {
      void persist({
        ...exclusions,
        excludedTerms: exclusions.excludedTerms.filter((existing) => existing !== term),
      });
    },
    [exclusions, persist],
  );

  const setSourceUsed = useCallback(
    (source: string, used: boolean) => {
      const suppressed = exclusions.suppressedSources.filter((existing) => existing !== source);
      void persist({
        ...exclusions,
        suppressedSources: used ? suppressed : [...suppressed, source],
      });
    },
    [exclusions, persist],
  );

  const busy = !loaded || saving;

  return (
    <SettingsScreenShell title="Never remember" backHref="/(app)/settings/memory">
      <SettingsInfo
        title="Cloud account memory"
        body="New memories that contain any of these terms are discarded before they are saved. Matching ignores case. This applies to new memories only; anything already saved stays until you delete it."
        icon={Ban}
      />

      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        <TextInput
          value={draft}
          onChangeText={(value) => {
            setDraft(value);
            if (error) setError(null);
          }}
          onSubmitEditing={addTerm}
          placeholder="e.g. my home address"
          placeholderTextColor={colors.textMuted}
          accessibilityLabel="Term to never remember"
          editable={!busy}
          maxLength={MAX_TERM_LENGTH}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          style={{
            flex: 1,
            minHeight: 44,
            paddingHorizontal: 12,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surfaceElevated,
            color: colors.textPrimary,
            fontSize: typeScale.body,
          }}
        />
        <Pressable
          onPress={addTerm}
          disabled={busy || draft.trim().length === 0}
          accessibilityRole="button"
          accessibilityLabel="Add term"
          accessibilityState={{ disabled: busy || draft.trim().length === 0 }}
          style={{
            minHeight: 44,
            minWidth: 64,
            paddingHorizontal: 14,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: busy || draft.trim().length === 0 ? 0.55 : 1,
          }}
        >
          <Text style={{ color: colors.textPrimary, fontSize: typeScale.body, fontWeight: '600' }}>
            Add
          </Text>
        </Pressable>
      </View>

      {error ? (
        <Text
          accessibilityRole="alert"
          style={{
            color: colors.agentError,
            fontSize: typeScale.footnote,
            lineHeight: 18,
            marginBottom: 12,
          }}
        >
          {error}
        </Text>
      ) : null}

      {!loaded ? (
        <ActivityIndicator
          accessibilityLabel="Loading what memory leaves out"
          color={colors.textSecondary}
          style={{ marginVertical: 16 }}
        />
      ) : exclusions.excludedTerms.length === 0 ? (
        <Text
          style={{
            color: colors.textMuted,
            fontSize: typeScale.footnote,
            lineHeight: 18,
            marginBottom: 24,
          }}
        >
          No exclusions yet. Everything the assistant learns is eligible to be remembered.
        </Text>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
          {exclusions.excludedTerms.map((term) => (
            <View
              key={term}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingLeft: 12,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surfaceElevated,
              }}
            >
              <Text style={{ color: colors.textPrimary, fontSize: typeScale.footnote }}>
                {term}
              </Text>
              <Pressable
                onPress={() => removeTerm(term)}
                disabled={saving}
                accessibilityRole="button"
                accessibilityLabel={`Stop excluding ${term}`}
                style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
              >
                <X size={14} color={colors.textSecondary} />
              </Pressable>
            </View>
          ))}
        </View>
      )}

      <Text
        style={{
          color: colors.textMuted,
          fontSize: typeScale.caption,
          fontWeight: '700',
          letterSpacing: 0.7,
          marginBottom: 8,
        }}
      >
        WHERE MEMORIES COME FROM
      </Text>
      <SettingsGroup>
        {MEMORY_SOURCES.map((source, index) => (
          <SettingsSwitchRow
            key={source.id}
            label={source.label}
            icon={source.icon}
            value={!exclusions.suppressedSources.includes(source.id)}
            onValueChange={(used) => setSourceUsed(source.id, used)}
            disabled={busy}
            isLast={index === MEMORY_SOURCES.length - 1}
          />
        ))}
      </SettingsGroup>
      <Text
        style={{
          color: colors.textMuted,
          fontSize: typeScale.caption,
          lineHeight: 17,
          marginBottom: 24,
        }}
      >
        Turn a source off to keep its memories out of every answer. They stay saved and listed, and
        turning off automatic capture also stops new ones being written.
      </Text>
    </SettingsScreenShell>
  );
}
