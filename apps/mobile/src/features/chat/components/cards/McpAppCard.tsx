import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { TriangleAlert } from 'lucide-react-native';
import type { McpAppCardBody } from '@agiworkforce/types';
import { MCP_APP_SANDBOX_UNAVAILABLE_MESSAGE } from '@agiworkforce/unified-chat/mcp-app';
import { LoadingIndicator } from '@/components/ui/LoadingIndicator';
import { fetchMcpAppResultText } from '../../services/mcpAppPayload';
import { useThemeColors } from '@/src/ui/theme';
import { codeFontFamily } from '@/src/ui/theme/codeFont';
import { typeScale } from '@/src/ui/theme/tokens';

export const MCP_APP_UNAVAILABLE_MESSAGE = 'This MCP App result expired or is unavailable.';
export const MCP_APP_EMPTY_RESULT = 'The tool returned no text to show.';

type McpAppState = { status: 'loading' } | { status: 'error' } | { status: 'result'; text: string };

export function McpAppCard({
  body,
  fallbackText,
  canLoad,
}: {
  body: McpAppCardBody;
  fallbackText: string;
  canLoad: boolean;
}) {
  const colors = useThemeColors();
  const [state, setState] = useState<McpAppState>({ status: 'loading' });
  const { payloadId, connectorId, resourceUri, toolName } = body;

  useEffect(() => {
    if (!canLoad) return undefined;
    let active = true;
    setState({ status: 'loading' });
    void fetchMcpAppResultText({ payloadId, connectorId, resourceUri, toolName })
      .then((text) => {
        if (!active) return;
        setState(text === null ? { status: 'error' } : { status: 'result', text });
      })
      .catch(() => {
        if (active) setState({ status: 'error' });
      });
    return () => {
      active = false;
    };
  }, [canLoad, payloadId, connectorId, resourceUri, toolName]);

  const notice = !canLoad
    ? fallbackText
    : state.status === 'error'
      ? MCP_APP_UNAVAILABLE_MESSAGE
      : state.status === 'result'
        ? MCP_APP_SANDBOX_UNAVAILABLE_MESSAGE
        : null;

  return (
    <View
      testID="interactive-card-mcp-app"
      accessibilityLabel={`${body.toolName} result`}
      style={{
        marginTop: 12,
        gap: 8,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 12,
        borderCurve: 'continuous',
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surfaceElevated,
      }}
    >
      {canLoad && state.status === 'loading' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <LoadingIndicator />
          <Text
            variant="inline"
            style={{ fontSize: typeScale.subhead, color: colors.textSecondary }}
          >
            Loading MCP App…
          </Text>
        </View>
      ) : null}
      {notice ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ paddingTop: 2 }}>
            <TriangleAlert size={16} color={colors.textSecondary} />
          </View>
          <Text
            variant="inline"
            selectable
            style={{ flex: 1, fontSize: typeScale.subhead, color: colors.textSecondary }}
          >
            {notice}
          </Text>
        </View>
      ) : null}
      {state.status === 'result' && canLoad ? (
        <ScrollView nestedScrollEnabled style={{ maxHeight: 384 }}>
          <Text
            variant="inline"
            testID="mcp-app-result"
            selectable
            style={{
              fontFamily: state.text ? codeFontFamily : undefined,
              fontSize: typeScale.footnote,
              color: state.text ? colors.textPrimary : colors.textMuted,
            }}
          >
            {state.text || MCP_APP_EMPTY_RESULT}
          </Text>
        </ScrollView>
      ) : null}
    </View>
  );
}
