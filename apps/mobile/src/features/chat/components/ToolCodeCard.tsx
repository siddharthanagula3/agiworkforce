import { useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import {
  MAX_HIGHLIGHT_LENGTH,
  syntaxTokenColor,
  tokenizeCode,
} from '@/src/features/chat/utils/syntaxHighlight';
import { CodeBlockCopyButton } from './CodeBlockCopyButton';
import { SideScroller } from './SideScroller';
import { TOOL_MONOSPACE } from './ToolFileDiffBlock';

const CODE_BODY_MAX_HEIGHT = 240;

export function ToolCodeCard({ language, code }: { language: string; code: string }) {
  const colors = useThemeColors();
  const tokens = useMemo(
    () =>
      code.length <= MAX_HIGHLIGHT_LENGTH
        ? tokenizeCode(code, language)
        : [{ text: code, type: 'plain' as const }],
    [code, language],
  );

  return (
    <View
      testID="tool-code-card"
      style={{ backgroundColor: colors.surfaceHover, borderRadius: 8, overflow: 'hidden' }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingLeft: 10,
          paddingRight: 6,
          paddingTop: 4,
        }}
      >
        <Text style={{ fontSize: typeScale.caption, color: colors.textMuted }}>{language}</Text>
        <CodeBlockCopyButton code={code} />
      </View>
      <ScrollView nestedScrollEnabled style={{ maxHeight: CODE_BODY_MAX_HEIGHT }}>
        <SideScroller nestedScrollEnabled showsHorizontalScrollIndicator={false}>
          <Text
            selectable
            accessibilityLabel={`${language} code`}
            style={{
              paddingHorizontal: 10,
              paddingBottom: 8,
              fontFamily: TOOL_MONOSPACE,
              fontSize: typeScale.caption,
              color: colors.textPrimary,
            }}
          >
            {tokens.map((token, index) =>
              token.type === 'plain' ? (
                token.text
              ) : (
                <Text key={index} style={{ color: syntaxTokenColor(token.type, colors) }}>
                  {token.text}
                </Text>
              ),
            )}
          </Text>
        </SideScroller>
      </ScrollView>
    </View>
  );
}
