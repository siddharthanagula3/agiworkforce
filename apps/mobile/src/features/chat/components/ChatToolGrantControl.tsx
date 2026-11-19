import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, View } from 'react-native';
import { conversationToolGrantRevokeConfirmation } from '@agiworkforce/cloud-contracts';
import { getToolDisplayLabel } from '@agiworkforce/types';
import { LoadingIndicator } from '@/components/ui/LoadingIndicator';
import { PressableBox } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import {
  CHAT_TOOL_GRANT_GONE,
  CHAT_TOOL_GRANT_REVOKE_FAILED,
  findChatToolGrant,
  stopAllowingChatTool,
} from '../services/chatToolGrants';

export const CHAT_TOOL_GRANT_ALLOWED = 'Allowed for this chat';
export const CHAT_TOOL_GRANT_STOP = 'Stop allowing';

type GrantState = 'checking' | 'absent' | 'allowed' | 'stopping' | 'stopped' | 'gone' | 'failed';

interface ChatToolGrantControlProps {
  conversationId: string;
  toolName: string;
}

export function ChatToolGrantControl({ conversationId, toolName }: ChatToolGrantControlProps) {
  const colors = useThemeColors();
  const [state, setState] = useState<GrantState>('checking');
  const mounted = useRef(true);
  const toolLabel = getToolDisplayLabel(toolName).displayName;
  const confirmation = conversationToolGrantRevokeConfirmation(toolLabel);

  useEffect(() => {
    mounted.current = true;
    setState('checking');
    findChatToolGrant(conversationId, toolName).then(
      (grant) => {
        if (mounted.current) setState(grant ? 'allowed' : 'absent');
      },
      () => {
        if (mounted.current) setState('allowed');
      },
    );
    return () => {
      mounted.current = false;
    };
  }, [conversationId, toolName]);

  const stop = useCallback(async () => {
    setState('stopping');
    try {
      const outcome = await stopAllowingChatTool(conversationId, toolName);
      if (mounted.current) setState(outcome);
    } catch {
      if (mounted.current) setState('failed');
    }
  }, [conversationId, toolName]);

  const askToStop = useCallback(() => {
    Alert.alert(confirmation.title, confirmation.message, [
      { text: 'Cancel', style: 'cancel' },
      { text: confirmation.confirmLabel, style: 'destructive', onPress: () => void stop() },
    ]);
  }, [confirmation.confirmLabel, confirmation.message, confirmation.title, stop]);

  if (state === 'checking' || state === 'absent') return null;

  if (state === 'stopped' || state === 'gone') {
    return (
      <Text
        accessibilityRole="alert"
        style={{ color: colors.textSecondary, fontSize: typeScale.caption }}
      >
        {state === 'stopped' ? confirmation.message : CHAT_TOOL_GRANT_GONE}
      </Text>
    );
  }

  const stopping = state === 'stopping';
  return (
    <View style={{ gap: 2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ color: colors.textMuted, fontSize: typeScale.caption }}>
          {CHAT_TOOL_GRANT_ALLOWED}
        </Text>
        <PressableBox
          onPress={stopping ? undefined : askToStop}
          disabled={stopping}
          accessibilityRole="button"
          accessibilityLabel={`${CHAT_TOOL_GRANT_STOP} ${toolLabel} in this chat`}
          accessibilityState={{ disabled: stopping, busy: stopping }}
          style={{ minHeight: 44, minWidth: 44, justifyContent: 'center' }}
        >
          {stopping ? (
            <LoadingIndicator size="small" accessibilityLabel="Stopping" />
          ) : (
            <Text
              style={{ color: colors.textPrimary, fontSize: typeScale.caption, fontWeight: '600' }}
            >
              {CHAT_TOOL_GRANT_STOP}
            </Text>
          )}
        </PressableBox>
      </View>
      {state === 'failed' ? (
        <Text
          accessibilityRole="alert"
          style={{ color: colors.agentError, fontSize: typeScale.caption }}
        >
          {CHAT_TOOL_GRANT_REVOKE_FAILED}
        </Text>
      ) : null}
    </View>
  );
}
