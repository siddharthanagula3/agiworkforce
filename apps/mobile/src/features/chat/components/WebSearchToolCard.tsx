import { Alert, Pressable, View } from 'react-native';
import { Globe, Loader2, SearchX, CircleSlash, TriangleAlert } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { hostnameOf, isValidExternalHttpUrl } from '@/src/features/chat/utils/externalUrls';
import { openUntrustedUrlInAppBrowser } from '@/lib/safeOpenURL';
import type { ToolCall, ToolSearchResult } from '@/types/chat';

const SEARCH_TOOL_NAMES = new Set(['web_search', 'perplexity_search', 'websearch', 'brave_search']);

export function isWebSearchTool(rawName: string | null | undefined): boolean {
  const name = (rawName ?? '').trim().toLowerCase();
  if (!name) return false;
  if (SEARCH_TOOL_NAMES.has(name)) return true;
  return name.includes('search') && name.includes('web');
}

export function webSearchQueryOf(tool: ToolCall): string | null {
  const raw = tool.input?.trim();
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      const record = parsed as Record<string, unknown>;
      for (const key of ['query', 'q', 'search_query', 'text']) {
        const value = record[key];
        if (typeof value === 'string' && value.trim().length > 0) return value.trim();
      }
    }
  } catch {
    return raw.length > 120 ? `${raw.slice(0, 120)}…` : raw;
  }
  return null;
}

function SourceChip({ result }: { result: ToolSearchResult }) {
  const colors = useThemeColors();
  const hostname = hostnameOf(result.url);

  const open = async () => {
    if (!isValidExternalHttpUrl(result.url)) return;
    const opened = await openUntrustedUrlInAppBrowser(result.url);
    if (!opened) {
      Alert.alert('Could not open source', 'Check your connection and try again.');
    }
  };

  return (
    <Pressable
      onPress={open}
      accessibilityRole="link"
      accessibilityLabel={`Open source ${hostname}, ${result.title}`}
      hitSlop={6}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        minHeight: 24,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 999,
        backgroundColor: colors.surfaceOverlay,
        borderWidth: 1,
        borderColor: colors.borderLight,
      }}
    >
      <Globe size={10} color={colors.textMuted} />
      <Text numberOfLines={1} style={{ fontSize: 11, color: colors.textSecondary, maxWidth: 150 }}>
        {hostname}
      </Text>
    </Pressable>
  );
}

type SearchLine = { text: string; tone: 'active' | 'muted' | 'warning' | 'error' };

function statusLine(tool: ToolCall, query: string | null): SearchLine | null {
  switch (tool.status) {
    case 'running':
      return query ? { text: `Searching for \u201c${query}\u201d`, tone: 'active' } : null;
    case 'partial':
      return { text: 'The search stopped early, these sources are incomplete.', tone: 'warning' };
    case 'canceled':
      return { text: 'Search canceled before it returned sources.', tone: 'muted' };
    case 'failed':
      return {
        text: tool.output?.trim() || 'The search failed. Try sending the message again.',
        tone: 'error',
      };
    default:
      return null;
  }
}

export function WebSearchToolCard({ tool, showSources }: { tool: ToolCall; showSources: boolean }) {
  const colors = useThemeColors();
  const query = webSearchQueryOf(tool);
  const line = statusLine(tool, query);
  const sources = tool.searchResults ?? [];
  const visibleSources = showSources ? sources : [];

  if (!line && visibleSources.length === 0) return null;

  const toneColor =
    line?.tone === 'active'
      ? colors.agentActive
      : line?.tone === 'warning'
        ? colors.agentWarning
        : line?.tone === 'error'
          ? colors.agentError
          : colors.textMuted;

  const LineIcon =
    tool.status === 'running'
      ? Loader2
      : tool.status === 'failed'
        ? SearchX
        : tool.status === 'canceled'
          ? CircleSlash
          : tool.status === 'partial'
            ? TriangleAlert
            : Globe;

  return (
    <View style={{ paddingLeft: 20, paddingBottom: 8, gap: 6 }}>
      {line ? (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
          <View style={{ paddingTop: 1 }}>
            <LineIcon size={12} strokeWidth={1.75} color={toneColor} />
          </View>
          <Text style={{ flex: 1, fontSize: 12, color: toneColor }}>{line.text}</Text>
        </View>
      ) : null}
      {query && tool.status === 'failed' ? (
        <Text numberOfLines={2} style={{ fontSize: 12, color: colors.textSecondary }}>
          {`“${query}”`}
        </Text>
      ) : null}
      {visibleSources.length > 0 ? (
        <>
          <Text style={{ fontSize: 11, color: colors.textMuted }}>
            {visibleSources.length === 1 ? '1 source' : `${visibleSources.length} sources`}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {visibleSources.map((result, index) => (
              <SourceChip key={`${tool.id}-chip-${index}`} result={result} />
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}
